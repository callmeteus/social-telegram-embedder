import { RuntimeMessageType } from "../../../core/types/Messages";
import { isConfigReady, loadConfig } from "../../../core/storage/Storage";
import { SocialPlatformId } from "../../types";
import {
    extractTweetUrlFromActionBar,
    extractTweetUrlFromElement,
    tweetUrlFromPage
} from "../url/FixupxUrl";
import {
    collectTweetActionBars,
    findActionBar,
    findShareButton,
    findShareInsertAnchor,
    INJECTED_ACTION_BAR_ATTR,
    INJECTED_POST_ATTR,
    resolveActionSlot,
    X_POST_ARTICLE_SELECTOR
} from "./ActionBar";
import { dismissProgressToast, openOptionsPage, showToast, updateProgressToast } from "../../../content/ui/Toast";
import { showChannelPicker } from "../../../content/ui/ChannelPicker";

const SEND_DEBOUNCE_MS = 3000;
const TELEGRAM_ICON_PATH = "M2.01 21L23 12 2.01 3 2 10l15 2-15 2z";
const recentSends = new Map<string, number>();

/**
 * Injects Telegram send buttons for X/Twitter posts.
 */
export function injectXContent(root: ParentNode = document): void {
    injectTimelinePosts(root);
    injectStandaloneActionBars(root);
}

function injectTimelinePosts(root: ParentNode): void {
    if (root instanceof Element && root.matches(X_POST_ARTICLE_SELECTOR)) {
        injectPostButton(root);
    }

    if (!(root instanceof Element || root instanceof Document || root instanceof DocumentFragment)) {
        return;
    }

    for (const post of Array.from(root.querySelectorAll(X_POST_ARTICLE_SELECTOR))) {
        injectPostButton(post);
    }
}

function injectStandaloneActionBars(root: ParentNode): void {
    for (const actionBar of collectTweetActionBars(root)) {
        if (actionBar.closest(X_POST_ARTICLE_SELECTOR)) {
            continue;
        }

        if (actionBar.getAttribute(INJECTED_ACTION_BAR_ATTR) === "true") {
            continue;
        }

        const postUrl = extractTweetUrlFromActionBar(actionBar) ?? tweetUrlFromPage(window.location);

        if (!postUrl) {
            continue;
        }

        injectIntoActionBar(actionBar, postUrl);
    }
}

function injectPostButton(postElement: Element): void {
    if (postElement.getAttribute(INJECTED_POST_ATTR) === "true") {
        return;
    }

    const actionBar = findActionBar(postElement);

    if (!actionBar) {
        return;
    }

    const postUrl = extractTweetUrlFromElement(postElement);

    if (!postUrl) {
        return;
    }

    if (injectIntoActionBar(actionBar, postUrl, postElement)) {
        postElement.setAttribute(INJECTED_POST_ATTR, "true");
    }
}

function injectIntoActionBar(
    actionBar: Element,
    postUrl: string,
    markContainer?: Element
): boolean {
    if (actionBar.getAttribute(INJECTED_ACTION_BAR_ATTR) === "true") {
        return false;
    }

    if (actionBar.querySelector(".x2tg-send-button-slot")) {
        actionBar.setAttribute(INJECTED_ACTION_BAR_ATTR, "true");
        markContainer?.setAttribute(INJECTED_POST_ATTR, "true");
        return false;
    }

    const buttonSlot = buildSendButtonSlot(actionBar, postUrl);

    if (!buttonSlot) {
        return false;
    }

    insertActionButtonSlot(actionBar, buttonSlot);
    actionBar.setAttribute(INJECTED_ACTION_BAR_ATTR, "true");
    markContainer?.setAttribute(INJECTED_POST_ATTR, "true");

    return true;
}

