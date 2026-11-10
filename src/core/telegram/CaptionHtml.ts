import { escapeTelegramHtml } from "./SocialCaption";

/** Telegram's hard limit for a photo/video caption, in visible characters. */
export const TelegramCaptionLimit = 1024;

const BLOCK_END_PATTERN = /<\/(?:div|p|li|h[1-6]|blockquote)\s*>/gi;
const LINE_BREAK_PATTERN = /<br\s*\/?>/gi;
const DROPPED_BLOCK_PATTERN = /<(script|style|noscript|template|iframe|object)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const DROPPED_TAG_PATTERN = /<(?:script|style|noscript|template|iframe|object|embed)\b[^>]*\/?>/gi;
const BOLD_TAG_PATTERN = /^<(?:b|strong)(?:\s[^>]*)?>$/i;
const BOLD_CLOSE_TAG_PATTERN = /^<\/(?:b|strong)\s*>$/i;
const TAG_PATTERN = /^<[^>]*>$/;
const ANY_TAG_PATTERN = /<[^>]*>/g;

/**
 * Keeps the caption HTML that Telegram understands and that the send pipeline writes:
 * escaped text, `<b>` ranges and line breaks. Everything else is dropped, bold tags are
 * balanced and the visible text is capped at {@link TelegramCaptionLimit}.
 *
 * Shared by the content script (editor output) and the service worker (untrusted messages).
 */
export function sanitizeCaptionHtml(html: string, maxLength: number = TelegramCaptionLimit): string {
    if (!html) {
        return "";
    }

    const flattened = html
        .replace(DROPPED_BLOCK_PATTERN, "")
        .replace(DROPPED_TAG_PATTERN, "")
        .replace(LINE_BREAK_PATTERN, "\n")
        .replace(BLOCK_END_PATTERN, "\n");

    return truncateCaptionHtml(balanceBold(flattened), maxLength);
}

/**
 * Truncates caption HTML to a visible length, never cutting inside a tag.
 */
export function truncateCaptionHtml(html: string, maxLength: number = TelegramCaptionLimit): string {
    if (maxLength <= 0) {
        return "";
    }

    const tokens = html.split(/(<\/?b>)/);
    let visible = 0;
    let output = "";
    let openBold = 0;

    for (const token of tokens) {
        if (!token) {
            continue;
        }

        if (token === "<b>") {
            output += token;
            openBold += 1;
            continue;
        }

        if (token === "</b>") {
            if (openBold > 0) {
                output += token;
                openBold -= 1;
            }

            continue;
        }

        const remaining = maxLength - visible;

        if (remaining <= 0) {
            break;
        }

        const text = decodeCaptionText(token.replace(ANY_TAG_PATTERN, ""));
        const kept = text.slice(0, remaining);

        visible += kept.length;
        output += escapeTelegramHtml(kept);

        if (kept.length < text.length) {
            break;
        }
    }

    while (openBold > 0) {
        output += "</b>";
        openBold -= 1;
    }

    return output.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Drops attributes, unknown tags and unbalanced bold ranges.
 */
function balanceBold(html: string): string {
    const tokens = html.split(/(<[^>]*>)/);
    let output = "";
    let openBold = 0;

    for (const token of tokens) {
        if (!token) {
            continue;
        }

        if (BOLD_TAG_PATTERN.test(token)) {
            output += "<b>";
            openBold += 1;
            continue;
        }

        if (BOLD_CLOSE_TAG_PATTERN.test(token)) {
            if (openBold > 0) {
                output += "</b>";
                openBold -= 1;
            }

            continue;
        }

        if (TAG_PATTERN.test(token)) {
            continue;
        }

        output += token;
    }

    while (openBold > 0) {
        output += "</b>";
        openBold -= 1;
    }

    return output;
}

const ENTITY_PATTERN = /&(amp|lt|gt|quot|#39);/g;
const ENTITIES: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": "\"",
    "&#39;": "'"
};

/**
 * Turns escaped caption text back into plain text (for rendering in the editor).
 */
export function decodeCaptionText(value: string): string {
    return value.replace(ENTITY_PATTERN, (entity) => ENTITIES[entity] ?? entity);
}
