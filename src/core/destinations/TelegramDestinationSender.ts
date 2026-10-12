import type { DestinationSender } from "./DestinationSender";
import type { SendProgressCallback } from "../network/SendProgress";
import type { TelegramClient } from "../telegram/TelegramClient";
import type { SendResult } from "../types/Results";
import type { FetchedSocialPost } from "../../platforms/types";

/**
 * Sends to a single Telegram chat through the Bot API.
 */
export class TelegramDestinationSender implements DestinationSender {
    /**
     * @param client - Client authenticated with the Telegram bot token.
     * @param chatId - Target chat or channel id.
     */
    public constructor(
        private readonly client: TelegramClient,
        private readonly chatId: string
    ) {}

    public sendSocialPost(post: FetchedSocialPost, onProgress?: SendProgressCallback): Promise<SendResult> {
        return this.client.sendSocialPost(this.chatId, post, onProgress);
    }

    public sendLink(url: string): Promise<SendResult> {
        return this.client.sendMessage(this.chatId, url);
    }

    public sendTestMessage(): Promise<SendResult> {
        return this.client.sendTestMessage(this.chatId);
    }
}
