import type { FetchedSocialPost, SocialMediaItem } from "../../types";
import { buildFuraffinityCaptionHtml, parseFuraffinityTitle } from "../text/FuraffinityCaption";
import { parseFuraffinityPostUrl } from "../url/FuraffinityUrl";

const FURAFFINITY_BASE_URL = "https://www.furaffinity.net/";

/**
 * Reads a meta tag or title tag value from submission HTML.
 */
function readFuraffinityMeta(html: string, name: string): string {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
        new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"),
        new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "i")
    ];

    for (const pattern of patterns) {
        const match = html.match(pattern);

        if (match?.[1]) {
            return match[1].trim();
        }
    }

    return "";
}

/**
 * Resolves a media URL found in the page against the FurAffinity origin.
 */
function absoluteFuraffinityUrl(value: string): string | null {
    try {
        const url = new URL(value, FURAFFINITY_BASE_URL);

        return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
    } catch {
        return null;
    }
}

/**
 * Maps a media URL to the Telegram attachment kind.
 */
function mediaKindForUrl(url: string, fromVideoTag: boolean): SocialMediaItem["kind"] {
    if (fromVideoTag || /\.(?:mp4|webm)(?:\?|$)/i.test(url)) {
        return "video";
    }

    return /\.gif(?:\?|$)/i.test(url) ? "gif" : "photo";
}

/**
 * Selects the submission media from Open Graph and video tags.
 */
export function selectFuraffinityMedia(html: string): SocialMediaItem[] {
    const candidates: Array<{ url: string; fromVideoTag: boolean }> = [];

    for (const pattern of [
        /<video[^>]+src=["']([^"']+)["']/gi,
        /<source[^>]+src=["']([^"']+)["']/gi
    ]) {
        for (const match of html.matchAll(pattern)) {
            if (match[1]) {
                candidates.push({
                    url: match[1],
                    fromVideoTag: true
                });
            }
        }
    }

    for (const name of ["og:image", "twitter:image"]) {
        const value = readFuraffinityMeta(html, name);

        if (value) {
            candidates.push({
                url: value,
                fromVideoTag: false
            });
        }
    }

    const seen = new Set<string>();
    const media: SocialMediaItem[] = [];

    for (const candidate of candidates) {
        const url = absoluteFuraffinityUrl(candidate.url);

        if (!url || seen.has(url)) {
            continue;
        }

        seen.add(url);
        media.push({
            kind: mediaKindForUrl(url, candidate.fromVideoTag),
            url
        });
    }

    return media.slice(0, 1);
}

/**
 * Maps FurAffinity submission HTML into the cross-platform post shape.
 *
 * @param html - Submission page HTML.
 * @param normalizedUrl - Canonical submission URL used as source link.
 * @returns The mapped post, or null when no media URL can be resolved.
 */
export function mapFuraffinitySubmission(html: string, normalizedUrl: string): FetchedSocialPost | null {
    const rawTitle = readFuraffinityMeta(html, "og:title") || readFuraffinityMeta(html, "twitter:title");
    const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "";
    const parsedTitle = parseFuraffinityTitle(rawTitle || titleTag);
    const description = readFuraffinityMeta(html, "og:description") || readFuraffinityMeta(html, "description");
    const media = selectFuraffinityMedia(html);

    if (media.length === 0) {
        return null;
    }

    return {
        embedUrl: normalizedUrl,
        sourceUrl: normalizedUrl,
        text: buildFuraffinityCaptionHtml(parsedTitle.title, parsedTitle.artist, description),
        media
    };
}

/**
 * Fetches and maps one FurAffinity submission through its public view page.
 *
 * @param normalizedUrl - Canonical submission URL returned by the URL normalizer.
 * @returns The fetched post, or null when the request fails or media is unavailable.
 */
export async function fetchFuraffinityPost(normalizedUrl: string): Promise<FetchedSocialPost | null> {
    if (!parseFuraffinityPostUrl(normalizedUrl)) {
        return null;
    }

    try {
        const response = await fetch(normalizedUrl, {
            credentials: "omit",
            redirect: "follow"
        });

        if (!response.ok) {
            return null;
        }

        return mapFuraffinitySubmission(await response.text(), normalizedUrl);
    } catch {
        return null;
    }
}
