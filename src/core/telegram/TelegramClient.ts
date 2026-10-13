import { isTwitterTimelinePhotoUrl, preferTwitterLargeMediaUrl } from "../media/TwitterMediaUrl";
import { buildTelegramCaption } from "./Caption";
import { chunkSocialMedia } from "./MediaBatch";
import type { FetchedSocialPost, SocialMediaItem } from "../../platforms/types";
import { t } from "../i18n/I18n";
import {
    fetchBlobWithProgress,
    formatDownloadProgressMessage
} from "../network/FetchProgress";
import type { SendProgressCallback } from "../network/SendProgress";
import type { DiscoverChannelsResponse, SendResult } from "../types/Results";
import {
    collectChannelsFromUpdate,
    sortDetectedChannels,
    type TelegramUpdateSnapshot
} from "./DiscoverChannels";
import { buildTelegramBotApiUrl } from "./TelegramApiUrl";
import { normalizeTelegramChatId } from "./NormalizeChatId";
import { getMediaDownloadUrl, guessFileExtension, resolveLocalMediaBlob } from "./TelegramFileUtils";

interface TelegramApiResponse<T = unknown> {
    ok: boolean;
    description?: string;
    result?: T;
}

interface TelegramWebhookInfo {
    url?: string;
}

interface TelegramInputMedia {
    type: "photo" | "video";
    media: string;
    caption?: string;
    parse_mode?: string;
}

interface TelegramSentMessage {
    message_id: number;
}

const TELEGRAM_HTML_PARSE_MODE = "HTML";

/**
 * Client for Telegram Bot API calls from the extension service worker.
 */
export class TelegramClient {
    private readonly botToken: string;

    /**
     * @param botToken - Bot token from @BotFather.
     */
    public constructor(botToken: string) {
        this.botToken = botToken.trim();
    }

    /**
     * Sends a text message to a Telegram chat or channel.
     */
    public async sendMessage(
        chatId: string,
        text: string,
        parseMode?: string
    ): Promise<SendResult> {
        return this.request("sendMessage", {
            chat_id: normalizeTelegramChatId(chatId),
            text,
            disable_web_page_preview: false,
            ...(parseMode ? { parse_mode: parseMode } : {})
        });
    }

    /**
     * Sends a social post with media attachments and source link in caption.
     */
    public async sendSocialPost(
        chatId: string,
        post: FetchedSocialPost,
        onProgress?: SendProgressCallback
    ): Promise<SendResult> {
        const normalizedChatId = normalizeTelegramChatId(chatId);
        const caption = buildTelegramCaption(post.embedUrl, post.text);
        const mediaTotal = post.media.length;

        if (post.media.length === 0) {
            onProgress?.({ message: t("progressSendingLink") });
            return this.sendMessage(normalizedChatId, caption, TELEGRAM_HTML_PARSE_MODE);
        }

        if (post.media.length === 1) {
            return this.sendSingleMedia(normalizedChatId, post.media[0], caption, 1, mediaTotal, onProgress);
        }

        const batches = chunkSocialMedia(post.media);
        let mediaIndex = 0;

        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batch = batches[batchIndex];
            const batchCaption = batchIndex === 0 ? caption : undefined;
            const result = await this.sendMediaBatch(
                normalizedChatId,
                batch,
                batchCaption,
                mediaIndex,
                mediaTotal,
                onProgress
            );

            if (!result.ok) {
                return result;
            }

            mediaIndex += batch.length;
        }

        if (batches.length > 1) {
            onProgress?.({ message: t("progressComplementaryLink") });

            const continuation = await this.sendMessage(
                normalizedChatId,
                t("followUpMoreMedia", post.embedUrl)
            );

            if (!continuation.ok) {
                return continuation;
            }
        }

