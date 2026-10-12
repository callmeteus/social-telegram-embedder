import type { DestinationSender } from "./DestinationSender";
import { TelegramDestinationSender } from "./TelegramDestinationSender";
import { TelegramClient } from "../telegram/TelegramClient";
import { DestinationProvider, type DestinationChannel, type ExtensionConfig } from "../types/Config";

/**
 * Builds the sender for a channel, or null when its provider has no sender implementation yet.
 */
export function createDestinationSender(
    config: ExtensionConfig,
    channel: DestinationChannel
): DestinationSender | null {
    if (channel.provider === DestinationProvider.TELEGRAM) {
        return new TelegramDestinationSender(
            new TelegramClient(config.providers.telegram.botToken),
            channel.chatId
        );
    }

    console.debug("[destinations] no sender implemented for provider %s", channel.provider);
    return null;
}
