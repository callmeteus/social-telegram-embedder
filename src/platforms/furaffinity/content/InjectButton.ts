import { isExtensionContextValid, sendRuntimeMessage } from "../../../core/extension";
import { RuntimeMessageType } from "../../../core/types/Messages";
import { t } from "../../../core/i18n/I18n";
import { isConfigReady, loadConfig } from "../../../core/storage/Storage";
import { SocialPlatformId } from "../../types";
import { furaffinityPostUrlFromPage } from "../url/FuraffinityUrl";
import {
    buildFuraffinitySnapshot,
    findFuraffinityInsertRow,
    findFuraffinitySubmissions
} from "./SubmissionView";
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
import { SEND_TO_TELEGRAM_ICON_PATH } from "../../../content/icons/TelegramIcon";
import type { SocialPostSnapshot } from "../../types";

/** Marker set on a submission view after its send button has been injected. */
export const FURAFFINITY_INJECTED_ATTR = "data-x2tg-furaffinity-injected";

/**
 * Injects a Telegram send button into each visible FurAffinity submission view.
 *
 * @param root - Subtree to scan.
 */
export function injectFuraffinityContent(root: ParentNode = document): void {
    for (const submission of findFuraffinitySubmissions(root)) {
        if (submission.getAttribute(FURAFFINITY_INJECTED_ATTR) === "true") {
            continue;
        }

        if (submission.querySelector(".x2tg-send-button--furaffinity")) {
            submission.setAttribute(FURAFFINITY_INJECTED_ATTR, "true");
            continue;
        }

        const postUrl = furaffinityPostUrlFromPage(window.location);

        if (!postUrl) {
            continue;
        }

        findFuraffinityInsertRow(submission).appendChild(buildSendButton(postUrl, submission));
        submission.setAttribute(FURAFFINITY_INJECTED_ATTR, "true");
    }
}

/**
 * Builds a compact send control that sits next to the native submission actions.
 */
function buildSendButton(postUrl: string, submission: Element): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.classList.add("button", "standard", "mobile-fix", "x2tg-send-button", "x2tg-send-button--furaffinity");
    button.setAttribute("aria-label", t("sendToTelegram"));
    button.title = t("sendToTelegram");

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "currentColor");
    path.setAttribute("d", SEND_TO_TELEGRAM_ICON_PATH);
    svg.appendChild(path);
    button.appendChild(svg);

    button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void handleSendClick(postUrl, submission);
    });

    return button;
}

/**
 * Opens the destination picker with the submission caption draft.
 */
async function handleSendClick(postUrl: string, submission: Element): Promise<void> {
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

    const resolvedPostUrl = furaffinityPostUrlFromPage(window.location) ?? postUrl;
    const snapshot = buildFuraffinitySnapshot(submission);

    showDestinationPicker({
        config,
        platformId: SocialPlatformId.FURAFINITY,
        initialCaptionHtml: buildCaptionDraftHtml(snapshot?.text ?? "", resolvedPostUrl),
        onSend: (destinations, captionHtml) => {
            void sendToDestinations(destinations, resolvedPostUrl, captionHtml, submission);
        }
    });
}

/**
 * Sends the submission to the selected destinations. The worker resolves media from the
 * snapshot, then from the view page, and falls back to a link-only send when neither works.
 */
async function sendToDestinations(
    destinations: PickedDestination[],
    postUrl: string,
    captionHtml: string,
    submission: Element
): Promise<void> {
    const dedupeKey = `${getDestinationsKey(destinations)}:${postUrl}`;

    if (wasRecentlySent(dedupeKey)) {
        showToast(t("waitBeforeResend"), "info");
        return;
    }

    const requestId = crypto.randomUUID();
    updateProgressToast(requestId, t("preparingSend"));

    const postSnapshot: SocialPostSnapshot | null = buildFuraffinitySnapshot(submission);
    registerPendingSend(requestId, {
        dedupeKey,
        destinations
    });

    const response = await sendRuntimeMessage<SendPostResponse>({
        type: RuntimeMessageType.SEND_POST,
        platformId: SocialPlatformId.FURAFINITY,
        requestId,
        destinations: destinations.map((destination) => destination.ref),
        postUrl,
        postSnapshot: postSnapshot ?? undefined,
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
