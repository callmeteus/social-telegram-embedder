import { isExtensionContextValid, sendRuntimeMessage } from "../../../core/extension";
import { RuntimeMessageType } from "../../../core/types/Messages";
import { t } from "../../../core/i18n/I18n";
import { isConfigReady, loadConfig } from "../../../core/storage/Storage";
import { SocialPlatformId } from "../../types";
import {
    extractPostUrlFromActionBar,
    extractPostUrlFromElement,
    extractReelPostUrl,
    extractReelUrlFromVideoContainer,
    facebookPostUrlFromPage,
    isFacebookReelViewerPage
} from "../url/FacebookUrl";
import {
    collectFacebookActionBars,
    collectLabeledShareActionBars,
    collectReelViewerActionBars,
    filterNestedActionBars,
    FB_PROFILE_NAME_SELECTOR,
    findActionBar,
    findPostRootFromProfile,
    findReelShareControl,
    findReelSnapshotRoot,
    findShareControl,
    findShareInsertAnchor,
    INJECTED_ACTION_BAR_ATTR,
    INJECTED_POST_ATTR,
    isReelViewerActionBar,
    isVisibleFacebookActionLabelControl,
    resolveActionSlot
} from "./ActionBar";
import { buildPostSnapshot } from "./PostDom";
import { offloadSnapshotMediaBlobs } from "../../../content/media/BlobSnapshotTransfer";
import { dismissProgressToast, openOptionsPage, showToast, updateProgressToast } from "../../../content/ui/Toast";
import { showChannelPicker } from "../../../content/ui/ChannelPicker";

const SEND_DEBOUNCE_MS = 3000;
const TELEGRAM_ICON_PATH = "M2.01 21L23 12 2.01 3 2 10l15 2-15 2z";
const recentSends = new Map<string, number>();

/**
 * Injects Telegram send buttons for Facebook posts.
 */
export function injectFacebookContent(root: ParentNode = document): void {
    injectTimelinePosts(root);
    injectStandaloneActionBars(root);
    injectReelViewerPosts(root);
}

function injectTimelinePosts(root: ParentNode): void {
    if (!(root instanceof Element || root instanceof Document || root instanceof DocumentFragment)) {
        return;
    }

    if (isFacebookReelViewerPage()) {
        return;
    }

    for (const profileName of Array.from(root.querySelectorAll(FB_PROFILE_NAME_SELECTOR))) {
        injectPostButton(profileName);
    }
}

function injectStandaloneActionBars(root: ParentNode): void {
    const actionBars = filterNestedActionBars([
        ...collectFacebookActionBars(root),
        ...collectLabeledShareActionBars(root)
    ]);

    for (const actionBar of actionBars) {
        injectActionBar(actionBar, findSnapshotRoot(actionBar));
    }
}

function injectReelViewerPosts(root: ParentNode): void {
    for (const actionBar of collectReelViewerActionBars(root)) {
        injectActionBar(actionBar, findReelSnapshotRoot(actionBar));
    }
}

function injectActionBar(actionBar: Element, snapshotRoot: Element): void {
    if (actionBar.getAttribute(INJECTED_ACTION_BAR_ATTR) === "true") {
        return;
    }

    const isReelActionBar = isReelViewerActionBar(actionBar);
    const scopedSnapshotRoot = isReelActionBar
        ? findReelSnapshotRoot(actionBar)
        : snapshotRoot;
    const postUrl = isReelActionBar
        ? extractReelPostUrl(scopedSnapshotRoot)
        : resolveFeedPostUrl(scopedSnapshotRoot, actionBar);

    if (!postUrl) {
        return;
    }

    injectIntoActionBar(actionBar, postUrl, scopedSnapshotRoot);
}

function resolveFeedPostUrl(snapshotRoot: Element, actionBar: Element): string | null {
    return extractPostUrlFromElement(snapshotRoot)
        ?? extractPostUrlFromActionBar(actionBar)
        ?? extractReelUrlFromVideoContainer(snapshotRoot)
        ?? facebookPostUrlFromPage(window.location);
}

