import { createTabProgressReporter } from "../ProgressReporter";
import {
    dedupeDestinationRefs,
    prefetchPostMedia,
    sendToDestinations,
    type ResolvedDestination
} from "./MultiDestinationSend";
import { telegramUserSessions, TelegramUserSessionError } from "../telegram-user";
import { hydrateSnapshotMediaBlobs } from "../../content/media/BlobSnapshotTransfer";
import { createDestinationSender } from "../../core/destinations";
import { t } from "../../core/i18n/I18n";
import { findAccountConnection } from "../../core/storage/Connections";
import { findChannelById, loadConfig, recordRecentDestinations } from "../../core/storage/Storage";
import { formatTelegramUserError } from "../../core/telegram-user/Errors";
import { TelegramUserErrorCode } from "../../core/telegram-user/SessionTypes";
import type { ExtensionConfig } from "../../core/types/Config";
import {
    DestinationRefType,
    MaxDestinationsPerSend,
    type DestinationRef
} from "../../core/types/DestinationRef";
import type { SendPostMessage, SendPostResult } from "../../core/types";
import { snapshotToFetchedPost } from "../../platforms/types";
import { getPlatformById } from "../../platforms/registry";

/**
 * Cheap validation of a SEND_POST payload, done before the job is queued so obvious mistakes are
 * reported to the tab instead of ending up in a notification.
 */
export function validateSendPostRequest(message: SendPostMessage): string | null {
    const platform = getPlatformById(message.platformId);

    if (!platform) {
        return t("errorUnsupportedPlatform");
    }

    const destinations = dedupeDestinationRefs(message.destinations);

    if (destinations.length === 0) {
        return t("errorChannelNotFound");
    }

    if (destinations.length > MaxDestinationsPerSend) {
        return t("errorTooManyDestinations", String(MaxDestinationsPerSend));
    }

    if (!platform.normalizePostUrl(message.postUrl)) {
        return t(platform.progressMessages.invalidUrl);
    }

    return null;
}

/**
 * Sends a social post to one or more destinations using the matching platform adapter.
 * The post is fetched once and reused for every destination.
 */
export async function handleSendPost(
    message: SendPostMessage,
    sender: chrome.runtime.MessageSender
): Promise<SendPostResult> {
    const invalid = validateSendPostRequest(message);

    if (invalid) {
        return {
            ok: false,
            error: invalid
        };
    }

    const platform = getPlatformById(message.platformId)!;
    const destinations = dedupeDestinationRefs(message.destinations);
    const normalizedUrl = platform.normalizePostUrl(message.postUrl)!;

    const config = await loadConfig();
    const tabId = sender.tab?.id;
    const onProgress = tabId
        ? createTabProgressReporter(tabId, message.requestId)
        : undefined;
    const accountConnectionIds = new Set(destinations
        .filter((ref) => ref.type === DestinationRefType.TELEGRAM_PEER)
        .map((ref) => ref.connectionId)
        .filter((connectionId) => findAccountConnection(config, connectionId)));
    const releases = Array.from(accountConnectionIds, (connectionId) => telegramUserSessions.get(connectionId).acquire());

    try {
        onProgress?.({ message: t(platform.progressMessages.fetching) });

        const hydratedSnapshot = message.postSnapshot
            ? await hydrateSnapshotMediaBlobs(message.postSnapshot)
            : undefined;

        const fetchedPost = hydratedSnapshot
            ? snapshotToFetchedPost(normalizedUrl, hydratedSnapshot)
            : await platform.fetchPost(normalizedUrl);

        if (!fetchedPost && platform.progressMessages.linkOnly) {
            onProgress?.({ message: t(platform.progressMessages.linkOnly) });
        }

        const { result, succeeded } = await sendToDestinations(
            {
                platform,
                post: fetchedPost,
                normalizedUrl,
                destinations,
                onProgress,
                captionHtml: typeof message.captionHtml === "string" ? message.captionHtml : undefined,
                hasSpoiler: message.hasSpoiler === true,
                captionAbove: message.captionAbove === true
            },
            {
                resolveDestination: (ref) => resolveDestination(config, ref),
                prefetchMedia: prefetchPostMedia,
                sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
            }
        );

        await recordRecentDestinations(succeeded);
        return result;
    } finally {
        for (const release of releases) {
            release();
        }
    }
}

async function resolveDestination(config: ExtensionConfig, ref: DestinationRef): Promise<ResolvedDestination> {
    if (ref.type === DestinationRefType.CHANNEL) {
        const channel = findChannelById(config, ref.channelId);

        if (!channel) {
            return { label: ref.channelId, sender: null, error: t("errorChannelNotFound") };
        }

        return { label: channel.label, sender: createDestinationSender(config, ref) };
    }

    if (!findAccountConnection(config, ref.connectionId)) {
        return { label: ref.title, sender: null, error: formatTelegramUserError({ code: TelegramUserErrorCode.NOT_CONNECTED }) };
    }

    try {
        const client = await telegramUserSessions.get(ref.connectionId).getClient();

        return { label: ref.title, sender: createDestinationSender(config, ref, client) };
    } catch (err) {
        if (err instanceof TelegramUserSessionError) {
            return { label: ref.title, sender: null, error: formatTelegramUserError(err.error) };
        }

        throw err;
    }
}
