import { isExtensionContextValid, sendRuntimeMessage } from "../../../core/extension";
import { RuntimeMessageType } from "../../../core/types/Messages";
import { t } from "../../../core/i18n/I18n";
import { isConfigReady, loadConfig } from "../../../core/storage/Storage";
import { SocialPlatformId } from "../../types";
import { e621PostUrlFromPage } from "../url/E621Url";
import {
    extractE621CaptionText,
    findE621ControlStrips,
    findE621InsertRow
} from "./ControlStrip";
import { dismissProgressToast, openOptionsPage, showToast, updateProgressToast } from "../../../content/ui/Toast";
import { SEND_TO_TELEGRAM_ICON_PATH } from "../../../content/icons/TelegramIcon";
import {
    getDestinationsKey,
    showDestinationPicker,
    showSendResultToast,
    type PickedDestination
} from "../../../content/ui/picker";
import { buildCaptionDraftHtml } from "../../../core/telegram/Caption";
import { registerPendingSend, takePendingSend, wasRecentlySent } from "../../../content/send/PendingSend";
import { isSendPostAccepted, type SendPostResponse } from "../../../core/types/Results";

/** Marker set on a control strip after its send button has been injected. */
export const E621_INJECTED_ATTR = "data-x2tg-e621-injected";

/**
 * Injects a Telegram send button into the control strip of each visible E621 post.
 *
 * @param root - Subtree to scan.
 */
export function injectE621Content(root: ParentNode = document): void {
    for (const strip of findE621ControlStrips(root)) {
        if (strip.getAttribute(E621_INJECTED_ATTR) === "true") {
            continue;
        }

        if (strip.querySelector(".x2tg-send-button-slot--e621")) {
            strip.setAttribute(E621_INJECTED_ATTR, "true");
            continue;
        }

        const postUrl = e621PostUrlFromPage(window.location);

        if (!postUrl) {
            continue;
        }

        findE621InsertRow(strip).appendChild(buildSendButton(postUrl));
        strip.setAttribute(E621_INJECTED_ATTR, "true");
    }
}

/**
 * Builds a toolbar button styled like the existing E621 controls.
 */
function buildSendButton(postUrl: string): HTMLElement {
    const slot = document.createElement("div");
    slot.classList.add("x2tg-send-button-slot", "x2tg-send-button-slot--e621");

    const button = document.createElement("button");
    button.type = "button";
    button.classList.add("st-button", "x2tg-send-button", "x2tg-send-button--e621");
    button.setAttribute("aria-label", t("sendToTelegram"));
    button.title = t("sendToTelegram");

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "18");
    svg.setAttribute("height", "18");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "currentColor");
    path.setAttribute("d", SEND_TO_TELEGRAM_ICON_PATH);
    svg.appendChild(path);

    const label = document.createElement("span");
    label.textContent = t("sendToTelegram");
    button.append(svg, label);
    slot.appendChild(button);

    wireSendButton(button, postUrl);

    return slot;
}

/**
 * Wires the click handler without letting the click reach E621 shortcuts.
 */
function wireSendButton(button: HTMLButtonElement, postUrl: string): void {
    button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void handleSendClick(postUrl);
    });
}

/**
 * Opens the destination picker with the post caption draft.
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

    const resolvedPostUrl = e621PostUrlFromPage(window.location) ?? postUrl;
    // E621 stores the description in a head-level payload, outside the control strip.
    const draftText = extractE621CaptionText(document);

    showDestinationPicker({
        config,
        platformId: SocialPlatformId.E621,
        initialCaptionHtml: buildCaptionDraftHtml(draftText, resolvedPostUrl),
        onSend: (destinations, captionHtml) => {
            void sendToDestinations(destinations, resolvedPostUrl, captionHtml);
        }
    });
}

/**
 * Sends the post URL to the selected destinations. Media is resolved by the adapter in the worker.
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

    // No DOM snapshot: the worker resolves the post through the E621 API, and falls back to a link send.
    registerPendingSend(requestId, { dedupeKey, destinations });

    const response = await sendRuntimeMessage<SendPostResponse>({
        type: RuntimeMessageType.SEND_POST,
        platformId: SocialPlatformId.E621,
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
