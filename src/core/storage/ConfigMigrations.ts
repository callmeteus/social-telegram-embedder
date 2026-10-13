import { isValidConnectionId, LegacyAccountConnectionId, LegacyBotConnectionId } from "./Connections";
import {
    CurrentConfigVersion,
    DestinationProvider,
    SendConnectionType,
    createDefaultExtensionConfig,
    type DestinationChannel,
    type ExtensionConfig,
    type SendConnection
} from "../types/Config";
import {
    DestinationRefType,
    MaxPinnedDestinations,
    MaxRecentDestinations,
    TelegramPeerKind,
    getDestinationRefKey,
    type DestinationRef,
    type RecentDestination
} from "../types/DestinationRef";

/** Raw object read from storage before migration; any version, untrusted shape. */
type RawConfig = Record<string, unknown>;

/** Upgrades a raw config from version N to N + 1. */
type ConfigMigration = (raw: RawConfig) => RawConfig;

/** Result of running migrations on a stored config. */
export interface ConfigMigrationResult {
    config: ExtensionConfig;
    /** True when the stored shape changed and must be persisted again. */
    migrated: boolean;
    fromVersion: number;
}

/**
 * v1 (Telegram only): `{ botToken, channels: [{ id, label, chatId }], lastUsedChannelId }`.
 * v2 (multi-provider): bot token moves to `providers.telegram`, each channel gets a `provider`.
 */
function migrateV1ToV2(raw: RawConfig): RawConfig {
    const legacyChannels = Array.isArray(raw.channels) ? raw.channels.filter(isRecord) : [];

    return {
        version: 2,

        providers: {
            telegram: {
                botToken: asString(raw.botToken)
            }
        },

        channels: legacyChannels.map((channel) => ({
            id: asString(channel.id) || crypto.randomUUID(),
            label: asString(channel.label),
            provider: DestinationProvider.TELEGRAM,
            chatId: asString(channel.chatId)
        })),

        lastUsedChannelId: raw.lastUsedChannelId
    };
}

/**
 * v3 (Telegram user account): adds `providers.telegramUser` and replaces `lastUsedChannelId`
 * with `recentDestinations`, which can also hold live Telegram account chats.
 */
function migrateV2ToV3(raw: RawConfig): RawConfig {
    const { lastUsedChannelId, ...rest } = raw;
    const providers = isRecord(raw.providers) ? raw.providers : {};
    const recentDestinations: RecentDestination[] = typeof lastUsedChannelId === "string" && lastUsedChannelId
        ? [{ ref: { type: DestinationRefType.CHANNEL, channelId: lastUsedChannelId }, usedAt: Date.now() }]
        : [];

    return {
        ...rest,
        version: 3,

        providers: {
            ...providers,
            telegramUser: { enabled: false, displayName: "" }
        },

        recentDestinations
    };
}

/**
 * v4 (multiple bots and accounts): `providers` becomes a `connections` list. The bot token and
 * the logged-in account become connections with fixed ids, bot channels point at the bot, and
 * account recents point at the account.
 */
function migrateV3ToV4(raw: RawConfig): RawConfig {
    const { providers: rawProviders, ...rest } = raw;
    const providers = isRecord(rawProviders) ? rawProviders : {};
    const telegram = isRecord(providers.telegram) ? providers.telegram : {};
    const telegramUser = isRecord(providers.telegramUser) ? providers.telegramUser : {};
    const botToken = asString(telegram.botToken).trim();
    const rawChannels = Array.isArray(raw.channels) ? raw.channels.filter(isRecord) : [];
    const hasBotChannels = rawChannels.some((channel) => channel.provider === DestinationProvider.TELEGRAM);
    const connections: RawConfig[] = [];

    if (botToken || hasBotChannels) {
        connections.push({ id: LegacyBotConnectionId, type: SendConnectionType.TELEGRAM_BOT, botToken, username: "" });
    }

    if (telegramUser.enabled === true) {
        connections.push({ id: LegacyAccountConnectionId, type: SendConnectionType.TELEGRAM_ACCOUNT, displayName: asString(telegramUser.displayName) });
    }

    const recents = Array.isArray(raw.recentDestinations) ? raw.recentDestinations.filter(isRecord) : [];

    return {
        ...rest,
        version: 4,
        connections,

        channels: rawChannels.map((channel) => channel.provider === DestinationProvider.TELEGRAM
            ? { ...channel, connectionId: LegacyBotConnectionId }
            : channel),

        recentDestinations: recents.map((recent) => isRecord(recent.ref) && recent.ref.type === DestinationRefType.TELEGRAM_PEER
            ? { ...recent, ref: { ...recent.ref, connectionId: LegacyAccountConnectionId } }
            : recent)
    };
}

