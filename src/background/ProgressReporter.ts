import { tabs } from "../core/extension/BrowserApi";
import type { SendProgressCallback } from "../core/network/SendProgress";
import {
    ContentMessageType,
    type ContentMessage,
    type SendProgressEndPayload,
    type SendProgressPayload
} from "../core/network/SendProgress";
import { getPlatformSiteForUrl } from "../platforms/site";

/**
 * Sends a message to every open tab on a supported site. Tabs that have not loaded the content
 * script simply reject the message and are ignored.
 */
export async function broadcastToCompatibleTabs(payload: ContentMessage): Promise<void> {
    let openTabs: chrome.tabs.Tab[];

    try {
        openTabs = await tabs.query({});
    } catch {
        // No tab access, for example while the extension is reloading.
        return;
    }

    await Promise.all(openTabs.map(async (tab) => {
        if (tab.id === undefined || !getPlatformSiteForUrl(tab.url)) {
            return;
        }

        try {
            await tabs.sendMessage(tab.id, payload);
        } catch {
            // Tab navigated away or has no content script loaded.
        }
    }));
}

/**
 * Reports progress to every tab showing a supported site.
 */
export function createProgressBroadcaster(requestId: string): SendProgressCallback {
    return (update) => {
        const payload: SendProgressPayload = {
            type: ContentMessageType.SEND_PROGRESS,
            requestId,
            message: update.message,
            percent: update.percent
        };

        void broadcastToCompatibleTabs(payload);
    };
}

/**
 * Closes the progress toast in every tab once the send stops being active.
 */
export async function broadcastProgressEnd(requestId: string): Promise<void> {
    const payload: SendProgressEndPayload = {
        type: ContentMessageType.SEND_PROGRESS_END,
        requestId
    };

    await broadcastToCompatibleTabs(payload);
}
