import { facebookPlatformManifest } from "./manifest";
import { injectFacebookContent } from "./content/InjectButton";
import { fetchFacebookOpenGraph } from "./api/OpenGraphFetch";
import { normalizeFacebookPostUrl } from "./url/FacebookUrl";
import type { SocialPlatform } from "../types";
import { SocialPlatformId } from "../types";
import type { FetchedSocialPost } from "../types";
import type { DestinationSender } from "../../core/destinations";
import type { SendProgressCallback } from "../../core/network/SendProgress";
import type { SendResult } from "../../core/types/Results";

/** Facebook platform adapter. */
export const facebookPlatform: SocialPlatform = {
    id: SocialPlatformId.FACEBOOK,
    label: "Facebook",
    manifest: facebookPlatformManifest,
    injectContent: injectFacebookContent,
    normalizePostUrl: normalizeFacebookPostUrl,
    async fetchPost(normalizedUrl): Promise<FetchedSocialPost | null> {
        const openGraph = await fetchFacebookOpenGraph(normalizedUrl);

        if (!openGraph) {
            return null;
        }

        return {
            embedUrl: normalizedUrl,
            sourceUrl: normalizedUrl,
            text: openGraph.text,
            media: openGraph.media
        };
    },
    sendPost(
        sender: DestinationSender,
        post: FetchedSocialPost,
        onProgress?: SendProgressCallback
    ): Promise<SendResult> {
        return sender.sendSocialPost(post, onProgress);
    },
    progressMessages: {
        fetching: "progressFetchingPost",
        invalidUrl: "errorInvalidPostUrl"
    }
};
