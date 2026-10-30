/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vencord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { Button } from "@components/Button";
import { CloudDownloadIcon, CopyIdIcon, InfoIcon } from "@components/Icons";
import { Paragraph } from "@components/Paragraph";
import { TooltipContainer } from "@components/TooltipContainer";
import { copyToClipboard } from "@utils/clipboard";
import { Devs } from "@utils/constants";
import { openUserProfile } from "@utils/discord";
import definePlugin from "@utils/types";
import { saveFile } from "@utils/web";
import type { Guild, GuildMember, RenderModalProps, Role, User } from "@vencord/discord-types";
import { Checkbox, GuildMemberStore, GuildRoleStore, IconUtils, Menu, Modal, openModal, PermissionsBits, ScrollerThin, useMemo, UserStore, useState, useStateFromStores } from "@webpack/common";

const STAFF_PERMISSIONS = [
    ["Administrator", "ADMINISTRATOR"],
    ["Manage Server", "MANAGE_GUILD"],
    ["Manage Channels", "MANAGE_CHANNELS"],
    ["Manage Roles", "MANAGE_ROLES"],
    ["Manage Messages", "MANAGE_MESSAGES"],
    ["Kick Members", "KICK_MEMBERS"],
    ["Ban Members", "BAN_MEMBERS"],
    ["Moderate Members", "MODERATE_MEMBERS"]
] as const;

interface StaffMember {
    member: GuildMember;
    user: User;
    roles: Role[];
    highestRole: Role | null;
    permissions: string[];
    isOwner: boolean;
}

function getPermissionSourceRoles(roles: Role[], key: typeof STAFF_PERMISSIONS[number][1]) {
    const permission = BigInt(PermissionsBits[key]);
    const administrator = BigInt(PermissionsBits.ADMINISTRATOR);

    return roles.filter(role =>
        (role.permissions & permission) !== 0n ||
        (key !== "ADMINISTRATOR" && (role.permissions & administrator) !== 0n)
    );
}

function getPermissionSources(roles: Role[]) {
    return STAFF_PERMISSIONS.flatMap(([label, key]) => {
        const sourceRoles = getPermissionSourceRoles(roles, key);
        return sourceRoles.length ? [{ key, label, sourceRoles }] : [];
    });
}

function hasRolePermission(permissionMask: bigint, key: typeof STAFF_PERMISSIONS[number][1]) {
    const permission = BigInt(PermissionsBits[key]);
    const administrator = BigInt(PermissionsBits.ADMINISTRATOR);

    return (permissionMask & permission) !== 0n ||
        (key !== "ADMINISTRATOR" && (permissionMask & administrator) !== 0n);
}

function getStaffMember(guild: Guild, member: GuildMember): StaffMember | null {
    const user = UserStore.getUser(member.userId);
    if (!user) return null;

    const roles = member.roles
        .map(roleId => GuildRoleStore.getRole(guild.id, roleId))
        .filter((role): role is Role => role != null);
    let highestRole: Role | null = null;
    let permissionMask = 0n;
    for (const role of roles) {
        permissionMask |= role.permissions;
        if (!highestRole || role.position > highestRole.position)
            highestRole = role;
    }

    const permissions = STAFF_PERMISSIONS
        .filter(([, key]) => hasRolePermission(permissionMask, key))
        .map(([label]) => label);
    const isOwner = guild.ownerId === member.userId;

    if (!isOwner && permissions.length === 0) return null;

    roles.sort((a, b) => b.position - a.position);
    return { member, user, roles, highestRole, permissions, isOwner };
}

function getRoleIconUrl(role: Role) {
    return role.icon && `${location.protocol}//${window.GLOBAL_ENV.CDN_HOST}/role-icons/${role.id}/${role.icon}.webp?size=48&quality=lossless`;
}

function RoleBadge({ role, owner = false }: { role: Role | null; owner?: boolean; }) {
    const iconUrl = role && getRoleIconUrl(role);
    const label = owner ? "Server Owner" : role?.name ?? "@everyone";

    return (
        <span className="vc-retrieve-staff-list-role-badge" style={{ color: role?.colorString ?? "var(--text-muted)" }}>
            {iconUrl
                ? <img className="vc-retrieve-staff-list-role-icon" src={iconUrl} alt="" />
                : role?.unicodeEmoji && <span className="vc-retrieve-staff-list-role-emoji">{role.unicodeEmoji}</span>}
            <span className="vc-retrieve-staff-list-role-dot" />
            <span>{label}</span>
        </span>
    );
}

