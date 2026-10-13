import type { DestinationSender } from "./DestinationSender";
import { t } from "../i18n/I18n";
import { fetchBlobWithProgress, formatDownloadProgressMessage } from "../network/FetchProgress";
import type { SendProgressCallback } from "../network/SendProgress";
import { buildTelegramCaption } from "../telegram/Caption";
import { chunkSocialMedia } from "../telegram/MediaBatch";
import { getMediaDownloadUrl, guessFileExtension, resolveLocalMediaBlob } from "../telegram/TelegramFileUtils";
import { classifyTelegramUserError, formatTelegramUserError } from "../telegram-user/Errors";
import { telegramHtmlToFormattedText, type FormattedText } from "../telegram-user/FormattedText";
import type { OutgoingMediaFile, TelegramUserMessenger } from "../telegram-user/TelegramUserClient";
import { TelegramUserErrorCode } from "../telegram-user/SessionTypes";
import type { TelegramPeerDestinationRef } from "../types/DestinationRef";
import type { SendResult } from "../types/Results";
import type { FetchedSocialPost, SocialMediaItem } from "../../platforms/types";

const DOWNLOAD_FAILED_PREFIX = "Download failed";

/**
 * Sends to a chat of the connected Telegram user account through MTProto.
 * Media is uploaded as files, so videos are not bound by the Bot API 50 MB limit.
 */
export class TelegramUserDestinationSender implements DestinationSender {
    /**
     * @param messenger - Connected Telegram user client.
     * @param ref - Target chat of the account.
     */
    public constructor(
        private readonly messenger: TelegramUserMessenger,
        private readonly ref: TelegramPeerDestinationRef
    ) {}

    public async sendSocialPost(post: FetchedSocialPost, onProgress?: SendProgressCallback): Promise<SendResult> {
        const caption = telegramHtmlToFormattedText(buildTelegramCaption(post.embedUrl, post.text));
        const mediaTotal = post.media.length;

        try {
            if (mediaTotal === 0) {
                onProgress?.({ message: t("progressSendingLink") });
                await this.messenger.sendText(this.ref.peerId, caption);
                return { ok: true };
            }

            if (mediaTotal === 1) {
                const file = await downloadMedia(post.media[0], 1, 1, onProgress);

                onProgress?.({ message: t("progressSendingToTelegram") });
                await this.messenger.sendMedia(this.ref.peerId, file, caption, (uploaded, total) => {
                    onProgress?.(formatUploadProgress(1, 1, uploaded, total));
                });
                return { ok: true };
            }

            await this.sendBatches(post, caption, onProgress);
            return { ok: true };
        } catch (err) {
            return toFailure(err);
        }
    }

    public async sendLink(url: string): Promise<SendResult> {
        return this.sendPlainText(url);
    }

    public async sendTestMessage(): Promise<SendResult> {
        return this.sendPlainText(t("testChannelMessage"));
    }

    private async sendBatches(
        post: FetchedSocialPost,
        caption: FormattedText,
        onProgress?: SendProgressCallback
    ): Promise<void> {
        const batches = chunkSocialMedia(post.media);
        const mediaTotal = post.media.length;
        let mediaIndex = 0;

        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batch = batches[batchIndex];
            const files: OutgoingMediaFile[] = [];

            for (let index = 0; index < batch.length; index++) {
                files.push(await downloadMedia(batch[index], mediaIndex + index + 1, mediaTotal, onProgress));
            }

            onProgress?.({
                message: t("progressSendingMediaRange", [
                    String(mediaIndex + 1),
                    String(mediaIndex + batch.length),
                    String(mediaTotal)
                ])
            });

            const startIndex = mediaIndex;

            await this.messenger.sendMediaGroup(
                this.ref.peerId,
                files,
                batchIndex === 0 ? caption : undefined,
                (index, uploaded, total) => {
                    onProgress?.(formatUploadProgress(startIndex + index + 1, mediaTotal, uploaded, total));
                }
            );

            mediaIndex += batch.length;
        }

        if (batches.length > 1) {
            onProgress?.({ message: t("progressComplementaryLink") });
            await this.messenger.sendText(this.ref.peerId, { text: t("followUpMoreMedia", post.embedUrl), bold: [] });
        }
    }

    private async sendPlainText(text: string): Promise<SendResult> {
        try {
            await this.messenger.sendText(this.ref.peerId, { text, bold: [] });
            return { ok: true };
        } catch (err) {
            return toFailure(err);
        }
    }
}

async function downloadMedia(
    item: SocialMediaItem,
    itemIndex: number,
    itemTotal: number,
    onProgress?: SendProgressCallback
): Promise<OutgoingMediaFile> {
    const downloadUrl = getMediaDownloadUrl(item);
    const blob = resolveLocalMediaBlob(item) ?? await fetchBlobWithProgress(downloadUrl, (loaded, total) => {
        onProgress?.(formatDownloadProgressMessage(itemIndex, itemTotal, loaded, total));
    });

    return {
        kind: item.kind,
        blob,
        fileName: `social-media-${itemIndex}.${guessFileExtension(downloadUrl, blob.type)}`
    };
}

function formatUploadProgress(itemIndex: number, itemTotal: number, uploaded: number, total: number) {
    const percent = total > 0 ? Math.min(100, Math.round((uploaded / total) * 100)) : undefined;
    const message = itemTotal > 1
        ? t("progressSendingToTelegramIndexed", [String(itemIndex), String(itemTotal)])
        : t("progressSendingToTelegram");

    return { message, percent };
}

function toFailure(err: unknown): SendResult {
    if (err instanceof Error && err.message.startsWith(DOWNLOAD_FAILED_PREFIX)) {
        return { ok: false, error: t("errorMediaDownloadFailed") };
    }

    const error = classifyTelegramUserError(err);

    console.debug("[telegram-user] send failed (%s): %O", error.code, err);

    return {
        ok: false,
        error: formatTelegramUserError(error),
        floodWaitSeconds: error.code === TelegramUserErrorCode.FLOOD_WAIT ? error.waitSeconds ?? 1 : undefined
    };
}