/** Migration from key version to key + 1. Append new steps here when the schema changes. */
const Migrations: Record<number, ConfigMigration> = {
    1: migrateV1ToV2,
    2: migrateV2ToV3,
    3: migrateV3ToV4
};

/**
 * Upgrades a stored config of any known version to the current schema.
 */
export function migrateConfig(stored: unknown): ConfigMigrationResult {
    if (!isRecord(stored)) {
        return {
            config: createDefaultExtensionConfig(),
            migrated: false,
            fromVersion: CurrentConfigVersion
        };
    }

    const fromVersion = typeof stored.version === "number" ? stored.version : 1;
    let raw = stored;
    let version = fromVersion;

    while (version < CurrentConfigVersion) {
        const migration = Migrations[version];

        if (!migration) {
            throw new Error(`[storage] missing config migration from v${version}`);
        }

        console.debug("[storage] migrating config v%d -> v%d", version, version + 1);
        raw = migration(raw);
        version++;
    }

    return {
        config: sanitizeConfig(raw),
        migrated: version !== fromVersion,
        fromVersion
    };
}

/**
 * Coerces a current-version raw object into a well-formed config, dropping unknown providers,
 * malformed connections and anything that points at a connection that no longer exists.
 */
function sanitizeConfig(raw: RawConfig): ExtensionConfig {
    const defaults = createDefaultExtensionConfig();
    const connections = sanitizeConnections(raw.connections);
    const botIds = new Set(connections.filter((connection) => connection.type === SendConnectionType.TELEGRAM_BOT).map((connection) => connection.id));
    const accountIds = new Set(connections.filter((connection) => connection.type === SendConnectionType.TELEGRAM_ACCOUNT).map((connection) => connection.id));
    const rawChannels = Array.isArray(raw.channels) ? raw.channels : [];
    const channels = rawChannels
        .map(sanitizeChannel)
        .filter((channel): channel is DestinationChannel => channel !== null)
        .filter((channel) => channel.provider !== DestinationProvider.TELEGRAM || botIds.has(channel.connectionId));

    return {
        ...defaults,
        connections,
        channels,
        recentDestinations: sanitizeRecentDestinations(raw.recentDestinations, channels, accountIds),
        pinnedDestinations: sanitizePinnedDestinations(raw.pinnedDestinations, channels, accountIds)
    };
}

function sanitizeConnections(raw: unknown): SendConnection[] {
    const list = Array.isArray(raw) ? raw : [];
    const seen = new Set<string>();
    const connections: SendConnection[] = [];

    for (const entry of list) {
        if (!isRecord(entry) || !isValidConnectionId(entry.id) || seen.has(entry.id)) {
            continue;
        }

        if (entry.type === SendConnectionType.TELEGRAM_BOT) {
            connections.push({
                id: entry.id,
                type: SendConnectionType.TELEGRAM_BOT,
                botToken: asString(entry.botToken).trim(),
                username: asString(entry.username).slice(0, 64)
            });
        } else
        if (entry.type === SendConnectionType.TELEGRAM_ACCOUNT) {
            connections.push({
                id: entry.id,
                type: SendConnectionType.TELEGRAM_ACCOUNT,
                displayName: asString(entry.displayName).slice(0, 128),
                accountId: typeof entry.accountId === "number" && Number.isSafeInteger(entry.accountId) ? entry.accountId : undefined
            });
        } else {
            continue;
        }

        seen.add(entry.id);
    }

    return connections;
}

