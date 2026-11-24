import { tabs, runtime } from "../core/extension/BrowserApi";
import { handleSendPost } from "./handlers/SendPostHandler";
import { broadcastProgressEnd } from "./ProgressReporter";
import { notifySendResult } from "./SendNotifier";
import { t } from "../core/i18n/I18n";
import { ContentMessageType, type SendPostDonePayload } from "../core/network/SendProgress";
import type { SendPostMessage, SendPostResult } from "../core/types";

/**
 * How often the worker pokes a Chrome API to reset the MV3 idle timer. Chrome kills an idle
 * worker after ~30s, so this stays comfortably below it.
 */
export const SendKeepaliveIntervalMs = 20_000;

let activeJobs = 0;
let keepaliveTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Runs a send in the background and reports the outcome later, so the tab that asked for it can
 * close right away.
 */
export function startSendJob(message: SendPostMessage, sender: chrome.runtime.MessageSender): void {
    void runSendJob(message, sender);
}

/**
 * Runs one send, keeping the worker alive meanwhile, then delivers the result to the tab or,
 * when it is gone, as a notification.
 */
export async function runSendJob(
    message: SendPostMessage,
    sender: chrome.runtime.MessageSender
): Promise<SendPostResult> {
    beginJob();

    let result: SendPostResult;

    try {
        result = await handleSendPost(message, sender);
    } catch (err) {
        console.error("[send] job %s failed: %O", message.requestId, err);
        result = { ok: false, error: t("errorInternal") };
    } finally {
        endJob();
    }

    await broadcastProgressEnd(message.requestId);
    await deliverSendResult(sender.tab?.id, message.requestId, result);
    return result;
}

/**
 * Sends the final result to the tab that started the send, or notifies the user when it is gone.
 */
export async function deliverSendResult(
    tabId: number | undefined,
    requestId: string,
    result: SendPostResult
): Promise<void> {
    const payload: SendPostDonePayload = {
        type: ContentMessageType.SEND_POST_DONE,
        requestId,
        result
    };

    if (tabId !== undefined) {
        try {
            await tabs.sendMessage(tabId, payload);
            return;
        } catch (err) {
            // Tab closed, navigated away or the extension was reloaded under it.
            console.debug("[send] tab %d could not receive the result, notifying: %O", tabId, err);
        }
    }

    notifySendResult(result);
}

/** Number of sends currently running in the worker (tests). */
export function activeSendJobs(): number {
    return activeJobs;
}

/** Whether the keepalive interval is running (tests). */
export function isKeepaliveRunning(): boolean {
    return keepaliveTimer !== null;
}

function beginJob(): void {
    activeJobs += 1;

    if (activeJobs === 1) {
        startKeepalive();
    }
}

function endJob(): void {
    activeJobs = Math.max(0, activeJobs - 1);

    if (activeJobs === 0) {
        stopKeepalive();
    }
}

function startKeepalive(): void {
    stopKeepalive();

    keepaliveTimer = setInterval(() => {
        try {
            void runtime.getPlatformInfo();
        } catch (err) {
            console.debug("[send] keepalive failed: %O", err);
        }
    }, SendKeepaliveIntervalMs);
}

function stopKeepalive(): void {
    if (keepaliveTimer !== null) {
        clearInterval(keepaliveTimer);
        keepaliveTimer = null;
    }
}
