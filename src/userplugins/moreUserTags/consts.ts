/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BadgeRarity } from "@api/Badges";
import { Channel, Guild, Message, User } from "@vencord/discord-types";
import { findByCodeLazy } from "@webpack";
import { GuildStore } from "@webpack/common";

import type { ITag } from "./types";

export const isWebhook = (message: Message | null, user: User) => !!message?.webhookId && user.isNonUserBot();
export const tags = [
    {
        name: "WEBHOOK",
        displayName: "Webhook",
        description: "Messages sent by webhooks",
        condition: isWebhook
    }, {
        name: "OWNER",
        displayName: "Owner",
        description: "Owns the server",
        condition: (_, user, channel) => GuildStore.getGuild(channel?.guild_id)?.ownerId === user.id
    }, {
        name: "ADMINISTRATOR",
        displayName: "Admin",
        description: "Has the administrator permission",
        permissions: ["ADMINISTRATOR"]
    }, {
        name: "MODERATOR_STAFF",
        displayName: "Staff",
        description: "Can manage the server, channels or roles",
        permissions: ["MANAGE_GUILD", "MANAGE_CHANNELS", "MANAGE_ROLES"]
    }, {
        name: "MODERATOR",
        displayName: "Mod",
        description: "Can manage messages or kick/ban people",
        permissions: ["MANAGE_MESSAGES", "KICK_MEMBERS", "BAN_MEMBERS"]
    }, {
        name: "VOICE_MODERATOR",
        displayName: "VC Mod",
        description: "Can manage voice chats",
        permissions: ["MOVE_MEMBERS", "MUTE_MEMBERS", "DEAFEN_MEMBERS"]
    }, {
        name: "CHAT_MODERATOR",
        displayName: "Chat Mod",
        description: "Can timeout people",
        permissions: ["MODERATE_MEMBERS"]
    }
] as const satisfies ITag[];

export const defaultRarities = {
    OWNER: BadgeRarity.MYTHIC,
    ADMINISTRATOR: BadgeRarity.MYTHIC,
    WEBHOOK: BadgeRarity.MYTHIC,
    MODERATOR_STAFF: BadgeRarity.EPIC,
    MODERATOR: BadgeRarity.RARE,
    VOICE_MODERATOR: BadgeRarity.COMMON,
    CHAT_MODERATOR: BadgeRarity.COMMON
} as const satisfies Record<(typeof tags)[number]["name"], BadgeRarity>;

export const computePermissions: (options: {
    user?: { id: string; } | string | null;
    context?: Guild | Channel | null;
    overwrites?: Channel["permissionOverwrites"] | null;
    checkElevated?: boolean;
    excludeGuildPermissions?: boolean;
}) => bigint = findByCodeLazy(".getCurrentUser()", ".computeLurkerPermissionsAllowList()");