function buildSendButtonSlot(actionBar: Element, postUrl: string): HTMLElement | null {
    const referenceButton = findShareButton(actionBar)
        ?? actionBar.querySelector('[data-testid="bookmark"]')
        ?? actionBar.querySelector('[data-testid="like"]')
        ?? actionBar.querySelector('[data-testid="reply"]');

    if (!(referenceButton instanceof HTMLButtonElement)) {
        return null;
    }

    const referenceSlot = resolveActionSlot(referenceButton, actionBar);

    if (!referenceSlot) {
        return null;
    }

    const slot = referenceSlot.cloneNode(false) as HTMLElement;
    const button = referenceButton.cloneNode(true) as HTMLButtonElement;

    prepareClonedActionButton(button);
    wireSendButton(button, postUrl);

    slot.appendChild(button);
    slot.classList.add("x2tg-send-button-slot");

    return slot;
}

function prepareClonedActionButton(button: HTMLButtonElement): void {
    button.removeAttribute("data-testid");
    button.removeAttribute("aria-haspopup");
    button.removeAttribute("aria-expanded");
    button.removeAttribute("role");
    button.classList.add("x2tg-send-button");
    button.setAttribute("aria-label", "Enviar para Telegram");
    button.setAttribute("title", "Enviar para Telegram");
    button.type = "button";

    for (const counter of Array.from(button.querySelectorAll('[data-testid="app-text-transition-container"]'))) {
        counter.remove();
    }

    replaceButtonIcon(button);
}

function replaceButtonIcon(button: HTMLButtonElement): void {
    const svg = button.querySelector("svg");

    if (!svg) {
        return;
    }

    const width = svg.getAttribute("width");
    const height = svg.getAttribute("height");
    const viewBox = svg.getAttribute("viewBox") ?? "0 0 24 24";

    svg.replaceChildren();
    svg.setAttribute("viewBox", viewBox);

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "currentColor");
    path.setAttribute("d", TELEGRAM_ICON_PATH);
    svg.appendChild(path);

    if (width) {
        svg.setAttribute("width", width);
    }

    if (height) {
        svg.setAttribute("height", height);
    }
}

function wireSendButton(button: HTMLButtonElement, postUrl: string): void {
    button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void handleSendClick(button, postUrl);
    });
}

async function handleSendClick(button: HTMLButtonElement, postUrl: string): Promise<void> {
    const config = await loadConfig();

    if (!isConfigReady(config)) {
        showToast("Configure o token do bot e pelo menos um canal nas opções da extensão.", "error");
        openOptionsPage();
        return;
    }

    showChannelPicker(
        button,
        config.channels,
        config.lastUsedChannelId,
        (channel) => {
            void sendToChannel(channel.id, channel.label, postUrl);
        }
    );
}

async function sendToChannel(
    channelId: string,
    channelLabel: string,
    postUrl: string
): Promise<void> {
    const dedupeKey = `${channelId}:${postUrl}`;
    const lastSent = recentSends.get(dedupeKey) ?? 0;

    if (Date.now() - lastSent < SEND_DEBOUNCE_MS) {
        showToast("Aguarde alguns segundos antes de reenviar o mesmo post.", "info");
        return;
    }

    const requestId = crypto.randomUUID();
    updateProgressToast(requestId, "Preparando envio...");

    const response = await chrome.runtime.sendMessage({
        type: RuntimeMessageType.SEND_POST,
        platformId: SocialPlatformId.X,
        requestId,
        channelId,
        postUrl
    });

    dismissProgressToast(requestId);

    if (!response?.ok) {
        showToast(response?.error ?? "Falha ao enviar para o Telegram.", "error");
        return;
    }

    recentSends.set(dedupeKey, Date.now());
    showToast(`Enviado para ${channelLabel}`, "success");
}

function insertActionButtonSlot(actionBar: Element, buttonSlot: HTMLElement): void {
    const shareSlot = findShareInsertAnchor(actionBar);

    if (shareSlot) {
        shareSlot.insertAdjacentElement("afterend", buttonSlot);
        return;
    }

    actionBar.appendChild(buttonSlot);
}
