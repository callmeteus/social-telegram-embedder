import { isExtensionContextValid, sendRuntimeMessage } from "../../../core/extension";
import { RuntimeMessageType } from "../../../core/types/Messages";
import { t } from "../../../core/i18n/I18n";
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
    findTweetPostRootFromActionBar,
    INJECTED_ACTION_BAR_ATTR,
    INJECTED_POST_ATTR,
    resolveActionSlot,
    X_POST_ARTICLE_SELECTOR
} from "./ActionBar";
import { offloadSnapshotMediaBlobs } from "../../../content/media/BlobSnapshotTransfer";
import { dismissProgressToast, openOptionsPage, showToast, updateProgressToast } from "../../../content/ui/Toast";
import { SEND_TO_TELEGRAM_ICON_PATH } from "../../../content/icons/TelegramIcon";
import {
    getDestinationsKey,
    showDestinationPicker,
    showSendResultToast,
    type PickedDestination
} from "../../../content/ui/picker";
import type { SendPostResult } from "../../../core/types/Results";
import { showTimelineMediaPicker } from "../../../content/ui/TimelineMediaPicker";
import { buildXContentPhotoViewerSnapshot, isXContentPhotoViewerContext } from "./PhotoViewer";
import { extractXContentTimelinePhotoUrls } from "./TimelineMedia";
import { buildXContentArticleSnapshot } from "./XPostSnapshot";
import type { SocialPostSnapshot } from "../../types";

const SEND_DEBOUNCE_MS = 3000;
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

        const postRoot = findTweetPostRootFromActionBar(actionBar);
        injectIntoActionBar(actionBar, postUrl, postRoot ?? undefined);
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

    const buttonSlot = buildSendButtonSlot(actionBar, postUrl, markContainer);

    if (!buttonSlot) {
        return false;
    }

    insertActionButtonSlot(actionBar, buttonSlot);
    actionBar.setAttribute(INJECTED_ACTION_BAR_ATTR, "true");
    markContainer?.setAttribute(INJECTED_POST_ATTR, "true");

    return true;
}

function buildSendButtonSlot(
    actionBar: Element,
    postUrl: string,
    tweetArticle?: Element
): HTMLElement | null {
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
    wireSendButton(button, postUrl, tweetArticle);

    slot.appendChild(button);
    slot.classList.add("x2tg-send-button-slot", "x2tg-send-button-slot--x");

    return slot;
}

function prepareClonedActionButton(button: HTMLButtonElement): void {
    button.removeAttribute("data-testid");
    button.removeAttribute("aria-haspopup");
    button.removeAttribute("aria-expanded");
    button.removeAttribute("role");
    button.classList.add("x2tg-send-button", "x2tg-send-button--x");
    button.setAttribute("aria-label", t("sendToTelegram"));
    button.setAttribute("title", t("sendToTelegram"));
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
    path.setAttribute("d", SEND_TO_TELEGRAM_ICON_PATH);
    svg.appendChild(path);

    if (width) {
        svg.setAttribute("width", width);
    }

    if (height) {
        svg.setAttribute("height", height);
    }
}

function wireSendButton(
    button: HTMLButtonElement,
    postUrl: string,
    tweetArticle?: Element
): void {
    button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void handleSendClick(button, postUrl, tweetArticle, button.closest('[role="group"]') ?? undefined);
    });
}

async function handleSendClick(
    button: HTMLButtonElement,
    postUrl: string,
    tweetArticle?: Element,
    actionBar?: Element
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

    const openChannelPicker = (pendingSnapshot?: SocialPostSnapshot) => {
        showDestinationPicker({
            config,
            platformId: SocialPlatformId.X,
            onSend: (destinations) => {
                void sendToDestinations(destinations, postUrl, pendingSnapshot);
            }
        });
    };

    const postRoot = tweetArticle ?? (actionBar ? findTweetPostRootFromActionBar(actionBar) : null);

    if (isXContentPhotoViewerContext()) {
        const viewerSnapshot = buildXContentPhotoViewerSnapshot(window.location, document, actionBar);
        openChannelPicker(viewerSnapshot ?? undefined);
        return;
    }

    if (postRoot instanceof Element) {
        const timelinePhotos = extractXContentTimelinePhotoUrls(postRoot);

        if (timelinePhotos.length >= 2) {
            showTimelineMediaPicker(
                timelinePhotos,
                () => {
                    openChannelPicker(buildXContentArticleSnapshot(postRoot, timelinePhotos));
                },
                (photoUrl) => {
                    openChannelPicker(buildXContentArticleSnapshot(postRoot, [photoUrl]));
                },
                SocialPlatformId.X
            );
            return;
        }

        if (timelinePhotos.length === 1) {
            openChannelPicker(buildXContentArticleSnapshot(postRoot, timelinePhotos));
            return;
        }
    }

    openChannelPicker();
}

async function sendToDestinations(
    destinations: PickedDestination[],
    postUrl: string,
    pendingSnapshot?: SocialPostSnapshot
): Promise<void> {
    const dedupeKey = `${getDestinationsKey(destinations)}:${postUrl}`;
    const lastSent = recentSends.get(dedupeKey) ?? 0;

    if (Date.now() - lastSent < SEND_DEBOUNCE_MS) {
        showToast(t("waitBeforeResend"), "info");
        return;
    }

    const requestId = crypto.randomUUID();
    updateProgressToast(requestId, t("preparingSend"));

    const photoViewerSnapshot = pendingSnapshot ?? buildXContentPhotoViewerSnapshot(window.location, document);
    const postSnapshot = photoViewerSnapshot
        ? await offloadSnapshotMediaBlobs(photoViewerSnapshot, requestId)
        : undefined;

    const response = await sendRuntimeMessage<SendPostResult>({
        type: RuntimeMessageType.SEND_POST,
        platformId: SocialPlatformId.X,
        requestId,
        destinations: destinations.map((destination) => destination.ref),
        postUrl,
        postSnapshot
    });

    dismissProgressToast(requestId);

    if (response === undefined) {
        showToast(t("extensionContextInvalidated"), "info");
        return;
    }

    if (response?.ok) {
        recentSends.set(dedupeKey, Date.now());
    }

    showSendResultToast(response, destinations);
}

function insertActionButtonSlot(actionBar: Element, buttonSlot: HTMLElement): void {
    const shareSlot = findShareInsertAnchor(actionBar);

    if (shareSlot) {
        shareSlot.insertAdjacentElement("afterend", buttonSlot);
        return;
    }

    actionBar.appendChild(buttonSlot);
}
