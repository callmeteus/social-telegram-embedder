import {
    DestinationProvider,
    createDefaultExtensionConfig,
    type DestinationChannel,
    type ExtensionConfig,
    type TelegramAccountConnection,
    type TelegramDestinationChannel
} from "../types/Config";
import {
    DestinationRefType,
    MaxPinnedDestinations,
    MaxRecentDestinations,
    getDestinationRefKey,
    type DestinationRef,
    type RecentDestination
} from "../types/DestinationRef";
import { migrateConfig } from "./ConfigMigrations";
import { findBotConnection, getAccountConnections, withConnection, withoutConnection } from "./Connections";
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
 * Returns true when a Telegram account is connected or at least one channel is ready.
 */
export function isConfigReady(config: ExtensionConfig): boolean {
    return getAccountConnections(config).length > 0
        || config.channels.some((channel) => isChannelReady(config, channel));
}

/**
 * Returns true when a channel is valid and its bot (for Telegram channels) has a token.
 */
export function isChannelReady(config: ExtensionConfig, channel: DestinationChannel): boolean {
    if (!isChannelValid(channel)) {
        return false;
    }

    if (channel.provider === DestinationProvider.TELEGRAM) {
        return Boolean(findBotConnection(config, channel.connectionId)?.botToken.trim());
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
 * Sorts valid channels for the picker, most recently used first.
 */
export function sortChannelsForPicker(
    channels: DestinationChannel[],
    recentDestinations: RecentDestination[] = []
): DestinationChannel[] {
    const valid = channels.filter(isChannelValid);
    const recentRank = new Map<string, number>();

    recentDestinations.forEach((recent, index) => {
        if (recent.ref.type === DestinationRefType.CHANNEL) {
            recentRank.set(recent.ref.channelId, index);
        }
    });

    return valid
        .map((channel, index) => ({ channel, index }))
        .sort((left, right) => {
            const leftRank = recentRank.get(left.channel.id) ?? Number.MAX_SAFE_INTEGER;
            const rightRank = recentRank.get(right.channel.id) ?? Number.MAX_SAFE_INTEGER;

            return leftRank - rightRank || left.index - right.index;
        })
        .map(({ channel }) => channel);
}

/**
 * Creates a new empty Telegram channel for a bot, with a unique id.
 */
export function createEmptyTelegramChannel(connectionId: string): TelegramDestinationChannel {
    return {
        id: crypto.randomUUID(),
        label: "",
        provider: DestinationProvider.TELEGRAM,
        chatId: "",
        connectionId
    };
}

/**
 * Returns recents with the given refs moved to the front (first ref newest), deduped and capped.
 */
export function mergeRecentDestinations(
    current: RecentDestination[],
    refs: DestinationRef[],
    now: number = Date.now()
): RecentDestination[] {
    const fresh = refs.map((ref) => ({ ref, usedAt: now }));
    const seen = new Set<string>();
    const merged: RecentDestination[] = [];

    for (const recent of [...fresh, ...current]) {
        const key = getDestinationRefKey(recent.ref);

        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        merged.push(recent);
    }

    return merged.slice(0, MaxRecentDestinations);
}

/**
 * Records successful destinations as the most recently used ones.
 */
export async function recordRecentDestinations(refs: DestinationRef[]): Promise<void> {
    if (refs.length === 0) {
        return;
    }

    const config = await loadConfig();

    await saveConfig({
        ...config,
        recentDestinations: mergeRecentDestinations(config.recentDestinations, refs)
    });
}

/**
 * Returns the pins with the ref removed when already pinned, otherwise appended (capped).
 */
export function togglePinnedRef(current: DestinationRef[], ref: DestinationRef): DestinationRef[] {
    const key = getDestinationRefKey(ref);
    const without = current.filter((pinned) => getDestinationRefKey(pinned) !== key);

    if (without.length !== current.length) {
        return without;
    }

    return current.length >= MaxPinnedDestinations ? current : [...current, ref];
}

/**
 * Returns the pins with `fromKey` moved into the slot of `toKey`, or the same list when either is missing.
 */
export function movePinnedRef(current: DestinationRef[], fromKey: string, toKey: string): DestinationRef[] {
    const from = current.findIndex((ref) => getDestinationRefKey(ref) === fromKey);
    const to = current.findIndex((ref) => getDestinationRefKey(ref) === toKey);

    if (from === -1 || to === -1 || from === to) {
        return current;
    }

    const next = [...current];
    const [moved] = next.splice(from, 1);

    next.splice(to, 0, moved);
    return next;
}

/**
 * Saves the pinned destinations in the given order.
 */
export async function savePinnedDestinations(pinnedDestinations: DestinationRef[]): Promise<void> {
    await saveConfig({ ...await loadConfig(), pinnedDestinations });
    console.debug("[storage] pinned destinations reordered: %d", pinnedDestinations.length);
}

/**
 * Pins a destination to the top of the picker, or unpins it; returns the saved pins.
 */
export async function togglePinnedDestination(ref: DestinationRef): Promise<DestinationRef[]> {
    const config = await loadConfig();
    const pinnedDestinations = togglePinnedRef(config.pinnedDestinations, ref);

    await saveConfig({ ...config, pinnedDestinations });
    console.debug("[storage] pinned destinations: %d", pinnedDestinations.length);
    return pinnedDestinations;
}

/**
 * Adds or updates a connected Telegram account in the list.
 */
export async function saveAccountConnection(connection: TelegramAccountConnection): Promise<void> {
    await saveConfig(withConnection(await loadConfig(), connection));
}

/**
 * Removes a connection with its bot destinations and recents.
 */
export async function removeConnection(connectionId: string): Promise<void> {
    await saveConfig(withoutConnection(await loadConfig(), connectionId));
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
