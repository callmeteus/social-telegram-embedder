import { buildSocialPostText } from "../../../core/telegram/SocialCaption";

const HTML_ENTITIES: Record<string, string> = {
    "&amp;": "&",
    "&quot;": "\"",
    "&#39;": "'",
    "&#x27;": "'",
    "&lt;": "<",
    "&gt;": ">"
};

/** Title and artist parsed from a FurAffinity page title. */
export interface FuraffinityTitleParts {
    title: string;
    artist: string;
}

/**
 * Converts FurAffinity markup into plain text.
 *
 * @param value - Raw title, artist or description from the page.
 * @returns Plain text with collapsed whitespace, or an empty string.
 */
export function plainFuraffinityText(value: string | undefined): string {
    if (!value) {
        return "";
    }

    let text = value.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n");

    for (const [entity, replacement] of Object.entries(HTML_ENTITIES)) {
        text = text.split(entity).join(replacement);
    }

    text = text.replace(/<[^>]+>/g, "");

    return text
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

/**
 * Parses the artist out of a FurAffinity page title such as "Art by Artist on Fur Affinity".
 *
 * @param rawTitle - Title from the page title tag or Open Graph metadata.
 * @returns The submission title and artist.
 */
export function parseFuraffinityTitle(rawTitle: string | undefined): FuraffinityTitleParts {
    const cleaned = plainFuraffinityText(rawTitle).replace(/\s+on Fur Affinity.*$/i, "");
    const match = cleaned.match(/^(.*?)\s+by\s+(.+)$/i);

    if (!match?.[1] || !match[2]) {
        return {
            title: cleaned,
            artist: ""
        };
    }

    return {
        title: match[1].trim(),
        artist: match[2].trim()
    };
}

/**
 * Builds the Telegram caption HTML for a FurAffinity submission.
 *
 * @param title - Submission title.
 * @param artist - Artist name shown as the caption header.
 * @param description - Submission description.
 * @returns Telegram-safe HTML for the caption draft and for sends.
 */
export function buildFuraffinityCaptionHtml(
    title: string | undefined,
    artist: string | undefined,
    description: string | undefined,
    artistUrl?: string
): string {
    const body = [plainFuraffinityText(title), plainFuraffinityText(description)]
        .filter(Boolean)
        .join("\n\n");

    return buildSocialPostText({
        body,
        pageName: plainFuraffinityText(artist),
        authorUrl: artistUrl
    });
}
