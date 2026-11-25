import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig, saveAccountConnection } from "../src/core/storage/Storage";
import { createDefaultExtensionConfig, SendConnectionType, type ExtensionConfig } from "../src/core/types/Config";

const OptionsMarkup = readFileSync(resolve(__dirname, "../src/options/OptionsPage.html"), "utf8");

type StorageChanges = Record<string, { newValue?: unknown }>;
type StorageListener = (changes: StorageChanges, area: string) => void;

let store: Record<string, unknown>;
let emitChanges: boolean;
const storageListeners = new Set<StorageListener>();

function installStorage(config: ExtensionConfig): void {
    store = { xToTelegramConfig: config };
    emitChanges = true;
    storageListeners.clear();

    (globalThis.chrome as unknown as { storage: unknown }).storage = {
        sync: {
            get: vi.fn(async (key: string) => ({ [key]: store[key] })),
            set: vi.fn(async (items: Record<string, unknown>) => {
                const changes = Object.fromEntries(Object.entries(items).map(([key, value]) => [key, { newValue: value }]));

                Object.assign(store, items);

                if (emitChanges) {
                    for (const listener of storageListeners) {
                        listener(changes, "sync");
                    }
                }
            })
        },
        onChanged: {
            addListener: (listener: StorageListener) => storageListeners.add(listener)
        }
    };
}

beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = OptionsMarkup;
    history.replaceState(null, "", "/options.html");
    Object.defineProperty(window, "scrollTo", { configurable: true, value: vi.fn() });

    const config = createDefaultExtensionConfig();

    config.connections = [{
        id: "bot",
        type: SendConnectionType.TELEGRAM_BOT,
        botToken: "123:abc",
        username: "news_bot"
    }];
    installStorage(config);
});

afterEach(() => {
    delete (globalThis.chrome as unknown as { storage?: unknown }).storage;
    vi.restoreAllMocks();
});

describe("options preferences", () => {
    it("keeps an account saved by another context while the preference change is pending", async () => {
        await import("../src/options/OptionsPage");
        await vi.waitFor(() => expect(document.querySelectorAll(".connection-row")).toHaveLength(1));

        emitChanges = false;
        await saveAccountConnection({
            id: "account",
            type: SendConnectionType.TELEGRAM_ACCOUNT,
            displayName: "Gio",
            accountId: 7
        });

        document.getElementById("hide-recent-chats")?.click();

        await vi.waitFor(() => expect((store.xToTelegramConfig as ExtensionConfig).hideRecentChats).toBe(true));
        expect((await loadConfig()).connections).toEqual([
            {
                id: "bot",
                type: SendConnectionType.TELEGRAM_BOT,
                botToken: "123:abc",
                username: "news_bot"
            },
            {
                id: "account",
                type: SendConnectionType.TELEGRAM_ACCOUNT,
                displayName: "Gio",
                accountId: 7
            }
        ]);
    });
});
