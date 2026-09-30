/**
 * Normalizes a user-entered Telegram chat_id for Bot API calls.
 *
 * Accepts @username, -100... ids, and bare channel ids copied from the Telegram client
 * (e.g. 1194845578 or 1.194.845.578).
 *
 * @param rawChatId - Value from options or detected channel list.
 * @returns chat_id string suitable for sendMessage and related methods.
 */
export function normalizeTelegramChatId(rawChatId: string): string {
    const trimmed = rawChatId.trim();

    if (!trimmed) {
        return trimmed;
    }

    if (trimmed.startsWith("@")) {
        return trimmed;
    }

    const compact = trimmed.replace(/[\s.]/g, "");

    if (!/^-?\d+$/.test(compact)) {
        return trimmed;
    }

    if (/^-100\d+$/.test(compact)) {
        return compact;
    }

    const channelIdDigits = compact.startsWith("-") ? compact.slice(1) : compact;

    // Telegram client shows channel ids like 1194845578; Bot API expects -1001194845578.
    // A lone leading minus (-1194845578) is a common mistake and is corrected here.
    if (channelIdDigits.length >= 9) {
        return `-100${channelIdDigits}`;
    }

    if (compact.startsWith("-")) {
        return compact;
    }

    return compact;
}
