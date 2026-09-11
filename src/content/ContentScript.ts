import { ContentMessageType, type SendProgressPayload } from "../core/network/SendProgress";
import { socialPlatforms } from "../platforms/registry";
import { updateProgressToast } from "./ui/Toast";

chrome.runtime.onMessage.addListener((message: SendProgressPayload) => {
    if (message.type !== ContentMessageType.SEND_PROGRESS) {
        return;
    }

    updateProgressToast(message.requestId, message.message, message.percent);
});

/**
 * Scans the document and injects platform-specific send buttons.
 */
function scanPlatforms(root: ParentNode = document): void {
    for (const platform of socialPlatforms) {
        platform.injectContent(root);
    }
}

/**
 * Starts observing DOM mutations to inject buttons on dynamically loaded posts.
 */
function startObserver(): void {
    scanPlatforms(document);

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of Array.from(mutation.addedNodes)) {
                if (!(node instanceof HTMLElement)) {
                    continue;
                }

                scanPlatforms(node);
            }
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObserver);
} else {
    startObserver();
}
