import { afterEach, describe, expect, it, vi } from "vitest";
import {
    isConfigReady,
    loadConfig,
    mergeRecentDestinations,
    recordRecentDestinations,
    removeConnection,
    saveAccountConnection,
    movePinnedRef,
    sortChannelsForPicker,
    togglePinnedRef
} from "../src/core/storage/Storage";
import { createDefaultExtensionConfig, DestinationProvider, SendConnectionType } from "../src/core/types/Config";
import { DestinationRefType, MaxPinnedDestinations, MaxRecentDestinations, TelegramPeerKind, type DestinationRef } from "../src/core/types/DestinationRef";

const channel = (channelId: string): DestinationRef => ({ type: DestinationRefType.CHANNEL, channelId });
const peer = (peerId: number, connectionId = "acc"): DestinationRef => ({
    type: DestinationRefType.TELEGRAM_PEER,
    connectionId,
    peerId,
    kind: TelegramPeerKind.USER,
    title: `P${peerId}`
});

function installSyncStorage(initial: Record<string, unknown> = {}): Record<string, unknown> {
    const store = { ...initial };

    (globalThis.chrome as unknown as { storage: unknown }).storage = {
        sync: {
            get: vi.fn(async (key: string) => ({ [key]: store[key] })),
            set: vi.fn(async (items: Record<string, unknown>) => Object.assign(store, items))
        }
    };
    return store;
}

afterEach(() => {
    delete (globalThis.chrome as unknown as { storage?: unknown }).storage;
});

describe("mergeRecentDestinations", () => {
    it("puts new refs first, dedupes and caps the list", () => {
        const current = Array.from({ length: MaxRecentDestinations }, (_, index) => ({ ref: peer(index + 1), usedAt: 1 }));
        const merged = mergeRecentDestinations(current, [channel("a"), peer(3)], 99);

        expect(merged).toHaveLength(MaxRecentDestinations);
        expect(merged.slice(0, 3)).toEqual([
            { ref: channel("a"), usedAt: 99 },
            { ref: peer(3), usedAt: 99 },
            { ref: peer(1), usedAt: 1 }
        ]);
        expect(merged.filter((recent) => recent.ref.type === DestinationRefType.TELEGRAM_PEER && recent.ref.peerId === 3)).toHaveLength(1);
    });

    it("keeps the same chat from two accounts as two recents", () => {
        const merged = mergeRecentDestinations([], [peer(1, "acc"), peer(1, "other")], 1);

        expect(merged).toHaveLength(2);
    });
});

describe("isConfigReady", () => {
    it("is ready with only a connected Telegram account", () => {
        const config = createDefaultExtensionConfig();

        expect(isConfigReady(config)).toBe(false);
        config.connections = [{ id: "acc", type: SendConnectionType.TELEGRAM_ACCOUNT, displayName: "Gio" }];
        expect(isConfigReady(config)).toBe(true);
    });

    it("needs a bot with a token for its destinations to count", () => {
        const config = createDefaultExtensionConfig();

        config.connections = [{ id: "bot", type: SendConnectionType.TELEGRAM_BOT, botToken: "", username: "" }];
        config.channels = [{ id: "a", label: "A", provider: DestinationProvider.TELEGRAM, chatId: "-1", connectionId: "bot" }];
        expect(isConfigReady(config)).toBe(false);

        config.connections = [{ id: "bot", type: SendConnectionType.TELEGRAM_BOT, botToken: "1:a", username: "" }];
        expect(isConfigReady(config)).toBe(true);
    });
});

describe("sortChannelsForPicker", () => {
    it("orders recently used channels first and drops invalid ones", () => {
        const channels = ["a", "b", "c"].map((id) => ({ id, label: id.toUpperCase(), provider: DestinationProvider.TELEGRAM, chatId: `-${id}`, connectionId: "bot" } as const));
        const invalid = { id: "x", label: "", provider: DestinationProvider.TELEGRAM, chatId: "-1", connectionId: "bot" } as const;

        expect(sortChannelsForPicker([...channels, invalid], [{ ref: channel("c"), usedAt: 1 }, { ref: peer(1), usedAt: 1 }]).map((item) => item.id))
            .toEqual(["c", "a", "b"]);
    });
});

