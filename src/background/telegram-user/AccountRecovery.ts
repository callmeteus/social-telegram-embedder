import { isValidConnectionId, LegacyAccountConnectionId } from "../../core/storage/Connections";
import { loadConfig, saveAccountConnection } from "../../core/storage/Storage";
import { storage } from "../../core/extension/BrowserApi";
import { loadTelegramApiCredentials, type TelegramApiCredentials } from "../../core/telegram-user/Credentials";
import type { TelegramUserClient } from "../../core/telegram-user/TelegramUserClient";
import {
    SendConnectionType,
    type ExtensionConfig,
    type TelegramAccountConnection
} from "../../core/types/Config";
import {
    MtcuteTelegramUserClient,
    TelegramUserDatabaseName
} from "./MtcuteTelegramUserClient";

/** Side effects used to restore account list entries from existing local sessions. */
export interface AccountRecoveryDeps {
    loadConfig(): Promise<ExtensionConfig>;
    loadCredentials(): Promise<TelegramApiCredentials | null>;
    listDatabaseNames(): Promise<string[]>;
    listCachedConnectionIds(): Promise<string[]>;
    createClient(credentials: TelegramApiCredentials, databaseName: string): Pick<TelegramUserClient, "connect" | "getAuthorizedAccount" | "destroy">;
    saveAccountConnection(connection: TelegramAccountConnection): Promise<void>;
}

const defaultDeps: AccountRecoveryDeps = {
    loadConfig,
    loadCredentials: loadTelegramApiCredentials,
    listDatabaseNames: listTelegramDatabaseNames,
    listCachedConnectionIds: listCachedAccountConnectionIds,
    createClient: (credentials, databaseName) => new MtcuteTelegramUserClient(credentials, databaseName),
    saveAccountConnection
};

let pendingRecovery: Promise<TelegramAccountConnection[]> | null = null;

/**
 * Restores list entries for Telegram sessions that still exist locally after a config overwrite.
 * Cached sessions are restored first; an uncached database requires Telegram confirmation.
 */
export async function recoverAccountConnections(deps: AccountRecoveryDeps = defaultDeps): Promise<TelegramAccountConnection[]> {
    const credentials = await deps.loadCredentials();

    if (!credentials) {
        return [];
    }

    const config = await deps.loadConfig();
    const databaseNames = await deps.listDatabaseNames();
    const cachedConnectionIds = await deps.listCachedConnectionIds();
    const recovered: TelegramAccountConnection[] = [];

    for (const connectionId of cachedConnectionIds) {
        if (!isValidConnectionId(connectionId) || config.connections.some((connection) => connection.id === connectionId)) {
            continue;
        }

        const connection: TelegramAccountConnection = {
            id: connectionId,
            type: SendConnectionType.TELEGRAM_ACCOUNT,
            displayName: ""
        };

        await deps.saveAccountConnection(connection);
        recovered.push(connection);
        config.connections.push(connection);
        console.debug("[telegram-user] recovered cached account connection %s", connectionId);
    }

    for (const databaseName of databaseNames) {
        const connectionId = getConnectionIdFromDatabaseName(databaseName);

        if (!connectionId || config.connections.some((connection) => connection.id === connectionId)) {
            continue;
        }

        const client = deps.createClient(credentials, databaseName);

        try {
            await client.connect();
            const account = await client.getAuthorizedAccount();

            if (!account) {
                continue;
            }

            const latestConfig = await deps.loadConfig();

            if (latestConfig.connections.some((connection) => connection.id === connectionId)
                || latestConfig.connections.some((connection) => connection.type === SendConnectionType.TELEGRAM_ACCOUNT
                    && connection.accountId === account.id)) {
                continue;
            }

            const connection: TelegramAccountConnection = {
                id: connectionId,
                type: SendConnectionType.TELEGRAM_ACCOUNT,
                displayName: account.displayName,
                accountId: account.id
            };

            await deps.saveAccountConnection(connection);
            recovered.push(connection);
            console.debug("[telegram-user] recovered account connection %s", connectionId);
        } catch (err) {
            console.debug("[telegram-user] could not recover account connection %s: %O", connectionId, err);
        } finally {
            await client.destroy().catch((err: unknown) => {
                console.debug("[telegram-user] recovery client cleanup failed for %s: %O", connectionId, err);
            });
        }
    }

    return recovered;
}

/** Runs one recovery pass per worker lifetime, shared by startup and update hooks. */
export function recoverTelegramAccountConnections(): Promise<TelegramAccountConnection[]> {
    pendingRecovery ??= recoverAccountConnections()
        .catch((err: unknown) => {
            console.debug("[telegram-user] account recovery failed: %O", err);
            return [];
        })
        .finally(() => {
            pendingRecovery = null;
        });

    return pendingRecovery;
}

function getConnectionIdFromDatabaseName(databaseName: string): string | null {
    if (databaseName === TelegramUserDatabaseName) {
        return LegacyAccountConnectionId;
    }

    const prefix = `${TelegramUserDatabaseName}-`;

    if (!databaseName.startsWith(prefix)) {
        return null;
    }

    const connectionId = databaseName.slice(prefix.length);

    return isValidConnectionId(connectionId) ? connectionId : null;
}

async function listTelegramDatabaseNames(): Promise<string[]> {
    if (typeof indexedDB.databases !== "function") {
        return [TelegramUserDatabaseName];
    }

    const databases = await indexedDB.databases();

    return databases.map((database) => database.name).filter((name) => name !== undefined);
}

async function listCachedAccountConnectionIds(): Promise<string[]> {
    const stored = await storage.local.get(null);
    const prefix = "telegramUserDialogsCache:";

    return Object.keys(stored)
        .filter((key) => key.startsWith(prefix))
        .map((key) => key.slice(prefix.length))
        .filter(isValidConnectionId);
}
