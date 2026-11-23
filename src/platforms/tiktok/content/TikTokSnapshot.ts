import type { SocialMediaItem, SocialPostSnapshot } from "../../types";
import { buildTikTokCaptionText } from "../text/TikTokCaption";

/** Minimum inline size for a real video, below this it is a player placeholder. */
const MIN_INLINE_BYTES = 4096;

/** Shape of a TikTok bitrate-info entry relevant to video resolution. */
interface TikTokBitrateEntry {
    Bitrate?: number;
    BitRate?: number;
    PlayAddr?: {
        Url?: string;
        url?: string;
        UrlList?: string[];
    };
}

/** Shape of the item struct exposed by TikTok's universal data payload. */
interface TikTokItemStruct {
    desc?: string;
    video?: {
        playAddr?: string;
        downloadAddr?: string;
        bitrateInfo?: TikTokBitrateEntry[];
    };
    author?: {
        uniqueId?: string;
        nickname?: string;
    };
}

/**
 * Reads the video detail struct from the page's universal data script.
 *
 * @returns The item struct for the current video, or null when unavailable.
 */
function readItemStruct(): TikTokItemStruct | null {
    const element = document.getElementById("__UNIVERSAL_DATA_FOR_REHYDRATION__");

    if (!element) {
        return null;
    }

    try {
        const data = JSON.parse(element.textContent ?? "") as Record<string, unknown>;
        const scope = data?.__DEFAULT_SCOPE__ as Record<string, unknown> | undefined;
        const detail = scope?.["webapp.video-detail"] as Record<string, unknown> | undefined;
        const itemInfo = detail?.itemInfo as Record<string, unknown> | undefined;

        return (itemInfo?.itemStruct as TikTokItemStruct) ?? null;
    } catch {
        return null;
    }
}

/**
 * Picks the highest-bitrate playable URL from the video detail struct.
 *
 * @param item - TikTok video item struct.
 * @returns A direct video URL, or null when the struct has none.
 */
function pickPlayableUrl(item: TikTokItemStruct): string | null {
    const video = item.video;

    if (!video) {
        return null;
    }

    const candidates: string[] = [];

    for (const entry of [...(video.bitrateInfo ?? [])].sort((left, right) =>
        (right.Bitrate ?? right.BitRate ?? 0) - (left.Bitrate ?? left.BitRate ?? 0)
    )) {
        const address = entry.PlayAddr;

        if (!address) {
            continue;
        }

        if (Array.isArray(address.UrlList)) {
            candidates.push(...address.UrlList);
        }

        if (address.Url) {
            candidates.push(address.Url);
        }

        if (address.url) {
            candidates.push(address.url);
        }
    }

    if (video.playAddr) {
        candidates.push(video.playAddr);
    }

    if (video.downloadAddr) {
        candidates.push(video.downloadAddr);
    }

    for (const candidate of candidates) {
        const url = candidate.replace(/\\\//g, "/").trim();

        if (/^https?:\/\//i.test(url)) {
            return url;
        }
    }

    return null;
}

/**
 * Downloads a TikTok video URL into inline bytes that survive the runtime message.
 *
 * @param url - Direct video URL from the page payload.
 * @returns Inline media descriptor, or undefined when the download fails.
 */
async function readInlineVideo(url: string): Promise<SocialMediaItem["inlineBlob"] | undefined> {
    try {
        const response = await fetch(url, {
            credentials: "include",
            headers: {
                Referer: "https://www.tiktok.com/",
                Origin: "https://www.tiktok.com"
            }
        });

        if (!response.ok) {
            return undefined;
        }

        const blob = await response.blob();

        if (blob.size < MIN_INLINE_BYTES) {
            return undefined;
        }

        const buffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const chunkSize = 0x8000;
        let binary = "";

        for (let index = 0; index < bytes.length; index += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
        }

        return {
            base64: btoa(binary),
            mimeType: blob.type.startsWith("video/") ? blob.type : "video/mp4"
        };
    } catch (err) {
        console.debug("[tiktok] could not read video %s: %O", url, err);

        return undefined;
    }
}

/**
 * Builds a post snapshot from the video currently rendered on the TikTok page.
 *
 * The page's universal data payload carries the real video URL, description and
 * author, so the content script captures them before the worker sends the post.
 *
 * @param postUrl - Canonical post URL used as the source link.
 * @returns Text and media captured from the page.
 */
export async function buildTikTokSnapshot(postUrl: string): Promise<SocialPostSnapshot> {
    const item = readItemStruct();

    if (!item) {
        return { text: "", media: [] };
    }

    const author = item.author?.uniqueId ? `@${item.author.uniqueId} ` : "";
    const description = buildTikTokCaptionText(item.desc);
    const text = `${author}${description}`.trim();
    const url = pickPlayableUrl(item);
    const inlineBlob = url ? await readInlineVideo(url) : undefined;
    const media: SocialMediaItem[] = inlineBlob && url
        ? [{ kind: "video", url, inlineBlob }]
        : [];

    return {
        text: text ? `${text}\n\n${postUrl}` : postUrl,
        media
    };
}
