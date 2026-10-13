import { t } from "../i18n/I18n";
import {
    DestinationProvider,
    SendConnectionType,
    type ExtensionConfig,
    type SendConnection,
    type TelegramAccountConnection,
    type TelegramBotConnection
} from "../types/Config";
import { DestinationRefType, type DestinationRef } from "../types/DestinationRef";

/** Id given to the bot of a pre-v4 config, so every context migrates to the same id. */
export const LegacyBotConnectionId = "telegram-bot";

/** Id given to the account of a pre-v4 config; its session keeps the original database. */
export const LegacyAccountConnectionId = "telegram-account";

const CONNECTION_ID_PATTERN = /^[a-z0-9-]{1,64}$/i;

/**
 * True for ids safe to use as storage keys and port name suffixes.
 */
export function isValidConnectionId(value: unknown): value is string {
    return typeof value === "string" && CONNECTION_ID_PATTERN.test(value);
}

/**
 * Creates a new random connection id.
 */
export function createConnectionId(): string {
    return crypto.randomUUID();
}

/**
 * Finds a connection by id.
 */
export function findConnection(config: ExtensionConfig, connectionId: string): SendConnection | undefined {
    return config.connections.find((connection) => connection.id === connectionId);
}

/**
 * Finds a bot connection by id.
 */
export function findBotConnection(config: ExtensionConfig, connectionId: string): TelegramBotConnection | undefined {
    const connection = findConnection(config, connectionId);

    return connection?.type === SendConnectionType.TELEGRAM_BOT ? connection : undefined;
}

/**
 * Finds an account connection by id.
 */
export function findAccountConnection(config: ExtensionConfig, connectionId: string): TelegramAccountConnection | undefined {
    const connection = findConnection(config, connectionId);

    return connection?.type === SendConnectionType.TELEGRAM_ACCOUNT ? connection : undefined;
}

/**
 * Every Telegram account connected on this device, in list order.
 */
export function getAccountConnections(config: ExtensionConfig): TelegramAccountConnection[] {
    return config.connections.filter((connection): connection is TelegramAccountConnection => connection.type === SendConnectionType.TELEGRAM_ACCOUNT);
}

/**
 * Every bot connection, in list order.
 */
export function getBotConnections(config: ExtensionConfig): TelegramBotConnection[] {
    return config.connections.filter((connection): connection is TelegramBotConnection => connection.type === SendConnectionType.TELEGRAM_BOT);
}

/**
 * Name shown for a connection: "@bot_username" or the account name.
 */
export function formatConnectionName(connection: SendConnection): string {
    if (connection.type === SendConnectionType.TELEGRAM_BOT) {
        return connection.username ? `@${connection.username}` : t("connectionUnnamedBot");
    }

    return connection.displayName || t("connectionUnnamedAccount");
}

/**
 * Returns the config with the connection added at the end, or replaced in place.
 */
export function withConnection(config: ExtensionConfig, connection: SendConnection): ExtensionConfig {
    const exists = config.connections.some((entry) => entry.id === connection.id);

    return {
        ...config,
        connections: exists
            ? config.connections.map((entry) => entry.id === connection.id ? connection : entry)
            : [...config.connections, connection]
    };
}

/**
 * Returns the config without the connection, its bot destinations, its recents and its pins.
 */
export function withoutConnection(config: ExtensionConfig, connectionId: string): ExtensionConfig {
    const channels = config.channels.filter((channel) => channel.provider !== DestinationProvider.TELEGRAM || channel.connectionId !== connectionId);
    const channelIds = new Set(channels.map((channel) => channel.id));
    const keep = (ref: DestinationRef): boolean => ref.type === DestinationRefType.CHANNEL
        ? channelIds.has(ref.channelId)
        : ref.connectionId !== connectionId;

    return {
        ...config,
        connections: config.connections.filter((connection) => connection.id !== connectionId),
        channels,
        recentDestinations: config.recentDestinations.filter((recent) => keep(recent.ref)),
        pinnedDestinations: config.pinnedDestinations.filter(keep)
    };
}
