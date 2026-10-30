/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BadgeRarity } from "@api/Badges";
import { definePluginSettings, useSettings } from "@api/Settings";
import { Card } from "@components/Card";
import { Flex } from "@components/Flex";
import { Heading } from "@components/Heading";
import { Switch } from "@components/Switch";
import { Margins } from "@utils/margins";
import { OptionType } from "@utils/types";
import { Select, Tooltip, useEffect, useState } from "@webpack/common";

import { defaultRarities, tags } from "./consts";
import { badgeIconUrls } from "./icons";
import { getValidIconUrl, TagSetting, TagSettings } from "./types";

const rarityOptions = [
    { label: "Common", value: BadgeRarity.COMMON },
    { label: "Rare", value: BadgeRarity.RARE },
    { label: "Epic", value: BadgeRarity.EPIC },
    { label: "Mythic", value: BadgeRarity.MYTHIC }
] satisfies Array<{ label: string; value: BadgeRarity; }>;
type TagName = (typeof tags)[number]["name"];
const badgeIconSize = 48;
const badgePreviewIconSize = 14;

export const tagDisplayNameSettingKeys = {
    WEBHOOK: "webhookDisplayName",
    OWNER: "ownerDisplayName",
    ADMINISTRATOR: "adminDisplayName",
    MODERATOR_STAFF: "staffDisplayName",
    MODERATOR: "moderatorDisplayName",
    VOICE_MODERATOR: "voiceModeratorDisplayName",
    CHAT_MODERATOR: "chatModeratorDisplayName"
} as const satisfies Record<TagName, string>;

export const tagIconUrlSettingKeys = {
    WEBHOOK: "webhookIconUrl",
    OWNER: "ownerIconUrl",
    ADMINISTRATOR: "adminIconUrl",
    MODERATOR_STAFF: "staffIconUrl",
    MODERATOR: "moderatorIconUrl",
    VOICE_MODERATOR: "voiceModeratorIconUrl",
    CHAT_MODERATOR: "chatModeratorIconUrl"
} as const satisfies Record<TagName, string>;

function SettingsComponent() {
    useSettings();
    const [tagSettings, setTagSettings] = useState<TagSettings>(settings.store.tagSettings ?? {});

    useEffect(() => {
        const normalized: TagSettings = { ...tagSettings };
        let hasChanges = false;

        for (const tag of tags) {
            if (!normalized[tag.name]) {
                normalized[tag.name] = {
                    showInChat: true,
                    showInNotChat: true,
                    rarity: defaultRarities[tag.name]
                };
                hasChanges = true;
            } else if (normalized[tag.name].rarity === undefined) {
                normalized[tag.name] = {
                    ...normalized[tag.name],
                    rarity: defaultRarities[tag.name]
                };
                hasChanges = true;
            }
        }

        if (hasChanges) {
            setTagSettings(normalized);
            settings.store.tagSettings = normalized;
        }
    }, []);

    const updateTagSetting = (tagName: TagName, key: keyof TagSetting, value: TagSetting[keyof TagSetting]) => {
        const updated = { ...tagSettings };
        if (!updated[tagName]) {
            updated[tagName] = {
                showInChat: true,
                showInNotChat: true,
                rarity: defaultRarities[tagName]
            };
        }
        updated[tagName] = { ...updated[tagName], [key]: value };
        setTagSettings(updated);
        settings.store.tagSettings = updated;
    };

    const normalizedTagSettings = tagSettings;

    return (
        <Flex flexDirection="column">
            {tags.map(t => {
                const customIconUrl = settings.store[tagIconUrlSettingKeys[t.name]];
                const validIconUrl = getValidIconUrl(customIconUrl);
                const displayName = settings.store[tagDisplayNameSettingKeys[t.name]] || t.displayName;
                const iconUrl = validIconUrl ?? badgeIconUrls[t.name];

                return (
                    <Card key={t.name} style={{ padding: "1em 1em 0" }}>
                        <Heading tag="h5" style={{ width: "fit-content" }}>
                            <Tooltip text={t.description}>
                                {({ onMouseEnter, onMouseLeave }) => (
                                    <div
                                        onMouseEnter={onMouseEnter}
                                        onMouseLeave={onMouseLeave}
                                    >
                                        {t.displayName} Tag
                                        <span
                                            className="botTagCozy_c19a55 botTag_c19a55 botTagRegular__82f07 botTag__82f07 vc-tag"
                                            role="img"
                                            aria-label={displayName}
                                            title={displayName}
                                            style={{ marginLeft: 6 }}
                                        >
                                            <img
                                                src={iconUrl}
                                                alt=""
                                                width={badgePreviewIconSize}
                                                height={badgePreviewIconSize}
                                                style={{
                                                    width: badgePreviewIconSize,
                                                    height: badgePreviewIconSize,
                                                    objectFit: "contain",
                                                    marginRight: 3
                                                }}
                                            />
                                            <span className="botText__82f07">{displayName}</span>
                                        </span>
                                    </div>
                                )}
                            </Tooltip>
                        </Heading>

                        <Flex alignItems="center" gap="0.75em" className={Margins.bottom16}>
                            {validIconUrl && (
                                <img
                                    src={validIconUrl}
                                    alt={`${t.displayName} badge preview`}
                                    width={badgeIconSize}
                                    height={badgeIconSize}
                                    style={{
                                        width: badgeIconSize,
                                        height: badgeIconSize,
                                        objectFit: "contain",
                                        flex: "0 0 auto"
                                    }}
                                />
                            )}
                        </Flex>
                        <span className={Margins.bottom16} style={{ display: "block", color: "var(--text-muted)" }}>
                            Use a direct image link. Icons are displayed within {badgeIconSize} × {badgeIconSize} px.
                        </span>
                        {customIconUrl && !validIconUrl && (
                            <span className={Margins.bottom16} style={{ display: "block", color: "var(--text-danger)" }}>
                                Enter a valid HTTP or HTTPS image URL.
                            </span>
                        )}

                        <Flex alignItems="center" gap="0.5em" className={Margins.bottom16}>
                            <span>Badge rarity</span>
                            <Select
                                options={rarityOptions}
                                placeholder="Badge rarity"
                                closeOnSelect={true}
                                select={value => updateTagSetting(t.name, "rarity", value)}
                                isSelected={value => value === (normalizedTagSettings[t.name]?.rarity ?? defaultRarities[t.name])}
                                serialize={String}
                            />
                        </Flex>

                        <Flex alignItems="center" gap="0.5em">
                            <Switch
                                checked={normalizedTagSettings[t.name]?.showInChat ?? true}
                                onChange={v => updateTagSetting(t.name, "showInChat", v)}
                            />
                            <span>Show in messages</span>
                        </Flex>

                        <Flex alignItems="center" gap="0.5em" style={{ marginTop: 8 }}>
                            <Switch
                                checked={normalizedTagSettings[t.name]?.showInNotChat ?? true}
                                onChange={v => updateTagSetting(t.name, "showInNotChat", v)}
                            />
                            <span>Show in member list and profiles</span>
                        </Flex>
                    </Card>
                );
            })}
        </Flex>
    );
}

