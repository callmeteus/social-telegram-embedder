import { describe, expect, it, vi } from "vitest";
import { recoverAccountConnections, type AccountRecoveryDeps } from "../src/background/telegram-user/AccountRecovery";
import { TelegramUserDatabaseName } from "../src/background/telegram-user/MtcuteTelegramUserClient";
import { LegacyAccountConnectionId, withConnection } from "../src/core/storage/Connections";
import { createDefaultExtensionConfig, SendConnectionType, type ExtensionConfig, type TelegramAccountConnection } from "../src/core/types/Config";
import { createFakeTelegramUserClient, type FakeTelegramUserClient } from "./helpers/FakeTelegramUserClient";

const Credentials = {
    apiId: 123,
    apiHash: "0123456789abcdef0123456789abcdef"
};
const Bot = {
    id: "bot",
    type: SendConnectionType.TELEGRAM_BOT,
    botToken: "123:abc",
    username: "news_bot"
} as const;

function createDeps(
    config: ExtensionConfig,
    databaseNames: string[],
    client: FakeTelegramUserClient,
    cachedConnectionIds: string[] = []
): AccountRecoveryDeps & { saved: () => ExtensionConfig; createClient: ReturnType<typeof vi.fn> } {
    let stored = config;
    const createClient = vi.fn(() => client);

    return {
        loadConfig: async () => stored,
        loadCredentials: async () => Credentials,
        listDatabaseNames: async () => databaseNames,
        listCachedConnectionIds: async () => cachedConnectionIds,
        createClient,
        saveAccountConnection: async (connection: TelegramAccountConnection) => {
            stored = withConnection(stored, connection);
        },
        saved: () => stored
    };
}

describe("recoverAccountConnections", () => {
    it("restores a missing account entry when the existing local session is authorized", async () => {
        const config = createDefaultExtensionConfig();

        config.connections = [Bot];
        const deps = createDeps(config, [TelegramUserDatabaseName], createFakeTelegramUserClient());

        const recovered = await recoverAccountConnections(deps);

        expect(recovered).toEqual([{
            id: LegacyAccountConnectionId,
            type: SendConnectionType.TELEGRAM_ACCOUNT,
            displayName: "Gio",
            accountId: 777
        }]);
        expect(deps.saved().connections).toEqual([Bot, recovered[0]]);
        expect(deps.createClient).toHaveBeenCalledWith(Credentials, TelegramUserDatabaseName);
    });

    it("restores an account entry from its local chat cache when server verification is unavailable", async () => {
        const config = createDefaultExtensionConfig();

        config.connections = [Bot];
        const deps = createDeps(config, [], createFakeTelegramUserClient(), ["cached-account"]);

        expect(await recoverAccountConnections(deps)).toEqual([{
            id: "cached-account",
            type: SendConnectionType.TELEGRAM_ACCOUNT,
            displayName: ""
        }]);
        expect(deps.saved().connections).toEqual([
            Bot,
            {
                id: "cached-account",
                type: SendConnectionType.TELEGRAM_ACCOUNT,
                displayName: ""
            }
        ]);
        expect(deps.createClient).not.toHaveBeenCalled();
    });

    it("does not restore an empty or logged-out local database", async () => {
        const config = createDefaultExtensionConfig();

        config.connections = [Bot];
        const client = createFakeTelegramUserClient();

        client.getAuthorizedAccount.mockResolvedValue(null);
        const deps = createDeps(config, [TelegramUserDatabaseName], client);

        expect(await recoverAccountConnections(deps)).toEqual([]);
        expect(deps.saved().connections).toEqual([Bot]);
    });

    it("does not add the same Telegram account under a second connection", async () => {
        const config = createDefaultExtensionConfig();

        config.connections = [
            Bot,
            {
                id: "other-account",
                type: SendConnectionType.TELEGRAM_ACCOUNT,
                displayName: "Gio",
                accountId: 777
            }
        ];
        const deps = createDeps(config, [TelegramUserDatabaseName], createFakeTelegramUserClient());

        expect(await recoverAccountConnections(deps)).toEqual([]);
        expect(deps.saved().connections).toEqual(config.connections);
    });

    it("leaves an account that is already listed alone", async () => {
        const config = createDefaultExtensionConfig();

        config.connections = [
            Bot,
            {
                id: LegacyAccountConnectionId,
                type: SendConnectionType.TELEGRAM_ACCOUNT,
                displayName: "Gio",
                accountId: 777
            }
        ];
        const deps = createDeps(config, [TelegramUserDatabaseName], createFakeTelegramUserClient());

        expect(await recoverAccountConnections(deps)).toEqual([]);
        expect(deps.createClient).not.toHaveBeenCalled();
    });

    it("continues after a broken session and recovers the next valid account", async () => {
        const config = createDefaultExtensionConfig();

        config.connections = [Bot];
        const brokenClient = createFakeTelegramUserClient();
        const validClient = createFakeTelegramUserClient();

        brokenClient.connect.mockRejectedValue(new Error("session revoked"));
        const deps = createDeps(config, [TelegramUserDatabaseName, `${TelegramUserDatabaseName}-second-account`], brokenClient);

        deps.createClient.mockReturnValueOnce(brokenClient).mockReturnValueOnce(validClient);

        expect(await recoverAccountConnections(deps)).toEqual([{
            id: "second-account",
            type: SendConnectionType.TELEGRAM_ACCOUNT,
            displayName: "Gio",
            accountId: 777
        }]);
        expect(deps.saved().connections).toHaveLength(2);
    });
});
