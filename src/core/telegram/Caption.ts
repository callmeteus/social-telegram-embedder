import { escapeTelegramHtml } from "./SocialCaption";

/**
 * Builds a Telegram caption with post text and source link.
 */
export function buildTelegramCaption(embedUrl: string, text: string): string {
    const trimmedText = text.trim();
    const linkBlock = escapeTelegramHtml(embedUrl.trim());

    if (!trimmedText) {
        return linkBlock.slice(0, 1024);
    }

    const maxTextLength = 1024 - linkBlock.length - 2;

    if (maxTextLength <= 0) {
        return linkBlock.slice(0, 1024);
    }

    return `${trimmedText.slice(0, maxTextLength)}\n\n${linkBlock}`;
}
