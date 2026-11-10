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

/**
 * Immediate reply to SEND_POST: the job is queued in the service worker and the tab can let go.
 * The outcome arrives later as SEND_POST_DONE (tab open) or as a notification (tab closed).
 */
export interface SendPostAccepted {
    accepted: true;
    requestId: string;
}

/** Reply to SEND_POST: accepted and queued, or rejected before any work started. */
export type SendPostResponse = SendPostAccepted | SendResult;

/** Type guard for {@link SendPostAccepted}. */
export function isSendPostAccepted(response: SendPostResponse | undefined): response is SendPostAccepted {
    return Boolean(response && "accepted" in response && response.accepted);
}

/** Result of discovering Telegram channels from bot updates. */
export interface DiscoverChannelsResponse {
    ok: boolean;
    channels?: DetectedTelegramChannel[];
    error?: string;
    warning?: string;
}
