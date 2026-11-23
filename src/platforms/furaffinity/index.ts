import { furaffinityPlatformManifest } from "./manifest";
import { fetchFuraffinityPost } from "./api/FuraffinityApi";
import { injectFuraffinityContent } from "./content/InjectButton";
import { normalizeFuraffinityPostUrl } from "./url/FuraffinityUrl";
import type { DestinationSender } from "../../core/destinations";
import type { SendProgressCallback } from "../../core/network/SendProgress";
import type { SendResult } from "../../core/types/Results";
import type { FetchedSocialPost, SocialPlatform } from "../types";
import { SocialPlatformId } from "../types";

/** FurAffinity platform adapter. */
export const furaffinityPlatform: SocialPlatform = {
    id: SocialPlatformId.FURAFINITY,
    label: "FurAffinity",
    manifest: furaffinityPlatformManifest,
    injectContent: injectFuraffinityContent,
    normalizePostUrl: normalizeFuraffinityPostUrl,
    async fetchPost(normalizedUrl): Promise<FetchedSocialPost | null> {
        return fetchFuraffinityPost(normalizedUrl);
    },
    sendPost(
        sender: DestinationSender,
        post: FetchedSocialPost,
        onProgress?: SendProgressCallback,
        captionHtml?: string
    ): Promise<SendResult> {
        return sender.sendSocialPost(post, onProgress, captionHtml);
    },
    progressMessages: {
        fetching: "progressFetchingPost",
        invalidUrl: "errorInvalidPostUrl"
    }
};
