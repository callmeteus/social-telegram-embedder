import { t } from "../core/i18n/I18n";
import type { SendPostResult } from "../core/types/Results";

const NOTIFICATION_PREFIX = "x2tg-send-";
const NOTIFICATION_ICON = "icons/icon128.png";

/**
 * Tells the user how a send ended when the tab that started it is gone.
 * Best-effort: without the `notifications` permission (or API) it only logs.
 */
export function notifySendResult(result: SendPostResult): void {
    const notifications = getNotificationsApi();

    if (!notifications) {
        console.debug("[send] notifications unavailable, result was: %O", result);
        return;
    }

    const outcomes = result.outcomes ?? [];
    const sent = outcomes.filter((outcome) => outcome.ok);
    const title = result.ok ? t("notificationSendSuccessTitle") : t("notificationSendFailedTitle");
    const message = result.ok
        ? describeSuccess(sent.map((outcome) => outcome.label), outcomes.length)
        : result.error ?? t("sendFailed");

    try {
        notifications.create(
            `${NOTIFICATION_PREFIX}${Date.now()}`,
            {
                type: "basic",
                iconUrl: chrome.runtime.getURL(NOTIFICATION_ICON),
                title,
                message,
                priority: 1
            },
            () => {
                // Reading lastError avoids an unchecked runtime error in the worker console.
                void chrome.runtime.lastError;
            }
        );
    } catch (err) {
        console.debug("[send] notification failed: %O", err);
    }
}

function describeSuccess(labels: string[], total: number): string {
    if (total <= 1) {
        return t("sentToChannel", labels[0] ?? t("pickerTitle"));
    }

    return t("sentToDestinations", String(total));
}

function getNotificationsApi(): typeof chrome.notifications | undefined {
    try {
        // Not every runtime exposes the API (tests, missing permission).
        const notifications = (chrome as { notifications?: typeof chrome.notifications }).notifications;

        return notifications && typeof notifications.create === "function" ? notifications : undefined;
    } catch {
        return undefined;
    }
}
