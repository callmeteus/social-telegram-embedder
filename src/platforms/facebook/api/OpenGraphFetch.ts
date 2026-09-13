import type { SocialMediaItem } from "../../types";

interface OpenGraphPayload {
    text: string;
    media: SocialMediaItem[];
}

const FACEBOOK_VIDEO_META_PROPERTIES = [
    "og:video:url",
    "og:video:secure_url",
    "og:video"
];

const FACEBOOK_VIDEO_JSON_PATTERNS = [
    /"(?:browser_native_hd_url|browser_native_sd_url|playable_url|progressive_url)"\s*:\s*"((?:[^"\\]|\\.)*)"/g,
    /"(?:playable_url_quality_hd|playable_url_quality_sd)"\s*:\s*"((?:[^"\\]|\\.)*)"/g,
    /"(?:sd_src|hd_src)"\s*:\s*"((?:[^"\\]|\\.)*)"/g
];

/**
 * Fetches Open Graph metadata for a Facebook post URL.
 */
export async function fetchFacebookOpenGraph(postUrl: string): Promise<OpenGraphPayload | null> {
    try {
        const response = await fetch(postUrl, {
            credentials: "omit",
            redirect: "follow"
        });

        if (!response.ok) {
            return null;
        }

        const html = await response.text();

        return parseFacebookOpenGraph(html);
    } catch {
        return null;
    }
}

/**
 * Parses Open Graph metadata and video URLs from Facebook HTML.
 */
export function parseFacebookOpenGraph(html: string): OpenGraphPayload | null {
    const title = readMetaContent(html, "og:title");
    const description = readMetaContent(html, "og:description");
    const image = readMetaContent(html, "og:image");
    const text = [title, description].filter(Boolean).join("\n\n").trim();
    const media: SocialMediaItem[] = [];
    const videoUrls = parseFacebookVideoUrlsFromHtml(html);

    if (videoUrls.length > 0) {
        media.push({
            kind: "video",
            url: videoUrls[0]
        });
    } else
    if (image) {
        media.push({
            kind: "photo",
            url: image
        });
    }

    if (!text && media.length === 0) {
        return null;
    }

    return {
        text,
        media
    };
}

/**
 * Extracts direct Facebook video URLs from HTML or embedded JSON payloads.
 */
export function parseFacebookVideoUrlsFromHtml(html: string): string[] {
    const urls = new Set<string>();

    for (const property of FACEBOOK_VIDEO_META_PROPERTIES) {
        const value = readMetaContent(html, property);

        if (value && looksLikeFacebookVideoUrl(value)) {
            urls.add(value);
        }
    }

    for (const pattern of FACEBOOK_VIDEO_JSON_PATTERNS) {
        for (const match of html.matchAll(pattern)) {
            const rawValue = match[1];

            if (!rawValue) {
                continue;
            }

            const normalized = unescapeFacebookJsonUrl(rawValue);

            if (looksLikeFacebookVideoUrl(normalized)) {
                urls.add(normalized);
            }
        }
    }

    return [...urls];
}

/**
 * Returns true when the URL looks like a direct Facebook video file.
 */
export function isFacebookDirectVideoUrl(url: string): boolean {
    return looksLikeFacebookVideoUrl(url);
}

function looksLikeFacebookVideoUrl(url: string): boolean {
    return /^https:\/\/(?:video|scontent)[^"'\\ ]+/i.test(url)
        || /\.mp4(?:\?|$)/i.test(url);
}

function unescapeFacebookJsonUrl(value: string): string {
    return value
        .replace(/\\\//g, "/")
        .replace(/\\u0026/g, "&")
        .replace(/\\u003d/g, "=")
        .replace(/\\u0025/g, "%");
}

function readMetaContent(html: string, property: string): string {
    const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
        `<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["']`,
        "i"
    );
    const match = html.match(pattern);

    if (match?.[1]) {
        return decodeHtmlEntities(match[1]).trim();
    }

    const reversePattern = new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["']`,
        "i"
    );
    const reverseMatch = html.match(reversePattern);

    return reverseMatch?.[1] ? decodeHtmlEntities(reverseMatch[1]).trim() : "";
}

function decodeHtmlEntities(value: string): string {
    return value
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, "\"")
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#x27;/g, "'");
}

const FACEBOOK_MESSAGE_JSON_PATTERNS = [
    /"message_text"\s*:\s*"((?:[^"\\]|\\.)*)"/g,
    /"__html"\s*:\s*"((?:[^"\\]|\\.)*)"/g
];

/**
 * Extracts the best available post body from Facebook HTML.
 */
export function parseFacebookPostBodyFromHtml(html: string): string | null {
    const candidates: string[] = [];
    const description = readMetaContent(html, "og:description");

    if (description) {
        candidates.push(stripHtmlTags(description));
    }

    for (const pattern of FACEBOOK_MESSAGE_JSON_PATTERNS) {
        for (const match of html.matchAll(pattern)) {
            const rawValue = match[1];

            if (!rawValue) {
                continue;
            }

            const normalized = stripHtmlTags(unescapeFacebookJsonUrl(rawValue));

            if (normalized) {
                candidates.push(normalized);
            }
        }
    }

    const best = candidates
        .map((candidate) => candidate.trim())
        .filter((candidate) => candidate.length > 0)
        .sort((left, right) => right.length - left.length)[0];

    return best ?? null;
}

function stripHtmlTags(value: string): string {
    return value
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}
