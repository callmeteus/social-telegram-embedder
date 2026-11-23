import { isExtensionContextValid, sendRuntimeMessage } from "../../../core/extension";
import { RuntimeMessageType } from "../../../core/types/Messages";
import { t } from "../../../core/i18n/I18n";
import { isConfigReady, loadConfig } from "../../../core/storage/Storage";
import { SEND_TO_TELEGRAM_ICON_PATH } from "../../../content/icons/TelegramIcon";
import { offloadSnapshotMediaBlobs } from "../../../content/media/BlobSnapshotTransfer";
import { dismissProgressToast, openOptionsPage, showToast, updateProgressToast } from "../../../content/ui/Toast";
import {
    getDestinationsKey,
    showDestinationPicker,
    showSendResultToast,
    type PickedDestination
} from "../../../content/ui/picker";
import { buildCaptionDraftHtml } from "../../../core/telegram/Caption";
import { registerPendingSend, takePendingSend, wasRecentlySent } from "../../../content/send/PendingSend";
import { isSendPostAccepted, type SendPostResponse } from "../../../core/types/Results";
import { SocialPlatformId } from "../../types";
import { resolveInstagramMedia } from "./InstagramMedia";
import {
    buildInstagramSnapshot,
    extractInstagramAuthorHandle,
    extractInstagramCaptionText,
    extractInstagramPostUrl,
    findInstagramActionBar,
    findInstagramPostRoot,
    findInstagramShareControls
} from "./PostDom";
import { buildInstagramCaptionText } from "../text/InstagramCaption";

/** Marker set on an action bar after its send button has been injected. */
export const INSTAGRAM_INJECTED_ATTR = "data-x2tg-instagram-injected";

/**
 * Injects a Telegram send button into the action bar of each visible Instagram post or reel.
 *
 * @param root - Subtree to scan.
 */
export function injectInstagramContent(root: ParentNode = document): void {
    for (const shareControl of findInstagramShareControls(root)) {
        const actionBar = findInstagramActionBar(shareControl);

        if (!actionBar || actionBar.getAttribute(INSTAGRAM_INJECTED_ATTR) === "true") {
            continue;
        }

        if (actionBar.querySelector(".x2tg-send-button--instagram")) {
            actionBar.setAttribute(INSTAGRAM_INJECTED_ATTR, "true");
            continue;
        }

        const postRoot = findInstagramPostRoot(actionBar);
        const postUrl = extractInstagramPostUrl(postRoot);

        if (!postUrl) {
            continue;
        }

        shareControl.insertAdjacentElement("afterend", buildSendButton(postRoot, postUrl));
        actionBar.setAttribute(INSTAGRAM_INJECTED_ATTR, "true");
    }
}

/**
 * Builds the paper-plane control that sits beside Instagram's Share action.
 */
function buildSendButton(postRoot: Element, postUrl: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.classList.add("x2tg-send-button", "x2tg-send-button--instagram");
    button.setAttribute("aria-label", t("sendToTelegram"));
    button.title = t("sendToTelegram");

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "currentColor");
    svg.setAttribute("aria-hidden", "true");

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", SEND_TO_TELEGRAM_ICON_PATH);
    svg.appendChild(path);
    button.appendChild(svg);

    button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void handleSendClick(postRoot, postUrl);
    });

    return button;
}

/**
 * Opens the destination picker with the caption text captured from the post.
 */
async function handleSendClick(postRoot: Element, postUrl: string): Promise<void> {
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

    const captionText = buildInstagramCaptionText(
        extractInstagramCaptionText(postRoot),
        extractInstagramAuthorHandle(postRoot)
    );

    showDestinationPicker({
        config,
        platformId: SocialPlatformId.INSTAGRAM,
        initialCaptionHtml: buildCaptionDraftHtml(captionText, postUrl),
        onSend: (destinations, captionHtml) => {
            void sendToDestinations(destinations, postUrl, captionHtml, postRoot);
        }
    });
}

/**
 * Sends the captured media and source link, or a link-only message with a clear status.
 */
async function sendToDestinations(
    destinations: PickedDestination[],
    postUrl: string,
    captionHtml: string,
    postRoot: Element
): Promise<void> {
    const dedupeKey = `${getDestinationsKey(destinations)}:${postUrl}`;

    if (wasRecentlySent(dedupeKey)) {
        showToast(t("waitBeforeResend"), "info");
        return;
    }

    const requestId = crypto.randomUUID();
    // Instagram media is read from the page, so resolve it before reporting progress.
    const snapshot = buildInstagramSnapshot(postRoot, postUrl);
    const media = await resolveInstagramMedia(snapshot.media);
    const payloadSnapshot = await offloadSnapshotMediaBlobs({
        ...snapshot,
        media
    }, requestId);
    const statusKey = media.length === 0 ? "instagramLinkOnly" : "preparingSend";

    updateProgressToast(requestId, t(statusKey));
    registerPendingSend(requestId, { dedupeKey, destinations });

    const response = await sendRuntimeMessage<SendPostResponse>({
        type: RuntimeMessageType.SEND_POST,
        platformId: SocialPlatformId.INSTAGRAM,
        requestId,
        destinations: destinations.map((destination) => destination.ref),
        postUrl,
        postSnapshot: payloadSnapshot,
        captionHtml
    });

    if (response === undefined) {
        takePendingSend(requestId);
        dismissProgressToast(requestId);
        showToast(t("extensionContextInvalidated"), "info");
        return;
    }

    if (!isSendPostAccepted(response)) {
        takePendingSend(requestId);
        dismissProgressToast(requestId);
        showSendResultToast(response, destinations);
    }
}
