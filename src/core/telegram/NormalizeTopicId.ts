/**
 * Normalizes a user-entered Telegram forum topic id for the Bot API `message_thread_id` field.
 *
 * Accepts a bare number, a link copied from a topic (`t.me/c/<chat>/<topic>` or
 * `t.me/<username>/<topic>`), and links carrying `?thread=<id>`.
 *
 * @param raw - Value from the options form, a detected topic, or stored config.
 * @returns A positive safe integer, or undefined when the value is not a topic id.
 */
export function normalizeTelegramTopicId(raw: unknown): number | undefined {
    if (typeof raw === "number") {
        return toTopicId(raw);
    }

    if (typeof raw !== "string") {
        return undefined;
    }

    const trimmed = raw.trim();

    if (!trimmed) {
        return undefined;
    }

    if (/^\d+$/.test(trimmed)) {
        return toTopicId(Number(trimmed));
    }

    const linkMatch = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?t\.me\/(?:c\/\d+|(?!c\/)[a-zA-Z0-9_]+)\/(\d+)(?:[/?#].*)?$/i);

    if (linkMatch) {
        return toTopicId(Number(linkMatch[1]));
    }

    const threadMatch = trimmed.match(/[?&]thread=(\d+)/i);

    if (threadMatch) {
        return toTopicId(Number(threadMatch[1]));
    }

    return undefined;
}

/**
 * Accepts only positive safe integers: Telegram thread ids start at 1.
 */
function toTopicId(value: number): number | undefined {
    return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}
