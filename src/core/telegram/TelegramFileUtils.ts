import { preferTwitterLargeMediaUrl } from "../media/TwitterMediaUrl";
import type { SocialMediaItem } from "../../platforms/types";

/**
 * Picks a file extension from the MIME type, falling back to the URL.
 */
export function guessFileExtension(mediaUrl: string, mimeType: string): string {
    if (mimeType.includes("jpeg") || mimeType.includes("jpg")) {
        return "jpg";
    }

    if (mimeType.includes("png")) {
        return "png";
    }

    if (mimeType.includes("webp")) {
        return "webp";
    }

    if (mimeType.includes("gif")) {
        return "gif";
    }

    if (mimeType.includes("mp4") || mediaUrl.includes(".mp4")) {
        return "mp4";
    }

    return "bin";
}

/**
 * Decodes base64 bytes into a Blob.
 */
export function base64ToBlob(base64: string, mimeType: string): Blob {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index++) {
        bytes[index] = binary.charCodeAt(index);
    }

    return new Blob([bytes], { type: mimeType });
}

/**
 * Encodes bytes as base64 in chunks, safe for large buffers.
 */
export function bytesToBase64(bytes: Uint8Array): string {
    let binary = "";

    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }

    return btoa(binary);
}

/**
 * Returns media bytes already available in the background (prefetched or captured inline), if any.
 */
export function resolveLocalMediaBlob(item: SocialMediaItem): Blob | null {
    if (item.prefetchedBlob) {
        return item.prefetchedBlob;
    }

    if (item.inlineBlob) {
        return base64ToBlob(item.inlineBlob.base64, item.inlineBlob.mimeType);
    }

    return null;
}

/**
 * URL to download a media item from (largest variant for X photos).
 */
export function getMediaDownloadUrl(item: SocialMediaItem): string {
    return item.kind === "photo" ? preferTwitterLargeMediaUrl(item.url) : item.url;
}
