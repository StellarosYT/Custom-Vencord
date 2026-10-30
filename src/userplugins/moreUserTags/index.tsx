/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { addProfileBadge, BadgePosition, ProfileBadge, removeProfileBadge } from "@api/Badges";
import { Devs } from "@utils/constants";
import { getCurrentChannel, getIntlMessage, openUserProfile } from "@utils/discord";
import definePlugin from "@utils/types";
import type { Channel, Message, Role, User } from "@vencord/discord-types";
import { ChannelStore, GuildMemberStore, GuildRoleStore, GuildStore, MessageStore, PermissionsBits, React, SelectedChannelStore, Tooltip, UserStore } from "@webpack/common";

import { computePermissions, defaultRarities, tags } from "./consts";
import { badgeIconUrls } from "./icons";
import { settings, tagDisplayNameSettingKeys, tagIconUrlSettingKeys } from "./settings";
import { getValidIconUrl, TagSettings } from "./types";

const tagsByName: ReadonlyMap<string, (typeof tags)[number]> = new Map(tags.map(tag => [tag.name, tag] as const));
type TagName = (typeof tags)[number]["name"];
const permissionMasks = new Map<string, bigint>();
const badgeLineBreak = "\u2028";
const badgeIconSize = 48;
let permissionCache = new WeakMap<User, WeakMap<Channel, {
    guild: ReturnType<typeof GuildStore.getGuild>;
    overwrites: Channel["permissionOverwrites"];
    permissions: bigint;
}>>();

interface BadgeDetails {
    detail: string;
    roleName?: string;
}

function formatPermission(permission: string) {
    return permission.toLowerCase().replace(/(^|_)(\w)/g, (_, separator, letter) =>
        `${separator ? " " : ""}${letter.toUpperCase()}`
    );
}

function getDetailsHash(detail: string) {
    let hash = 2166136261;
    for (let i = 0; i < detail.length; i++)
        hash = Math.imul(hash ^ detail.charCodeAt(i), 16777619);
    return (hash >>> 0).toString(36);
}

function getPermissionDetails(user: User, channel: Channel, permissions: readonly string[]): BadgeDetails {
    const guild = GuildStore.getGuild(channel.guild_id);
    if (!guild) return { detail: "Role and permission details are unavailable outside a server." };

    const member = GuildMemberStore.getMember(guild.id, user.id);
    if (!member) return { detail: "Member role details are not available." };

    const roleIds = new Set([guild.id, ...member.roles]);
    const roles = Array.from(roleIds)
        .map(roleId => GuildRoleStore.getRole(guild.id, roleId))
        .filter((role): role is Role => role != null)
        .sort((a, b) => b.position - a.position);
    const administrator = BigInt(PermissionsBits.ADMINISTRATOR);
    const effectivePermissions = plugin.getPermissions(user, channel);
    const sources = roles.flatMap(role => {
        const rolePermissions = permissions.filter(permission => {
            const bit = PermissionsBits[permission as keyof typeof PermissionsBits];
            if (bit === undefined) return false;
            const effective = effectivePermissions & BigInt(bit);
            if (effective === 0n && (permission === "ADMINISTRATOR" || (effectivePermissions & administrator) === 0n))
                return false;
            return (role.permissions & BigInt(bit)) !== 0n ||
                (permission !== "ADMINISTRATOR" && (role.permissions & administrator) !== 0n) ||
                ((channel.permissionOverwrites?.[role.id]?.allow ?? 0n) & BigInt(bit)) !== 0n;
        });

        return rolePermissions.length
            ? [{
                roleName: role.name,
                detail: `${role.name}${badgeLineBreak}${rolePermissions.map(permission => `• ${formatPermission(permission)}`).join(badgeLineBreak)}`
            }]
            : [];
    });

    if (sources.length) {
        return {
            roleName: sources[0].roleName,
            detail: `Permission sources · ${guild.name}${badgeLineBreak}${badgeLineBreak}${sources.map(source => source.detail).join(`${badgeLineBreak}${badgeLineBreak}`)}`
        };
    }

    return { detail: `No matching role permissions found · ${guild.name}` };
}

