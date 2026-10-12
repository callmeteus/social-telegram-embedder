/** Messaging services that can receive posts. */
export enum DestinationProvider {
    TELEGRAM = "TELEGRAM",
    DISCORD = "DISCORD"
}

/** Fields shared by every destination channel, regardless of provider. */
interface BaseDestinationChannel {
    id: string;
    label: string;
}

/** A Telegram channel or chat configured by the user. */
export interface TelegramDestinationChannel extends BaseDestinationChannel {
    provider: DestinationProvider.TELEGRAM;
    chatId: string;
}

/** A Discord channel reached through an incoming webhook. */
export interface DiscordDestinationChannel extends BaseDestinationChannel {
    provider: DestinationProvider.DISCORD;
    webhookUrl: string;
}

/** Any destination channel, discriminated by `provider`. */
export type DestinationChannel = TelegramDestinationChannel | DiscordDestinationChannel;

/** Telegram credentials shared by all Telegram channels. */
export interface TelegramProviderConfig {
    botToken: string;
}

/** Per-provider credentials. Discord needs none because each channel carries its own webhook. */
export interface ProvidersConfig {
    telegram: TelegramProviderConfig;
}

/** Current schema version of the persisted configuration. */
export const CurrentConfigVersion = 2;

/** Extension settings persisted in chrome.storage.sync. */
export interface ExtensionConfig {
    version: number;
    providers: ProvidersConfig;
    channels: DestinationChannel[];
    lastUsedChannelId?: string;
}

/**
 * Builds a fresh default configuration (new object every call, safe to mutate).
 */
export function createDefaultExtensionConfig(): ExtensionConfig {
    return {
        version: CurrentConfigVersion,

        providers: {
            telegram: {
                botToken: ""
            }
        },

        channels: []
    };
}
