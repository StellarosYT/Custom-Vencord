/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { BadgeRarity } from "@api/Badges";
import type { Channel, Message, Permissions, User } from "@vencord/discord-types";

export type ITag = {
    name: string;
    displayName: string;
    description: string;
} & ({
    permissions: Permissions[];
} | {
    condition?(message: Message | null, user: User, channel: Channel): boolean;
});

export interface TagSetting {
    text?: string;
    showInChat: boolean;
    showInNotChat: boolean;
    rarity?: BadgeRarity;
    iconUrl?: string;
}

export type TagSettings = Record<string, TagSetting>;

export function getValidIconUrl(value?: string) {
    if (!value?.trim()) return undefined;

    try {
        const url = new URL(value.trim());
        return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
    } catch (error) {
        if (error instanceof TypeError) return undefined;
        throw error;
    }
}
