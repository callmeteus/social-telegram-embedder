import { getTelegramUserDatabaseName, MtcuteTelegramUserClient, wipeTelegramUserDatabase } from "./MtcuteTelegramUserClient";
import { TelegramUserSession } from "./TelegramUserSession";
import { TelegramUserSessionRegistry } from "./TelegramUserSessionRegistry";
import { findAccountConnection, getAccountConnections } from "../../core/storage/Connections";
import { loadConfig, removeConnection, saveAccountConnection } from "../../core/storage/Storage";
import { loadTelegramApiCredentials, saveTelegramApiCredentials } from "../../core/telegram-user/Credentials";
import { clearCachedDialogs } from "../../core/telegram-user/DialogsCache";
import { SendConnectionType } from "../../core/types/Config";

export { routeTelegramUserPort } from "./PortRouter";
export { TelegramUserSession, TelegramUserSessionError } from "./TelegramUserSession";
export { TelegramUserSessionRegistry } from "./TelegramUserSessionRegistry";

/**
 * Builds the session of one account connection. The app credentials are shared by every
 * account; the login, the chat cache and the list entry belong to the connection.
 */
function createTelegramUserSession(connectionId: string): TelegramUserSession {
    const databaseName = getTelegramUserDatabaseName(connectionId);

    return new TelegramUserSession({
        connectionId,
        createClient: (credentials) => new MtcuteTelegramUserClient(credentials, databaseName),
        loadCredentials: loadTelegramApiCredentials,
        saveCredentials: saveTelegramApiCredentials,

        async wipeSessionStorage() {
            await Promise.all([wipeTelegramUserDatabase(databaseName), clearCachedDialogs(connectionId)]);
        },

        async loadAccountCache() {
            const connection = findAccountConnection(await loadConfig(), connectionId);

            return connection
                ? { enabled: true, displayName: connection.displayName, accountId: connection.accountId }
                : { enabled: false, displayName: "" };
        },

        async saveAccountCache(cache) {
            if (!cache.enabled) {
                await removeConnection(connectionId);
                return;
            }

            await saveAccountConnection({
                id: connectionId,
                type: SendConnectionType.TELEGRAM_ACCOUNT,
                displayName: cache.displayName,
                accountId: cache.accountId
            });
        },

        async isAccountConnectedElsewhere(accountId) {
            return getAccountConnections(await loadConfig())
                .some((connection) => connection.id !== connectionId && connection.accountId === accountId);
        }
    });
}

/** Every Telegram account session of the background, one per account connection. */
export const telegramUserSessions = new TelegramUserSessionRegistry(createTelegramUserSession);
