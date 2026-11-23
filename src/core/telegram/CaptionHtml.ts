import { escapeTelegramHtml } from "./SocialCaption";

/** Telegram's hard limit for a photo/video caption, in visible characters. */
export const TelegramCaptionLimit = 1024;

const BLOCK_END_PATTERN = /<\/(?:div|p|li|h[1-6]|blockquote)\s*>/gi;
const LINE_BREAK_PATTERN = /<br\s*\/?>/gi;
const DROPPED_BLOCK_PATTERN = /<(script|style|noscript|template|iframe|object)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const DROPPED_TAG_PATTERN = /<(?:script|style|noscript|template|iframe|object|embed)\b[^>]*\/?>/gi;
const TAG_PATTERN = /^<[^>]*>$/;
const ANY_TAG_PATTERN = /<[^>]*>/g;
const LINK_OPEN_PATTERN = /^<a\s+href="(https?:\/\/[^"]+)"\s*>$/i;
const LINK_CLOSE_PATTERN = /^<\/a\s*>$/i;
const INLINE_TAG_SPLIT = /(<b>|<\/b>|<a\s+href="[^"]*">|<\/a>)/gi;

/**
 * Normalizes the inline tags Telegram accepts in captions: bold and safe HTTP links.
 *
 * @param token - Raw tag token from the caption HTML.
 * @returns The normalized tag, or null when the tag must be dropped.
 */
function normalizeInlineTag(token: string): string | null {
    if (/^<b>$/i.test(token)) {
        return "<b>";
    }

    if (/^<\/b>$/i.test(token)) {
        return "</b>";
    }

    const link = token.match(LINK_OPEN_PATTERN);

    if (link) {
        return `<a href="${link[1]}">`;
    }

    if (LINK_CLOSE_PATTERN.test(token)) {
        return "</a>";
    }

    return null;
}

/**
 * Returns the closing tag matching an inline tag.
 */
function closingTag(tag: string): string {
    return tag === "<b>" ? "</b>" : "</a>";
}

/**
 * Keeps the caption HTML that Telegram understands: escaped text, `<b>` ranges, `<a href>` links
 * and line breaks. Everything else is dropped and inline tags are balanced.
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

    return truncateCaptionHtml(balanceInlineTags(flattened), maxLength);
}

/**
 * Truncates caption HTML to a visible length, never cutting inside a tag.
 */
export function truncateCaptionHtml(html: string, maxLength: number = TelegramCaptionLimit): string {
    if (maxLength <= 0) {
        return "";
    }

    const tokens = html.split(INLINE_TAG_SPLIT);
    const openTags: string[] = [];
    let visible = 0;
    let output = "";

    for (const token of tokens) {
        if (!token) {
            continue;
        }

        if (TAG_PATTERN.test(token)) {
            const tag = normalizeInlineTag(token);

            if (!tag) {
                continue;
            }

            output += tag;

            if (tag === "<b>" || tag.startsWith("<a ")) {
                openTags.push(tag);
            } else if (openTags.length > 0) {
                const expected = tag === "</b>" ? "<b>" : "<a";

                if (openTags[openTags.length - 1]?.startsWith(expected)) {
                    openTags.pop();
                }
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

    while (openTags.length > 0) {
        const tag = openTags.pop();

        if (tag) {
            output += closingTag(tag);
        }
    }

    return output.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Drops attributes, unknown tags and unbalanced inline ranges.
 */
function balanceInlineTags(html: string): string {
    const tokens = html.split(/(<[^>]*>)/);
    const openTags: string[] = [];
    let output = "";

    for (const token of tokens) {
        if (!token) {
            continue;
        }

        if (TAG_PATTERN.test(token)) {
            const tag = normalizeInlineTag(token);

            if (!tag) {
                continue;
            }

            if (tag === "<b>" || tag.startsWith("<a ")) {
                output += tag;
                openTags.push(tag);
                continue;
            }

            const expected = tag === "</b>" ? "<b>" : "<a";

            if (openTags[openTags.length - 1]?.startsWith(expected)) {
                output += tag;
                openTags.pop();
            }

            continue;
        }

        output += token;
    }

    while (openTags.length > 0) {
        const tag = openTags.pop();

        if (tag) {
            output += closingTag(tag);
        }
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