function sanitizeChannel(raw: unknown): DestinationChannel | null {
    if (!isRecord(raw)) {
        return null;
    }

    const id = asString(raw.id) || crypto.randomUUID();
    const label = asString(raw.label);

    if (raw.provider === DestinationProvider.TELEGRAM) {
        return { id, label, provider: DestinationProvider.TELEGRAM, chatId: asString(raw.chatId), connectionId: asString(raw.connectionId) };
    } else
    if (raw.provider === DestinationProvider.DISCORD) {
        return { id, label, provider: DestinationProvider.DISCORD, webhookUrl: asString(raw.webhookUrl) };
    }

    console.debug("[storage] dropping channel with unknown provider: %o", raw.provider);
    return null;
}

/**
 * Keeps well-formed recents pointing at existing channels or valid peers, deduped and capped.
 */
function sanitizeRecentDestinations(raw: unknown, channels: DestinationChannel[], accountIds: Set<string>): RecentDestination[] {
    if (!Array.isArray(raw)) {
        return [];
    }

    const channelIds = new Set(channels.map((channel) => channel.id));
    const seen = new Set<string>();
    const recents: RecentDestination[] = [];

    for (const entry of raw) {
        if (!isRecord(entry)) {
            continue;
        }

        const ref = sanitizeDestinationRef(entry.ref);

        if (!ref || !isReachableRef(ref, channelIds, accountIds)) {
            continue;
        }

        const key = getDestinationRefKey(ref);

        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        recents.push({ ref, usedAt: typeof entry.usedAt === "number" ? entry.usedAt : 0 });

        if (recents.length >= MaxRecentDestinations) {
            break;
        }
    }

    return recents;
}

/**
 * Keeps well-formed pins pointing at existing channels or valid peers, deduped and capped.
 * Pins were added after v4 without a schema bump, so a missing list simply means none.
 */
function sanitizePinnedDestinations(raw: unknown, channels: DestinationChannel[], accountIds: Set<string>): DestinationRef[] {
    if (!Array.isArray(raw)) {
        return [];
    }

    const channelIds = new Set(channels.map((channel) => channel.id));
    const seen = new Set<string>();
    const pins: DestinationRef[] = [];

    for (const entry of raw) {
        const ref = sanitizeDestinationRef(entry);

        if (!ref || !isReachableRef(ref, channelIds, accountIds) || seen.has(getDestinationRefKey(ref))) {
            continue;
        }

        seen.add(getDestinationRefKey(ref));
        pins.push(ref);

        if (pins.length >= MaxPinnedDestinations) {
            break;
        }
    }

    return pins;
}

function isReachableRef(ref: DestinationRef, channelIds: Set<string>, accountIds: Set<string>): boolean {
    return ref.type === DestinationRefType.CHANNEL ? channelIds.has(ref.channelId) : accountIds.has(ref.connectionId);
}

/**
 * Validates an untrusted destination ref (also used for refs arriving in runtime messages).
 */
export function sanitizeDestinationRef(raw: unknown): DestinationRef | null {
    if (!isRecord(raw)) {
        return null;
    }

    if (raw.type === DestinationRefType.CHANNEL) {
        const channelId = asString(raw.channelId);
        return channelId ? { type: DestinationRefType.CHANNEL, channelId } : null;
    }

    if (raw.type === DestinationRefType.TELEGRAM_PEER) {
        const peerId = raw.peerId;
        const kind = Object.values(TelegramPeerKind).find((value) => value === raw.kind);

        if (typeof peerId !== "number" || !Number.isSafeInteger(peerId) || peerId === 0 || !kind || !isValidConnectionId(raw.connectionId)) {
            return null;
        }

        return {
            type: DestinationRefType.TELEGRAM_PEER,
            connectionId: raw.connectionId,
            peerId,
            kind,
            title: asString(raw.title).slice(0, 128)
        };
    }

    return null;
}

function isRecord(value: unknown): value is RawConfig {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
    return typeof value === "string" ? value : "";
}
