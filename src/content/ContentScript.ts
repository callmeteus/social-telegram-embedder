import { isExtensionContextError, isExtensionContextValid } from "../core/extension";
import { ContentMessageType, type SendProgressPayload } from "../core/network/SendProgress";
import { socialPlatforms } from "../platforms/registry";
import { updateProgressToast } from "./ui/Toast";

let domObserver: MutationObserver | null = null;
let contentScriptStopped = false;

try {
    chrome.runtime.onMessage.addListener((message: SendProgressPayload) => {
        if (!isExtensionContextValid()) {
            stopContentScript();
            return;
        }

        if (message.type !== ContentMessageType.SEND_PROGRESS) {
            return;
        }

        updateProgressToast(message.requestId, message.message, message.percent);
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
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObserver);
} else {
    startObserver();
}
