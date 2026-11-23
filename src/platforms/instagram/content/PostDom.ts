import { normalizeInstagramPostUrl } from "../url/InstagramUrl";
import { buildInstagramCaptionText } from "../text/InstagramCaption";
import type { SocialMediaItem, SocialPostSnapshot } from "../../types";
import { getMp4ForBlob } from "../../../content/media/InstagramVideoMap";

/** Action labels Instagram shows in the post and reel control rows. */
const ACTION_LABEL_PATTERN = /^(like|comment|share|repost|save|curtir|comentar|compartilhar|salvar|gustar|compartir)/i;

/** Short interface labels that must never become the post caption. */
const CHROME_TEXT_PATTERN = /^(like|comment|share|save|repost|follow|more|reply|replies|view all|see all|ver mais|curtir|comentar|compartilhar|salvar|seguir|respostas?|curtido|saved|sugestões para você|sugestões|sugestions for you|sugestions|áudio original|audio original|original audio|música original|ver tradução|see translation|ver traducao)$/i;

/** Hosts that serve Instagram post photos and videos. */
const MEDIA_HOST_PATTERN = /(?:cdninstagram|fbcdn\.net|instagram\.com)/i;

/**
 * Finds the share controls inside a DOM subtree.
 *
 * @param root - Subtree to scan.
 * @returns Share controls, without duplicates.
 */
export function findInstagramShareControls(root: ParentNode): HTMLElement[] {
    if (!(root instanceof Element || root instanceof Document || root instanceof DocumentFragment)) {
        return [];
    }

    const controls: HTMLElement[] = [];

    for (const svg of Array.from(root.querySelectorAll("svg[aria-label]"))) {
        const label = svg.getAttribute("aria-label")?.trim() ?? "";

        if (!/share|compartilhar|compartir/i.test(label)) {
            continue;
        }

        const control = svg.closest('[role="button"]') ?? svg.parentElement;

        if (control instanceof HTMLElement) {
            controls.push(control);
        }
    }

    return [...new Set(controls)];
}

/**
 * Finds the control row that owns a share button.
 *
 * @param shareControl - Instagram share control.
 * @returns The nearest row holding at least one other action control.
 */
export function findInstagramActionBar(shareControl: Element): Element | null {
    let node: Element | null = shareControl;

    while (node && node !== document.body) {
        const actions = Array.from(node.querySelectorAll("svg[aria-label]"))
            .filter((svg) => ACTION_LABEL_PATTERN.test(svg.getAttribute("aria-label")?.trim() ?? ""));

        if (actions.length >= 3 && actions.length <= 10) {
            return node;
        }

        node = node.parentElement;
    }

    return null;
}

/**
 * Finds the post container that owns an action bar.
 *
 * @param actionBar - Instagram action bar.
 * @returns The article or dialog holding the post, or the action bar itself.
 */
export function findInstagramPostRoot(actionBar: Element): Element {
    const mediaSelector = 'video, img[src*="fbcdn.net"], img[src*="cdninstagram"]';
    const captionSelector = 'span._ap3a._aacu, span.x193iq5w, div[class*="xvs91rp"]';
    const candidates: Array<{ element: Element; hasVideo: boolean }> = [];
    let node: Element | null = actionBar;

    while (node && node !== document.body) {
        const rectangle = node.getBoundingClientRect();
        const hasVideo = node.querySelector("video") !== null;
        const hasMedia = node.querySelector(mediaSelector) !== null;
        const hasCaption = Array.from(node.querySelectorAll(captionSelector))
            .some((element) => (element.textContent ?? "").trim().length > 20);

        if ((hasMedia || hasVideo) && hasCaption && rectangle.height >= 200 && rectangle.height <= 1000) {
            candidates.push({ element: node, hasVideo });
        }

        node = node.parentElement;
    }

    const videoCandidate = candidates.find((candidate) => candidate.hasVideo);

    if (videoCandidate) {
        return videoCandidate.element;
    }

    if (candidates[0]) {
        return candidates[0].element;
    }

    node = actionBar;

    while (node && node !== document.body) {
        const rectangle = node.getBoundingClientRect();

        if (rectangle.height >= 200 && rectangle.height <= 1000 && node.querySelector(mediaSelector)) {
            return node;
        }

        node = node.parentElement;
    }

    return actionBar.closest("article, [role='dialog']") ?? actionBar;
}