function injectPostButton(profileName: Element): void {
    const postRoot = findPostRootFromProfile(profileName);

    if (postRoot.getAttribute(INJECTED_POST_ATTR) === "true") {
        return;
    }

    const actionBar = findActionBar(postRoot);

    if (!actionBar) {
        return;
    }

    const postUrl = extractPostUrlFromElement(postRoot)
        ?? extractPostUrlFromActionBar(actionBar)
        ?? extractReelUrlFromVideoContainer(postRoot);

    if (!postUrl) {
        return;
    }

    if (injectIntoActionBar(actionBar, postUrl, postRoot)) {
        postRoot.setAttribute(INJECTED_POST_ATTR, "true");
    }
}

function injectIntoActionBar(
    actionBar: Element,
    postUrl: string,
    snapshotRoot: Element
): boolean {
    if (actionBar.getAttribute(INJECTED_ACTION_BAR_ATTR) === "true") {
        return false;
    }

    if (actionBar.querySelector(".x2tg-send-button-slot")) {
        actionBar.setAttribute(INJECTED_ACTION_BAR_ATTR, "true");
        snapshotRoot.setAttribute(INJECTED_POST_ATTR, "true");

        return false;
    }

    const buttonSlot = buildSendButtonSlot(actionBar, postUrl, snapshotRoot);

    if (!buttonSlot) {
        return false;
    }

    insertActionButtonSlot(actionBar, buttonSlot);
    actionBar.setAttribute(INJECTED_ACTION_BAR_ATTR, "true");
    snapshotRoot.setAttribute(INJECTED_POST_ATTR, "true");

    return true;
}

function buildSendButtonSlot(
    actionBar: Element,
    postUrl: string,
    snapshotRoot: Element
): HTMLElement | null {
    const referenceControl = findShareControl(actionBar)
        ?? findReelShareControl(actionBar)
        ?? actionBar.querySelector('[data-ad-rendering-role="like_button"]')?.closest('[role="button"]')
        ?? actionBar.querySelector('[data-ad-rendering-role="comment_button"]')?.closest('[role="button"]');

    if (!(referenceControl instanceof HTMLElement)) {
        return null;
    }

    const referenceSlot = resolveActionSlot(referenceControl, actionBar);

    if (!referenceSlot) {
        return null;
    }

    const slot = referenceSlot.cloneNode(false) as HTMLElement;
    const button = referenceControl.cloneNode(true) as HTMLElement;
    const variant = isReelViewerActionBar(actionBar) ? "facebook-reel" : "facebook";
    const labeledShare = isVisibleFacebookActionLabelControl(referenceControl);

    prepareClonedActionButton(button, actionBar, variant, labeledShare);
    wireSendButton(button, postUrl, snapshotRoot);

    slot.appendChild(button);
    slot.classList.add("x2tg-send-button-slot", `x2tg-send-button-slot--${variant}`);

    if (labeledShare) {
        slot.classList.add("x2tg-send-button-slot--facebook-labeled-share");
        button.classList.add("x2tg-send-button--facebook-labeled-share");
    }

    return slot;
}

function prepareClonedActionButton(
    button: HTMLElement,
    actionBar: Element,
    variant: "facebook" | "facebook-reel",
    labeledShare = false
): void {
    button.removeAttribute("aria-haspopup");
    button.removeAttribute("aria-expanded");
    button.removeAttribute("title");
    button.classList.add("x2tg-send-button", `x2tg-send-button--${variant}`);
    button.setAttribute("aria-label", t("sendToTelegram"));
    button.setAttribute("role", "button");
    button.setAttribute("tabindex", "0");

    removeFacebookActionCounter(button);
    removeFacebookRenderingMarkers(button);

    if (labeledShare) {
        removeFacebookActionLabel(button);
    }

    replaceFacebookButtonIcon(button, actionBar, variant);
    ensureFacebookHoverOverlay(button);
}

