import { buildSocialPostText, SocialCaptionAuthorStyle } from "../../../core/telegram/SocialCaption";
import type { SocialPostSnapshot } from "../../types";
import { extractFacebookAttribution } from "./PostAttribution";
import { extractPostMedia } from "./PostMedia";
import {
    extractFacebookRichText,
    isFacebookProfileNavigationText,
    isFacebookReelChromeText,
    isFacebookTruncatedText,
    isOnlyFacebookExpandLink,
    normalizeWhitespace,
    stripFacebookExpandSuffix
} from "./PostTextUtils";
import { resolveFacebookPostBody } from "./PostTextResolve";
import { resolveFacebookPostMedia } from "./VideoMediaResolve";

/**
 * Extracts post text and media from a Facebook post container.
 */
export function extractPostSnapshot(root: Element, postUrl?: string | null): SocialPostSnapshot {
    const attribution = extractFacebookAttribution(root, postUrl);

    return {
        text: buildSocialPostText({
            body: extractPostBody(root),
            pageName: attribution.pageName,
            repostedBy: attribution.repostedBy,
            authorStyle: SocialCaptionAuthorStyle.NAME
        }),
        media: extractPostMedia(root)
    };
}

/**
 * Builds a post snapshot with live Facebook text and video resolution at send time.
 */
export async function buildPostSnapshot(
    root: Element,
    postUrl?: string | null
): Promise<SocialPostSnapshot> {
    const attribution = extractFacebookAttribution(root, postUrl);
    const initialBody = extractPostBody(root);
    const body = await resolveFacebookPostBody(
        root,
        postUrl,
        initialBody,
        () => extractPostBody(root)
    );

    return {
        text: buildSocialPostText({
            body,
            pageName: attribution.pageName,
            repostedBy: attribution.repostedBy,
            authorStyle: SocialCaptionAuthorStyle.NAME
        }),
        media: await resolveFacebookPostMedia(root, postUrl)
    };
}

/**
 * Extracts the post body text from a Facebook post container.
 */
export function extractPostBody(root: Element): string {
    const reelCaption = extractReelCaptionText(root);

    if (reelCaption) {
        return finalizeTextParts([reelCaption]);
    }

    const storyMessage = extractStoryMessageText(root);

    if (storyMessage && !isOnlyFacebookExpandLink(storyMessage) && !isFacebookTruncatedText(storyMessage)) {
        return finalizeTextParts([stripFacebookExpandSuffix(storyMessage)]);
    }

    const description = extractRenderingRoleText(root, "description");
    const title = extractRenderingRoleText(root, "title");

    if (storyMessage && isFacebookTruncatedText(storyMessage)) {
        if (description && !isFacebookTruncatedText(description)) {
            return finalizeTextParts([stripFacebookExpandSuffix(description)]);
        }
    }

    const structuredParts = [title, description]
        .map(stripFacebookExpandSuffix)
        .filter((part) => part.length > 0 && !isOnlyFacebookExpandLink(part) && !isFacebookTruncatedText(part));

    if (structuredParts.length > 0) {
        return finalizeTextParts(structuredParts);
    }

    if (description && !isFacebookTruncatedText(description)) {
        return finalizeTextParts([stripFacebookExpandSuffix(description)]);
    }

    if (storyMessage && !isOnlyFacebookExpandLink(storyMessage)) {
        return finalizeTextParts([stripFacebookExpandSuffix(storyMessage)]);
    }

    const photoViewerCaption = root.querySelector(".xyinxu5.x1g2khh7");

    if (photoViewerCaption?.textContent?.trim()) {
        return finalizeTextParts([stripFacebookExpandSuffix(normalizeWhitespace(photoViewerCaption.textContent))]);
    }

    return "";
}

