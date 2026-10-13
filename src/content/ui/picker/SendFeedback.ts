import type { PickedDestination } from "./DestinationPicker";
import { t } from "../../../core/i18n/I18n";
import type { SendPostResult } from "../../../core/types/Results";
import { showToast } from "../Toast";

/**
 * Shows the result of a send: the destination name for one, a count or a failure summary for several.
 */
export function showSendResultToast(response: SendPostResult | null, destinations: PickedDestination[]): void {
    if (!response?.ok) {
        showToast(response?.error ?? t("sendFailed"), "error");
        return;
    }

    if (destinations.length === 1) {
        showToast(t("sentToChannel", destinations[0].label), "success");
        return;
    }

    showToast(t("sentToDestinations", String(destinations.length)), "success");
}
