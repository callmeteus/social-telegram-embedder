import { describe, expect, it } from "vitest";
import {
    createConnectionId,
    findAccountConnection,
    findBotConnection,
    formatConnectionName,
    getAccountConnections,
    getBotConnections,
    isValidConnectionId,
    withConnection,
    withoutConnection
} from "../src/core/storage/Connections";
import { createDefaultExtensionConfig, DestinationProvider, SendConnectionType, type ExtensionConfig } from "../src/core/types/Config";
import { DestinationRefType, TelegramPeerKind } from "../src/core/types/DestinationRef";

function sampleConfig(): ExtensionConfig {
    const config = createDefaultExtensionConfig();

    config.connections = [
        { id: "bot", type: SendConnectionType.TELEGRAM_BOT, botToken: "1:a", username: "news_bot" },
        { id: "acc", type: SendConnectionType.TELEGRAM_ACCOUNT, displayName: "Gio" }
    ];
    config.channels = [
        { id: "a", label: "A", provider: DestinationProvider.TELEGRAM, chatId: "-1", connectionId: "bot" },
        { id: "d", label: "D", provider: DestinationProvider.DISCORD, webhookUrl: "https://discord.com/api/webhooks/1/abc" }
    ];
    config.recentDestinations = [
        { ref: { type: DestinationRefType.CHANNEL, channelId: "a" }, usedAt: 3 },
        { ref: { type: DestinationRefType.TELEGRAM_PEER, connectionId: "acc", peerId: 1, kind: TelegramPeerKind.USER, title: "Ana" }, usedAt: 2 },
        { ref: { type: DestinationRefType.CHANNEL, channelId: "d" }, usedAt: 1 }
    ];
    config.pinnedDestinations = [
        { type: DestinationRefType.TELEGRAM_PEER, connectionId: "acc", peerId: 1, kind: TelegramPeerKind.USER, title: "Ana" },
        { type: DestinationRefType.CHANNEL, channelId: "a" }
    ];
    return config;
}

describe("connection ids", () => {
    it("accepts generated and legacy ids and rejects unsafe ones", () => {
        expect(isValidConnectionId(createConnectionId())).toBe(true);
        expect(isValidConnectionId("telegram-bot")).toBe(true);
        expect(isValidConnectionId("")).toBe(false);
        expect(isValidConnectionId("a/b")).toBe(false);
        expect(isValidConnectionId("x".repeat(65))).toBe(false);
        expect(isValidConnectionId(42)).toBe(false);
    });
});

describe("finding connections", () => {
    it("finds bots and accounts by id and kind", () => {
        const config = sampleConfig();

        expect(findBotConnection(config, "bot")?.username).toBe("news_bot");
        expect(findBotConnection(config, "acc")).toBeUndefined();
        expect(findAccountConnection(config, "acc")?.displayName).toBe("Gio");
        expect(findAccountConnection(config, "bot")).toBeUndefined();
        expect(getBotConnections(config).map((connection) => connection.id)).toEqual(["bot"]);
        expect(getAccountConnections(config).map((connection) => connection.id)).toEqual(["acc"]);
    });

    it("names bots by username and accounts by display name, with fallbacks", () => {
        expect(formatConnectionName({ id: "b", type: SendConnectionType.TELEGRAM_BOT, botToken: "", username: "x_bot" })).toBe("@x_bot");
        expect(formatConnectionName({ id: "b", type: SendConnectionType.TELEGRAM_BOT, botToken: "", username: "" })).toBe("Bot without a name");
        expect(formatConnectionName({ id: "a", type: SendConnectionType.TELEGRAM_ACCOUNT, displayName: "" })).toBe("Telegram account");
    });
});

describe("withConnection / withoutConnection", () => {
    it("appends a new connection and replaces an existing one in place", () => {
        const config = sampleConfig();
        const added = withConnection(config, { id: "bot-2", type: SendConnectionType.TELEGRAM_BOT, botToken: "2:b", username: "" });
        const replaced = withConnection(added, { id: "bot", type: SendConnectionType.TELEGRAM_BOT, botToken: "9:z", username: "renamed" });

        expect(replaced.connections.map((connection) => connection.id)).toEqual(["bot", "acc", "bot-2"]);
        expect(findBotConnection(replaced, "bot")?.botToken).toBe("9:z");
    });

    it("removes a bot with its destinations and their recents, keeping other providers", () => {
        const result = withoutConnection(sampleConfig(), "bot");

        expect(result.connections.map((connection) => connection.id)).toEqual(["acc"]);
        expect(result.channels.map((channel) => channel.id)).toEqual(["d"]);
        expect(result.recentDestinations.map((recent) => recent.usedAt)).toEqual([2, 1]);
        expect(result.pinnedDestinations).toEqual([expect.objectContaining({ connectionId: "acc" })]);
    });

    it("removes an account with its recent chats", () => {
        const result = withoutConnection(sampleConfig(), "acc");

        expect(result.channels).toHaveLength(2);
        expect(result.recentDestinations.map((recent) => recent.usedAt)).toEqual([3, 1]);
        expect(result.pinnedDestinations).toEqual([{ type: DestinationRefType.CHANNEL, channelId: "a" }]);
    });
});
