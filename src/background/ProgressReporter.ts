import type { SendProgressCallback } from "../core/network/SendProgress";
import { ContentMessageType, type SendProgressPayload } from "../core/network/SendProgress";

/**
 * Sends progress updates to the content script tab.
 */
export function createTabProgressReporter(
    tabId: number,
    requestId: string
): SendProgressCallback {
    return (update) => {
        const payload: SendProgressPayload = {
            type: ContentMessageType.SEND_PROGRESS,
            requestId,
            message: update.message,
            percent: update.percent
        };

        void chrome.tabs.sendMessage(tabId, payload).catch(() => {
            // Tab may have navigated away while sending.
        });
    };
}
