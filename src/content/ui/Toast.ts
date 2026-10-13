/**
 * Floating toast notifications inside the X/Twitter page.
 */

import { isExtensionContextValid } from "../../core/extension";
import { t } from "../../core/i18n/I18n";

let toastContainer: HTMLElement | null = null;

/** Quick sends never show the elapsed counter; slow ones show it so the toast never looks frozen. */
const ELAPSED_VISIBLE_AFTER_MS = 3000;

interface ProgressToastEntry {
    root: HTMLElement;
    messageEl: HTMLElement;
    elapsedEl: HTMLElement;
    trackEl: HTMLElement;
    barEl: HTMLElement;
    startedAt: number;
    elapsedTimer: number;
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

        const header = document.createElement("div");
        header.className = "x2tg-toast__header";

        const messageEl = document.createElement("div");
        messageEl.className = "x2tg-toast__message";

        const elapsedEl = document.createElement("div");
        elapsedEl.className = "x2tg-toast__elapsed";

        const trackEl = document.createElement("div");
        trackEl.className = "x2tg-toast__progress-track";

        const barEl = document.createElement("div");
        barEl.className = "x2tg-toast__progress-bar";
        trackEl.appendChild(barEl);

        header.appendChild(messageEl);
        header.appendChild(elapsedEl);
        root.appendChild(header);
        root.appendChild(trackEl);
        container.appendChild(root);

        const created: ProgressToastEntry = {
            root,
            messageEl,
            elapsedEl,
            trackEl,
            barEl,
            startedAt: Date.now(),
            elapsedTimer: 0
        };

        created.elapsedTimer = window.setInterval(() => renderElapsed(created), 1000);
        entry = created;
        progressToasts.set(requestId, entry);
    }

    entry.messageEl.textContent = message;

    if (percent !== undefined) {
        entry.trackEl.classList.remove("x2tg-toast__progress-track--indeterminate");
        entry.barEl.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    } else {
        entry.trackEl.classList.add("x2tg-toast__progress-track--indeterminate");
        entry.barEl.style.removeProperty("width");
    }
}

function renderElapsed(entry: ProgressToastEntry): void {
    const elapsedMs = Date.now() - entry.startedAt;

    entry.elapsedEl.textContent = elapsedMs >= ELAPSED_VISIBLE_AFTER_MS
        ? t("progressElapsedSeconds", String(Math.floor(elapsedMs / 1000)))
        : "";
}

/**
 * Removes a progress toast after the send flow finishes.
 */
export function dismissProgressToast(requestId: string): void {
    const entry = progressToasts.get(requestId);

    if (!entry) {
        return;
    }

    window.clearInterval(entry.elapsedTimer);
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
