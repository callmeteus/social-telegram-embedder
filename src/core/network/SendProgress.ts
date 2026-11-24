import type { SendPostResult } from "../types/Results";

/**
 * Progress updates pushed from the service worker to the content script.
 */
export enum ContentMessageType {
    SEND_PROGRESS = "SEND_PROGRESS",
    SEND_PROGRESS_END = "SEND_PROGRESS_END",
    SEND_POST_DONE = "SEND_POST_DONE"
}

/** Payload for send progress toast updates. */
export interface SendProgressPayload {
    type: ContentMessageType.SEND_PROGRESS;
    requestId: string;
    message: string;
    percent?: number;
}

/** Payload that closes a progress toast in tabs that will not receive the final result. */
export interface SendProgressEndPayload {
    type: ContentMessageType.SEND_PROGRESS_END;
    requestId: string;
}

/** Payload with the final outcome of a queued send, pushed once the background job finishes. */
export interface SendPostDonePayload {
    type: ContentMessageType.SEND_POST_DONE;
    requestId: string;
    result: SendPostResult;
}

/** Every message the service worker pushes into a content script tab. */
export type ContentMessage = SendProgressPayload | SendProgressEndPayload | SendPostDonePayload;

/** Progress callback used while sending a social post. */
export interface SendProgressUpdate {
    message: string;
    percent?: number;
}

export type SendProgressCallback = (update: SendProgressUpdate) => void;
