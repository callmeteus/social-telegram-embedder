import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultExtensionConfig, DestinationProvider, SendConnectionType, type ExtensionConfig } from "../src/core/types/Config";

vi.mock("../src/core/telegram/TelegramClient", () => ({
    TelegramClient: class {
        private readonly token: string;

        public constructor(token: string) {
            this.token = token;
        }

        public async getMe(): Promise<{ ok: boolean; username?: string; error?: string }> {
            return this.token.startsWith("bad") ? { ok: false, error: "Unauthorized" } : { ok: true, username: `bot_${this.token.split(":")[0]}` };
        }

        public async sendTestMessage(): Promise<{ ok: boolean }> {
            return { ok: true };
        }

        public async discoverChannels(): Promise<{ ok: boolean; channels: { title: string; chatId: string }[] }> {
            return { ok: true, channels: [{ title: "Found", chatId: "-100777" }] };
        }
    }
}));

import { initBotConnectionEditor, type BotConnectionEditor } from "../src/options/BotConnectionEditor";

const EditorMarkup = (() => {
    const html = readFileSync(resolve(__dirname, "../src/options/OptionsPage.html"), "utf8");
    const parts = [
        /<section id="bot-section"[\s\S]*?<\/section>/,
        /<footer class="save-dock"[\s\S]*?<\/footer>/,
        /<template id="channel-row-template">[\s\S]*?<\/template>/
    ].map((pattern) => pattern.exec(html)?.[0]);

    if (parts.some((part) => !part)) {
        throw new Error("bot editor markup not found");
    }

    return parts.join("\n");
})();

const byId = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
let store: Record<string, unknown> = {};

function installStorage(config: ExtensionConfig): void {
    store = { xToTelegramConfig: config };
    (globalThis.chrome as unknown as { storage: unknown }).storage = {
        sync: {
            get: vi.fn(async (key: string) => ({ [key]: store[key] })),
            set: vi.fn(async (items: Record<string, unknown>) => Object.assign(store, items))
        }
    };
}

function savedConfig(): ExtensionConfig {
    return store.xToTelegramConfig as ExtensionConfig;
}

function sampleConfig(): ExtensionConfig {
    const config = createDefaultExtensionConfig();

    config.connections = [
        { id: "bot", type: SendConnectionType.TELEGRAM_BOT, botToken: "1:a", username: "bot_1" },
        { id: "bot-2", type: SendConnectionType.TELEGRAM_BOT, botToken: "2:b", username: "bot_2" }
    ];
    config.channels = [
        { id: "a", label: "Canal A", provider: DestinationProvider.TELEGRAM, chatId: "-1", connectionId: "bot" },
        { id: "z", label: "Outro bot", provider: DestinationProvider.TELEGRAM, chatId: "-9", connectionId: "bot-2" }
    ];
    return config;
}

function typeInto(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
}

function labels(): string[] {
    return Array.from(document.querySelectorAll<HTMLInputElement>(".channel-label")).map((input) => input.value);
}

async function openEditor(connectionId: string, onRemoved = vi.fn()): Promise<BotConnectionEditor> {
    const editor = initBotConnectionEditor({ onRemoved })!;

    byId("bot-section").hidden = false;
    await editor.open(connectionId);
    return editor;
}

beforeEach(() => {
    document.body.innerHTML = EditorMarkup;
    installStorage(sampleConfig());
});

afterEach(() => {
    delete (globalThis.chrome as unknown as { storage?: unknown }).storage;
    vi.restoreAllMocks();
});

