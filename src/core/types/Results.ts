import type { DetectedTelegramChannel } from "../telegram/DiscoverChannels";

/** Result of a Telegram send operation. */
export interface SendResult {
    ok: boolean;
    error?: string;
}

/** Result of discovering Telegram channels from bot updates. */
export interface DiscoverChannelsResponse {
    ok: boolean;
    channels?: DetectedTelegramChannel[];
    error?: string;
    warning?: string;
}