function RoleIdIcon({ width = 18, height = 18, ...props }: Parameters<typeof InfoIcon>[0]) {
    return (
        <svg {...props} width={width} height={height} viewBox="0 0 24 24" fill="none">
            <path fill="currentColor" d="M3 5a3 3 0 0 1 3-3h8.17a3 3 0 0 1 2.12.88l4.83 4.83a3 3 0 0 1 0 4.24l-7.05 7.05a3 3 0 0 1-4.24 0l-6.95-6.95A3 3 0 0 1 2 9.93V6a3 3 0 0 1 1-1Zm3-1a1 1 0 0 0-1 1v3.93a1 1 0 0 0 .29.71l6.95 6.95a1 1 0 0 0 1.42 0l7.05-7.05a1 1 0 0 0 0-1.42l-4.83-4.83A1 1 0 0 0 15.17 4H6Zm2.5 2A1.5 1.5 0 1 1 7 7.5 1.5 1.5 0 0 1 8.5 6Z" />
        </svg>
    );
}

function IconButton({ label, icon: Icon, onClick }: { label: string; icon: typeof InfoIcon; onClick(): void; }) {
    return (
        <TooltipContainer text={label}>
            <button
                aria-label={label}
                className="vc-retrieve-staff-list-icon-button"
                onClick={event => {
                    event.stopPropagation();
                    onClick();
                }}
            >
                <Icon width="18" height="18" />
            </button>
        </TooltipContainer>
    );
}

function openPermissionsModal(entry: StaffMember) {
    openModal(modalProps => (
        <Modal {...modalProps} size="md" title={`${entry.member.nick ?? entry.user.globalName ?? entry.user.username} Permissions`}>
            <div className="vc-retrieve-staff-list-permissions-modal">
                {entry.isOwner && <Paragraph>The server owner has every permission.</Paragraph>}
                {getPermissionSources(entry.roles).map(({ key, label, sourceRoles }) => (
                    <div className="vc-retrieve-staff-list-permission" key={key}>
                        <strong>{label}</strong>
                        <div className="vc-retrieve-staff-list-permission-sources">
                            {sourceRoles.map(role => <RoleBadge key={role.id} role={role} />)}
                        </div>
                    </div>
                ))}
            </div>
        </Modal>
    ));
}

function StaffRow({ entry, guild }: { entry: StaffMember; guild: Guild; }) {
    const avatar = entry.member.avatar
        ? IconUtils.getGuildMemberAvatarURLSimple({
            userId: entry.user.id,
            avatar: entry.member.avatar,
            guildId: guild.id,
            canAnimate: true
        })
        : IconUtils.getUserAvatarURL(entry.user, true);
    const displayName = entry.member.nick ?? entry.user.globalName ?? entry.user.username;

    return (
        <div className="vc-retrieve-staff-list-row">
            <button className="vc-retrieve-staff-list-member" onClick={() => openUserProfile(entry.user.id)}>
                <img className="vc-retrieve-staff-list-avatar" src={avatar} alt="" />
                <span className="vc-retrieve-staff-list-identity">
                    <span className="vc-retrieve-staff-list-display-name">
                        <strong>{displayName}</strong>
                        {entry.user.bot && (
                            <span className={`vc-retrieve-staff-list-app-badge${entry.user.isVerifiedBot() ? " verified" : ""}`} aria-label={entry.user.isVerifiedBot() ? "Verified application" : "Application"}>
                                {entry.user.isVerifiedBot() && (
                                    <svg aria-hidden="true" viewBox="0 0 12 12">
                                        <path fill="currentColor" d="m4.5 8.4-2.1-2.1 1-1L4.5 6.4l4.1-4.1 1 1-5.1 5.1Z" />
                                    </svg>
                                )}
                                APP
                            </span>
                        )}
                    </span>
                    <span className="vc-retrieve-staff-list-username">@{entry.user.username}</span>
                </span>
            </button>
            <RoleBadge role={entry.highestRole} owner={entry.isOwner} />
            <span className="vc-retrieve-staff-list-permission-summary">
                {entry.isOwner ? "All permissions" : entry.permissions.join(", ")}
            </span>
            <span className="vc-retrieve-staff-list-actions">
                <IconButton label="View permissions by role" icon={InfoIcon} onClick={() => openPermissionsModal(entry)} />
                <IconButton label="Copy member ID" icon={CopyIdIcon} onClick={() => copyToClipboard(entry.user.id)} />
                {entry.highestRole && <IconButton label="Copy highest role ID" icon={RoleIdIcon} onClick={() => copyToClipboard(entry.highestRole!.id)} />}
            </span>
        </div>
    );
}

