/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import administratorIcon from "file://./icons/ADMINISTRATOR.gif?base64";
import moderatorIcon from "file://./icons/MODERATOR.gif?base64";
import moderatorStaffIcon from "file://./icons/MODERATOR_STAFF.gif?base64";
import ownerIcon from "file://./icons/OWNER.gif?base64";

import { tags } from "./consts";

const makeBadgeIcon = (content: string, viewBox = "0 0 24 24") =>
    `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='${viewBox}'>${content}</svg>`)}`;

export const badgeIconUrls = {
    OWNER: `data:image/gif;base64,${ownerIcon}`,
    ADMINISTRATOR: `data:image/gif;base64,${administratorIcon}`,
    WEBHOOK: makeBadgeIcon("<circle cx='12' cy='12' r='8.5' fill='none' stroke='#eb459e' stroke-width='2'/><path d='M3.8 9h16.4M3.8 15h16.4M12 3.5c2.3 2.3 3.4 5.1 3.4 8.5s-1.1 6.2-3.4 8.5C9.7 18.2 8.6 15.4 8.6 12s1.1-6.2 3.4-8.5Z' fill='none' stroke='#eb459e' stroke-width='1.6'/><circle cx='12' cy='12' r='2' fill='#eb459e'/>"),
    MODERATOR_STAFF: `data:image/gif;base64,${moderatorStaffIcon}`,
    MODERATOR: `data:image/gif;base64,${moderatorIcon}`,
    VOICE_MODERATOR: makeBadgeIcon("<path fill='#5865f2' d='M12 2a4 4 0 0 0-4 4v6a4 4 0 0 0 8 0V6a4 4 0 0 0-4-4Zm-7 9v1a7 7 0 0 0 6 6.9V22h2v-3.1a7 7 0 0 0 6-6.9v-1h-2v1a5 5 0 0 1-10 0v-1H5Z'/>"),
    CHAT_MODERATOR: makeBadgeIcon("<path fill='#5865f2' d='m19.4 2.6 2 2a2 2 0 0 1 0 2.8l-1.2 1.2-4.8-4.8 1.2-1.2a2 2 0 0 1 2.8 0ZM14 5.2l4.8 4.8-9.6 9.6-6.1 1.3 1.3-6.1L14 5.2ZM4.8 18.7l.5.5 2.5-.5-2.5-2.5-.5 2.5Z'/>")
} as const satisfies Record<(typeof tags)[number]["name"], string>;
