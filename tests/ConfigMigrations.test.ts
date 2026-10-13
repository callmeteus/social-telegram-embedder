import { describe, expect, it } from "vitest";
import { migrateConfig, sanitizeDestinationRef } from "../src/core/storage/ConfigMigrations";
import { LegacyAccountConnectionId, LegacyBotConnectionId } from "../src/core/storage/Connections";
import { isConfigReady } from "../src/core/storage/Storage";
import { CurrentConfigVersion, DestinationProvider, SendConnectionType } from "../src/core/types/Config";
import { DestinationRefType, MaxPinnedDestinations, MaxRecentDestinations, TelegramPeerKind } from "../src/core/types/DestinationRef";

/** chrome.storage.sync allows 8 KB per item. */
const SyncItemQuotaBytes = 8192;

const LegacyBot = { id: LegacyBotConnectionId, type: SendConnectionType.TELEGRAM_BOT, botToken: "123:abc", username: "" };

describe("migrateConfig", () => {
    it("upgrades the legacy Telegram-only config straight to the current schema", () => {
        const result = migrateConfig({
            botToken: "123:abc",
            channels: [
                { id: "a", label: "Canal A", chatId: "-1001" },
                { id: "b", label: "Canal B", chatId: "@canalb" }
            ],
            lastUsedChannelId: "b"
        });

        expect(result.migrated).toBe(true);
        expect(result.fromVersion).toBe(1);
        expect(result.config).toEqual({
            version: CurrentConfigVersion,
            connections: [LegacyBot],

            channels: [
                { id: "a", label: "Canal A", provider: DestinationProvider.TELEGRAM, chatId: "-1001", connectionId: LegacyBotConnectionId },
                { id: "b", label: "Canal B", provider: DestinationProvider.TELEGRAM, chatId: "@canalb", connectionId: LegacyBotConnectionId }
            ],

            recentDestinations: [
                { ref: { type: DestinationRefType.CHANNEL, channelId: "b" }, usedAt: expect.any(Number) }
            ],

            pinnedDestinations: []
        });
        expect(isConfigReady(result.config)).toBe(true);
    });

    it("upgrades v2, turning the last used channel into a recent destination", () => {
        const result = migrateConfig({
            version: 2,
            providers: { telegram: { botToken: "123:abc" } },
            channels: [{ id: "a", label: "Canal A", provider: DestinationProvider.TELEGRAM, chatId: "-1001" }],
            lastUsedChannelId: "a"
        });

        expect(result.migrated).toBe(true);
        expect(result.fromVersion).toBe(2);
        expect(result.config.version).toBe(CurrentConfigVersion);
        expect(result.config.connections).toEqual([LegacyBot]);
        expect(result.config.recentDestinations).toEqual([
            { ref: { type: DestinationRefType.CHANNEL, channelId: "a" }, usedAt: expect.any(Number) }
        ]);
        expect("lastUsedChannelId" in result.config).toBe(false);
        expect("providers" in result.config).toBe(false);
    });

    it("drops a v2 last used channel that no longer exists", () => {
        const result = migrateConfig({
            version: 2,
            providers: { telegram: { botToken: "" } },
            channels: [],
            lastUsedChannelId: "gone"
        });

        expect(result.config.recentDestinations).toEqual([]);
        expect(result.config.connections).toEqual([]);
    });

    it("upgrades v3: the bot and the logged-in account become connections with fixed ids", () => {
        const result = migrateConfig({
            version: 3,
            providers: { telegram: { botToken: "123:abc" }, telegramUser: { enabled: true, displayName: "Gio" } },
            channels: [{ id: "a", label: "Canal A", provider: DestinationProvider.TELEGRAM, chatId: "-1001" }],
            recentDestinations: [
                { ref: { type: DestinationRefType.TELEGRAM_PEER, peerId: 42, kind: TelegramPeerKind.USER, title: "Ana" }, usedAt: 5 },
                { ref: { type: DestinationRefType.CHANNEL, channelId: "a" }, usedAt: 4 }
            ]
        });

        expect(result.migrated).toBe(true);
        expect(result.config.connections).toEqual([
            LegacyBot,
            { id: LegacyAccountConnectionId, type: SendConnectionType.TELEGRAM_ACCOUNT, displayName: "Gio", accountId: undefined }
        ]);
        expect(result.config.channels[0]).toMatchObject({ connectionId: LegacyBotConnectionId });
        expect(result.config.recentDestinations.map((recent) => recent.ref)).toEqual([
            { type: DestinationRefType.TELEGRAM_PEER, connectionId: LegacyAccountConnectionId, peerId: 42, kind: TelegramPeerKind.USER, title: "Ana" },
            { type: DestinationRefType.CHANNEL, channelId: "a" }
        ]);
    });

    it("upgrades v3 without a bot or account to an empty list, forgetting account recents", () => {
        const result = migrateConfig({
            version: 3,
            providers: { telegram: { botToken: "" }, telegramUser: { enabled: false, displayName: "" } },
            channels: [],
            recentDestinations: [
                { ref: { type: DestinationRefType.TELEGRAM_PEER, peerId: 42, kind: TelegramPeerKind.USER, title: "Ana" }, usedAt: 5 }
            ]
        });

        expect(result.config.connections).toEqual([]);
        expect(result.config.recentDestinations).toEqual([]);
    });

    it("keeps v3 bot channels when the token was cleared, under a bot without a token", () => {
        const result = migrateConfig({
            version: 3,
            providers: { telegram: { botToken: "" } },
            channels: [{ id: "a", label: "Canal A", provider: DestinationProvider.TELEGRAM, chatId: "-1001" }]
        });

        expect(result.config.connections).toEqual([{ ...LegacyBot, botToken: "" }]);
        expect(result.config.channels).toHaveLength(1);
        expect(isConfigReady(result.config)).toBe(false);
    });

    it("repairs a broken legacy config instead of throwing", () => {
        const result = migrateConfig({
            channels: [{ label: "Sem id", chatId: "-1001" }, "lixo"]
        });

        expect(result.migrated).toBe(true);
        expect(result.config.connections).toEqual([{ ...LegacyBot, botToken: "" }]);
        expect(result.config.channels).toHaveLength(1);
        expect(result.config.channels[0]?.id).toMatch(/.+/);
        expect(isConfigReady(result.config)).toBe(false);
    });

    it("leaves a current-version config untouched and keeps mixed providers", () => {
        const stored = {
            version: CurrentConfigVersion,

            connections: [
                { id: "bot-1", type: SendConnectionType.TELEGRAM_BOT, botToken: "123:abc", username: "my_bot" },
                { id: "acc-1", type: SendConnectionType.TELEGRAM_ACCOUNT, displayName: "Gio", accountId: 7 }
            ],

            channels: [
                { id: "a", label: "Telegram", provider: DestinationProvider.TELEGRAM, chatId: "-1001", connectionId: "bot-1" },
                {
                    id: "b",
                    label: "Discord",
                    provider: DestinationProvider.DISCORD,
                    webhookUrl: "https://discord.com/api/webhooks/1/abc"
                }
            ],

            recentDestinations: [
                { ref: { type: DestinationRefType.TELEGRAM_PEER, connectionId: "acc-1", peerId: 42, kind: TelegramPeerKind.USER, title: "Ana" }, usedAt: 5 }
            ],

            pinnedDestinations: [{ type: DestinationRefType.CHANNEL, channelId: "b" }]
        };

        const result = migrateConfig(stored);

        expect(result.migrated).toBe(false);
        expect(result.config).toEqual(stored);
    });

    it("drops bot channels and account recents that point at missing connections", () => {
        const result = migrateConfig({
            version: CurrentConfigVersion,
            connections: [{ id: "bot-1", type: SendConnectionType.TELEGRAM_BOT, botToken: "1:a", username: "" }],
            channels: [
                { id: "a", label: "A", provider: DestinationProvider.TELEGRAM, chatId: "-1", connectionId: "bot-1" },
                { id: "b", label: "B", provider: DestinationProvider.TELEGRAM, chatId: "-2", connectionId: "gone" }
            ],
            recentDestinations: [
                { ref: { type: DestinationRefType.TELEGRAM_PEER, connectionId: "gone", peerId: 1, kind: TelegramPeerKind.USER, title: "X" }, usedAt: 1 },
                { ref: { type: DestinationRefType.CHANNEL, channelId: "b" }, usedAt: 1 }
            ]
        });

        expect(result.config.channels.map((channel) => channel.id)).toEqual(["a"]);
        expect(result.config.recentDestinations).toEqual([]);
    });

    it("drops malformed, unknown and duplicated connections", () => {
        const result = migrateConfig({
            version: CurrentConfigVersion,
            connections: [
                { id: "bot-1", type: SendConnectionType.TELEGRAM_BOT, botToken: " 1:a ", username: "b" },
                { id: "bot-1", type: SendConnectionType.TELEGRAM_BOT, botToken: "2:b", username: "dup" },
                { id: "bad id!", type: SendConnectionType.TELEGRAM_BOT, botToken: "3:c" },
                { id: "x", type: "SLACK" },
                "junk"
            ],
            channels: []
        });

        expect(result.config.connections).toEqual([{ id: "bot-1", type: SendConnectionType.TELEGRAM_BOT, botToken: "1:a", username: "b" }]);
    });

    it("cleans invalid, duplicated and excess recent destinations", () => {
        const peer = (peerId: number) => ({
            ref: { type: DestinationRefType.TELEGRAM_PEER, connectionId: "acc", peerId, kind: TelegramPeerKind.GROUP, title: "G" },
            usedAt: peerId
        });
        const result = migrateConfig({
            version: CurrentConfigVersion,
            connections: [{ id: "acc", type: SendConnectionType.TELEGRAM_ACCOUNT, displayName: "A" }],
            channels: [],
            recentDestinations: [
                peer(1),
                peer(1),
                { ref: { type: DestinationRefType.CHANNEL, channelId: "missing" }, usedAt: 1 },
                { ref: { type: DestinationRefType.TELEGRAM_PEER, connectionId: "acc", peerId: 1.5, kind: TelegramPeerKind.USER }, usedAt: 1 },
                { ref: { type: DestinationRefType.TELEGRAM_PEER, connectionId: "acc", peerId: 7, kind: "ROBOT" }, usedAt: 1 },
                "junk",
                ...Array.from({ length: 20 }, (_, index) => peer(index + 2))
            ]
        });

        expect(result.config.recentDestinations).toHaveLength(MaxRecentDestinations);
        expect(result.config.recentDestinations[0]?.ref).toMatchObject({ peerId: 1 });
        expect(new Set(result.config.recentDestinations.map((recent) => JSON.stringify(recent.ref))).size)
            .toBe(MaxRecentDestinations);
    });

    it("treats a missing pin list as empty and cleans invalid, duplicated, unreachable and excess pins", () => {
        const peer = (peerId: number) => ({ type: DestinationRefType.TELEGRAM_PEER, connectionId: "acc", peerId, kind: TelegramPeerKind.USER, title: "P" });
        const base = { version: CurrentConfigVersion, connections: [{ id: "acc", type: SendConnectionType.TELEGRAM_ACCOUNT, displayName: "A" }], channels: [] };
        const missing = migrateConfig(base);
        const result = migrateConfig({
            ...base,
            pinnedDestinations: [
                peer(1),
                peer(1),
                { type: DestinationRefType.CHANNEL, channelId: "missing" },
                { ...peer(2), connectionId: "gone" },
                "junk",
                ...Array.from({ length: 20 }, (_, index) => peer(index + 3))
            ]
        });

        expect(missing.config.pinnedDestinations).toEqual([]);
        expect(missing.migrated).toBe(false);
        expect(result.config.pinnedDestinations).toHaveLength(MaxPinnedDestinations);
        expect(result.config.pinnedDestinations.slice(0, 2)).toEqual([peer(1), peer(3)]);
    });

    it("stays under the sync storage item quota with several connections, full recent and pin lists and long titles", () => {
        const result = migrateConfig({
            version: CurrentConfigVersion,
            connections: [
                ...Array.from({ length: 3 }, (_, index) => ({
                    id: crypto.randomUUID(),
                    type: SendConnectionType.TELEGRAM_BOT,
                    botToken: "1234567890:" + "a".repeat(35),
                    username: "b".repeat(32) + index
                })),
                { id: "acc", type: SendConnectionType.TELEGRAM_ACCOUNT, displayName: "x".repeat(200), accountId: 123456789 }
            ],
            channels: Array.from({ length: 10 }, (_, index) => ({
                id: crypto.randomUUID(),
                label: "Canal ".repeat(10) + index,
                provider: DestinationProvider.DISCORD,
                webhookUrl: "https://discord.com/api/webhooks/1/abc"
            })),
            recentDestinations: Array.from({ length: MaxRecentDestinations }, (_, index) => ({
                ref: { type: DestinationRefType.TELEGRAM_PEER, connectionId: "acc", peerId: -1000000000000 - index, kind: TelegramPeerKind.CHANNEL, title: "T".repeat(500) },
                usedAt: Date.now()
            })),
            pinnedDestinations: Array.from({ length: MaxPinnedDestinations }, (_, index) => ({
                type: DestinationRefType.TELEGRAM_PEER, connectionId: "acc", peerId: -2000000000000 - index, kind: TelegramPeerKind.CHANNEL, title: "P".repeat(500)
            }))
        });
        const bytes = new TextEncoder().encode("xToTelegramConfig" + JSON.stringify(result.config)).length;

        expect(result.config.recentDestinations.every((recent) =>
            recent.ref.type !== DestinationRefType.TELEGRAM_PEER || recent.ref.title.length === 128)).toBe(true);
        expect(result.config.pinnedDestinations).toHaveLength(MaxPinnedDestinations);
        expect(bytes).toBeLessThan(SyncItemQuotaBytes);
    });

    it("drops channels with an unknown provider", () => {
        const result = migrateConfig({
            version: CurrentConfigVersion,
            connections: [],
            channels: [{ id: "x", label: "Outro", provider: "SLACK" }]
        });

        expect(result.config.channels).toEqual([]);
    });

    it("returns defaults when nothing is stored", () => {
        const result = migrateConfig(undefined);

        expect(result.migrated).toBe(false);
        expect(result.config.version).toBe(CurrentConfigVersion);
        expect(result.config.connections).toEqual([]);
        expect(result.config.channels).toEqual([]);
        expect(result.config.recentDestinations).toEqual([]);
    });
});

