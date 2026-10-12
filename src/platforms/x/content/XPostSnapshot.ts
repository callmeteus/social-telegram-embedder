import { buildSocialPostText, SocialCaptionAuthorStyle } from "../../../core/telegram/SocialCaption";
import type { SocialMediaItem, SocialPostSnapshot } from "../../types";

/**
 * Builds a Telegram snapshot from a timeline tweet article and selected photo URLs.
 */
export function buildXContentArticleSnapshot(
    tweetArticle: Element,
    photoUrls: string[]
): SocialPostSnapshot {
    const media: SocialMediaItem[] = photoUrls.map((url) => ({
        kind: "photo",
        url
    }));

    return {
        text: extractXContentArticleCaption(tweetArticle),
        media
    };
}

/**
 * Builds caption text from a tweet article on the timeline or in a viewer.
 */
export function extractXContentArticleCaption(tweetArticle: Element | null): string {
    if (!tweetArticle) {
        return "";
    }

    const authorHandle = readXContentAuthorHandle(tweetArticle);
    const body = readXContentTweetBody(tweetArticle);

    return buildSocialPostText({
        body,
        pageName: authorHandle ?? undefined,
        authorStyle: SocialCaptionAuthorStyle.HANDLE
    });
}

function readXContentAuthorHandle(tweetArticle: Element): string | null {
    for (const anchor of Array.from(tweetArticle.querySelectorAll('[data-testid="User-Name"] a[href*="/"]'))) {
        const href = anchor.getAttribute("href") ?? "";
        const match = href.match(/^\/([^/?#]+)$/);

        if (match?.[1]) {
            return `@${match[1]}`;
        }
    }

    const displayName = tweetArticle.querySelector('[data-testid="User-Name"]')?.textContent?.trim();

    if (displayName) {
        return displayName;
    }

    return null;
}

function readXContentTweetBody(tweetArticle: Element): string {
    const tweetText = tweetArticle.querySelector('[data-testid="tweetText"]');

    if (!tweetText?.textContent?.trim()) {
        return "";
    }

    return tweetText.textContent.replace(/\s+/g, " ").trim();
}
