import { FB_PROFILE_NAME_SELECTOR } from "./ActionBar";
import { isFacebookActivityHeaderText, isFacebookProfileNavigationText, normalizeWhitespace } from "./PostTextUtils";
import { extractFacebookProfileSlug, humanizeFacebookSlug } from "../url/FacebookUrl";

/**
 * Resolved Facebook page/profile attribution for captions.
 */
export interface FacebookPostAttribution {
    pageName?: string;
    repostedBy?: string;
}

/**
 * Resolves page name and repost attribution for a Facebook post container.
 */
export function extractFacebookAttribution(root: Element, postUrl?: string | null): FacebookPostAttribution {
    const reelAuthorName = extractReelAuthorName(root);
    const feedProfileName = extractFeedProfileName(root);
    const innerAuthorName = extractEmbeddedAuthorName(root);
    const pageNameFromUrl = resolvePageNameFromPostUrl(root, postUrl);
    const pageName = reelAuthorName
        ?? pageNameFromUrl
        ?? innerAuthorName
        ?? feedProfileName
        ?? undefined;
    const repostedBy = resolveRepostedBy(root, {
        feedProfileName,
        pageName,
        innerAuthorName,
        postUrl
    });

    if (repostedBy && pageName && normalizeAttributionName(pageName) === normalizeAttributionName(repostedBy)) {
        return {
            pageName
        };
    }

    return {
        pageName,
        repostedBy
    };
}

function resolvePageNameFromPostUrl(root: Element, postUrl?: string | null): string | null {
    if (!postUrl) {
        return null;
    }

    const slug = extractFacebookProfileSlug(postUrl);

    if (!slug) {
        return null;
    }

    return findProfileDisplayNameBySlug(root, slug) ?? humanizeFacebookSlug(slug);
}

function resolveRepostedBy(
    root: Element,
    context: {
        feedProfileName: string | null;
        pageName?: string;
        innerAuthorName: string | null;
        postUrl?: string | null;
    }
): string | undefined {
    if (!context.feedProfileName) {
        return undefined;
    }

    const feedName = normalizeAttributionName(context.feedProfileName);
    const pageName = context.pageName ? normalizeAttributionName(context.pageName) : null;
    const innerAuthor = context.innerAuthorName ? normalizeAttributionName(context.innerAuthorName) : null;
    const slug = context.postUrl ? extractFacebookProfileSlug(context.postUrl) : null;
    const feedSlug = extractFeedProfileSlug(root);

    if (pageName && feedName !== pageName) {
        return context.feedProfileName;
    }

    if (innerAuthor && feedName !== innerAuthor) {
        return context.feedProfileName;
    }

    if (slug && feedSlug && slug !== feedSlug) {
        return context.feedProfileName;
    }

    return undefined;
}

function extractReelAuthorName(root: Element): string | null {
    if (!root.querySelector("[data-video-id], video")) {
        return null;
    }

    const headingLink = root.querySelector('h2 a[href*="facebook.com/"], h2 a[href^="/"]');

    if (!(headingLink instanceof HTMLAnchorElement)) {
        return null;
    }

    return readAnchorProfileName(headingLink);
}

function extractFeedProfileSlug(root: Element): string | null {
    const profileName = root.querySelector(FB_PROFILE_NAME_SELECTOR);

    if (!profileName) {
        return null;
    }

    const anchor = profileName.closest("a[href*='facebook.com/']")
        ?? profileName.querySelector("a[href*='facebook.com/']");

    if (!(anchor instanceof HTMLAnchorElement)) {
        return null;
    }

    const href = anchor.href || anchor.getAttribute("href");

    if (!href) {
        return null;
    }

    return extractFacebookProfileSlug(href);
}

function extractFeedProfileName(root: Element): string | null {
    const profileName = root.querySelector(FB_PROFILE_NAME_SELECTOR);

    if (!profileName) {
        return null;
    }

    for (const anchor of Array.from(profileName.querySelectorAll(
        "a[href*='facebook.com/'], a[href^='/']"
    ))) {
        if (!(anchor instanceof HTMLAnchorElement)) {
            continue;
        }

        const name = readAnchorProfileName(anchor);

        if (name) {
            return name;
        }
    }

    const text = profileName.textContent?.trim();

    if (!text || isFacebookActivityHeaderText(text)) {
        return null;
    }

    return normalizeWhitespace(text);
}

function extractEmbeddedAuthorName(root: Element): string | null {
    const storyMessage = root.querySelector('[data-ad-rendering-role="story_message"]');

    if (!storyMessage) {
        return null;
    }

    let node: Element | null = storyMessage;

    while (node && node !== root) {
        const headingLink = node.querySelector("h5 a[href*='facebook.com/'], h4 a[href*='facebook.com/']");

        if (headingLink instanceof HTMLAnchorElement) {
            const name = readAnchorProfileName(headingLink);

            if (name) {
                return name;
            }
        }

        node = node.parentElement;
    }

    return null;
}

function findProfileDisplayNameBySlug(root: Element, slug: string): string | null {
    const normalizedSlug = slug.toLowerCase();

    for (const anchor of Array.from(root.querySelectorAll("a[href*='facebook.com/']"))) {
        if (!(anchor instanceof HTMLAnchorElement)) {
            continue;
        }

        const href = anchor.getAttribute("href") ?? "";

        if (!href.toLowerCase().includes(`facebook.com/${normalizedSlug}`)) {
            continue;
        }

        const name = readAnchorProfileName(anchor);

        if (name) {
            return name;
        }
    }

    return null;
}

function readAnchorProfileName(anchor: HTMLAnchorElement): string | null {
    const boldText = anchor.querySelector("b span, b")?.textContent?.trim();

    if (boldText && !isFacebookProfileNavigationText(boldText)) {
        return normalizeWhitespace(boldText);
    }

    const text = anchor.textContent?.trim();

    if (text && !isFacebookProfileNavigationText(text)) {
        return normalizeWhitespace(text);
    }

    const ariaLabel = anchor.getAttribute("aria-label")?.trim();

    if (ariaLabel) {
        const [firstPart] = ariaLabel.split(",");

        if (firstPart?.trim()
            && !/^ver story$/i.test(firstPart.trim())
            && !isFacebookProfileNavigationText(firstPart)) {
            return normalizeWhitespace(firstPart);
        }
    }

    return null;
}

function normalizeAttributionName(value: string): string {
    return normalizeWhitespace(value).toLowerCase();
}
