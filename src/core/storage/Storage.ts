import {
    DestinationProvider,
    createDefaultExtensionConfig,
    type DestinationChannel,
    type ExtensionConfig,
    type TelegramDestinationChannel
} from "../types/Config";
import { migrateConfig } from "./ConfigMigrations";
import { isExtensionContextError, isExtensionContextValid } from "../extension";

const STORAGE_KEY = "xToTelegramConfig";

/**
 * Loads extension configuration from chrome.storage.sync, upgrading older schemas in place.
 */
export async function loadConfig(): Promise<ExtensionConfig> {
    if (!isExtensionContextValid()) {
        return createDefaultExtensionConfig();
    }

    try {
        const result = await chrome.storage.sync.get(STORAGE_KEY);
        const { config, migrated, fromVersion } = migrateConfig(result[STORAGE_KEY]);

        if (migrated) {
            await saveConfig(config);
            console.debug("[storage] persisted config migrated from v%d to v%d", fromVersion, config.version);
        }

        return config;
    } catch (err) {
        if (isExtensionContextError(err)) {
            return createDefaultExtensionConfig();
        }

        throw err;
    }
}

/**
 * Persists extension configuration to chrome.storage.sync.
 */
export async function saveConfig(config: ExtensionConfig): Promise<void> {
    await chrome.storage.sync.set({
        [STORAGE_KEY]: config
    });
}

/**
 * Returns true when at least one channel is valid and its provider has credentials.
 */
export function isConfigReady(config: ExtensionConfig): boolean {
    return config.channels.some((channel) => isChannelReady(config, channel));
}

/**
 * Returns true when a channel is valid and its provider credentials are filled in.
 */
export function isChannelReady(config: ExtensionConfig, channel: DestinationChannel): boolean {
    if (!isChannelValid(channel)) {
        return false;
    }

    if (channel.provider === DestinationProvider.TELEGRAM) {
        return Boolean(config.providers.telegram.botToken.trim());
    }

    return true;
}

/**
 * Validates a channel entry (label plus the provider-specific target).
 */
export function isChannelValid(channel: DestinationChannel): boolean {
    if (!channel.label.trim()) {
        return false;
    }

    if (channel.provider === DestinationProvider.TELEGRAM) {
        return Boolean(channel.chatId.trim());
    }

    return Boolean(channel.webhookUrl.trim());
}

/**
 * Sorts channels for the picker, placing last used first.
 */
export function sortChannelsForPicker(
    channels: DestinationChannel[],
    lastUsedChannelId?: string
): DestinationChannel[] {
    const valid = channels.filter(isChannelValid);

    if (!lastUsedChannelId) {
        return valid;
    }

    const lastUsed = valid.find((channel) => channel.id === lastUsedChannelId);
    const rest = valid.filter((channel) => channel.id !== lastUsedChannelId);

    if (!lastUsed) {
        return valid;
    }

    return [lastUsed, ...rest];
}

/**
 * Creates a new empty Telegram channel with a unique id.
 */
export function createEmptyTelegramChannel(): TelegramDestinationChannel {
    return {
        id: crypto.randomUUID(),
        label: "",
        provider: DestinationProvider.TELEGRAM,
        chatId: ""
    };
}

/**
 * Updates last used channel id in storage.
 */
export async function setLastUsedChannelId(channelId: string): Promise<void> {
    const config = await loadConfig();

    await saveConfig({
        ...config,
        lastUsedChannelId: channelId
    });
}

/**
 * Finds a channel by id.
 */
export function findChannelById(
    config: ExtensionConfig,
    channelId: string
): DestinationChannel | undefined {
    return config.channels.find((channel) => channel.id === channelId);
}