function getBadgeDetails(tagName: (typeof tags)[number]["name"], user: User, channel: Channel | undefined): BadgeDetails {
    if (tagName === "OWNER") {
        const guild = channel && GuildStore.getGuild(channel.guild_id);
        return {
            detail: guild ? `Server owner · ${guild.name}${badgeLineBreak}${user.username}` : `Server owner${badgeLineBreak}${user.username}`
        };
    }

    if (tagName === "WEBHOOK")
        return { detail: `Webhook message${badgeLineBreak}Awarded for sending a message through a webhook.` };

    const tag = tagsByName.get(tagName);
    return tag && "permissions" in tag && channel
        ? getPermissionDetails(user, channel, tag.permissions)
        : { detail: tag?.description ?? "" };
}

function getTagIconSrc(tagName: (typeof tags)[number]["name"]) {
    return getValidIconUrl(settings.store[tagIconUrlSettingKeys[tagName]]) ?? badgeIconUrls[tagName];
}

function renderTagBadge(tagName: TagName, userId: string, className: string, showDisplayName = false, imageContainerClassName?: string) {
    const displayText = plugin.getTagText(tagName);
    const iconSrc = getTagIconSrc(tagName);
    const icon = (
        <img
            src={iconSrc}
            alt={`Role icon, ${displayText}`}
            className="roleIcon_ee71ee roleIcon_c19a55 clickable_ee71ee"
            width={20}
            height={20}
            style={{ width: 20, height: 20, objectFit: "contain" }}
        />
    );
    const badgeContent = showDisplayName
        ? <span className="botText__82f07">{displayText}</span>
        : imageContainerClassName
            ? <span className={imageContainerClassName}>{icon}</span>
            : icon;

    return (
        <Tooltip text={displayText}>
            {({ onMouseEnter, onMouseLeave }) => (
                <span
                    className={className}
                    role="button"
                    tabIndex={0}
                    aria-label={displayText}
                    onMouseEnter={onMouseEnter}
                    onMouseLeave={onMouseLeave}
                    onClick={event => {
                        event.stopPropagation();
                        void openUserProfile(userId);
                    }}
                    onKeyDown={event => {
                        if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            event.stopPropagation();
                            void openUserProfile(userId);
                        }
                    }}
                >
                    {badgeContent}
                </span>
            )}
        </Tooltip>
    );
}

const profileBadge: ProfileBadge = {
    id: "vc-more-user-tags",
    position: BadgePosition.START,
    getBadges({ userId, guildId }) {
        const user = UserStore.getUser(userId);
        const channelId = plugin.getChannelId();
        const selectedChannel = channelId ? ChannelStore.getChannel(channelId) : undefined;
        const channel = selectedChannel && (!guildId || selectedChannel.guild_id === guildId) ? selectedChannel : undefined;
        const message = channel
            ? MessageStore.getMessages(channel.id)._array.find(message => message.author.id === userId && message.webhookId)
            : undefined;
        const tagId = plugin.getTag({
            message,
            user,
            channelId: channel?.id,
            isChat: false
        });
        if (!tagId) return [];

        const tagKey = plugin.getTagNameFromNumId(tagId);
        const tag = tagKey && tagsByName.get(tagKey);
        if (!tag || !user) return [];

        const tagName = tag.name;
        const displayText = plugin.getTagText(tagName);
        const { detail, roleName } = getBadgeDetails(tagName, user, channel);
        const rarity = settings.store.tagSettings?.[tagName]?.rarity ?? defaultRarities[tagName];
        const iconSrc = getTagIconSrc(tagName);
        const badgeName = roleName ?? displayText;

        return [{
            id: `vc-more-user-tag-${tagName.toLowerCase()}-${getDetailsHash(`${badgeName}\0${displayText}\0${rarity}\0${detail}\0${iconSrc}`)}`,
            key: displayText,
            iconSrc,
            largeIconSrc: iconSrc,
            name: badgeName,
            description: displayText,
            detail,
            rarity,
            infoLabel: displayText,
            props: {
                title: displayText,
                alt: displayText,
                width: 20,
                height: 20,
                style: {
                    width: 20,
                    height: 20,
                    maxWidth: 20,
                    maxHeight: 20,
                    objectFit: "contain"
                }
            }
        }];
    }
};

