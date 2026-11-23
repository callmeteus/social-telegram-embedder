import type { FetchedSocialPost } from "../../types";
import { buildTikTokCaptionText } from "../text/TikTokCaption";
import { normalizeTikTokPostUrl, parseTikTokPostUrl, type TikTokPostIdentity } from "../url/TikTokUrl";

/** Browser user agent used on TikTok's public metadata endpoints. */
const TIKTOK_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** Markers of a login wall or anti-bot challenge returned instead of an embed page. */
const CHALLENGE_PATTERN = /captcha|verify\.tiktok\.com|access denied|are you a robot|security check/i;

/** Subset of TikTok's oEmbed payload used by the adapter. */
export interface TikTokOEmbed {
    title?: string;
    author_name?: string;
    thumbnail_url?: string;
}

/**
 * Returns true when the value is a non-null object that is not an array.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads a string property from a record, ignoring values of other types.
 */
function readString(record: Record<string, unknown> | undefined, key: string): string | undefined {
    const value = record?.[key];

    return typeof value === "string" ? value : undefined;
}

/**
 * Returns the bitrate of a TikTok bitrate-info entry, defaulting to zero.
 */
function bitRateOf(value: unknown): number {
    return isRecord(value) && typeof value.BitRate === "number" ? value.BitRate : 0;
}

/**
 * Finds the video detail struct in a universal-data or SIGI_STATE payload.
 */
function pickItemStruct(payload: unknown, videoId: string | null): Record<string, unknown> | null {
    if (!isRecord(payload)) {
        return null;
    }

    const scope = payload.__DEFAULT_SCOPE__;

    if (isRecord(scope)) {
        const detail = scope["webapp.video-detail"];

        if (isRecord(detail) && isRecord(detail.itemInfo) && isRecord(detail.itemInfo.itemStruct)) {
            return detail.itemInfo.itemStruct;
        }
    }

    if (isRecord(payload.ItemModule) && videoId) {
        const item = payload.ItemModule[videoId];

        if (isRecord(item)) {
            return item;
        }
    }

    return null;
}

/**
 * Picks the highest-quality direct video URL from a TikTok video detail struct.
 */
