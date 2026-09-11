import { buildTelegramCaption } from "./Caption";
import { chunkSocialMedia } from "./MediaBatch";
import type { FetchedSocialPost, SocialMediaItem } from "../../platforms/types";
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
}

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
    public async sendMessage(chatId: string, text: string): Promise<SendResult> {
        return this.request("sendMessage", {
            chat_id: chatId.trim(),
            text,
            disable_web_page_preview: false
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
        const normalizedChatId = chatId.trim();
        const caption = buildTelegramCaption(post.embedUrl, post.text);
        const mediaTotal = post.media.length;

        if (post.media.length === 0) {
            onProgress?.({ message: "Enviando link..." });
            return this.sendMessage(normalizedChatId, caption);
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
            onProgress?.({ message: "Enviando link complementar..." });

            const continuation = await this.sendMessage(
                normalizedChatId,
                `Mais mídia do post:\n${post.embedUrl}`
            );

            if (!continuation.ok) {
                return continuation;
            }
        }

        return { ok: true };
    }

    /**
     * Validates the bot token via getMe.
     */
    public async getMe(): Promise<SendResult> {
        return this.request("getMe", {});
    }

    /**
     * Sends a test message to verify channel access.
     */
    public async sendTestMessage(chatId: string): Promise<SendResult> {
        return this.sendMessage(
            chatId,
            "Teste da extensão Social Telegram Embedder. Se você vê esta mensagem, o canal está configurado corretamente."
        );
    }

    /**
     * Lists channels seen in pending bot updates (getUpdates).
     */
    public async discoverChannels(): Promise<DiscoverChannelsResponse> {
        const webhookResponse = await this.requestRaw<TelegramWebhookInfo>("getWebhookInfo", {});

        if (!webhookResponse.ok) {
            return {
                ok: false,
                error: translateTelegramError(webhookResponse.description ?? "Falha ao consultar webhook.")
            };
        }

        if (webhookResponse.result?.url) {
            return {
                ok: false,
                error: "Este bot usa webhook. Remova o webhook (deleteWebhook) para detectar canais pela extensão."
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
                    error: translateTelegramError(updatesResponse.description ?? "Falha ao buscar updates.")
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
                warning:
                    "Nenhum canal encontrado. Adicione o bot como admin do canal e publique uma mensagem no canal (ou busque de novo depois)."
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
                ? `Enviando mídia ${startIndex + 1} a ${Math.min(startIndex + mediaItems.length, itemTotal)} de ${itemTotal}...`
                : "Enviando mídia..."
        });

        const media: TelegramInputMedia[] = mediaItems.map((item, index) => ({
            type: item.kind === "photo" ? "photo" : "video",
            media: item.url,
            caption: index === 0 ? caption : undefined
        }));

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
        onProgress?.({
            message: itemTotal > 1
                ? `Enviando mídia ${itemIndex} de ${itemTotal}...`
                : "Enviando mídia..."
        });

        const byUrl = await this.request(method, {
            chat_id: chatId,
            [fieldName]: mediaUrl,
            caption
        });

        if (byUrl.ok) {
            return byUrl;
        }

        return this.uploadMediaFromUrl(
            method,
            chatId,
            fieldName,
            mediaUrl,
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

            onProgress?.({
                message: itemTotal > 1
                    ? `Enviando mídia ${itemIndex} de ${itemTotal} para o Telegram...`
                    : "Enviando mídia para o Telegram..."
            });

            const extension = guessFileExtension(mediaUrl, blob.type);
            const formData = new FormData();

            formData.append("chat_id", chatId);
            formData.append(fieldName, blob, `tweet-media.${extension}`);

            if (caption) {
                formData.append("caption", caption);
            }

            return this.requestForm(method, formData);
        } catch (err) {
            const fallbackMessage = "Falha ao enviar mídia para o Telegram.";

            if (err instanceof Error && err.message.startsWith("Download failed")) {
                return {
                    ok: false,
                    error: "Não foi possível baixar a mídia do tweet."
                };
            }

            return {
                ok: false,
                error: err instanceof Error ? err.message : fallbackMessage
            };
        }
    }

    private async requestForm(
        method: string,
        formData: FormData
    ): Promise<SendResult> {
        if (!this.botToken) {
            return {
                ok: false,
                error: "Token do bot não configurado."
            };
        }

        try {
            const response = await fetch(
                `https://api.telegram.org/bot${this.botToken}/${method}`,
                {
                    method: "POST",
                    body: formData
                }
            );

            const data = (await response.json()) as TelegramApiResponse;

            if (!data.ok) {
                return {
                    ok: false,
                    error: translateTelegramError(data.description ?? "Erro desconhecido do Telegram.")
                };
            }

            return { ok: true };
        } catch (err) {
            return {
                ok: false,
                error: err instanceof Error ? err.message : "Falha de rede ao contatar o Telegram."
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
                description: "Token do bot não configurado."
            };
        }

        try {
            const response = await fetch(
                `https://api.telegram.org/bot${this.botToken}/${method}`,
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
                description: err instanceof Error ? err.message : "Falha de rede ao contatar o Telegram."
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
                error: translateTelegramError(data.description ?? "Erro desconhecido do Telegram.")
            };
        }

        return { ok: true };
    }
}

/**
 * Maps common Telegram API errors to Portuguese messages.
 */
function translateTelegramError(description: string): string {
    const lower = description.toLowerCase();

    if (lower.includes("unauthorized") || lower.includes("bot token")) {
        return "Token do bot inválido. Verifique o token do @BotFather.";
    }

    if (lower.includes("chat not found")) {
        return "Canal não encontrado. Confira o chat_id (@canal ou -100...).";
    }

    if (lower.includes("not enough rights") || lower.includes("have rights")) {
        return "O bot não tem permissão para postar neste canal. Adicione-o como administrador.";
    }

    if (lower.includes("bot was kicked") || lower.includes("bot is not a member")) {
        return "O bot não está no canal. Adicione-o como administrador.";
    }

    return description;
}

function guessFileExtension(mediaUrl: string, mimeType: string): string {
    if (mimeType.includes("jpeg") || mimeType.includes("jpg")) {
        return "jpg";
    }

    if (mimeType.includes("png")) {
        return "png";
    }

    if (mimeType.includes("webp")) {
        return "webp";
    }

    if (mimeType.includes("gif")) {
        return "gif";
    }

    if (mimeType.includes("mp4") || mediaUrl.includes(".mp4")) {
        return "mp4";
    }

    return "bin";
}
