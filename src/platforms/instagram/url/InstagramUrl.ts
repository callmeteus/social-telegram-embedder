const INSTAGRAM_HOSTS = new Set([
    "instagram.com",
    "www.instagram.com",
    "m.instagram.com"
]);

/** Post types this adapter supports: single photos, carousels, videos and reels. */
export type InstagramPostKind = "post" | "reel";

/** Identity parsed from a shareable Instagram post or reel URL. */
export interface InstagramPostIdentity {
    shortcode: string;
    kind: InstagramPostKind;
}

/**
 * Returns true when the hostname belongs to Instagram.
 */
function isInstagramHost(hostname: string): boolean {
    const normalized = hostname.toLowerCase().replace(/^www\./, "");

    return INSTAGRAM_HOSTS.has(normalized) || normalized.endsWith(".instagram.com");
}

/**
 * Parses the shortcode and post type from an Instagram URL.
 *
 * Stories, profiles and the home feed are not shareable posts and are rejected.
 *
 * @param rawUrl - Absolute or relative Instagram URL.
 * @returns The post identity, or null when the URL is not a supported post or reel.
 */
export function parseInstagramPostUrl(rawUrl: string): InstagramPostIdentity | null {
    let url: URL;

    try {
        url = new URL(rawUrl, "https://www.instagram.com/");
    } catch {
        return null;
    }

    if (!isInstagramHost(url.hostname)) {
        return null;
    }

    const match = url.pathname.match(/^\/(p|reel|reels|tv)\/([A-Za-z0-9_-]{5,})\/?$/);

    if (!match) {
        return null;
    }

    return {
        shortcode: match[2] ?? "",
        kind: match[1] === "p" ? "post" : "reel"
    };
}

/**
 * Normalizes an Instagram URL to its canonical post or reel form, dropping tracking parameters.
 *
 * @param rawUrl - Absolute or relative Instagram URL.
 * @returns The canonical URL, or null when the URL is not a supported post or reel.
 */
export function normalizeInstagramPostUrl(rawUrl: string): string | null {
    const identity = parseInstagramPostUrl(rawUrl);

    if (!identity) {
        return null;
    }

    const segment = identity.kind === "reel" ? "reel" : "p";

    return `https://www.instagram.com/${segment}/${identity.shortcode}/`;
}

/**
 * Resolves the canonical URL of the Instagram page currently shown.
 *
 * @param location - Current page location.
 * @returns The canonical URL, or null when the page is not a post or reel view.
 */
export function instagramPostUrlFromPage(
    location: Pick<Location, "href"> = window.location
): string | null {
    return normalizeInstagramPostUrl(location.href);
}
