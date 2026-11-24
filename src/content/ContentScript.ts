import { isFirefoxRuntime, runtime } from "../core/extension/BrowserApi";
import { isExtensionContextError, isExtensionContextValid } from "../core/extension";
import {
    ContentMessageType,
    type ContentMessage,
    type SendPostDonePayload,
    type SendProgressEndPayload,
    type SendProgressPayload
} from "../core/network/SendProgress";
import { handleSendPostDone } from "./send/SendResultHandler";
import { socialPlatforms } from "../platforms/registry";
import { dismissProgressToast, updateProgressToast } from "./ui/Toast";
import { startInstagramVideoMapListener } from "./media/InstagramVideoMap";

let domObserver: MutationObserver | null = null;
let rescanTimer: number | undefined;
let contentScriptStopped = false;

/** Re-scans for late-rendered action bars on SPAs such as Instagram reels. */
const RESCAN_INTERVAL_MS = 1000;

try {
    runtime.onMessage.addListener((message: ContentMessage) => {
        if (!isExtensionContextValid()) {
            stopContentScript();
            return;
        }

        if (message.type === ContentMessageType.SEND_PROGRESS) {
            const progress = message as SendProgressPayload;

            updateProgressToast(progress.requestId, progress.message, progress.percent);
            return;
        }

        if (message.type === ContentMessageType.SEND_PROGRESS_END) {
            dismissProgressToast((message as SendProgressEndPayload).requestId);
            return;
        }

        if (message.type === ContentMessageType.SEND_POST_DONE) {
            handleSendPostDone(message as SendPostDonePayload);
        }
    });
} catch (err) {
    if (isExtensionContextError(err)) {
        contentScriptStopped = true;
    }
}

/**
 * Stops DOM scanning after the extension context is invalidated.
 */
export function stopContentScript(): void {
    if (contentScriptStopped) {
        return;
    }

    contentScriptStopped = true;
    domObserver?.disconnect();
    domObserver = null;

    if (rescanTimer !== undefined) {
        window.clearInterval(rescanTimer);
        rescanTimer = undefined;
    }
}

/**
 * Scans the document and injects platform-specific send buttons.
 */
function scanPlatforms(root: ParentNode = document): void {
    if (contentScriptStopped || !isExtensionContextValid()) {
        stopContentScript();
        return;
    }

    try {
        for (const platform of socialPlatforms) {
            platform.injectContent(root);
        }
    } catch (err) {
        if (isExtensionContextError(err)) {
            stopContentScript();
            return;
        }

        throw err;
    }
}

/**
 * Starts observing DOM mutations to inject buttons on dynamically loaded posts.
 */
function startObserver(): void {
    if (contentScriptStopped || !isExtensionContextValid()) {
        return;
    }

    startInstagramVideoMapListener();

    // Shared-DOM marker identifying which browser ran the content script.
    // Useful for diagnostics and for the cross-browser smoke tests.
    document.documentElement.setAttribute(
        "data-x2tg-content-script",
        isFirefoxRuntime() ? "firefox" : "chrome"
    );

    scanPlatforms(document);

    domObserver = new MutationObserver((mutations) => {
        if (contentScriptStopped || !isExtensionContextValid()) {
            stopContentScript();
            return;
        }

        for (const mutation of mutations) {
            for (const node of Array.from(mutation.addedNodes)) {
                if (!(node instanceof HTMLElement)) {
                    continue;
                }

                scanPlatforms(node);
            }
        }
    });

    domObserver.observe(document.body, {
        childList: true,
        subtree: true
    });

    rescanTimer = window.setInterval(() => {
        if (contentScriptStopped || !isExtensionContextValid()) {
            stopContentScript();
            return;
        }

        scanPlatforms(document);
    }, RESCAN_INTERVAL_MS);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObserver);
} else {
    startObserver();
}