export const settings = definePluginSettings({
    webhookDisplayName: {
        description: "Display name for the Webhook badge",
        type: OptionType.STRING,
        default: "Webhook"
    },
    ownerDisplayName: {
        description: "Display name for the Owner badge",
        type: OptionType.STRING,
        default: "Owner"
    },
    adminDisplayName: {
        description: "Display name for the Admin badge",
        type: OptionType.STRING,
        default: "Admin"
    },
    staffDisplayName: {
        description: "Display name for the Staff badge",
        type: OptionType.STRING,
        default: "Staff"
    },
    moderatorDisplayName: {
        description: "Display name for the Mod badge",
        type: OptionType.STRING,
        default: "Mod"
    },
    voiceModeratorDisplayName: {
        description: "Display name for the VC Mod badge",
        type: OptionType.STRING,
        default: "VC Mod"
    },
    chatModeratorDisplayName: {
        description: "Display name for the Chat Mod badge",
        type: OptionType.STRING,
        default: "Chat Mod"
    },
    webhookIconUrl: {
        description: "Custom image URL for the Webhook badge (SVG, PNG, JPG, GIF)",
        type: OptionType.STRING,
        default: ""
    },
    ownerIconUrl: {
        description: "Custom image URL for the Owner badge (SVG, PNG, JPG, GIF)",
        type: OptionType.STRING,
        default: ""
    },
    adminIconUrl: {
        description: "Custom image URL for the Admin badge (SVG, PNG, JPG, GIF)",
        type: OptionType.STRING,
        default: ""
    },
    staffIconUrl: {
        description: "Custom image URL for the Staff badge (SVG, PNG, JPG, GIF)",
        type: OptionType.STRING,
        default: ""
    },
    moderatorIconUrl: {
        description: "Custom image URL for the Mod badge (SVG, PNG, JPG, GIF)",
        type: OptionType.STRING,
        default: ""
    },
    voiceModeratorIconUrl: {
        description: "Custom image URL for the VC Mod badge (SVG, PNG, JPG, GIF)",
        type: OptionType.STRING,
        default: ""
    },
    chatModeratorIconUrl: {
        description: "Custom image URL for the Chat Mod badge (SVG, PNG, JPG, GIF)",
        type: OptionType.STRING,
        default: ""
    },
    dontShowForBots: {
        description: "Don't show extra tags for bots (excluding webhooks)",
        type: OptionType.BOOLEAN,
        default: false
    },
    dontShowBotTag: {
        description: "Only show extra tags for bots / Hide [APP] text",
        type: OptionType.BOOLEAN,
        default: false,
        restartNeeded: true
    },
    tagSettings: {
        type: OptionType.COMPONENT,
        component: SettingsComponent,
        description: "Configure tag text, visibility and badge rarity."
    }
});