describe("BotConnectionEditor", () => {
    it("starts a new bot empty and saves it once the token is valid", async () => {
        await openEditor("new-bot");

        expect(byId("bot-section-title").textContent).toBe("New bot");
        expect(byId("bot-danger").hidden).toBe(true);
        expect(byId("channels-section").hidden).toBe(true);
        expect(labels()).toEqual([""]);

        typeInto(byId<HTMLInputElement>("bot-token"), "3:c");
        byId("test-bot").click();

        await vi.waitFor(() => expect(byId("channels-section").hidden).toBe(false));
        expect(savedConfig().connections.at(-1)).toEqual({ id: "new-bot", type: SendConnectionType.TELEGRAM_BOT, botToken: "3:c", username: "bot_3" });
        expect(byId("bot-section-title").textContent).toBe("@bot_3");
        expect(byId("bot-danger").hidden).toBe(false);
        expect(byId("save-dock").hidden).toBe(true);
    });

    it("keeps a rejected token out of the list", async () => {
        await openEditor("new-bot");

        typeInto(byId<HTMLInputElement>("bot-token"), "bad:token");
        byId("test-bot").click();

        await vi.waitFor(() => expect(byId("bot-status").textContent).toBe("Unauthorized"));
        expect(savedConfig().connections).toHaveLength(2);
        expect(byId("channels-section").hidden).toBe(true);
    });

    it("refuses a bot that is already in the list", async () => {
        await openEditor("new-bot");

        typeInto(byId<HTMLInputElement>("bot-token"), "1:a");
        byId("test-bot").click();

        await vi.waitFor(() => expect(byId("bot-status").textContent).toBe("This bot is already in your list."));
        expect(savedConfig().connections).toHaveLength(2);
    });

    it("shows only this bot's destinations and saves edits without touching other bots", async () => {
        const editor = await openEditor("bot");

        expect(byId<HTMLInputElement>("bot-token").value).toBe("1:a");
        expect(byId("channels-section").hidden).toBe(false);
        expect(labels()).toEqual(["Canal A"]);
        expect(byId("bot-summary").textContent).toBe("1 destination");

        byId("add-channel").click();

        const inputs = document.querySelectorAll<HTMLInputElement>(".channel-row");
        const newRow = inputs[1]!;

        typeInto(newRow.querySelector<HTMLInputElement>(".channel-label")!, "Canal B");
        typeInto(newRow.querySelector<HTMLInputElement>(".channel-chat-id")!, "@canalb");

        expect(editor.isDirty()).toBe(true);
        expect(byId("save-dock").hidden).toBe(false);

        byId("save-config").click();

        await vi.waitFor(() => expect(byId("save-dock").hidden).toBe(true));
        expect(savedConfig().channels.map((channel) => [channel.label, channel.provider === DestinationProvider.TELEGRAM && channel.connectionId]))
            .toEqual([["Outro bot", "bot-2"], ["Canal A", "bot"], ["Canal B", "bot"]]);
        expect(editor.isDirty()).toBe(false);
        expect(byId("bot-summary").textContent).toBe("2 destinations");
    });

    it("asks to validate a changed token before saving", async () => {
        await openEditor("bot");

        typeInto(byId<HTMLInputElement>("bot-token"), "4:d");
        expect(byId("channels-section").hidden).toBe(true);

        byId("save-config").click();

        await vi.waitFor(() => expect(byId("save-status").textContent).toBe("Validate the token before saving."));
        expect(savedConfig().connections[0]).toMatchObject({ botToken: "1:a" });
    });

    it("adds a destination found by the bot", async () => {
        await openEditor("bot");

        byId("discover-channels").click();
        await vi.waitFor(() => expect(document.querySelector(".discovered-item")).toBeTruthy());
        document.querySelector<HTMLButtonElement>(".discovered-item button")?.click();

        expect(labels()).toEqual(["Canal A", "Found"]);
        expect(byId("save-dock").hidden).toBe(false);
    });

    it("removes the bot and its destinations only after confirmation", async () => {
        const onRemoved = vi.fn();
        const confirmSpy = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);

        await openEditor("bot", onRemoved);
        byId("bot-remove").click();
        await Promise.resolve();

        expect(onRemoved).not.toHaveBeenCalled();
        expect(confirmSpy).toHaveBeenLastCalledWith("Remove @bot_1 and its destinations?");

        byId("bot-remove").click();

        await vi.waitFor(() => expect(onRemoved).toHaveBeenCalledTimes(1));
        expect(savedConfig().connections.map((connection) => connection.id)).toEqual(["bot-2"]);
        expect(savedConfig().channels.map((channel) => channel.id)).toEqual(["z"]);
    });

    it("forgets unsaved edits when closed and reopened", async () => {
        const editor = await openEditor("bot");

        typeInto(document.querySelector<HTMLInputElement>(".channel-label")!, "Renomeado");
        expect(editor.isDirty()).toBe(true);

        editor.close();
        expect(byId("save-dock").hidden).toBe(true);

        await editor.open("bot");
        expect(labels()).toEqual(["Canal A"]);
        expect(editor.isDirty()).toBe(false);
    });
});
