import { isExtensionContextValid, sendRuntimeMessage } from "../../../core/extension";
import { RuntimeMessageType } from "../../../core/types/Messages";
import { t } from "../../../core/i18n/I18n";
import { isConfigReady, loadConfig } from "../../../core/storage/Storage";
import { SocialPlatformId } from "../../types";
import { tikTokPostUrlFromPage } from "../url/TikTokUrl";
import {
    extractTikTokCaptionText,
    findTikTokActionBars,
    findTikTokInsertTarget
} from "./VideoActionBar";
import { dismissProgressToast, openOptionsPage, showToast, updateProgressToast } from "../../../content/ui/Toast";
import {
    getDestinationsKey,
    showDestinationPicker,
    showSendResultToast,
    type PickedDestination
} from "../../../content/ui/picker";
import { SEND_TO_TELEGRAM_ICON_PATH } from "../../../content/icons/TelegramIcon";
import { buildCaptionDraftHtml } from "../../../core/telegram/Caption";
import { registerPendingSend, takePendingSend, wasRecentlySent } from "../../../content/send/PendingSend";
import { isSendPostAccepted, type SendPostResponse } from "../../../core/types/Results";

/** Marker set on an action rail after its send button has been injected. */
export const TIKTOK_INJECTED_ATTR = "data-x2tg-tiktok-injected";

/**
 * Injects a Telegram send button into the action rail of each visible TikTok video.
 *
 * @param root - Subtree to scan.
 */
export function injectTikTokContent(root: ParentNode = document): void {
    for (const actionBar of findTikTokActionBars(root)) {
        if (actionBar.getAttribute(TIKTOK_INJECTED_ATTR) === "true") {
            continue;
        }

        if (actionBar.querySelector(".x2tg-send-button--tiktok")) {
            actionBar.setAttribute(TIKTOK_INJECTED_ATTR, "true");
            continue;
        }

        const postUrl = tikTokPostUrlFromPage(window.location);

        if (!postUrl) {
            continue;
        }

        findTikTokInsertTarget(actionBar).appendChild(buildSendButton(postUrl));
        actionBar.setAttribute(TIKTOK_INJECTED_ATTR, "true");
    }
}

/**
 * Builds a toolbar control matching TikTok's icon buttons. The accessible name stays localized.
 */
function buildSendButton(postUrl: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.classList.add("x2tg-send-button", "x2tg-send-button--tiktok");
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
        void handleSendClick(postUrl);
    });

    return button;
}

/**
 * Opens the destination picker with the video caption draft.
 */
async function handleSendClick(postUrl: string): Promise<void> {
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

    const resolvedPostUrl = tikTokPostUrlFromPage(window.location) ?? postUrl;
    const draftText = extractTikTokCaptionText(document);

    showDestinationPicker({
        config,
        platformId: SocialPlatformId.TIKTOK,
        initialCaptionHtml: buildCaptionDraftHtml(draftText, resolvedPostUrl),
        onSend: (destinations, captionHtml) => {
            void sendToDestinations(destinations, resolvedPostUrl, captionHtml);
        }
    });
}

/**
 * Sends the video URL to the selected destinations. Media is resolved by the adapter in the worker.
 */
async function sendToDestinations(
    destinations: PickedDestination[],
    postUrl: string,
    captionHtml: string
): Promise<void> {
    const dedupeKey = `${getDestinationsKey(destinations)}:${postUrl}`;

    if (wasRecentlySent(dedupeKey)) {
        showToast(t("waitBeforeResend"), "info");
        return;
    }

    const requestId = crypto.randomUUID();
    updateProgressToast(requestId, t("preparingSend"));

    // No DOM snapshot: the worker resolves the video through public endpoints, then falls back to a link send.
    registerPendingSend(requestId, { dedupeKey, destinations });

    const response = await sendRuntimeMessage<SendPostResponse>({
        type: RuntimeMessageType.SEND_POST,
        platformId: SocialPlatformId.TIKTOK,
        requestId,
        destinations: destinations.map((destination) => destination.ref),
        postUrl,
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