function extractReelCaptionText(root: Element): string {
    if (!isReelContentRoot(root)) {
        return "";
    }

    for (const block of findReelCaptionBlocks(root)) {
        const text = stripFacebookExpandSuffix(normalizeWhitespace(block.textContent ?? ""));

        if (!text || isOnlyFacebookExpandLink(text) || isFacebookTruncatedText(text)) {
            continue;
        }

        if (isFacebookReelChromeText(text)) {
            continue;
        }

        return text;
    }

    const parts: string[] = [];

    for (const block of Array.from(root.querySelectorAll("div[dir='auto'], span[dir='auto']"))) {
        if (!(block instanceof HTMLElement)) {
            continue;
        }

        if (block.closest('[data-x2tg-fb-action-bar-injected="true"], [role="slider"], h2')) {
            continue;
        }

        const text = stripFacebookExpandSuffix(normalizeWhitespace(block.textContent ?? ""));

        if (!text || isOnlyFacebookExpandLink(text) || isFacebookTruncatedText(text)) {
            continue;
        }

        if (isFacebookReelChromeText(text)) {
            continue;
        }

        parts.push(text);
    }

    return finalizeTextParts(parts);
}

function findReelCaptionBlocks(root: Element): Element[] {
    const blocks: Element[] = [];

    for (const block of Array.from(root.querySelectorAll('[class*="x126k92a"]'))) {
        if (block.closest('[data-x2tg-fb-action-bar-injected="true"], [role="slider"], h2')) {
            continue;
        }

        blocks.push(block);
    }

    return blocks;
}

function isReelContentRoot(root: Element): boolean {
    if (!root.querySelector("[data-video-id], video")) {
        return false;
    }

    if (root.querySelector(
        '[data-ad-rendering-role="story_message"], '
        + '[data-ad-rendering-role="profile_name"], '
        + '[data-ad-rendering-role="title"], '
        + '[data-ad-rendering-role="description"]'
    )) {
        return false;
    }

    return true;
}

function extractStoryMessageText(root: Element): string {
    const storyMessage = root.querySelector('[data-ad-rendering-role="story_message"]');

    if (!storyMessage) {
        return "";
    }

    const previewMessage = storyMessage.querySelector('[data-ad-comet-preview="message"]');
    const richTextRoot = previewMessage ?? storyMessage;
    const richText = extractFacebookRichText(richTextRoot);

    if (richText) {
        return richText;
    }

    return "";
}

function finalizeTextParts(parts: string[]): string {
    const filtered = parts
        .map((part) => normalizeWhitespace(part))
        .filter((part) => part.length > 0 && !isJunkFacebookText(part));

    const deduped: string[] = [];

    for (const part of filtered) {
        const duplicateIndex = deduped.findIndex((existing) =>
            existing.includes(part) || part.includes(existing)
        );

        if (duplicateIndex === -1) {
            deduped.push(part);
            continue;
        }

        if (part.length > deduped[duplicateIndex].length) {
            deduped[duplicateIndex] = part;
        }
    }

    return deduped.join("\n\n");
}

function isJunkFacebookText(text: string): boolean {
    const normalized = text.trim();

    if (!normalized) {
        return true;
    }

    if (isFacebookProfileNavigationText(normalized)) {
        return true;
    }

    if (isOnlyFacebookExpandLink(normalized)) {
        return true;
    }

    if (/^(fotos?|photos?|v[ií]deos?|facebook|instagram|whatsapp)$/i.test(normalized)) {
        return true;
    }

    if (/^m\.me$/i.test(normalized)) {
        return true;
    }

    if (/^0x[a-fA-F0-9]{20,}$/.test(normalized)) {
        return true;
    }

    if (/^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?$/i.test(normalized)) {
        return true;
    }

    return false;
}

function extractRenderingRoleText(root: Element, role: string): string {
    const node = root.querySelector(`[data-ad-rendering-role="${role}"]`);

    if (!node?.textContent?.trim()) {
        return "";
    }

    return normalizeWhitespace(node.textContent);
}
