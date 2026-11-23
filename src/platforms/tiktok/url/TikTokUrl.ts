/** Hosts that serve TikTok video pages. */
const TIKTOK_PAGE_HOSTS = new Set([
    "tiktok.com",
    "www.tiktok.com",
    "m.tiktok.com"
]);

/** Hosts that serve share links redirecting to a video page. */
const TIKTOK_SHORT_HOSTS = new Set([
    "vm.tiktok.com",
    "vt.tiktok.com"
]);

/** Path shapes that carry a numeric TikTok video id. */
const VIDEO_PATH_PATTERNS = [
    /^\/@[^/]+\/video\/(\d+)/,
    /^\/video\/(\d+)/,
    /^\/v\/(\d+)(?:\.html)?\/?$/,
    /^\/embed\/v3\/(\d+)/,
    /^\/player\/v1\/(\d+)/
];

/** Share-link code shapes used by TikTok short URLs. */
const SHORT_CODE_PATTERN = /^[A-Za-z0-9_-]{4,}$/;

/** Identity parsed from a TikTok video page or short link. */
export interface TikTokPostIdentity {
    /** Numeric video id when the URL points at a specific video. */
    videoId: string | null;
    /** Short-link code when the URL must be resolved through a redirect. */
    shortCode: string | null;
    /** Normalized share URL used as the source link and caption target. */
    canonicalUrl: string;
}

/**
 * Returns the video id from a TikTok path, when the path names a video.
 */
function videoIdFromPath(pathname: string): string | null {
    for (const pattern of VIDEO_PATH_PATTERNS) {
        const id = pathname.match(pattern)?.[1];

        if (id) {
            return id;
        }
    }

    return null;
}

/**
 * Parses a TikTok video URL or short link into its stable identity.
 *
 * @param rawUrl - Absolute or relative TikTok URL.
 * @returns The post identity, or null when the URL is not a shareable TikTok video.
 */
export function parseTikTokPostUrl(rawUrl: string): TikTokPostIdentity | null {
    let url: URL;

    try {
        url = new URL(rawUrl, "https://www.tiktok.com/");
    } catch {
        return null;
    }

    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const pathname = url.pathname.replace(/\/+$/, "") || "/";

    const isShortHost = TIKTOK_SHORT_HOSTS.has(host);
    const isTLink = host === "tiktok.com" && /^\/t\//.test(pathname);

    if (isShortHost || isTLink) {
        const segments = pathname.split("/").filter(Boolean);
        const code = isTLink ? segments[1] ?? "" : segments[0] ?? "";

        if (!SHORT_CODE_PATTERN.test(code)) {
            return null;
        }

        return {
            videoId: null,
            shortCode: code,
            canonicalUrl: isTLink ? `https://www.tiktok.com/t/${code}` : `https://${host}/${code}`
        };
    }

    if (!TIKTOK_PAGE_HOSTS.has(host)) {
        return null;
    }

    const videoId = videoIdFromPath(pathname);

    if (!videoId) {
        return null;
    }

    return {
        videoId,
        shortCode: null,
        canonicalUrl: `https://www.tiktok.com${pathname}`
    };
}

/**
 * Normalizes a TikTok URL to its canonical share form, dropping tracking parameters.
 * Short links are kept as links because resolving them needs a network redirect.
 *
 * @param rawUrl - Absolute or relative TikTok URL.
 * @returns The canonical URL, or null when the URL is not a shareable TikTok video.
 */
export function normalizeTikTokPostUrl(rawUrl: string): string | null {
    return parseTikTokPostUrl(rawUrl)?.canonicalUrl ?? null;
}

/**
 * Builds the canonical video URL for the current TikTok page.
 *
 * @param location - Current page location.
 * @param doc - Document holding a possible Open Graph URL.
 * @returns The canonical URL, or null when the page is not a video view.
 */
export function tikTokPostUrlFromPage(
    location: Pick<Location, "href"> = window.location,
    doc: Document = document
): string | null {
    const fromHref = normalizeTikTokPostUrl(location.href);

    if (fromHref) {
        return fromHref;
    }

    const openGraphUrl = doc.querySelector('meta[property="og:url"]')?.getAttribute("content")?.trim();

    return openGraphUrl ? normalizeTikTokPostUrl(openGraphUrl) : null;
}
