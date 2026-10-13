import { vi } from "vitest";
import {
    TelegramUserSession,
    type TelegramUserAccountCache
} from "../../src/background/telegram-user/TelegramUserSession";
import type { TelegramApiCredentials } from "../../src/core/telegram-user/Credentials";
import { createFakeTelegramUserClient, type FakeTelegramUserClient } from "./FakeTelegramUserClient";

export const SampleCredentials: TelegramApiCredentials = { apiId: 123, apiHash: "0123456789abcdef0123456789abcdef" };

/** A real session wired to a mock client and in-memory storage. */
export interface SessionHarness {
    session: TelegramUserSession;
    client: FakeTelegramUserClient;
    createClient: ReturnType<typeof vi.fn>;
    saveCredentials: ReturnType<typeof vi.fn>;
    wipeSessionStorage: ReturnType<typeof vi.fn>;
    cache: TelegramUserAccountCache;
}

/**
 * Builds a session; by default credentials exist and nobody is logged in.
 */
export function createSessionHarness(
    options: {
        credentials?: TelegramApiCredentials | null;
        loggedIn?: boolean;
        idleTimeoutMs?: number;
        connectionId?: string;
        /** Telegram account ids already connected on other connections. */
        connectedElsewhere?: number[];
    } = {}
): SessionHarness {
    const client = createFakeTelegramUserClient();
    const cache: TelegramUserAccountCache = { enabled: options.loggedIn ?? false, displayName: options.loggedIn ? "Gio" : "" };
    const createClient = vi.fn(() => client);
    const saveCredentials = vi.fn(async () => {});
    const wipeSessionStorage = vi.fn(async () => {});
    const session = new TelegramUserSession({
        connectionId: options.connectionId ?? "acc",
        isAccountConnectedElsewhere: async (accountId) => options.connectedElsewhere?.includes(accountId) ?? false,
        createClient,
        loadCredentials: async () => (options.credentials === undefined ? SampleCredentials : options.credentials),
        saveCredentials,
        wipeSessionStorage,
        loadAccountCache: async () => ({ ...cache }),
        saveAccountCache: async (next) => {
            Object.assign(cache, next);
        },
        idleTimeoutMs: options.idleTimeoutMs
    });

    return { session, client, createClient, saveCredentials, wipeSessionStorage, cache };
}
