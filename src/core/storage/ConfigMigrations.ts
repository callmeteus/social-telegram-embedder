import {
    CurrentConfigVersion,
    DestinationProvider,
    createDefaultExtensionConfig,
    type DestinationChannel,
    type ExtensionConfig
} from "../types/Config";

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

/** Migration from key version to key + 1. Append new steps here when the schema changes. */
const Migrations: Record<number, ConfigMigration> = {
    1: migrateV1ToV2
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
 * Coerces a current-version raw object into a well-formed config, dropping unknown providers.
 */
function sanitizeConfig(raw: RawConfig): ExtensionConfig {
    const defaults = createDefaultExtensionConfig();
    const providers = isRecord(raw.providers) ? raw.providers : {};
    const telegram = isRecord(providers.telegram) ? providers.telegram : {};
    const rawChannels = Array.isArray(raw.channels) ? raw.channels : [];

    return {
        ...defaults,

        providers: {
            telegram: {
                botToken: asString(telegram.botToken)
            }
        },

        channels: rawChannels
            .map(sanitizeChannel)
            .filter((channel): channel is DestinationChannel => channel !== null),

        lastUsedChannelId: typeof raw.lastUsedChannelId === "string" ? raw.lastUsedChannelId : undefined
    };
}

function sanitizeChannel(raw: unknown): DestinationChannel | null {
    if (!isRecord(raw)) {
        return null;
    }

    const id = asString(raw.id) || crypto.randomUUID();
    const label = asString(raw.label);

    if (raw.provider === DestinationProvider.TELEGRAM) {
        return { id, label, provider: DestinationProvider.TELEGRAM, chatId: asString(raw.chatId) };
    } else
    if (raw.provider === DestinationProvider.DISCORD) {
        return { id, label, provider: DestinationProvider.DISCORD, webhookUrl: asString(raw.webhookUrl) };
    }

    console.debug("[storage] dropping channel with unknown provider: %o", raw.provider);
    return null;
}

function isRecord(value: unknown): value is RawConfig {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
    return typeof value === "string" ? value : "";
}
