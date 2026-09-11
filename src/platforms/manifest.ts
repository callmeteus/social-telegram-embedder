import { socialPlatforms } from "./registry";

/** Permissions required by the Telegram Bot API. */
export const TELEGRAM_CORE_HOST_PERMISSIONS = [
    "https://api.telegram.org/*"
];

/**
 * Aggregates content script match patterns from all platforms.
 */
export function getContentScriptMatches(): string[] {
    return socialPlatforms.flatMap((platform) => platform.manifest.matches);
}

/**
 * Aggregates host permissions from Telegram core and all platforms.
 */
export function getHostPermissions(): string[] {
    const combined = [
        ...TELEGRAM_CORE_HOST_PERMISSIONS,
        ...socialPlatforms.flatMap((platform) => platform.manifest.hostPermissions)
    ];

    return [...new Set(combined)];
}
