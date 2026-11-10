import { dismissProgressToast } from "../ui/Toast";
import { showSendResultToast } from "../ui/picker/SendFeedback";
import { markRecentSend, takePendingSend } from "./PendingSend";
import type { SendPostDonePayload } from "../../core/network/SendProgress";

/**
 * Finishes a send in the tab: closes the progress toast, starts the resend debounce and shows
 * the outcome. The pending entry is gone when the page was reloaded mid-send; the result still
 * carries the destination labels, so the user sees the outcome anyway.
 */
export function handleSendPostDone(payload: SendPostDonePayload): void {
    dismissProgressToast(payload.requestId);

    const pending = takePendingSend(payload.requestId);

    if (payload.result.ok && pending) {
        markRecentSend(pending.dedupeKey);
    }

    const destinations = pending?.destinations ?? payload.result.outcomes?.map((outcome) => ({ label: outcome.label })) ?? [];

    showSendResultToast(payload.result, destinations);
}
