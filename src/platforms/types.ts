import type { SendProgressCallback } from "../core/network/SendProgress";
import type { SendResult } from "../core/types/Results";
import type { TelegramClient } from "../core/telegram/TelegramClient";

/** Supported social network identifiers. */
export enum SocialPlatformId {
    X = "x",
    FACEBOOK = "facebook"
}

/** Post payload captured from the page DOM at click time. */
export interface SocialPostSnapshot {
    text: string;
    media: SocialMediaItem[];
}

/** Inline media bytes captured in the content script. */
export interface SocialMediaInlineBlob {
    base64: string;
    mimeType: string;
}

/** A single media attachment resolved from a social post. */
export interface SocialMediaItem {
    kind: "photo" | "video" | "gif";
    url: string;
    inlineBlob?: SocialMediaInlineBlob;
    /** Session storage key when inline bytes are offloaded from the runtime message. */
    inlineBlobStorageKey?: string;
}

/** Normalized post payload used to build Telegram messages. */
export interface FetchedSocialPost {
    embedUrl: string;
    sourceUrl: string;
    text: string;
    media: SocialMediaItem[];
}

/**
 * Builds a fetched post from a content-script snapshot.
 */
export function snapshotToFetchedPost(
    normalizedUrl: string,
    snapshot: SocialPostSnapshot
): FetchedSocialPost {
    return {
        embedUrl: normalizedUrl,
        sourceUrl: normalizedUrl,
        text: snapshot.text,
        media: snapshot.media
    };
}

/** Manifest fragments contributed by a social platform. */
export interface SocialPlatformManifest {
    matches: string[];
    hostPermissions: string[];
}

/** Contract implemented by each social network adapter. */
export interface SocialPlatform {
    id: SocialPlatformId;
    label: string;
    manifest: SocialPlatformManifest;
    injectContent(root: ParentNode): void;
    normalizePostUrl(rawUrl: string): string | null;
    fetchPost(normalizedUrl: string): Promise<FetchedSocialPost | null>;
    sendPost(
        client: TelegramClient,
        chatId: string,
        post: FetchedSocialPost,
        onProgress?: SendProgressCallback
    ): Promise<SendResult>;
    progressMessages: {
        /** i18n message keys resolved via chrome.i18n at runtime. */
        fetching: string;
        invalidUrl: string;
    };
}
