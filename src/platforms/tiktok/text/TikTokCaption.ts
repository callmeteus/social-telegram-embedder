/** HTML entities that TikTok descriptions may carry over from the page. */
const CAPTION_ENTITIES: Record<string, string> = {
    "&amp;": "&",
    "&quot;": "\"",
    "&#39;": "'",
    "&#x27;": "'",
    "&lt;": "<",
    "&gt;": ">"
};

/**
 * Converts a TikTok description into plain text for the Telegram caption draft.
 *
 * @param description - Raw description from the video payload, Open Graph tag or oEmbed title.
 * @returns Plain text with collapsed whitespace, or an empty string.
 */
export function buildTikTokCaptionText(description: string | undefined): string {
    if (!description) {
        return "";
    }

    let text = description
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]+>/g, "");

    for (const [entity, replacement] of Object.entries(CAPTION_ENTITIES)) {
        text = text.split(entity).join(replacement);
    }

    return text
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}