describe("sanitizeDestinationRef", () => {
    it("accepts channel and peer refs", () => {
        expect(sanitizeDestinationRef({ type: DestinationRefType.CHANNEL, channelId: "a" }))
            .toEqual({ type: DestinationRefType.CHANNEL, channelId: "a" });
        expect(sanitizeDestinationRef({ type: DestinationRefType.TELEGRAM_PEER, connectionId: "acc", peerId: -100123, kind: TelegramPeerKind.CHANNEL, title: "News" }))
            .toEqual({ type: DestinationRefType.TELEGRAM_PEER, connectionId: "acc", peerId: -100123, kind: TelegramPeerKind.CHANNEL, title: "News" });
    });

    it("rejects unsafe or malformed refs", () => {
        const peer = { type: DestinationRefType.TELEGRAM_PEER, connectionId: "acc", kind: TelegramPeerKind.USER };

        expect(sanitizeDestinationRef(null)).toBeNull();
        expect(sanitizeDestinationRef({ type: DestinationRefType.CHANNEL, channelId: "" })).toBeNull();
        expect(sanitizeDestinationRef({ ...peer, peerId: 0 })).toBeNull();
        expect(sanitizeDestinationRef({ ...peer, peerId: "42" })).toBeNull();
        expect(sanitizeDestinationRef({ ...peer, peerId: Number.MAX_SAFE_INTEGER + 2 })).toBeNull();
        expect(sanitizeDestinationRef({ ...peer, peerId: 42, connectionId: undefined })).toBeNull();
        expect(sanitizeDestinationRef({ ...peer, peerId: 42, connectionId: "../evil" })).toBeNull();
        expect(sanitizeDestinationRef({ type: "OTHER" })).toBeNull();
    });
});
