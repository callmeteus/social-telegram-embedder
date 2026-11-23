import type { FetchedSocialPost, SocialMediaItem } from "../../types";
import { buildE621CaptionText } from "../text/E621Caption";
import { parseE621PostUrl } from "../url/E621Url";

/** Telegram Bot API upload limit for photos. */
const TELEGRAM_PHOTO_MAX_BYTES = 10 * 1024 * 1024;

interface E621ApiFile {
    url?: string;
    jpg?: string;
    webp?: string;
}

interface E621ApiFiles {
    meta?: {
        ext?: string;
        size?: number;
    };
    original?: E621ApiFile;
    sample?: E621ApiFile;
    preview?: E621ApiFile;
}

interface E621ApiPost {
    id?: number;
    description?: string;
    tags?: string[];
    files?: E621ApiFiles;
}

/**
 * Returns true when the value is a non-null object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

/**
 * Type guard for the subset of the E621 post payload used by the adapter.
 */
function isE621ApiPost(value: unknown): value is E621ApiPost {
    if (!isRecord(value)) {
        return false;
    }

    if (value.description !== undefined && typeof value.description !== "string") {
        return false;
    }

    if (value.tags !== undefined && !Array.isArray(value.tags)) {
        return false;
    }

    return value.files === undefined || isRecord(value.files);
}

/**
 * Picks the best media URL and its Telegram kind from an E621 post.
 */
function selectE621Media(post: E621ApiPost): { url: string; kind: SocialMediaItem["kind"] } | null {
    const extension = (post.files?.meta?.ext ?? "").toLowerCase();
    const kind: SocialMediaItem["kind"] = extension === "gif"
        ? "gif"
        : extension === "mp4" || extension === "webm"
            ? "video"
            : "photo";
    const original = post.files?.original?.url;
    const sampleJpg = post.files?.sample?.jpg;
    const sample = sampleJpg ?? post.files?.sample?.webp;
    const preview = post.files?.preview?.jpg ?? post.files?.preview?.webp;
    const fileSize = post.files?.meta?.size ?? 0;
    const preferSample = kind === "photo" && fileSize > TELEGRAM_PHOTO_MAX_BYTES;
    const url = preferSample && sampleJpg ? sampleJpg : original ?? sample ?? preview;

    if (!url) {
        return null;
    }

    return {
        url,
        kind
    };
}

/**
 * Maps an E621 API post into the cross-platform post shape.
 *
 * @param post - Post payload from the E621 API.
 * @param normalizedUrl - Canonical post URL used as source link.
 * @returns The mapped post, or null when no media URL can be resolved.
 */
export function mapE621Post(post: E621ApiPost, normalizedUrl: string): FetchedSocialPost | null {
    const media = selectE621Media(post);

    if (!media) {
        return null;
    }

    return {
        embedUrl: normalizedUrl,
        sourceUrl: normalizedUrl,
        text: buildE621CaptionText(post.description),
        media: [
            {
                kind: media.kind,
                url: media.url
            }
        ]
    };
}

/**
 * Fetches and maps one E621 post through the public JSON endpoint.
 *
 * @param normalizedUrl - Canonical post URL returned by the E621 URL normalizer.
 * @returns The fetched post, or null when the request fails or media is unavailable.
 */
export async function fetchE621Post(normalizedUrl: string): Promise<FetchedSocialPost | null> {
    const identity = parseE621PostUrl(normalizedUrl);

    if (!identity) {
        return null;
    }

    try {
        const response = await fetch(`https://${identity.host}/posts/${identity.id}.json`, {
            credentials: "omit",
            headers: {
                Accept: "application/json"
            }
        });

        if (!response.ok) {
            return null;
        }

        const payload: unknown = await response.json();

        if (!isE621ApiPost(payload)) {
            return null;
        }

        return mapE621Post(payload, normalizedUrl);
    } catch {
        return null;
    }
}
