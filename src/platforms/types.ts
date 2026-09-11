import type { SendProgressCallback } from "../core/network/SendProgress";
import type { SendResult } from "../core/types/Results";
import type { TelegramClient } from "../core/telegram/TelegramClient";

/** Supported social network identifiers. */
export enum SocialPlatformId {
    X = "x"
}

/** A single media attachment resolved from a social post. */
export interface SocialMediaItem {
    kind: "photo" | "video" | "gif";
    url: string;
}

/** Normalized post payload used to build Telegram messages. */
export interface FetchedSocialPost {
    embedUrl: string;
    sourceUrl: string;
    text: string;
    media: SocialMediaItem[];
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
        fetching: string;
        invalidUrl: string;
    };
}