        return { ok: true };
    }

    /**
     * Validates the bot token via getMe; on success also returns the bot username.
     */
    public async getMe(): Promise<SendResult & { username?: string }> {
        const data = await this.requestRaw<{ username?: string }>("getMe", {});

        if (!data.ok) {
            return { ok: false, error: translateTelegramError(data.description ?? t("errorTelegramUnknown")) };
        }

        return { ok: true, username: data.result?.username };
    }

    /**
     * Sends a test message to verify channel access, then deletes it from the channel.
     */
    public async sendTestMessage(chatId: string): Promise<SendResult> {
        const normalizedChatId = normalizeTelegramChatId(chatId);
        const sendResponse = await this.requestRaw<TelegramSentMessage>("sendMessage", {
            chat_id: normalizedChatId,
            text: t("testChannelMessage"),
            disable_web_page_preview: false
        });

        if (!sendResponse.ok) {
            return {
                ok: false,
                error: translateTelegramError(sendResponse.description ?? t("errorTelegramUnknown"))
            };
        }

        const messageId = sendResponse.result?.message_id;

        if (messageId !== undefined) {
            await this.request("deleteMessage", {
                chat_id: normalizedChatId,
                message_id: messageId
            });
        }

        return { ok: true };
    }

    /**
     * Lists channels seen in pending bot updates (getUpdates).
     */
    public async discoverChannels(): Promise<DiscoverChannelsResponse> {
        const webhookResponse = await this.requestRaw<TelegramWebhookInfo>("getWebhookInfo", {});

        if (!webhookResponse.ok) {
            return {
                ok: false,
                error: translateTelegramError(webhookResponse.description ?? t("errorWebhookQueryFailed"))
            };
        }

        if (webhookResponse.result?.url) {
            return {
                ok: false,
                error: t("errorWebhookActive")
            };
        }

        const channels = new Map<string, import("./DiscoverChannels").DetectedTelegramChannel>();
        let offset = 0;

        while (true) {
            const updatesResponse = await this.requestRaw<TelegramUpdateSnapshot[]>("getUpdates", {
                offset,
                limit: 100,
                timeout: 0
            });

            if (!updatesResponse.ok) {
                return {
                    ok: false,
                    error: translateTelegramError(updatesResponse.description ?? t("errorDiscoverUpdatesFailed"))
                };
            }

            const updates = updatesResponse.result ?? [];

            if (updates.length === 0) {
                break;
            }

            for (const update of updates) {
                collectChannelsFromUpdate(update, channels);
                offset = update.update_id + 1;
            }
        }

        const sortedChannels = sortDetectedChannels(Array.from(channels.values()));

        if (sortedChannels.length === 0) {
            return {
                ok: true,
                channels: [],
                warning: t("warningDiscoverNoChannels")
            };
        }

        return {
            ok: true,
            channels: sortedChannels
        };
    }

    private async sendSingleMedia(
        chatId: string,
        media: SocialMediaItem,
        caption: string | undefined,
        itemIndex: number,
        itemTotal: number,
        onProgress?: SendProgressCallback
    ): Promise<SendResult> {
        const localBlob = resolveLocalMediaBlob(media);

        if (localBlob) {
            return this.uploadMediaBlob(
                media.kind === "photo" ? "sendPhoto" : "sendVideo",
                chatId,
                media.kind === "photo" ? "photo" : "video",
                localBlob,
                localBlob.type || media.url,
                caption,
                itemIndex,
                itemTotal,
                onProgress
            );
        }

        if (media.kind === "photo") {
            return this.sendMediaByUrl("sendPhoto", chatId, "photo", media.url, caption, itemIndex, itemTotal, onProgress);
        }

        if (media.kind === "gif") {
            const animationResult = await this.sendMediaByUrl(
                "sendAnimation",
                chatId,
                "animation",
                media.url,
                caption,
                itemIndex,
                itemTotal,
                onProgress
            );

            if (animationResult.ok) {
                return animationResult;
            }

            return this.sendMediaByUrl("sendVideo", chatId, "video", media.url, caption, itemIndex, itemTotal, onProgress);
        }

        return this.sendMediaByUrl("sendVideo", chatId, "video", media.url, caption, itemIndex, itemTotal, onProgress);
    }

    private async sendMediaBatch(
        chatId: string,
        mediaItems: SocialMediaItem[],
        caption: string | undefined,
        startIndex: number,
        itemTotal: number,
        onProgress?: SendProgressCallback
    ): Promise<SendResult> {
        onProgress?.({
            message: itemTotal > 1
                ? t("progressSendingMediaRange", [
                    String(startIndex + 1),
                    String(Math.min(startIndex + mediaItems.length, itemTotal)),
                    String(itemTotal)
                ])
                : t("progressSendingMedia")
        });

        const shouldUploadTwitterPhotos = mediaItems.some(
            (item) => item.kind === "photo" && isTwitterTimelinePhotoUrl(item.url)
        );
        const hasLocalBlobs = mediaItems.some((item) => item.prefetchedBlob || item.inlineBlob);

        if (shouldUploadTwitterPhotos || hasLocalBlobs) {
            const uploaded = await this.sendMediaBatchByUpload(
                chatId,
                mediaItems,
                caption,
                startIndex,
                itemTotal,
                onProgress
            );

            if (uploaded.ok) {
                return uploaded;
            }
        }

        const media: TelegramInputMedia[] = mediaItems.map((item, index) => {
            const photoUrl = item.kind === "photo"
                ? preferTwitterLargeMediaUrl(item.url)
                : item.url;
            const entry: TelegramInputMedia = {
                type: item.kind === "photo" ? "photo" : "video",
                media: photoUrl
            };

            if (index === 0 && caption) {
                entry.caption = caption;
                entry.parse_mode = TELEGRAM_HTML_PARSE_MODE;
            }

            return entry;
        });

        const byUrl = await this.request("sendMediaGroup", {
            chat_id: chatId,
            media
        });

        if (byUrl.ok) {
            return byUrl;
        }

        for (let index = 0; index < mediaItems.length; index++) {
            const item = mediaItems[index];
            const itemCaption = index === 0 ? caption : undefined;
            const result = await this.sendSingleMedia(
                chatId,
                item,
                itemCaption,
                startIndex + index + 1,
                itemTotal,
                onProgress
            );

            if (!result.ok) {
                return result;
            }
        }

        return { ok: true };
    }

    private async sendMediaBatchByUpload(
        chatId: string,
        mediaItems: SocialMediaItem[],
        caption: string | undefined,
        startIndex: number,
        itemTotal: number,
        onProgress?: SendProgressCallback
    ): Promise<SendResult> {
        const formData = new FormData();
        const mediaPayload: TelegramInputMedia[] = [];

        formData.append("chat_id", chatId);

        for (let index = 0; index < mediaItems.length; index++) {
            const item = mediaItems[index];
            const attachName = `file${index}`;
            const downloadUrl = getMediaDownloadUrl(item);

            onProgress?.({
                message: itemTotal > 1
                    ? t("progressSendingMediaIndexed", [String(startIndex + index + 1), String(itemTotal)])
                    : t("progressSendingMedia")
            });

            try {
                const blob = resolveLocalMediaBlob(item) ?? await fetchBlobWithProgress(downloadUrl, (loaded, total) => {
                    const progress = formatDownloadProgressMessage(startIndex + index + 1, itemTotal, loaded, total);
                    onProgress?.(progress);
                });
                const extension = guessFileExtension(downloadUrl, blob.type);

                formData.append(attachName, blob, `social-media-${index}.${extension}`);
            } catch (err) {
                if (err instanceof Error && err.message.startsWith("Download failed")) {
                    return {
                        ok: false,
                        error: t("errorMediaDownloadFailed")
                    };
                }

                return {
                    ok: false,
                    error: err instanceof Error ? err.message : t("errorMediaUploadFailed")
                };
            }

            const entry: TelegramInputMedia = {
                type: item.kind === "photo" ? "photo" : "video",
                media: `attach://${attachName}`
            };

            if (index === 0 && caption) {
                entry.caption = caption;
                entry.parse_mode = TELEGRAM_HTML_PARSE_MODE;
            }

            mediaPayload.push(entry);
        }

        formData.append("media", JSON.stringify(mediaPayload));

        onProgress?.({
            message: itemTotal > 1
                ? t("progressSendingMediaRange", [
                    String(startIndex + 1),
                    String(Math.min(startIndex + mediaItems.length, itemTotal)),
                    String(itemTotal)
                ])
                : t("progressSendingMedia")
        });

        return this.requestForm("sendMediaGroup", formData);
    }

    private async sendMediaByUrl(
        method: "sendPhoto" | "sendVideo" | "sendAnimation",
        chatId: string,
        fieldName: "photo" | "video" | "animation",
        mediaUrl: string,
        caption: string | undefined,
        itemIndex: number,
        itemTotal: number,
        onProgress?: SendProgressCallback
    ): Promise<SendResult> {
        const resolvedUrl = fieldName === "photo"
            ? preferTwitterLargeMediaUrl(mediaUrl)
            : mediaUrl;

        onProgress?.({
            message: itemTotal > 1
                ? t("progressSendingMediaIndexed", [String(itemIndex), String(itemTotal)])
                : t("progressSendingMedia")
        });

        if (fieldName === "photo" && isTwitterTimelinePhotoUrl(resolvedUrl)) {
            return this.uploadMediaFromUrl(
                method,
                chatId,
                fieldName,
                resolvedUrl,
                caption,
                itemIndex,
                itemTotal,
                onProgress
            );
        }

        const byUrl = await this.request(method, {
            chat_id: chatId,
            [fieldName]: resolvedUrl,
            caption,
            parse_mode: TELEGRAM_HTML_PARSE_MODE
        });

        if (byUrl.ok) {
            return byUrl;
        }

        return this.uploadMediaFromUrl(
            method,
            chatId,
            fieldName,
            resolvedUrl,
            caption,
            itemIndex,
            itemTotal,
            onProgress
        );
    }

    private async uploadMediaFromUrl(
        method: "sendPhoto" | "sendVideo" | "sendAnimation",
        chatId: string,
        fieldName: "photo" | "video" | "animation",
        mediaUrl: string,
        caption: string | undefined,
        itemIndex: number,
        itemTotal: number,
        onProgress?: SendProgressCallback
    ): Promise<SendResult> {
        try {
            const blob = await fetchBlobWithProgress(mediaUrl, (loaded, total) => {
                const progress = formatDownloadProgressMessage(itemIndex, itemTotal, loaded, total);
                onProgress?.(progress);
            });

            return this.uploadMediaBlob(
                method,
                chatId,
                fieldName,
                blob,
                mediaUrl,
                caption,
                itemIndex,
                itemTotal,
                onProgress
            );
        } catch (err) {
            if (err instanceof Error && err.message.startsWith("Download failed")) {
                return {
                    ok: false,
                    error: t("errorMediaDownloadFailed")
                };
            }

            return {
                ok: false,
                error: err instanceof Error ? err.message : t("errorMediaUploadFailed")
            };
        }
    }

    private async uploadMediaBlob(
        method: "sendPhoto" | "sendVideo" | "sendAnimation",
        chatId: string,
        fieldName: "photo" | "video" | "animation",
        blob: Blob,
        nameHint: string,
        caption: string | undefined,
        itemIndex: number,
        itemTotal: number,
        onProgress?: SendProgressCallback
    ): Promise<SendResult> {
        onProgress?.({
            message: itemTotal > 1
                ? t("progressSendingToTelegramIndexed", [String(itemIndex), String(itemTotal)])
                : t("progressSendingToTelegram")
        });

        const extension = guessFileExtension(nameHint, blob.type);
        const formData = new FormData();

        formData.append("chat_id", chatId);
        formData.append(fieldName, blob, `social-media.${extension}`);

        if (caption) {
            formData.append("caption", caption);
            formData.append("parse_mode", TELEGRAM_HTML_PARSE_MODE);
        }

        return this.requestForm(method, formData);
    }

    private async requestForm(
        method: string,
        formData: FormData
    ): Promise<SendResult> {
        if (!this.botToken) {
            return {
                ok: false,
                error: t("errorBotTokenMissing")
            };
        }

        try {
            const response = await fetch(
                buildTelegramBotApiUrl(this.botToken, method),
                {
                    method: "POST",
                    body: formData
                }
            );

            const data = (await response.json()) as TelegramApiResponse;

            if (!data.ok) {
                return {
                    ok: false,
                    error: translateTelegramError(data.description ?? t("errorTelegramUnknown"))
                };
            }

            return { ok: true };
        } catch (err) {
            return {
                ok: false,
                error: err instanceof Error ? err.message : t("errorNetworkTelegram")
            };
        }
    }

    private async requestRaw<T>(
        method: string,
        body: Record<string, unknown>
    ): Promise<TelegramApiResponse<T>> {
        if (!this.botToken) {
            return {
                ok: false,
                description: t("errorBotTokenMissing")
            };
        }

        try {
            const response = await fetch(
                buildTelegramBotApiUrl(this.botToken, method),
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(body)
                }
            );

            return (await response.json()) as TelegramApiResponse<T>;
        } catch (err) {
            return {
                ok: false,
                description: err instanceof Error ? err.message : t("errorNetworkTelegram")
            };
        }
    }

    private async request(
        method: string,
        body: Record<string, unknown>
    ): Promise<SendResult> {
        const data = await this.requestRaw(method, body);

        if (!data.ok) {
            return {
                ok: false,
                error: translateTelegramError(data.description ?? t("errorTelegramUnknown"))
            };
        }

        return { ok: true };
    }
}

/**
 * Maps common Telegram API errors to localized messages.
 */
function translateTelegramError(description: string): string {
    const lower = description.toLowerCase();

    if (lower.includes("unauthorized") || lower.includes("bot token")) {
        return t("telegramErrorUnauthorized");
    }

    if (lower.includes("chat not found")) {
        return t("telegramErrorChatNotFound");
    }

    if (lower.includes("not enough rights") || lower.includes("have rights")) {
        return t("telegramErrorNoRights");
    }

    if (lower.includes("bot was kicked") || lower.includes("bot is not a member")) {
        return t("telegramErrorNotMember");
    }

    if (lower.includes("entity too large") || lower.includes("file is too big") || lower.includes("request entity too large")) {
        return t("telegramErrorFileTooLarge");
    }

    return description;
}