function pickVideoUrl(item: Record<string, unknown>): string | null {
    if (!isRecord(item.video)) {
        return null;
    }

    const video = item.video;
    const bitrateInfo: unknown[] = Array.isArray(video.bitrateInfo) ? video.bitrateInfo : [];
    const candidates: string[] = [];

    for (const entry of [...bitrateInfo].sort((left, right) => bitRateOf(right) - bitRateOf(left))) {
        if (!isRecord(entry)) {
            continue;
        }

        const playAddr = isRecord(entry.PlayAddr) ? entry.PlayAddr : undefined;
        const url = readString(playAddr, "Url") ?? readString(playAddr, "url");

        if (url) {
            candidates.push(url);
        }
    }

    candidates.push(readString(video, "playAddr") ?? "");
    candidates.push(readString(video, "downloadAddr") ?? "");

    for (const candidate of candidates) {
        const url = candidate.replace(/\\\//g, "/").trim();

        if (/^https?:\/\//i.test(url)) {
            return url;
        }
    }

    return null;
}

/**
 * Parses a JSON script tag from an embed page.
 */
function extractJsonScript(html: string, scriptId: string): unknown {
    const pattern = new RegExp(`<script[^>]*id=["']${scriptId}["'][^>]*>([\\s\\S]*?)<\\/script>`, "i");
    const raw = html.match(pattern)?.[1]?.trim();

    if (!raw) {
        return null;
    }

    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

/**
 * Parses the legacy SIGI_STATE assignment from an embed page.
 */
function extractSigiState(html: string): unknown {
    const raw = html.match(/window\._SIGI_STATE\s*=\s*(\{[\s\S]*?\});/)?.[1];

    if (!raw) {
        return null;
    }

    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

/**
 * Detects a login wall or anti-bot challenge returned in place of video metadata.
 *
 * @param html - HTML returned by TikTok's embed endpoint.
 * @returns True when the response is a challenge page rather than a video page.
 */
export function isTikTokChallengePage(html: string): boolean {
    return CHALLENGE_PATTERN.test(html);
}

/**
 * Maps a TikTok embed payload into the cross-platform post shape.
 * Returns null when the payload has no direct video URL, which triggers the link-only fallback.
 *
 * @param payload - Parsed universal data or SIGI_STATE object.
 * @param videoId - Video id used to locate legacy ItemModule entries.
 * @param sourceUrl - Canonical URL used as the source link.
 * @param oEmbed - Optional oEmbed metadata used when the payload has no description.
 * @returns The mapped post, or null when no video URL can be resolved.
 */
export function mapTikTokVideoDetail(
    payload: unknown,
    videoId: string | null,
    sourceUrl: string,
    oEmbed: TikTokOEmbed | null = null
): FetchedSocialPost | null {
    const item = pickItemStruct(payload, videoId);

    if (!item) {
        return null;
    }

    const videoUrl = pickVideoUrl(item);

    if (!videoUrl) {
        return null;
    }

    return {
        embedUrl: sourceUrl,
        sourceUrl,
        text: buildTikTokCaptionText(readString(item, "desc") ?? oEmbed?.title),
        media: [
            {
                kind: "video",
                url: videoUrl
            }
        ]
    };
}

/**
 * Reads TikTok's public oEmbed endpoint for a video page URL.
 */
async function fetchTikTokOEmbed(url: string): Promise<TikTokOEmbed | null> {
    try {
        const response = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, {
            credentials: "omit",
            headers: {
                Accept: "application/json",
                "User-Agent": TIKTOK_USER_AGENT
            }
        });

        if (!response.ok) {
            return null;
        }

        const payload: unknown = await response.json();

        return isRecord(payload) ? payload : null;
    } catch {
        return null;
    }
}

/**
 * Reads the HTML of TikTok's embeddable player for a video id.
 */
async function fetchTikTokEmbedHtml(videoId: string): Promise<string | null> {
    try {
        const response = await fetch(`https://www.tiktok.com/embed/v3/${videoId}`, {
            credentials: "omit",
            headers: {
                Accept: "text/html",
                "User-Agent": TIKTOK_USER_AGENT
            }
        });

        if (!response.ok) {
            return null;
        }

        const html = await response.text();

        return isTikTokChallengePage(html) ? null : html;
    } catch {
        return null;
    }
}

/**
 * Resolves a short link to a canonical video URL through a redirect.
 * Login walls and challenge pages leave the original short link in place.
 */
async function resolveTikTokSourceUrl(identity: TikTokPostIdentity, normalizedUrl: string): Promise<string> {
    if (!identity.shortCode) {
        return normalizedUrl;
    }

    try {
        const response = await fetch(normalizedUrl, {
            credentials: "omit",
            redirect: "follow",
            headers: {
                "User-Agent": TIKTOK_USER_AGENT
            }
        });
        const resolved = normalizeTikTokPostUrl(response.url);
        const isShort = resolved ? Boolean(parseTikTokPostUrl(resolved)?.shortCode) : true;

        return resolved && !isShort ? resolved : normalizedUrl;
    } catch {
        return normalizedUrl;
    }
}

/**
 * Fetches and maps one TikTok video through public metadata endpoints.
 * Returns null on login walls, anti-bot challenges or missing media so the caller sends a link only.
 *
 * @param normalizedUrl - Canonical URL returned by the TikTok URL normalizer.
 * @returns The fetched post, or null when the video cannot be fetched.
 */
export async function fetchTikTokPost(normalizedUrl: string): Promise<FetchedSocialPost | null> {
    const identity = parseTikTokPostUrl(normalizedUrl);

    if (!identity) {
        return null;
    }

    const sourceUrl = await resolveTikTokSourceUrl(identity, normalizedUrl);
    const resolvedIdentity = parseTikTokPostUrl(sourceUrl) ?? identity;
    const oEmbed = await fetchTikTokOEmbed(sourceUrl);

    if (!resolvedIdentity.videoId) {
        return null;
    }

    const html = await fetchTikTokEmbedHtml(resolvedIdentity.videoId);

    if (!html) {
        return null;
    }

    const payload = extractJsonScript(html, "__UNIVERSAL_DATA_FOR_REHYDRATION__") ?? extractSigiState(html);
    const post = mapTikTokVideoDetail(payload, resolvedIdentity.videoId, sourceUrl, oEmbed);

    return post;
}
