import { describe, expect, it, vi } from "vitest";
import { describeConnection, formatDestinationCount, renderConnectionsList } from "../src/options/ConnectionsList";
import { createDefaultExtensionConfig, DestinationProvider, SendConnectionType, type ExtensionConfig } from "../src/core/types/Config";

function sampleConfig(): ExtensionConfig {
    const config = createDefaultExtensionConfig();

    config.connections = [
        { id: "bot", type: SendConnectionType.TELEGRAM_BOT, botToken: "1:a", username: "news_bot" },
        { id: "bot-2", type: SendConnectionType.TELEGRAM_BOT, botToken: "2:b", username: "" },
        { id: "acc", type: SendConnectionType.TELEGRAM_ACCOUNT, displayName: "Gio" }
    ];
    config.channels = [
        { id: "a", label: "A", provider: DestinationProvider.TELEGRAM, chatId: "-1", connectionId: "bot" },
        { id: "b", label: "B", provider: DestinationProvider.TELEGRAM, chatId: "-2", connectionId: "bot" },
        { id: "c", label: "", provider: DestinationProvider.TELEGRAM, chatId: "-3", connectionId: "bot" },
        { id: "d", label: "D", provider: DestinationProvider.TELEGRAM, chatId: "-4", connectionId: "bot-2" }
    ];
    return config;
}

describe("formatDestinationCount", () => {
    it("words zero, one and many destinations", () => {
        expect(formatDestinationCount(0)).toBe("No destinations yet");
        expect(formatDestinationCount(1)).toBe("1 destination");
        expect(formatDestinationCount(3)).toBe("3 destinations");
    });
});

describe("describeConnection", () => {
    it("counts only the complete destinations of each bot", () => {
        const config = sampleConfig();

        expect(describeConnection(config, config.connections[0]!)).toBe("Bot · 2 destinations");
        expect(describeConnection(config, config.connections[1]!)).toBe("Bot · 1 destination");
        expect(describeConnection(config, config.connections[2]!)).toBe("Telegram account");
    });
});

describe("renderConnectionsList", () => {
    it("renders one row per connection with icon, name and description, and opens it on click", () => {
        const container = document.createElement("ul");
        const onOpen = vi.fn();
        const config = sampleConfig();

        renderConnectionsList(container, config, onOpen);

        const rows = Array.from(container.querySelectorAll<HTMLButtonElement>(".connection-row"));

        expect(rows.map((row) => row.querySelector(".connection-row__name")?.textContent)).toEqual(["@news_bot", "Bot without a name", "Gio"]);
        expect(rows.every((row) => row.querySelector(".connection-row__icon svg") && row.querySelector(".connection-row__chevron svg"))).toBe(true);

        rows[2]?.click();
        expect(onOpen).toHaveBeenCalledWith(config.connections[2]);
    });

    it("replaces the previous rows when rendered again", () => {
        const container = document.createElement("ul");
        const config = sampleConfig();

        renderConnectionsList(container, config, vi.fn());
        renderConnectionsList(container, { ...config, connections: config.connections.slice(0, 1) }, vi.fn());

        expect(container.querySelectorAll(".connection-row")).toHaveLength(1);
    });
});
