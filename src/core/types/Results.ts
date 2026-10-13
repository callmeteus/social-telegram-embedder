import type { DetectedTelegramChannel } from "../telegram/DiscoverChannels";

/** Result of a Telegram send operation. */
export interface SendResult {
    ok: boolean;
    error?: string;
    /** Set when Telegram asked to wait before sending again (seconds). */
    floodWaitSeconds?: number;
}

/** Outcome for one destination of a send. */
export interface DestinationSendOutcome {
    label: string;
    ok: boolean;
    error?: string;
}

/** Result of SEND_POST: overall status plus one outcome per destination. */
export interface SendPostResult extends SendResult {
    outcomes?: DestinationSendOutcome[];
}

/** Result of discovering Telegram channels from bot updates. */
export interface DiscoverChannelsResponse {
    ok: boolean;
    channels?: DetectedTelegramChannel[];
    error?: string;
    warning?: string;
}
