import { handleSendPost } from "./handlers/SendPostHandler";
import { findChannelById, loadConfig } from "../core/storage/Storage";
import { TelegramClient } from "../core/telegram/TelegramClient";
import {
    RuntimeMessageType,
    type DiscoverChannelsResponse,
    type RuntimeMessage,
    type SendResult
} from "../core/types";

/**
 * Handles runtime messages from content script and options page.
 */
chrome.runtime.onMessage.addListener((
    message: RuntimeMessage,
    sender,
    sendResponse
) => {
    handleMessage(message, sender)
        .then(sendResponse)
        .catch((err: unknown) => {
            sendResponse({
                ok: false,
                error: err instanceof Error ? err.message : "Erro interno da extensão."
            } satisfies SendResult);
        });

    return true;
});

async function handleMessage(
    message: RuntimeMessage,
    sender: chrome.runtime.MessageSender
): Promise<SendResult | DiscoverChannelsResponse> {
    const config = await loadConfig();
    const client = new TelegramClient(config.botToken);

    if (message.type === RuntimeMessageType.GET_BOT_INFO) {
        return client.getMe();
    }

    if (message.type === RuntimeMessageType.DISCOVER_CHANNELS) {
        return client.discoverChannels();
    }

    if (message.type === RuntimeMessageType.TEST_CHANNEL) {
        const channel = findChannelById(config, message.channelId);

        if (!channel) {
            return { ok: false, error: "Canal não encontrado na configuração." };
        }

        return client.sendTestMessage(channel.chatId);
    }

    if (message.type === RuntimeMessageType.SEND_POST) {
        return handleSendPost(message, sender);
    }

    return {
        ok: false,
        error: `Tipo de mensagem não suportado: ${String((message as { type?: string }).type ?? "")}`
    };
}