function exportStaffList(guild: Guild, members: StaffMember[]) {
    const data = {
        guild: { id: guild.id, name: guild.name },
        exportedAt: new Date().toISOString(),
        members: members.map(entry => ({
            id: entry.user.id,
            username: entry.user.username,
            displayName: entry.member.nick ?? entry.user.globalName ?? entry.user.username,
            isOwner: entry.isOwner,
            highestRole: entry.highestRole && {
                id: entry.highestRole.id,
                name: entry.highestRole.name,
                color: entry.highestRole.colorString ?? null,
                icon: getRoleIconUrl(entry.highestRole) ?? null
            },
            roles: entry.roles.map(role => ({ id: role.id, name: role.name, color: role.colorString ?? null })),
            permissions: getPermissionSources(entry.roles).map(({ label, sourceRoles }) => ({
                name: label,
                roles: sourceRoles.map(role => ({ id: role.id, name: role.name }))
            }))
        }))
    };
    const filename = `${guild.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || guild.id}-staff-list.json`;
    saveFile(new File([JSON.stringify(data, null, 2)], filename, { type: "application/json" }));
}

function StaffListModal({ guild, modalProps }: { guild: Guild; modalProps: RenderModalProps; }) {
    const [excludeBots, setExcludeBots] = useState(true);
    const memberVersion = useStateFromStores(
        [GuildMemberStore],
        () => GuildMemberStore.getMemberVersion(),
        null
    );
    const roleSnapshot = useStateFromStores(
        [GuildRoleStore],
        () => GuildRoleStore.getRolesSnapshot(guild.id),
        [guild.id]
    );
    const allStaffMembers = useMemo(() => GuildMemberStore.getMembers(guild.id)
        .map(member => getStaffMember(guild, member))
        .filter((member): member is StaffMember => member != null)
        .sort((a, b) => {
            if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
            const positionDifference = (b.highestRole?.position ?? 0) - (a.highestRole?.position ?? 0);
            return positionDifference || (a.user.globalName ?? a.user.username).localeCompare(b.user.globalName ?? b.user.username);
        }), [guild, memberVersion, roleSnapshot]);
    const members = useMemo(
        () => excludeBots ? allStaffMembers.filter(member => !member.user.bot) : allStaffMembers,
        [allStaffMembers, excludeBots]
    );

    return (
        <Modal {...modalProps} size="xl" title="Staff List">
            <div className="vc-retrieve-staff-list-modal">
                <div className="vc-retrieve-staff-list-toolbar">
                    <Paragraph className="vc-retrieve-staff-list-description">
                        {members.length} staff members currently available in Discord's local cache.
                    </Paragraph>
                    <Checkbox value={excludeBots} onChange={(_, value) => setExcludeBots(value)} size={18}>
                        Exclude bots
                    </Checkbox>
                </div>
                <div className="vc-retrieve-staff-list-columns" aria-hidden="true">
                    <span>Member</span><span>Highest role</span><span>Elevated permissions</span><span>Actions</span>
                </div>
                <ScrollerThin className="vc-retrieve-staff-list-scroller">
                    {members.length > 0
                        ? members.map(entry => <StaffRow key={entry.user.id} entry={entry} guild={guild} />)
                        : <Paragraph>No staff members are available yet.</Paragraph>}
                </ScrollerThin>
                <div className="vc-retrieve-staff-list-footer">
                    <Button onClick={() => exportStaffList(guild, members)}>
                        <CloudDownloadIcon width="18" height="18" />
                        Export cached list
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

function openStaffList(guild: Guild) {
    openModal(props => <StaffListModal guild={guild} modalProps={props} />);
}

const GuildContext: NavContextMenuPatchCallback = (children, { guild }: { guild?: Guild; }) => {
    if (!guild) return;

    findGroupChildrenByChildId("privacy", children)?.push(
        <Menu.MenuItem
            id="vc-retrieve-staff-list"
            label="View Staff List"
            action={() => openStaffList(guild)}
        />
    );
};

export default definePlugin({
    name: "RetrieveStaffList",
    description: "View server staff members, their highest role and elevated permissions.",
    tags: ["Servers", "Roles", "Utility"],
    authors: [Devs.Stellaros],
    contextMenus: {
        "guild-context": GuildContext,
        "guild-header-popout": GuildContext
    }
});
