import { e621PlatformManifest } from "./manifest";
import { fetchE621Post } from "./api/E621Api";
import { injectE621Content } from "./content/InjectButton";
import { normalizeE621PostUrl } from "./url/E621Url";
import type { DestinationSender } from "../../core/destinations";
import type { SendProgressCallback } from "../../core/network/SendProgress";
import type { SendResult } from "../../core/types/Results";
import type { FetchedSocialPost, SocialPlatform } from "../types";
import { SocialPlatformId } from "../types";

/** E621 platform adapter. */
export const e621Platform: SocialPlatform = {
    id: SocialPlatformId.E621,
    label: "e621",
    manifest: e621PlatformManifest,
    injectContent: injectE621Content,
    normalizePostUrl: normalizeE621PostUrl,
    async fetchPost(normalizedUrl): Promise<FetchedSocialPost | null> {
        return fetchE621Post(normalizedUrl);
    },
    sendPost(
        sender: DestinationSender,
        post: FetchedSocialPost,
        onProgress?: SendProgressCallback,
        captionHtml?: string,
        hasSpoiler?: boolean,
        captionAbove?: boolean
    ): Promise<SendResult> {
        return sender.sendSocialPost(post, onProgress, captionHtml, hasSpoiler, captionAbove);
    },
    progressMessages: {
        fetching: "progressFetchingPost",
        invalidUrl: "errorInvalidPostUrl"
    }
};
