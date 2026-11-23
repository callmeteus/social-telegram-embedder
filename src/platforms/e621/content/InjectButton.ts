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

/** Outline paper-plane paths, matching the stroke icons used by E621 controls. */
const E621_SEND_ICON_PATHS = [
    "M22 2 11 13",
    "M22 2 15 22l-4-9-9-4Z"
];

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

        if (strip.querySelector(".x2tg-send-button--e621")) {
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
 * Builds a toolbar control that reuses E621's native button styles.
 * The visible icon avoids mixing the extension locale with the site language; the
 * accessible name stays localized through i18n.
 */
function buildSendButton(postUrl: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.classList.add("st-button", "kinetic", "x2tg-send-button", "x2tg-send-button--e621");
    button.setAttribute("aria-label", t("sendToTelegram"));
    button.title = t("sendToTelegram");

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    for (const pathData of E621_SEND_ICON_PATHS) {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", pathData);
        svg.appendChild(path);
    }
    button.appendChild(svg);

    wireSendButton(button, postUrl);

    return button;
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
        onSend: (destinations, captionHtml, hasSpoiler) => {
            void sendToDestinations(destinations, resolvedPostUrl, captionHtml, hasSpoiler);
        }
    });
}

/**
 * Sends the post URL to the selected destinations. Media is resolved by the adapter in the worker.
 */
async function sendToDestinations(
    destinations: PickedDestination[],
    postUrl: string,
    captionHtml: string,
    hasSpoiler: boolean
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
        captionHtml,
        hasSpoiler
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
