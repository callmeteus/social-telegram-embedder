import { buildInstagramLinkOnlyPost } from "./api/InstagramPost";
import { injectInstagramContent } from "./content/InjectButton";
import { instagramPlatformManifest } from "./manifest";
import { normalizeInstagramPostUrl } from "./url/InstagramUrl";
import type { DestinationSender } from "../../core/destinations";
import type { SendProgressCallback } from "../../core/network/SendProgress";
import type { SendResult } from "../../core/types/Results";
import type { FetchedSocialPost, SocialPlatform } from "../types";
import { SocialPlatformId } from "../types";

/** Instagram platform adapter. */
export const instagramPlatform: SocialPlatform = {
    id: SocialPlatformId.INSTAGRAM,
    label: "Instagram",
    manifest: instagramPlatformManifest,
    injectContent: injectInstagramContent,
    normalizePostUrl: normalizeInstagramPostUrl,
    async fetchPost(normalizedUrl): Promise<FetchedSocialPost | null> {
        return buildInstagramLinkOnlyPost(normalizedUrl);
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
        fetching: "progressReadingInstagram",
        invalidUrl: "errorInvalidPostUrl"
    }
};