function removeFacebookActionLabel(button: HTMLElement): void {
    for (const span of Array.from(button.querySelectorAll("span[dir='auto']"))) {
        const label = span.textContent?.trim() ?? "";

        if (/^(?:compartilhar|share|curtir|like|comentar|comment)$/i.test(label)) {
            span.remove();
        }
    }
}

function ensureFacebookHoverOverlay(button: HTMLElement): void {
    let overlay = button.querySelector('[role="none"][data-visualcompletion="ignore"]');

    if (!(overlay instanceof HTMLElement)) {
        overlay = document.createElement("div");
        overlay.setAttribute("role", "none");
        overlay.setAttribute("data-visualcompletion", "ignore");
        button.appendChild(overlay);
    }

    overlay.classList.add("x2tg-send-button__overlay");
}

function removeFacebookActionCounter(button: HTMLElement): void {
    for (const counter of Array.from(button.querySelectorAll("span[dir='auto']"))) {
        if (!/^\d+$/.test(counter.textContent?.trim() ?? "")) {
            continue;
        }

        const column = counter.closest(".x9f619");

        if (column) {
            column.remove();
        } else {
            counter.remove();
        }
    }
}

function removeFacebookRenderingMarkers(button: HTMLElement): void {
    for (const marker of Array.from(button.querySelectorAll("[data-ad-rendering-role]"))) {
        marker.remove();
    }
}

function findFacebookIconTemplate(actionBar: Element): SVGSVGElement | null {
    const likeControl = actionBar.querySelector('[data-ad-rendering-role="like_button"]')?.closest('[role="button"]');
    const svg = likeControl?.querySelector("svg");

    if (svg instanceof SVGSVGElement) {
        return svg;
    }

    const commentControl = actionBar.querySelector('[data-ad-rendering-role="comment_button"]')?.closest('[role="button"]');
    const commentSvg = commentControl?.querySelector("svg");

    if (commentSvg instanceof SVGSVGElement) {
        return commentSvg;
    }

    return null;
}

function replaceFacebookButtonIcon(
    button: HTMLElement,
    actionBar: Element,
    variant: "facebook" | "facebook-reel"
): void {
    const referenceSvg = button.querySelector("svg") ?? findFacebookIconTemplate(actionBar);
    const telegramSvg = buildFacebookTelegramIcon(referenceSvg, variant);
    const icons = Array.from(button.querySelectorAll('i[data-visualcompletion="css-img"], svg'));

    if (icons.length > 0) {
        icons[0].replaceWith(telegramSvg.cloneNode(true));

        for (let index = 1; index < icons.length; index++) {
            icons[index].remove();
        }

        return;
    }

    const iconColumn = button.querySelector(".x9f619, .x12nagc, .x14l7nz5");

    if (iconColumn instanceof HTMLElement) {
        iconColumn.prepend(telegramSvg.cloneNode(true));
        return;
    }

    button.prepend(telegramSvg.cloneNode(true));
}

function buildFacebookTelegramIcon(
    referenceSvg: SVGSVGElement | null,
    variant: "facebook" | "facebook-reel"
): SVGSVGElement {
    const svg = referenceSvg
        ? referenceSvg.cloneNode(false) as SVGSVGElement
        : document.createElementNS("http://www.w3.org/2000/svg", "svg");

    if (!referenceSvg) {
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("width", "20");
        svg.setAttribute("height", "20");
        svg.setAttribute("aria-hidden", "true");
    }

    const iconColor = variant === "facebook-reel"
        ? "var(--always-white, #ffffff)"
        : "var(--secondary-icon, #b0b3b8)";

    svg.setAttribute("fill", "currentColor");
    svg.style.setProperty("--x-color", iconColor);
    svg.style.color = iconColor;

    svg.replaceChildren();

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "currentColor");
    path.setAttribute("d", TELEGRAM_ICON_PATH);
    svg.appendChild(path);

    return svg;
}

