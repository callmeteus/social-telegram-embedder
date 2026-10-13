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
 * Sends a social post to one or more destinations using the matching platform adapter.
 * The post is fetched once and reused for every destination.
 */
export async function handleSendPost(
    message: SendPostMessage,
    sender: chrome.runtime.MessageSender
): Promise<SendPostResult> {
    const platform = getPlatformById(message.platformId);

    if (!platform) {
        return {
            ok: false,
            error: t("errorUnsupportedPlatform")
        };
    }

    const destinations = dedupeDestinationRefs(message.destinations);

    if (destinations.length === 0) {
        return {
            ok: false,
            error: t("errorChannelNotFound")
        };
    }

    if (destinations.length > MaxDestinationsPerSend) {
        return {
            ok: false,
            error: t("errorTooManyDestinations", String(MaxDestinationsPerSend))
        };
    }

    const normalizedUrl = platform.normalizePostUrl(message.postUrl);

    if (!normalizedUrl) {
        return {
            ok: false,
            error: t(platform.progressMessages.invalidUrl)
        };
    }

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

        const { result, succeeded } = await sendToDestinations(
            { platform, post: fetchedPost, normalizedUrl, destinations, onProgress },
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
