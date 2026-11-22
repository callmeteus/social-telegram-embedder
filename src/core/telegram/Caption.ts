import { escapeTelegramHtml } from "./SocialCaption";
import { sanitizeCaptionHtml, TelegramCaptionLimit } from "./CaptionHtml";

/**
 * Converts a media proxy link back into the canonical social URL shown in captions.
 * The proxy is still used to resolve media; only the displayed link is rewritten.
 */
export function toCaptionSourceUrl(url: string): string {
    const trimmed = url.trim();

    try {
        const parsed = new URL(trimmed);
        const host = parsed.hostname.toLowerCase().replace(/^www\./, "");

        if (host === "fixupx.com") {
            parsed.hostname = "x.com";
        } else
        if (host === "fxtwitter.com") {
            parsed.hostname = "twitter.com";
        } else {
            return trimmed;
        }

        parsed.search = "";
        parsed.hash = "";
        return parsed.toString();
    } catch {
        return trimmed;
    }
}

/**
 * Builds a Telegram caption with post text and source link.
 */
export function buildTelegramCaption(embedUrl: string, text: string): string {
    const trimmedText = text.trim();
    const linkBlock = escapeTelegramHtml(toCaptionSourceUrl(embedUrl));

    if (!trimmedText) {
        return linkBlock.slice(0, TelegramCaptionLimit);
    }

    const maxTextLength = TelegramCaptionLimit - linkBlock.length - 2;

    if (maxTextLength <= 0) {
        return linkBlock.slice(0, TelegramCaptionLimit);
    }

    return `${trimmedText.slice(0, maxTextLength)}\n\n${linkBlock}`;
}

/**
 * Caption edited in the picker, sanitized, or the generated one when the editor was left empty.
 */
export function resolveTelegramCaption(captionHtml: string | undefined, embedUrl: string, text: string): string {
    const edited = captionHtml ? sanitizeCaptionHtml(captionHtml) : "";

    return edited || buildTelegramCaption(embedUrl, text);
}

/**
 * Caption draft shown in the picker editor: the text the pipeline already builds (escaped,
 * with `<b>` where it uses bold) plus the source link, which the user may edit or remove.
 */
export function buildCaptionDraftHtml(textHtml: string, sourceUrl: string, maxLength: number = TelegramCaptionLimit): string {
    const text = sanitizeCaptionHtml(textHtml, maxLength);
    const link = escapeTelegramHtml(toCaptionSourceUrl(sourceUrl));

    if (!text) {
        return link.slice(0, maxLength);
    }

    const maxTextLength = maxLength - link.length - 2;

    if (maxTextLength <= 0) {
        return link.slice(0, maxLength);
    }

    return `${sanitizeCaptionHtml(text, maxTextLength)}\n\n${link}`;
}