function wireSendButton(button: HTMLElement, postUrl: string, snapshotRoot: Element): void {
    button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void handleSendClick(button, postUrl, snapshotRoot);
    });
}

async function handleSendClick(
    button: HTMLElement,
    postUrl: string,
    snapshotRoot: Element
): Promise<void> {
    if (!isExtensionContextValid()) {
        showToast(t("extensionContextInvalidated"), "info");
        return;
    }

    const config = await loadConfig();

    if (!isConfigReady(config)) {
        showToast(t("configureExtension"), "error");
        openOptionsPage();
        return;
    }

    const resolvedPostUrl = resolveSendPostUrl(button, snapshotRoot, postUrl);

    showChannelPicker(
        button,
        config.channels,
        config.lastUsedChannelId,
        (channel) => {
            void sendToChannel(channel.id, channel.label, resolvedPostUrl, snapshotRoot);
        },
        SocialPlatformId.FACEBOOK
    );
}

function resolveSendPostUrl(
    button: HTMLElement,
    snapshotRoot: Element,
    wiredPostUrl: string
): string {
    if (button.classList.contains("x2tg-send-button--facebook-reel")) {
        return extractReelPostUrl(snapshotRoot) ?? wiredPostUrl;
    }

    return resolveFeedPostUrl(snapshotRoot, button) ?? wiredPostUrl;
}

async function sendToChannel(
    channelId: string,
    channelLabel: string,
    postUrl: string,
    snapshotRoot: Element
): Promise<void> {
    const dedupeKey = `${channelId}:${postUrl}`;
    const lastSent = recentSends.get(dedupeKey) ?? 0;

    if (Date.now() - lastSent < SEND_DEBOUNCE_MS) {
        showToast(t("waitBeforeResend"), "info");
        return;
    }

    const requestId = crypto.randomUUID();
    updateProgressToast(requestId, t("preparingSend"));

    updateProgressToast(requestId, t("progressResolvingVideo"));

    const postSnapshot = await buildPostSnapshot(snapshotRoot, postUrl);
    const payloadSnapshot = await offloadSnapshotMediaBlobs(postSnapshot, requestId);

    const response = await sendRuntimeMessage<{ ok?: boolean; error?: string }>({
        type: RuntimeMessageType.SEND_POST,
        platformId: SocialPlatformId.FACEBOOK,
        requestId,
        channelId,
        postUrl,
        postSnapshot: payloadSnapshot
    });

    dismissProgressToast(requestId);

    if (response === undefined) {
        showToast(t("extensionContextInvalidated"), "info");
        return;
    }

    if (!response?.ok) {
        showToast(response?.error ?? t("sendFailed"), "error");
        return;
    }

    recentSends.set(dedupeKey, Date.now());
    showToast(t("sentToChannel", channelLabel), "success");
}

function insertActionButtonSlot(actionBar: Element, buttonSlot: HTMLElement): void {
    const shareSlot = findShareInsertAnchor(actionBar);

    if (shareSlot) {
        shareSlot.insertAdjacentElement("afterend", buttonSlot);
        return;
    }

    actionBar.appendChild(buttonSlot);
}

function findSnapshotRoot(actionBar: Element): Element {
    let node: Element | null = actionBar;
    let fallback: Element | null = null;

    while (node) {
        if (
            node.querySelector('[data-ad-rendering-role="story_message"]')
            || node.querySelector('[data-ad-rendering-role="title"]')
            || node.querySelector('img[data-imgperflogname="feedImage"]')
            || node.querySelector('img[data-visualcompletion="media-vc-image"]')
            || node.querySelector("[data-video-id]")
        ) {
            fallback = node;
        }

        if (node.querySelector(FB_PROFILE_NAME_SELECTOR)) {
            return fallback ?? node;
        }

        node = node.parentElement;
    }

    return fallback ?? actionBar;
}