describe("recents and connections in storage", () => {
    it("records successful destinations", async () => {
        const store = installSyncStorage();

        await recordRecentDestinations([peer(1)]);
        await recordRecentDestinations([]);

        expect((store.xToTelegramConfig as { recentDestinations: unknown[] }).recentDestinations).toEqual([{ ref: peer(1), usedAt: expect.any(Number) }]);
    });

    it("adds an account once and updates it in place", async () => {
        installSyncStorage({ xToTelegramConfig: createDefaultExtensionConfig() });

        await saveAccountConnection({ id: "acc", type: SendConnectionType.TELEGRAM_ACCOUNT, displayName: "Gio" });
        await saveAccountConnection({ id: "acc", type: SendConnectionType.TELEGRAM_ACCOUNT, displayName: "Gio R", accountId: 9 });

        expect((await loadConfig()).connections).toEqual([
            { id: "acc", type: SendConnectionType.TELEGRAM_ACCOUNT, displayName: "Gio R", accountId: 9 }
        ]);
    });

    it("forgets an account's chats from recents when it is removed, keeping everything else", async () => {
        const config = createDefaultExtensionConfig();

        config.connections = [
            { id: "bot", type: SendConnectionType.TELEGRAM_BOT, botToken: "1:a", username: "" },
            { id: "acc", type: SendConnectionType.TELEGRAM_ACCOUNT, displayName: "Gio" },
            { id: "other", type: SendConnectionType.TELEGRAM_ACCOUNT, displayName: "Ana" }
        ];
        config.channels = [{ id: "a", label: "A", provider: DestinationProvider.TELEGRAM, chatId: "-1", connectionId: "bot" }];
        config.recentDestinations = [{ ref: peer(1), usedAt: 3 }, { ref: peer(2, "other"), usedAt: 2 }, { ref: channel("a"), usedAt: 1 }];
        installSyncStorage({ xToTelegramConfig: config });

        await removeConnection("acc");

        const saved = await loadConfig();

        expect(saved.connections.map((connection) => connection.id)).toEqual(["bot", "other"]);
        expect(saved.recentDestinations).toEqual([{ ref: peer(2, "other"), usedAt: 2 }, { ref: channel("a"), usedAt: 1 }]);
    });

    it("removes a bot with its destinations and their recents", async () => {
        const config = createDefaultExtensionConfig();

        config.connections = [
            { id: "bot", type: SendConnectionType.TELEGRAM_BOT, botToken: "1:a", username: "" },
            { id: "bot-2", type: SendConnectionType.TELEGRAM_BOT, botToken: "2:b", username: "" }
        ];
        config.channels = [
            { id: "a", label: "A", provider: DestinationProvider.TELEGRAM, chatId: "-1", connectionId: "bot" },
            { id: "b", label: "B", provider: DestinationProvider.TELEGRAM, chatId: "-2", connectionId: "bot-2" }
        ];
        config.recentDestinations = [{ ref: channel("a"), usedAt: 2 }, { ref: channel("b"), usedAt: 1 }];
        installSyncStorage({ xToTelegramConfig: config });

        await removeConnection("bot");

        const saved = await loadConfig();

        expect(saved.channels.map((entry) => entry.id)).toEqual(["b"]);
        expect(saved.recentDestinations).toEqual([{ ref: channel("b"), usedAt: 1 }]);
    });
});

describe("togglePinnedRef", () => {
    it("appends a new pin and removes an existing one, matching peers by account and id", () => {
        const pinned = togglePinnedRef([channel("a")], peer(1));

        expect(pinned).toEqual([channel("a"), peer(1)]);
        expect(togglePinnedRef(pinned, { ...peer(1), title: "Renamed" })).toEqual([channel("a")]);
        expect(togglePinnedRef(pinned, peer(1, "acc-2"))).toEqual([channel("a"), peer(1), peer(1, "acc-2")]);
    });

    it("returns the same list when full", () => {
        const full = Array.from({ length: MaxPinnedDestinations }, (_, index) => peer(index + 1));

        expect(togglePinnedRef(full, channel("x"))).toBe(full);
        expect(togglePinnedRef(full, peer(1))).toHaveLength(MaxPinnedDestinations - 1);
    });
});

describe("movePinnedRef", () => {
    const key = (ref: DestinationRef): string => ref.type === DestinationRefType.CHANNEL ? `channel:${ref.channelId}` : "";

    it("moves a pin down or up into another pin's slot", () => {
        const pins = [channel("a"), channel("b"), channel("c")];

        expect(movePinnedRef(pins, key(channel("a")), key(channel("c")))).toEqual([channel("b"), channel("c"), channel("a")]);
        expect(movePinnedRef(pins, key(channel("c")), key(channel("a")))).toEqual([channel("c"), channel("a"), channel("b")]);
    });

    it("returns the same list for unknown or identical keys", () => {
        const pins = [channel("a"), channel("b")];

        expect(movePinnedRef(pins, "channel:x", key(channel("a")))).toBe(pins);
        expect(movePinnedRef(pins, key(channel("a")), key(channel("a")))).toBe(pins);
    });
});
