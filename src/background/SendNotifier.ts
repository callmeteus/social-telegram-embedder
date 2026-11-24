import { t } from "../core/i18n/I18n";
import type { SendPostResult } from "../core/types/Results";
import { createNotification, getExtensionUrl } from "../core/extension/BrowserApi";

const NOTIFICATION_PREFIX = "x2tg-send-";
const NOTIFICATION_ICON = "icons/icon128.png";

/**
 * Tells the user how a send ended when the tab that started it is gone.
 * Best-effort: without the `notifications` permission (or API) it only logs.
 */
export function notifySendResult(result: SendPostResult): void {
    const outcomes = result.outcomes ?? [];
    const sent = outcomes.filter((outcome) => outcome.ok);
    const title = result.ok ? t("notificationSendSuccessTitle") : t("notificationSendFailedTitle");
    const message = result.ok
        ? describeSuccess(sent.map((outcome) => outcome.label), outcomes.length)
        : result.error ?? t("sendFailed");

    void createNotification(
        `${NOTIFICATION_PREFIX}${Date.now()}`,
        {
            type: "basic",
            iconUrl: getExtensionUrl(NOTIFICATION_ICON),
            title,
            message,
            priority: 1
        }
    ).catch((err: unknown) => {
        console.debug("[send] notification failed: %O", err);
    });
}

function describeSuccess(labels: string[], total: number): string {
    if (total <= 1) {
        return t("sentToChannel", labels[0] ?? t("pickerTitle"));
    }

    return t("sentToDestinations", String(total));
}