/**
 * Resolves the canonical URL of an Instagram post from its container.
 *
 * @param root - Post container.
 * @param location - Page location, used as a fallback on dedicated post views.
 * @returns The canonical post URL, or null when no post can be identified.
 */
export function extractInstagramPostUrl(
    root: Element,
    location: Pick<Location, "href"> = window.location
): string | null {
    for (const anchor of Array.from(root.querySelectorAll('a[href*="/p/"], a[href*="/reel"], a[href*="/tv/"]'))) {
        const href = anchor.getAttribute("href");

        if (href) {
            const url = normalizeInstagramPostUrl(href);

            if (url) {
                return url;
            }
        }
    }

    return normalizeInstagramPostUrl(location.href);
}

/**
 * Reads the author handle shown on an Instagram post.
 *
 * @param root - Post container.
 * @returns The handle without the leading at sign, or null when unavailable.
 */
export function extractInstagramAuthorHandle(root: Element): string | null {
    const caption = root.querySelector("span.x193iq5w");
    const scopes = [caption?.parentElement, root].filter((scope): scope is Element => scope instanceof Element);

    let fallback: string | null = null;

    for (const scope of scopes) {
        for (const link of Array.from(scope.querySelectorAll('a[href^="/"]'))) {
            const href = link.getAttribute("href") ?? "";
            const match = href.match(/^\/([A-Za-z0-9._]{1,30})(?:\/|$)/);

            if (!match?.[1] || /^(p|reel|reels|tv|explore|accounts|stories)$/i.test(match[1])) {
                continue;
            }

            fallback ??= match[1];
            const label = (link.textContent ?? "").trim().replace(/^@/, "");

            if (label === match[1]) {
                return match[1];
            }
        }
    }

    if (fallback) {
        return fallback;
    }

    const header = root.querySelector("header, h1");
    const text = header?.textContent?.trim().replace(/^@/, "");

    return text && /^[A-Za-z0-9._]{1,30}$/.test(text) ? text : null;
}

/**
 * Clicks Instagram's "more" affordance so the full caption is available in the DOM.
 */
function expandInstagramCaption(root: Element): void {
    for (const element of Array.from(root.querySelectorAll("button, [role='button'], span, div"))) {
        if (!(element instanceof HTMLElement)) {
            continue;
        }

        if (!/^(?:mais|more|see more|ver mais)$/i.test(element.textContent?.trim() ?? "")) {
            continue;
        }

        element.click();
        return;
    }
}

/**
 * Reads the caption text of an Instagram post without the surrounding interface labels.
 *
 * @param root - Post container.
 * @returns Plain caption text, or an empty string behind a login wall.
 */
