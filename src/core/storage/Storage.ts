import type { ExtensionConfig, TelegramChannel } from "../types/Config";
import { DefaultExtensionConfig } from "../types/Config";
import { isExtensionContextError, isExtensionContextValid } from "../extension";

const STORAGE_KEY = "xToTelegramConfig";

/**
 * Loads extension configuration from chrome.storage.sync.
 */
export async function loadConfig(): Promise<ExtensionConfig> {
    if (!isExtensionContextValid()) {
        return { ...DefaultExtensionConfig };
    }

    try {
        const result = await chrome.storage.sync.get(STORAGE_KEY);
        const stored = result[STORAGE_KEY] as ExtensionConfig | undefined;

        if (!stored) {
            return { ...DefaultExtensionConfig };
        }

        return {
            botToken: stored.botToken ?? "",
            channels: Array.isArray(stored.channels) ? stored.channels : [],
            lastUsedChannelId: stored.lastUsedChannelId
        };
    } catch (err) {
        if (isExtensionContextError(err)) {
            return { ...DefaultExtensionConfig };
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
 * Returns true when the bot token and at least one valid channel exist.
 */
export function isConfigReady(config: ExtensionConfig): boolean {
    if (!config.botToken.trim()) {
        return false;
    }

    return config.channels.some((channel) => isChannelValid(channel));
}

/**
 * Validates a channel entry.
 */
export function isChannelValid(channel: TelegramChannel): boolean {
    return Boolean(channel.label.trim() && channel.chatId.trim());
}

/**
 * Sorts channels for the picker, placing last used first.
 */
export function sortChannelsForPicker(
    channels: TelegramChannel[],
    lastUsedChannelId?: string
): TelegramChannel[] {
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
 * Creates a new empty channel with a unique id.
 */
export function createEmptyChannel(): TelegramChannel {
    return {
        id: crypto.randomUUID(),
        label: "",
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
): TelegramChannel | undefined {
    return config.channels.find((channel) => channel.id === channelId);
}
