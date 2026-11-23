import type { SocialMediaItem } from "../../types";

/** Media smaller than this is usually a player placeholder rather than the real post file. */
const MIN_INLINE_BYTES = 4096;

/**
 * Resolves Instagram blob videos into inline bytes that survive the runtime message.
 * Direct CDN URLs are kept as-is so the worker can download them once for every destination.
 *
 * @param media - Media captured from the post DOM.
 * @returns Media with blob URLs replaced by inline bytes.
 */
export async function resolveInstagramMedia(media: SocialMediaItem[]): Promise<SocialMediaItem[]> {
    const resolved = await Promise.all(media.map(async (item) => {
        if (!item.url.startsWith("blob:")) {
            return item;
        }

        const inlineBlob = await readInlineBlob(item.url);

        if (!inlineBlob) {
            return null;
        }

        return {
            ...item,
            inlineBlob
        };
    }));

    return resolved.filter((item): item is SocialMediaItem => item !== null);
}

/**
 * Reads a browser blob URL into base64 bytes.
 */
async function readInlineBlob(url: string): Promise<SocialMediaItem["inlineBlob"] | undefined> {
    try {
        const response = await fetch(url);

        if (!response.ok) {
            return undefined;
        }

        const blob = await response.blob();

        if (blob.size < MIN_INLINE_BYTES) {
            return undefined;
        }

        const buffer = await blob.arrayBuffer();

        return {
            base64: arrayBufferToBase64(buffer),
            mimeType: blob.type.startsWith("video/") ? blob.type : "video/mp4"
        };
    } catch (err) {
        console.debug("[instagram] could not read blob video %s: %O", url, err);

        return undefined;
    }
}

/**
 * Encodes bytes as base64 in small chunks to avoid call-stack limits.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;

    for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }

    return btoa(binary);
}
