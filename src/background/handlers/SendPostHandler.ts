import { createTabProgressReporter } from "../ProgressReporter";
import { findChannelById, loadConfig, setLastUsedChannelId } from "../../core/storage/Storage";
import { TelegramClient } from "../../core/telegram/TelegramClient";
import type { SendPostMessage, SendResult } from "../../core/types";
import { getPlatformById } from "../../platforms/registry";

/**
 * Sends a social post to Telegram using the matching platform adapter.
 */
export async function handleSendPost(
    message: SendPostMessage,
    sender: chrome.runtime.MessageSender
): Promise<SendResult> {
    const platform = getPlatformById(message.platformId);

    if (!platform) {
        return {
            ok: false,
            error: "Plataforma não suportada."
        };
    }

    const config = await loadConfig();
    const channel = findChannelById(config, message.channelId);

    if (!channel) {
        return {
            ok: false,
            error: "Canal não encontrado na configuração."
        };
    }

    const normalizedUrl = platform.normalizePostUrl(message.postUrl);

    if (!normalizedUrl) {
        return {
            ok: false,
            error: platform.progressMessages.invalidUrl
        };
    }

    const tabId = sender.tab?.id;
    const onProgress = tabId
        ? createTabProgressReporter(tabId, message.requestId)
        : undefined;

    const client = new TelegramClient(config.botToken);

    onProgress?.({ message: platform.progressMessages.fetching });

    const fetchedPost = await platform.fetchPost(normalizedUrl);
    const result = fetchedPost
        ? await platform.sendPost(client, channel.chatId, fetchedPost, onProgress)
        : await client.sendMessage(channel.chatId, normalizedUrl);

    if (result.ok) {
        await setLastUsedChannelId(channel.id);
    }

    return result;
}
