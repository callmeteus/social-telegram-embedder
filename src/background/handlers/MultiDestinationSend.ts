import type { DestinationSender } from "../../core/destinations";
import { t } from "../../core/i18n/I18n";
import { fetchBlobWithProgress, formatDownloadProgressMessage } from "../../core/network/FetchProgress";
import type { SendProgressCallback } from "../../core/network/SendProgress";
import { sanitizeDestinationRef } from "../../core/storage/ConfigMigrations";
import { getMediaDownloadUrl, resolveLocalMediaBlob } from "../../core/telegram/TelegramFileUtils";
import { formatTelegramUserError } from "../../core/telegram-user/Errors";
import { TelegramUserErrorCode } from "../../core/telegram-user/SessionTypes";
import { DestinationRefType, getDestinationRefKey, type DestinationRef } from "../../core/types/DestinationRef";
import type { DestinationSendOutcome, SendPostResult, SendResult } from "../../core/types/Results";
import type { FetchedSocialPost, SocialPlatform } from "../../platforms/types";

/** Pause between consecutive sends from the Telegram account, to stay clear of flood limits. */
export const TelegramUserSendDelayMs = 1500;

/** A destination ready to send to, or the reason it cannot be used. */
export interface ResolvedDestination {
    label: string;
    sender: DestinationSender | null;
    error?: string;
}

/** Side effects of a multi-destination send; injected for tests. */
export interface MultiDestinationSendDeps {
    resolveDestination(ref: DestinationRef): Promise<ResolvedDestination>;
    prefetchMedia(post: FetchedSocialPost, onProgress?: SendProgressCallback): Promise<FetchedSocialPost>;
    sleep(ms: number): Promise<void>;
}

/** What to send and where. */
export interface MultiDestinationSendParams {
    platform: Pick<SocialPlatform, "sendPost">;
    /** Post details, or null to send only the link. */
    post: FetchedSocialPost | null;
    normalizedUrl: string;
    destinations: DestinationRef[];
    onProgress?: SendProgressCallback;
}

/** Result plus the destinations that succeeded (for recents). */
export interface MultiDestinationSendResult {
    result: SendPostResult;
    succeeded: DestinationRef[];
}

/**
 * Validates untrusted refs from a runtime message, dropping malformed ones and duplicates (first wins).
 */
export function dedupeDestinationRefs(raw: unknown): DestinationRef[] {
    const list = Array.isArray(raw) ? raw : [];
    const seen = new Set<string>();
    const refs: DestinationRef[] = [];

    for (const entry of list) {
        const ref = sanitizeDestinationRef(entry);

        if (!ref || seen.has(getDestinationRefKey(ref))) {
            continue;
        }

        seen.add(getDestinationRefKey(ref));
        refs.push(ref);
    }

    return refs;
}

/**
 * Sends one post to every destination in order. Media is downloaded once and reused,
 * consecutive sends from the same Telegram account are spaced out, a FLOOD_WAIT skips the
 * remaining sends of that account, and one failure never cancels the rest.
 */
export async function sendToDestinations(
    params: MultiDestinationSendParams,
    deps: MultiDestinationSendDeps
): Promise<MultiDestinationSendResult> {
    const { destinations, onProgress } = params;
    const isMulti = destinations.length > 1;
    const post = isMulti && params.post && params.post.media.length > 0
        ? await deps.prefetchMedia(params.post, onProgress)
        : params.post;
    const outcomes: DestinationSendOutcome[] = [];
    const succeeded: DestinationRef[] = [];
    const floodWaits = new Map<string, number>();

    for (let index = 0; index < destinations.length; index++) {
        const ref = destinations[index];
        const accountId = ref.type === DestinationRefType.TELEGRAM_PEER ? ref.connectionId : null;
        const resolved = await deps.resolveDestination(ref);
        const floodWaitSeconds = accountId !== null ? floodWaits.get(accountId) : undefined;

        if (floodWaitSeconds !== undefined) {
            outcomes.push({
                label: resolved.label,
                ok: false,
                error: formatTelegramUserError({ code: TelegramUserErrorCode.FLOOD_WAIT, waitSeconds: floodWaitSeconds })
            });
            continue;
        }

        if (!resolved.sender) {
            outcomes.push({ label: resolved.label, ok: false, error: resolved.error ?? t("errorDestinationNotSupported") });
            continue;
        }

        const destinationProgress: SendProgressCallback | undefined = onProgress && isMulti
            ? (update) => onProgress({
                ...update,
                message: t("progressDestinationPrefix", [String(index + 1), String(destinations.length), resolved.label, update.message])
            })
            : onProgress;

        const result: SendResult = post
            ? await params.platform.sendPost(resolved.sender, post, destinationProgress)
            : await resolved.sender.sendLink(params.normalizedUrl);

        outcomes.push({ label: resolved.label, ok: result.ok, error: result.ok ? undefined : result.error });

        if (result.ok) {
            succeeded.push(ref);
        } else
        if (result.floodWaitSeconds !== undefined && accountId !== null) {
            floodWaits.set(accountId, result.floodWaitSeconds);
            console.debug("[send] flood wait %ds, skipping remaining destinations of account %s", result.floodWaitSeconds, accountId);
        }

        const next = destinations[index + 1];
        const nextSameAccount = accountId !== null && next?.type === DestinationRefType.TELEGRAM_PEER && next.connectionId === accountId;

        if (nextSameAccount && !floodWaits.has(accountId)) {
            await deps.sleep(TelegramUserSendDelayMs);
        }
    }

    console.debug("[send] %d of %d destinations succeeded", succeeded.length, destinations.length);

    return { result: summarizeOutcomes(outcomes), succeeded };
}

/**
 * Downloads every remote media item once so all destinations reuse the same bytes.
 * Items that fail to download are left as-is; each sender retries them on its own.
 */
export async function prefetchPostMedia(
    post: FetchedSocialPost,
    onProgress?: SendProgressCallback
): Promise<FetchedSocialPost> {
    const media = [];

    for (let index = 0; index < post.media.length; index++) {
        const item = post.media[index];

        if (resolveLocalMediaBlob(item)) {
            media.push(item);
            continue;
        }

        try {
            const prefetchedBlob = await fetchBlobWithProgress(getMediaDownloadUrl(item), (loaded, total) => {
                onProgress?.(formatDownloadProgressMessage(index + 1, post.media.length, loaded, total));
            });

            media.push({ ...item, prefetchedBlob });
        } catch (err) {
            console.debug("[send] media prefetch failed, senders will retry: %O", err);
            media.push(item);
        }
    }

    return { ...post, media };
}

function summarizeOutcomes(outcomes: DestinationSendOutcome[]): SendPostResult {
    const failures = outcomes.filter((outcome) => !outcome.ok);

    if (outcomes.length === 1) {
        return { ok: outcomes[0].ok, error: outcomes[0].error, outcomes };
    }

    if (failures.length === 0) {
        return { ok: true, outcomes };
    }

    return {
        ok: false,
        error: t("sentPartialSummary", [
            String(outcomes.length - failures.length),
            String(outcomes.length),
            failures.map((failure) => `${failure.label} (${failure.error ?? t("sendFailed")})`).join("; ")
        ]),
        outcomes
    };
}
