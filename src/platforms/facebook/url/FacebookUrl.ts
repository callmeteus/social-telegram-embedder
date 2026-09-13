const FACEBOOK_HOSTS = new Set([
    "www.facebook.com",
    "web.facebook.com",
    "m.facebook.com",
    "facebook.com"
]);

const TRACKING_PARAM_PREFIXES = ["__"];

/**
 * Returns true when the hostname belongs to Facebook.
 */
function isFacebookHost(hostname: string): boolean {
    const normalized = hostname.toLowerCase();

    return FACEBOOK_HOSTS.has(normalized) || normalized.endsWith(".facebook.com");
}

/**
 * Removes Facebook tracking query params and hash fragments.
 */
function stripTrackingParams(url: URL): void {
    const keysToDelete: string[] = [];

    url.searchParams.forEach((_value, key) => {
        if (TRACKING_PARAM_PREFIXES.some((prefix) => key.startsWith(prefix))) {
            keysToDelete.push(key);
            return;
        }

        if (key === "comment_id" || key === "reply_comment_id") {
            keysToDelete.push(key);
        }
    });

    for (const key of keysToDelete) {
        url.searchParams.delete(key);
    }

    url.hash = "";
}

/**
 * Returns true when the pathname looks like a shareable Facebook post URL.
 */
function isShareablePostPath(pathname: string): boolean {
    return pathname.includes("/posts/")
        || pathname.includes("/permalink.php")
        || pathname.includes("/photo/")
        || pathname.includes("/photos/")
        || pathname.includes("/reel/")
        || pathname.includes("/watch/");
}

/**
 * Normalizes a Facebook post URL by stripping tracking params.
 */
export function normalizeFacebookPostUrl(rawUrl: string): string | null {
    try {
        const url = new URL(rawUrl, "https://www.facebook.com/");

        if (!isFacebookHost(url.hostname)) {
            return null;
        }

        if (!isShareablePostPath(url.pathname)) {
            return null;
        }

        stripTrackingParams(url);

        return url.toString();
    } catch {
        return null;
    }
}

/**
 * Builds a normalized post URL from the current page when it is a post view.
 */
export function facebookPostUrlFromPage(location: Location): string | null {
    return normalizeFacebookPostUrl(location.href);
}

const FACEBOOK_PROFILE_PATH_MARKERS = new Set([
    "posts",
    "photo",
    "photos",
    "reel",
    "watch",
    "videos",
    "groups",
    "events",
    "permalink.php"
]);

/**
 * Extracts the profile/page slug from a Facebook post URL.
 */
export function extractFacebookProfileSlug(rawUrl: string): string | null {
    try {
        const url = new URL(rawUrl, "https://www.facebook.com/");

        if (!isFacebookHost(url.hostname)) {
            return null;
        }

        const segments = url.pathname.split("/").filter(Boolean);

        if (segments.length === 0 || segments[0] === "profile.php") {
            return null;
        }

        if (FACEBOOK_PROFILE_PATH_MARKERS.has(segments[0])) {
            return null;
        }

        return segments[0].toLowerCase();
    } catch {
        return null;
    }
}

/**
 * Builds a readable page name from a Facebook profile slug.
 */
export function humanizeFacebookSlug(slug: string): string {
    return slug
        .split(".")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

/**
 * Finds the best post URL inside a DOM subtree.
 */
/**
 * Builds a reel URL from a Facebook video id attribute.
 */
export function facebookReelUrlFromVideoId(videoId: string): string | null {
    const trimmed = videoId.trim();

    if (!/^\d+$/.test(trimmed)) {
        return null;
    }

    return normalizeFacebookPostUrl(`https://www.facebook.com/reel/${trimmed}/`);
}

/**
 * Finds a reel URL from a video container in the DOM.
 */
export function extractReelUrlFromVideoContainer(root: Element): string | null {
    const videoHost = root.matches("[data-video-id]")
        ? root
        : root.querySelector("[data-video-id]");
    const videoId = videoHost?.getAttribute("data-video-id");

    if (!videoId) {
        return null;
    }

    return facebookReelUrlFromVideoId(videoId);
}

/**
 * Returns true when the current page is a dedicated Facebook reel viewer.
 */
export function isFacebookReelViewerPage(location: Location = window.location): boolean {
    return /\/reel\//.test(location.pathname);
}

/**
 * Resolves a reel URL without walking up into unrelated feed posts.
 */
export function extractReelPostUrl(
    snapshotRoot: Element,
    location: Location = window.location
): string | null {
    return extractReelUrlFromVideoContainer(snapshotRoot)
        ?? facebookPostUrlFromPage(location)
        ?? extractPostUrlFromElement(snapshotRoot);
}

export function extractPostUrlFromElement(root: Element): string | null {
    const selectors = [
        'a[href*="/posts/pfbid"]',
        'a[href*="/posts/"]',
        'a[href*="/reel/"]',
        'a[href*="/watch/"]',
        'a[href*="/photo/?fbid="]',
        'a[href*="permalink.php"]'
    ];

    for (const selector of selectors) {
        for (const anchor of Array.from(root.querySelectorAll(selector))) {
            if (!(anchor instanceof HTMLAnchorElement)) {
                continue;
            }

            const hrefAttr = anchor.getAttribute("href");

            if (hrefAttr) {
                const normalizedFromAttr = normalizeFacebookPostUrl(hrefAttr);

                if (normalizedFromAttr) {
                    return normalizedFromAttr;
                }
            }

            if (!anchor.href) {
                continue;
            }

            const normalized = normalizeFacebookPostUrl(anchor.href);

            if (normalized) {
                return normalized;
            }
        }
    }

    return null;
}

/**
 * Walks up from an action bar to find a permalink for the post.
 */
export function extractPostUrlFromActionBar(actionBar: Element): string | null {
    let node: Element | null = actionBar;

    while (node) {
        const fromElement = extractPostUrlFromElement(node);

        if (fromElement) {
            return fromElement;
        }

        node = node.parentElement;
    }

    const fromVideo = extractReelUrlFromVideoContainer(actionBar);

    if (fromVideo) {
        return fromVideo;
    }

    return facebookPostUrlFromPage(window.location);
}
