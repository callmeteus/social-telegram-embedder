import type { SendProgressCallback } from "../network/SendProgress";
import type { SendResult } from "../types/Results";
import type { FetchedSocialPost } from "../../platforms/types";

/**
 * Sends content to one configured destination channel. One implementation per provider.
 */
export interface DestinationSender {
    /** Sends a post with its media and caption. */
    sendSocialPost(post: FetchedSocialPost, onProgress?: SendProgressCallback): Promise<SendResult>;
    /** Sends only the post link, used when post details could not be fetched. */
    sendLink(url: string): Promise<SendResult>;
    /** Sends a test message to confirm the channel is reachable. */
    sendTestMessage(): Promise<SendResult>;
}