export function extractInstagramCaptionText(root: Element): string {
    expandInstagramCaption(root);

    const author = extractInstagramAuthorHandle(root);
    const dedicatedCaption = root.querySelector('[data-testid="post-caption"]')?.textContent?.trim();

    if (dedicatedCaption) {
        return normalizeCaptionWhitespace(dedicatedCaption);
    }

    const captionSelectors = ["span._ap3a._aacu", "span.x193iq5w", 'div[class*="xvs91rp"]'];

    for (const selector of captionSelectors) {
        const texts = Array.from(root.querySelectorAll(selector))
            .map((element) => normalizeCaptionWhitespace(element.textContent ?? "")
                .replace(/^\s*[A-Za-z0-9._]{1,30}\s+\d+\s*[smhdwmy]\s*/i, "")
                .replace(/([^\s])#/g, "$1 #")
                .replace(/\s+(?:mais|more|see more|ver mais)$/i, ""))
            .filter((text) => text.length >= 2)
            .filter((text) => !CHROME_TEXT_PATTERN.test(text))
            .filter((text) => !/^(?:curtido por|liked by|me gusta)/i.test(text))
            .filter((text) => !/^(?:e\s+)?outras?\s+\d+\s+pessoas?$/i.test(text))
            .filter((text) => !/^(?:and\s+)?\d+\s+others?$/i.test(text))
            .filter((text) => text !== author)
            .sort((left, right) => right.length - left.length);

        if (texts[0]) {
            return texts[0];
        }
    }

    const candidates = Array.from(root.querySelectorAll('div[dir="auto"], span[dir="auto"]'))
        .filter((element) => !(element instanceof HTMLElement && element.closest("header, nav, button, a")))
        .map((element) => normalizeCaptionWhitespace(element.textContent ?? ""))
        .filter((text) => text.length >= 2)
        .filter((text) => !CHROME_TEXT_PATTERN.test(text))
        .filter((text) => !/^[\d.,\s]+$/.test(text))
        .filter((text) => text !== author)
        .sort((left, right) => right.length - left.length);

    return candidates[0] ?? "";
}

/**
 * Finds the CDN mp4 URL behind a specific blob-based Instagram video player.
 *
 * The mapping is captured in the page world by the MAIN-world injector, so each
 * video element resolves to its own mp4 instead of an unrelated feed video.
 *
 * @param blobUrl - Blob URL from the video element.
 * @returns A direct video URL without the MediaSource byte range, or undefined.
 */
function findCdnVideoUrl(blobUrl: string): string | undefined {
    return getMp4ForBlob(blobUrl);
}

/**
 * Extracts photo and video media from an Instagram post container.
 *
 * Carousels produce one item per photo. Reels and video posts produce a video item.
 *
 * @param root - Post container.
 * @returns Media items in display order.
 */
export function extractInstagramMedia(root: Element): SocialMediaItem[] {
    const media: SocialMediaItem[] = [];
    const urls = new Set<string>();
    const posterUrls = new Set<string>();
    const videos = Array.from(root.querySelectorAll("video"));

    for (const rawPoster of videos.map((video) => video.poster).filter(Boolean)) {
        posterUrls.add(rawPoster);
    }

    for (const image of Array.from(root.querySelectorAll("img[src]"))) {
        if (!(image instanceof HTMLImageElement)) {
            continue;
        }

        const url = image.src;

        if (!isPostMediaUrl(url) || urls.has(url) || posterUrls.has(url) || isAvatar(image)) {
            continue;
        }

        urls.add(url);
        media.push({
            kind: /\.gif(?:\?|$)/i.test(url) ? "gif" : "photo",
            url
        });
    }

    for (const video of videos) {
        const rawUrl = readVideoUrl(video);
        const url = rawUrl?.startsWith("blob:") ? findCdnVideoUrl(rawUrl) ?? rawUrl : rawUrl;

        if (!url || urls.has(url)) {
            continue;
        }

        urls.add(url);
        media.push({
            kind: /\.gif(?:\?|$)/i.test(url) ? "gif" : "video",
            url
        });
    }

    return media;
}

/**
 * Builds a Telegram snapshot from an Instagram post container.
 *
 * @param root - Post container.
 * @param postUrl - Canonical post URL used as the source link.
 * @returns Text and media captured from the page, empty when the content is behind a login wall.
 */
export function buildInstagramSnapshot(root: Element, postUrl: string): SocialPostSnapshot {
    return {
        text: buildInstagramCaptionText(
            extractInstagramCaptionText(root),
            extractInstagramAuthorHandle(root)
        ),
        media: extractInstagramMedia(root)
    };
}

/**
 * Returns true when a URL points at Instagram media rather than a UI image.
 */
function isPostMediaUrl(url: string): boolean {
    return /^https?:\/\//i.test(url) && MEDIA_HOST_PATTERN.test(url);
}

/**
 * Returns true when an image is a profile avatar instead of post media.
 */
function isAvatar(image: HTMLImageElement): boolean {
    if (image.closest("header") || image.closest('[data-testid*="avatar" i]')) {
        return true;
    }

    if (/avatar/i.test(image.className)) {
        return true;
    }

    const width = Number(image.getAttribute("width") ?? image.naturalWidth ?? 0);

    return width > 0 && width < 200;
}

/**
 * Reads the first playable URL from a video element.
 */
function readVideoUrl(video: HTMLVideoElement): string | null {
    const candidates = [
        video.currentSrc,
        video.src,
        ...Array.from(video.querySelectorAll("source")).map((source) => source.src)
    ];

    for (const candidate of candidates) {
        if (candidate.startsWith("blob:")) {
            return candidate;
        }

        if (/^https?:\/\//i.test(candidate) && MEDIA_HOST_PATTERN.test(candidate)) {
            return candidate;
        }
    }

    return null;
}

/**
 * Collapses whitespace in Instagram caption text.
 */
function normalizeCaptionWhitespace(value: string): string {
    return value.replace(/\s+/g, " ").trim();
}
