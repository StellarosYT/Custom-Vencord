/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "AllUserBadges",
    enabledByDefault: true,
    description: "Expands all badges provided by Discord in user profiles without an overflow indicator.",
    tags: ["Appearance"],
    authors: [Devs.Stellaros],
    patches: [
        {
            find: "#{intl::PROFILE_USER_BADGES}",
            replacement: [
                {
                    match: /\[(\i)\.slice\(0,[^)]+\)\]/,
                    replace: "[$1]"
                },
                {
                    match: /,(\i)>0&&\((\i)\?/,
                    replace: ",!1&&$1>0&&($2?"
                }
            ]
        }
    ]
});
