/**
 * Progress updates pushed from the service worker to the content script.
 */
export enum ContentMessageType {
    SEND_PROGRESS = "SEND_PROGRESS"
}

/** Payload for send progress toast updates. */
export interface SendProgressPayload {
    type: ContentMessageType.SEND_PROGRESS;
    requestId: string;
    message: string;
    percent?: number;
}

/** Progress callback used while sending a social post. */
export interface SendProgressUpdate {
    message: string;
    percent?: number;
}

export type SendProgressCallback = (update: SendProgressUpdate) => void;
