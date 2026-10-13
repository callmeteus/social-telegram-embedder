import type { DestinationSender } from "./DestinationSender";
import { TelegramDestinationSender } from "./TelegramDestinationSender";
import { TelegramUserDestinationSender } from "./TelegramUserDestinationSender";
import { findBotConnection } from "../storage/Connections";
import { findChannelById } from "../storage/Storage";
import { TelegramClient } from "../telegram/TelegramClient";
import type { TelegramUserMessenger } from "../telegram-user/TelegramUserClient";
import { DestinationProvider, type ExtensionConfig } from "../types/Config";
import { DestinationRefType, type DestinationRef } from "../types/DestinationRef";

/**
 * Builds the sender for a destination, or null when it cannot be served
 * (unknown channel or bot, provider without a sender yet, or no connected Telegram account).
 */
export function createDestinationSender(
    config: ExtensionConfig,
    ref: DestinationRef,
    telegramUser: TelegramUserMessenger | null = null
): DestinationSender | null {
    if (ref.type === DestinationRefType.TELEGRAM_PEER) {
        if (!telegramUser) {
            console.debug("[destinations] Telegram account not connected for peer destination");
            return null;
        }

        return new TelegramUserDestinationSender(telegramUser, ref);
    }

    const channel = findChannelById(config, ref.channelId);

    if (channel?.provider === DestinationProvider.TELEGRAM) {
        const bot = findBotConnection(config, channel.connectionId);

        if (!bot) {
            console.debug("[destinations] bot %s of channel %s is gone", channel.connectionId, channel.id);
            return null;
        }

        return new TelegramDestinationSender(new TelegramClient(bot.botToken), channel.chatId);
    }

    console.debug("[destinations] no sender for channel %s (provider %s)", ref.channelId, channel?.provider ?? "missing");
    return null;
}
