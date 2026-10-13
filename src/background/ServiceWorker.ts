import { handleSendPost } from "./handlers/SendPostHandler";
import { routeTelegramUserPort, telegramUserSessions } from "./telegram-user";
import { createDestinationSender } from "../core/destinations";
import { t } from "../core/i18n/I18n";
import { findBotConnection } from "../core/storage/Connections";
import { findChannelById, loadConfig } from "../core/storage/Storage";
import { fetchBotChatPhoto } from "../core/telegram/ChatPhoto";
import { TelegramClient } from "../core/telegram/TelegramClient";
import {
    DestinationProvider,
    DestinationRefType,
    RuntimeMessageType,
    type ChannelPhotoResponse,
    type DiscoverChannelsResponse,
    type RuntimeMessage,
    type SendResult
} from "../core/types";

/**
 * Upgrades the stored config right after an extension update, before any page asks for it.
 */
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason !== chrome.runtime.OnInstalledReason.UPDATE) {
        return;
    }

    loadConfig().catch((err: unknown) => {
        console.error("[storage] config migration on update failed: %O", err);
    });
});

/**
 * Long-lived connections from the options page (account login) and the destination picker (dialogs).
 * Only extension pages and our own content scripts can connect; login only from extension pages.
 */
chrome.runtime.onConnect.addListener((port) => {
    routeTelegramUserPort(port, telegramUserSessions, chrome.runtime.id);
});

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
            console.error("[background] message %s failed: %O", (message as { type?: string })?.type, err);
            sendResponse({
                ok: false,
                error: err instanceof Error ? err.message : t("errorInternal")
            } satisfies SendResult);
        });

    return true;
});

async function handleMessage(
    message: RuntimeMessage,
    sender: chrome.runtime.MessageSender
): Promise<SendResult | DiscoverChannelsResponse | ChannelPhotoResponse> {
    const config = await loadConfig();

    if (message.type === RuntimeMessageType.GET_CHANNEL_PHOTO) {
        const channel = findChannelById(config, message.channelId);
        const bot = channel?.provider === DestinationProvider.TELEGRAM ? findBotConnection(config, channel.connectionId) : undefined;

        if (channel?.provider !== DestinationProvider.TELEGRAM || !bot?.botToken) {
            return { dataUrl: null };
        }

        return { dataUrl: await loadChannelPhoto(bot.botToken, channel.chatId) };
    }

    if (message.type === RuntimeMessageType.GET_BOT_INFO || message.type === RuntimeMessageType.DISCOVER_CHANNELS) {
        const bot = findBotConnection(config, message.connectionId);

        if (!bot?.botToken) {
            return { ok: false, error: t("optionsEnterBotToken") };
        }

        const client = new TelegramClient(bot.botToken);

        return message.type === RuntimeMessageType.GET_BOT_INFO ? client.getMe() : client.discoverChannels();
    }

    if (message.type === RuntimeMessageType.TEST_CHANNEL) {
        const channel = findChannelById(config, message.channelId);

        if (!channel) {
            return { ok: false, error: t("errorChannelNotFound") };
        }

        const destination = createDestinationSender(config, { type: DestinationRefType.CHANNEL, channelId: channel.id });

        if (!destination) {
            return { ok: false, error: t("errorDestinationNotSupported") };
        }

        return destination.sendTestMessage();
    }

    if (message.type === RuntimeMessageType.SEND_POST) {
        return handleSendPost(message, sender);
    }

    return {
        ok: false,
        error: t("errorUnsupportedMessageType", String((message as { type?: string }).type ?? ""))
    };
}

/** Bot channel photos, cached for the worker lifetime (keyed by bot token and chat id). */
const channelPhotoCache = new Map<string, Promise<string | null>>();

function loadChannelPhoto(botToken: string, chatId: string): Promise<string | null> {
    const key = `${botToken}\n${chatId}`;
    let pending = channelPhotoCache.get(key);

    if (!pending) {
        pending = fetchBotChatPhoto(botToken, chatId);
        channelPhotoCache.set(key, pending);
    }

    return pending;
}
