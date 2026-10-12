import { handleSendPost } from "./handlers/SendPostHandler";
import { createDestinationSender } from "../core/destinations";
import { t } from "../core/i18n/I18n";
import { findChannelById, loadConfig } from "../core/storage/Storage";
import { TelegramClient } from "../core/telegram/TelegramClient";
import {
    RuntimeMessageType,
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
                error: err instanceof Error ? err.message : t("errorInternal")
            } satisfies SendResult);
        });

    return true;
});

async function handleMessage(
    message: RuntimeMessage,
    sender: chrome.runtime.MessageSender
): Promise<SendResult | DiscoverChannelsResponse> {
    const config = await loadConfig();
    const client = new TelegramClient(config.providers.telegram.botToken);

    if (message.type === RuntimeMessageType.GET_BOT_INFO) {
        return client.getMe();
    }

    if (message.type === RuntimeMessageType.DISCOVER_CHANNELS) {
        return client.discoverChannels();
    }

    if (message.type === RuntimeMessageType.TEST_CHANNEL) {
        const channel = findChannelById(config, message.channelId);

        if (!channel) {
            return { ok: false, error: t("errorChannelNotFound") };
        }

        const destination = createDestinationSender(config, channel);

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
