import { xPlatformManifest } from "./manifest";
import { injectXContent } from "./content/InjectButton";
import { fetchTweetByFixupxUrl } from "./api/FixupxApi";
import { toFixupxTweetUrl } from "./url/FixupxUrl";
import type { SocialPlatform } from "../types";
import { SocialPlatformId } from "../types";
import type { FetchedSocialPost } from "../types";
import type { TelegramClient } from "../../core/telegram/TelegramClient";
import type { SendProgressCallback } from "../../core/network/SendProgress";
import type { SendResult } from "../../core/types/Results";

/**
 * Maps FxTwitter payload to the cross-platform post shape.
 */
function mapFetchedTweet(tweet: NonNullable<Awaited<ReturnType<typeof fetchTweetByFixupxUrl>>>): FetchedSocialPost {
    return {
        embedUrl: tweet.fixupxUrl,
        sourceUrl: tweet.originalUrl,
        text: tweet.text,
        media: tweet.media
    };
}

/** X/Twitter platform adapter. */
export const xPlatform: SocialPlatform = {
    id: SocialPlatformId.X,
    label: "X",
    manifest: xPlatformManifest,
    injectContent: injectXContent,
    normalizePostUrl: toFixupxTweetUrl,
    async fetchPost(normalizedUrl) {
        const tweet = await fetchTweetByFixupxUrl(normalizedUrl);

        if (!tweet) {
            return null;
        }

        return mapFetchedTweet(tweet);
    },
    sendPost(client, chatId, post, onProgress) {
        return client.sendSocialPost(chatId, post, onProgress);
    },
    progressMessages: {
        fetching: "progressFetchingPost",
        invalidUrl: "errorInvalidPostUrl"
    }
};
