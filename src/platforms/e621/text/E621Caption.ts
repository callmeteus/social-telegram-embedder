const DTEXT_TAGS = /\[\/?(?:b|i|u|s|code|quote|spoiler|url(?:=[^\]]+)?|img)\]/gi;

const HTML_ENTITIES: Record<string, string> = {
    "&amp;": "&",
    "&quot;": "\"",
    "&#39;": "'",
    "&#x27;": "'",
    "&lt;": "<",
    "&gt;": ">"
};

/**
 * Converts an E621 description into plain text for the Telegram caption draft.
 *
 * @param description - Raw description returned by the API or rendered in the page.
 * @returns Plain text with collapsed whitespace, or an empty string.
 */
export function buildE621CaptionText(description: string | undefined): string {
    if (!description) {
        return "";
    }

    let text = description
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(DTEXT_TAGS, "");

    for (const [entity, replacement] of Object.entries(HTML_ENTITIES)) {
        text = text.split(entity).join(replacement);
    }

    return text
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}
