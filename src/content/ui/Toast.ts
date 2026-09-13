/**
 * Floating toast notifications inside the X/Twitter page.
 */

import { isExtensionContextValid } from "../../core/extension";

let toastContainer: HTMLElement | null = null;

interface ProgressToastEntry {
    root: HTMLElement;
    messageEl: HTMLElement;
    trackEl: HTMLElement;
    barEl: HTMLElement;
}

const progressToasts = new Map<string, ProgressToastEntry>();

function ensureToastContainer(): HTMLElement {
    if (!toastContainer) {
        toastContainer = document.createElement("div");
        toastContainer.className = "x2tg-toast-container";
        document.body.appendChild(toastContainer);
    }

    return toastContainer;
}

/**
 * Shows a temporary toast message on the page.
 */
export function showToast(message: string, variant: "success" | "error" | "info" = "info"): void {
    const container = ensureToastContainer();

    const toast = document.createElement("div");
    toast.className = `x2tg-toast x2tg-toast--${variant}`;
    toast.textContent = message;
    container.appendChild(toast);

    window.setTimeout(() => {
        toast.classList.add("x2tg-toast--hide");

        window.setTimeout(() => {
            toast.remove();

            if (toastContainer && toastContainer.childElementCount === 0) {
                toastContainer.remove();
                toastContainer = null;
            }
        }, 300);
    }, 4000);
}

/**
 * Creates or updates a progress toast tied to a send request.
 */
export function updateProgressToast(requestId: string, message: string, percent?: number): void {
    const container = ensureToastContainer();
    let entry = progressToasts.get(requestId);

    if (!entry) {
        const root = document.createElement("div");
        root.className = "x2tg-toast x2tg-toast--info x2tg-toast--progress";

        const messageEl = document.createElement("div");
        messageEl.className = "x2tg-toast__message";

        const trackEl = document.createElement("div");
        trackEl.className = "x2tg-toast__progress-track";

        const barEl = document.createElement("div");
        barEl.className = "x2tg-toast__progress-bar";
        trackEl.appendChild(barEl);

        root.appendChild(messageEl);
        root.appendChild(trackEl);
        container.appendChild(root);

        entry = {
            root,
            messageEl,
            trackEl,
            barEl
        };

        progressToasts.set(requestId, entry);
    }

    entry.messageEl.textContent = message;

    if (percent !== undefined) {
        entry.trackEl.style.display = "block";
        entry.barEl.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    } else {
        entry.trackEl.style.display = "none";
        entry.barEl.style.width = "0%";
    }
}

/**
 * Removes a progress toast after the send flow finishes.
 */
export function dismissProgressToast(requestId: string): void {
    const entry = progressToasts.get(requestId);

    if (!entry) {
        return;
    }

    entry.root.classList.add("x2tg-toast--hide");

    window.setTimeout(() => {
        entry.root.remove();
        progressToasts.delete(requestId);

        if (toastContainer && toastContainer.childElementCount === 0) {
            toastContainer.remove();
            toastContainer = null;
        }
    }, 300);
}

/**
 * Opens the extension options page.
 */
export function openOptionsPage(): void {
    try {
        if (isExtensionContextValid() && chrome.runtime.openOptionsPage) {
            chrome.runtime.openOptionsPage();
        }
    } catch {
        // Extension was reloaded while the page stayed open.
    }
}
