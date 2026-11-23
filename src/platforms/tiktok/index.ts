import { tiktokPlatformManifest } from "./manifest";
import { fetchTikTokPost } from "./api/TikTokApi";
import { injectTikTokContent } from "./content/InjectButton";
import { normalizeTikTokPostUrl } from "./url/TikTokUrl";
import type { FetchedSocialPost, SocialPlatform } from "../types";
import { SocialPlatformId } from "../types";
import type { DestinationSender } from "../../core/destinations";
import type { SendProgressCallback } from "../../core/network/SendProgress";
import type { SendResult } from "../../core/types/Results";

/** TikTok platform adapter. */
export const tiktokPlatform: SocialPlatform = {
    id: SocialPlatformId.TIKTOK,
    label: "TikTok",
    manifest: tiktokPlatformManifest,
    injectContent: injectTikTokContent,
    normalizePostUrl: normalizeTikTokPostUrl,
    async fetchPost(normalizedUrl): Promise<FetchedSocialPost | null> {
        return fetchTikTokPost(normalizedUrl);
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
        invalidUrl: "errorInvalidPostUrl",
        linkOnly: "progressTikTokLinkOnly"
    }
};
