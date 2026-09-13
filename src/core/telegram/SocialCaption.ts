/**
 * How author labels are rendered in Telegram captions.
 */
export enum SocialCaptionAuthorStyle {
    HANDLE = "HANDLE",
    NAME = "NAME"
}

/**
 * Semantic parts used to build a Telegram caption body.
 */
export interface SocialCaptionParts {
    body: string;
    pageName?: string;
    repostedBy?: string;
    authorStyle?: SocialCaptionAuthorStyle;
}

const REPOST_MARKER = "🔁";

/**
 * Builds the text block that appears above the source link in Telegram captions.
 */
export function buildSocialPostText(parts: SocialCaptionParts): string {
    const sections: string[] = [];
    const header = buildAuthorHeader(parts);
    const body = parts.body.trim();

    if (header) {
        sections.push(header);
    }

    if (body) {
        sections.push(escapeTelegramHtml(body));
    }

    return sections.join("\n\n");
}

function buildAuthorHeader(parts: SocialCaptionParts): string {
    const style = parts.authorStyle ?? SocialCaptionAuthorStyle.NAME;
    const originalAuthor = formatAuthorLabel(parts.pageName, style);
    const reposter = formatAuthorLabel(parts.repostedBy, style);

    if (reposter && originalAuthor) {
        return `${boldTelegram(reposter)} ${REPOST_MARKER} ${boldTelegram(originalAuthor)}`;
    }

    if (originalAuthor) {
        return boldTelegram(originalAuthor);
    }

    if (reposter) {
        return boldTelegram(reposter);
    }

    return "";
}

function formatAuthorLabel(value: string | undefined, style: SocialCaptionAuthorStyle): string {
    if (!value?.trim()) {
        return "";
    }

    const trimmed = value.trim();

    if (style === SocialCaptionAuthorStyle.HANDLE) {
        return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
    }

    return trimmed.replace(/^@/, "");
}

function boldTelegram(value: string): string {
    return `<b>${escapeTelegramHtml(value)}</b>`;
}

/**
 * Escapes plain text for Telegram HTML parse mode.
 */
export function escapeTelegramHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}