const genTagTypes = () => {
    let i = 100;
    const obj = {};

    for (const { name } of tags) {
        obj[name] = ++i;
        obj[i] = name;
    }

    return obj;
};

const plugin = definePlugin({
    name: "MoreUserTags",
    description: "Adds tags for webhooks and moderative roles (owner, admin, etc.)",
    authors: [Devs.Cyn, Devs.TheSun, Devs.RyanCaoDev, Devs.LordElias, Devs.AutumnVN, Devs.Stellaros],
    settings,
    flux: {
        GUILD_MEMBER_UPDATE: () => { permissionCache = new WeakMap(); },
        GUILD_ROLE_CREATE: () => { permissionCache = new WeakMap(); },
        GUILD_ROLE_UPDATE: () => { permissionCache = new WeakMap(); },
        GUILD_ROLE_DELETE: () => { permissionCache = new WeakMap(); },
        CHANNEL_UPDATE: () => { permissionCache = new WeakMap(); },
        GUILD_UPDATE: () => { permissionCache = new WeakMap(); },
    },
    patches: [
        {
            find: ".clickableUsername",
            replacement: {
                match: /null!=(\i)(?=.{0,100}type:\i)/,
                replace: "($1=$self.getTag({...arguments[0],channelId:$self.getChannelId(),isChat:false,origType:$1}),$1!==null)"
            }
        },
        {
            find: "#{intl::GUEST_NAME_SUFFIX})]",
            replacement: {
                match: /#{intl::GUEST_NAME_SUFFIX}.{0,50}?""(?=\])(?<=guildId:(\i),.+?user:(\i).+?)/,
                replace: "$&,$self.renderVoiceUserTag({user:$2})"
            }
        }
    ],
    start() {
        const tagSettings = settings.store.tagSettings || {} as TagSettings;
        for (const tag of Object.values(tags)) {
            const legacySettings = tagSettings[tag.name];
            const displayNameSettingKey = tagDisplayNameSettingKeys[tag.name];
            const iconUrlSettingKey = tagIconUrlSettingKeys[tag.name];

            if (legacySettings?.text && settings.store[displayNameSettingKey] === tag.displayName)
                settings.store[displayNameSettingKey] = legacySettings.text;
            if (legacySettings?.iconUrl && !settings.store[iconUrlSettingKey])
                settings.store[iconUrlSettingKey] = legacySettings.iconUrl;

            tagSettings[tag.name] ??= {
                showInChat: true,
                showInNotChat: true,
                rarity: defaultRarities[tag.name]
            };

            if (legacySettings) {
                delete legacySettings.text;
                delete legacySettings.iconUrl;
            }
        }

        settings.store.tagSettings = tagSettings;
        addProfileBadge(profileBadge);
    },
    stop() {
        removeProfileBadge(profileBadge);
    },
    localTags: genTagTypes(),
    getChannelId() {
        return SelectedChannelStore.getChannelId();
    },
    getTagNameFromNumId(numId: number | null): string | null {
        if (!numId) return null;
        return this.localTags[numId] || null;
    },
    getTagText(tagName: string | null | undefined) {
        if (!tagName) return getIntlMessage("APP_TAG");

        if (!settings.store.tagSettings) {
            settings.store.tagSettings = {};
        }

        const tag = tagsByName.get(tagName);
        if (!tag) return tagName || getIntlMessage("APP_TAG");

        const configured = settings.store[tagDisplayNameSettingKeys[tag.name]];
        return configured || tag.displayName;
    },
    renderMessageDecoration(props) {
        const tagId = this.getTag({
            message: props.message,
            user: UserStore.getUser(props.message.author.id),
            channelId: props.message.channel_id,
            isChat: false
        });

        if (!tagId) return null;
        const tagKey = this.getTagNameFromNumId(tagId);
        const tag = tagKey && tagsByName.get(tagKey);
        if (!tag) return null;
        return renderTagBadge(
            tag.name,
            props.message.author.id,
            "botTagCozy_c19a55 botTag_c19a55 botTagRegular__82f07 botTag__82f07 rem__82f07",
            true
        );
    },
    renderMemberListDecorator(props) {
        const tagId = this.getTag({
            user: props.user,
            channel: getCurrentChannel(),
            isChat: false
        });

        if (!tagId) return null;
        const tagKey = this.getTagNameFromNumId(tagId);
        const tag = tagKey && tagsByName.get(tagKey);
        if (!tag) return null;
        return renderTagBadge(
            tag.name,
            props.user.id,
            "botTagCozy_c19a55 botTag_c19a55 botTagRegular__82f07 botTag__82f07 px__82f07 vc-tag",
            true
        );
    },
    renderVoiceUserTag({ user }: { user: User; }) {
        const tagId = this.getTag({ user, channelId: this.getChannelId(), isChat: false });
        if (!tagId) return null;

        const tagKey = this.getTagNameFromNumId(tagId);
        const tag = tagKey && tagsByName.get(tagKey);
        if (!tag) return null;
        return renderTagBadge(
            tag.name,
            user.id,
            "vc-mut-voice-tag",
            false,
            "vc-mut-voice-icon-container"
        );
    },
    getTag({
        message, user, channelId, isChat, channel, origType
    }: {
        message?: Message,
        user?: User,
        channel?: Channel,
        channelId?: string;
        isChat?: boolean;
        origType?: number | null;
    }): number | null {
        const pluginSettings = settings.store;

        if (!user) return null;
        if (isChat && user.id === "1") return null;

        if (!channel && channelId)
            channel = ChannelStore.getChannel(channelId);
        if (!channel) return null;

        const isGuildOwner = GuildStore.getGuild(channel.guild_id)?.ownerId === user.id;
        const ownerVisibilitySetting = isChat ? "showInChat" : "showInNotChat";
        let perms: bigint | undefined;

        for (const tag of tags) {
            if (user.bot && pluginSettings.dontShowForBots && tag.name !== "WEBHOOK")
                continue;

            if (isChat && !pluginSettings.tagSettings?.[tag.name]?.showInChat)
                continue;
            if (!isChat && !pluginSettings.tagSettings?.[tag.name]?.showInNotChat)
                continue;

            if (
                tag.name !== "OWNER" &&
                isGuildOwner &&
                !pluginSettings.tagSettings?.OWNER?.[ownerVisibilitySetting]
            )
                continue;

            if ("permissions" in tag) {
                const permissionMask = perms ??= this.getPermissions(user, channel);
                if ((permissionMask & this.getPermissionMask(tag.name, tag.permissions)) !== 0n)
                    return this.localTags[tag.name];
            } else if (tag.condition?.(message ?? null, user, channel)) {

                return this.localTags[tag.name];
            }
        }

        if (pluginSettings.dontShowBotTag && user.bot) return null;
        return origType ?? null;
    },
    getPermissions(user: User, channel: Channel): bigint {
        const guild = GuildStore.getGuild(channel.guild_id);
        if (!guild) return 0n;

        const overwrites = channel.permissionOverwrites;
        let channelPermissions = permissionCache.get(user);
        if (!channelPermissions) {
            channelPermissions = new WeakMap();
            permissionCache.set(user, channelPermissions);
        }

        const cached = channelPermissions.get(channel);
        if (cached?.guild === guild && cached.overwrites === overwrites)
            return cached.permissions;

        const permissions = computePermissions({ user, context: guild, overwrites });
        channelPermissions.set(channel, { guild, overwrites, permissions });
        return permissions;
    },
    getPermissionMask(tagName: string, permissions: readonly string[]): bigint {
        const cached = permissionMasks.get(tagName);
        if (cached !== undefined) return cached;

        const mask = permissions.reduce((acc, permission) => {
            const bit = PermissionsBits[permission as keyof typeof PermissionsBits];
            return bit === undefined ? acc : acc | BigInt(bit);
        }, 0n);

        permissionMasks.set(tagName, mask);
        return mask;
    },
});

export default plugin;
