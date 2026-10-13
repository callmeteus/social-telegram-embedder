import { afterEach, describe, expect, it, vi } from "vitest";
import { closeDestinationPicker, getDestinationsKey, showDestinationPicker } from "../src/content/ui/picker";
import { TelegramFolderColor, type TelegramDialogEntry } from "../src/core/telegram-user/Dialogs";
import { DialogsPortMessageType, DialogsRequestType } from "../src/core/telegram-user/PortProtocol";
import { TelegramUserSessionState } from "../src/core/telegram-user/SessionTypes";
import { createDefaultExtensionConfig, DestinationProvider, SendConnectionType, type ExtensionConfig } from "../src/core/types/Config";
import { DestinationRefType, MaxDestinationsPerSend, MaxPinnedDestinations, TelegramPeerKind } from "../src/core/types/DestinationRef";
import { createFakePort, type FakePort } from "./helpers/FakePort";

function configWith(channelLabels: string[], accountEnabled = false): ExtensionConfig {
    const config = createDefaultExtensionConfig();

    config.connections = [{ id: "bot", type: SendConnectionType.TELEGRAM_BOT, botToken: "1:a", username: "news_bot" }];

    if (accountEnabled) {
        config.connections.push({ id: "acc", type: SendConnectionType.TELEGRAM_ACCOUNT, displayName: "Gio" });
    }

    config.channels = channelLabels.map((label, index) => ({
        id: `c${index + 1}`,
        label,
        provider: DestinationProvider.TELEGRAM,
        chatId: `-100${index + 1}`,
        connectionId: "bot"
    }));
    return config;
}

function dialog(peerId: number, title: string, overrides: Partial<TelegramDialogEntry> = {}): TelegramDialogEntry {
    return {
        peerId,
        kind: TelegramPeerKind.USER,
        title,
        canPost: true,
        isPinned: false,
        isArchived: false,
        lastMessageAt: peerId,
        hasAvatar: false,
        ...overrides
    };
}

function rows(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>(".x2tg-picker__item"));
}

function labels(): string[] {
    return rows().map((row) => row.querySelector(".x2tg-picker__label")?.textContent ?? "");
}

function activeLabel(): string | undefined {
    return document.querySelector(".x2tg-picker__item--active .x2tg-picker__label")?.textContent ?? undefined;
}

function press(key: string, modifiers: KeyboardEventInit = {}): void {
    document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...modifiers }));
}

function routeLabels(): string[] {
    return rows().map((row) => row.querySelector(".x2tg-picker__route")?.textContent ?? "");
}

function typeQuery(query: string): void {
    const input = document.querySelector<HTMLInputElement>(".x2tg-picker__search")!;

    input.value = query;
    input.dispatchEvent(new Event("input", { bubbles: true }));
}

function openWithAccount(onSend = vi.fn()): { fake: FakePort; onSend: typeof onSend } {
    const fake = createFakePort("telegram-user-dialogs");

    showDestinationPicker({ config: configWith(["Notícias"], true), onSend, connectDialogs: () => fake.port });
    fake.emit({ type: DialogsPortMessageType.SESSION, snapshot: { state: TelegramUserSessionState.READY, hasCredentials: true } });
    return { fake, onSend };
}

afterEach(() => {
    closeDestinationPicker();
    vi.useRealTimers();
});

describe("showDestinationPicker keyboard navigation", () => {
    it("moves the active row with arrows, wraps, toggles with Enter and sends with Ctrl+Enter", () => {
        const onSend = vi.fn();

        showDestinationPicker({ config: configWith(["Canal A", "Canal B", "Canal C"]), onSend });

        expect(activeLabel()).toBe("Canal A");
        expect(rows()[0]?.querySelector(".x2tg-picker__avatar-badge svg")).toBeTruthy();

        press("ArrowDown");
        press("ArrowDown");
        expect(activeLabel()).toBe("Canal C");

        press("ArrowDown");
        expect(activeLabel()).toBe("Canal A");

        press("ArrowUp");
        expect(activeLabel()).toBe("Canal C");

        press("ArrowUp");
        press("Enter");

        expect(onSend).not.toHaveBeenCalled();
        expect(rows()[1]?.getAttribute("aria-selected")).toBe("true");

        press("Enter");
        expect(rows()[1]?.getAttribute("aria-selected")).toBe("false");

        press("Enter");
        expect(onSend).not.toHaveBeenCalled();

        press("Enter", { ctrlKey: true });

        expect(onSend).toHaveBeenCalledWith([{ ref: { type: DestinationRefType.CHANNEL, channelId: "c2" }, label: "Canal B" }]);
        expect(document.querySelector(".x2tg-picker-overlay")).toBeNull();
    });

    it("sends the active row straight away with Ctrl+Enter or Cmd+Enter when nothing is selected", () => {
        const onSend = vi.fn();

        showDestinationPicker({ config: configWith(["Canal A", "Canal B"]), onSend });
        press("ArrowDown");
        press("Enter", { metaKey: true });

        expect(onSend).toHaveBeenCalledWith([{ ref: { type: DestinationRefType.CHANNEL, channelId: "c2" }, label: "Canal B" }]);
    });

    it("closes on Escape without sending and keeps keys away from the page", () => {
        const onSend = vi.fn();
        const pageHandler = vi.fn();

        document.addEventListener("keydown", pageHandler);
        showDestinationPicker({ config: configWith(["Canal A"]), onSend });
        press("j");
        press("Escape");

        expect(pageHandler).not.toHaveBeenCalled();
        expect(onSend).not.toHaveBeenCalled();
        expect(document.querySelector(".x2tg-picker-overlay")).toBeNull();
        document.removeEventListener("keydown", pageHandler);
    });

    it("only selects on click and sends after the confirm button", () => {
        const onSend = vi.fn();

        showDestinationPicker({ config: configWith(["Canal A", "Canal B"]), onSend });

        const sendButton = document.querySelector<HTMLButtonElement>(".x2tg-picker__send")!;

        expect(sendButton.disabled).toBe(true);
        expect(sendButton.textContent).toBe("Send");
        expect(document.querySelector(".x2tg-picker__count")?.textContent).toBe("Enter selects, Ctrl+Enter sends");

        rows()[1]?.click();

        expect(onSend).not.toHaveBeenCalled();
        expect(sendButton.disabled).toBe(false);
        expect(sendButton.textContent).toBe("Send (1)");
        expect(document.querySelector(".x2tg-picker__count")?.textContent).toBe("1 selected · Ctrl+Enter sends");

        sendButton.click();

        expect(onSend).toHaveBeenCalledWith([expect.objectContaining({ label: "Canal B" })]);
    });

    it("closes from the close button without sending", () => {
        const onSend = vi.fn();

        showDestinationPicker({ config: configWith(["Canal A"]), onSend });
        rows()[0]?.click();

        const close = document.querySelector<HTMLButtonElement>(".x2tg-picker__close")!;

        expect(close.getAttribute("aria-label")).toBe("Close");
        close.click();

        expect(onSend).not.toHaveBeenCalled();
        expect(document.querySelector(".x2tg-picker-overlay")).toBeNull();
    });

    it("does nothing when confirming an empty selection", () => {
        const onSend = vi.fn();

        showDestinationPicker({ config: configWith(["Canal A"]), onSend });
        document.querySelector<HTMLButtonElement>(".x2tg-picker__send")?.click();

        expect(onSend).not.toHaveBeenCalled();
        expect(document.querySelector(".x2tg-picker-overlay")).not.toBeNull();
    });

    it("lists channels from different providers together, only Telegram ones with the Telegram badge", () => {
        const config = configWith(["Canal Telegram"]);

        config.channels.push({ id: "d1", label: "Canal Discord", provider: DestinationProvider.DISCORD, webhookUrl: "https://discord.com/api/webhooks/1/abc" });
        showDestinationPicker({ config, onSend: vi.fn() });

        expect(labels()).toEqual(["Canal Telegram", "Canal Discord"]);
        expect(routeLabels()).toEqual(["Telegram bot · @news_bot", ""]);
        expect(rows()[1]?.querySelector(".x2tg-picker__meta")).toBeNull();
        expect(rows()[1]?.querySelector(".x2tg-picker__avatar")).toBeTruthy();
        expect(rows()[1]?.querySelector(".x2tg-picker__avatar-badge")).toBeNull();
    });

    it("loads the photo of Telegram bot channels once and shows it", async () => {
        const loadChannelPhoto = vi.fn(async (channelId: string) => (channelId === "photo-c1" ? "data:image/jpeg;base64,BBBB" : null));
        const config = configWith(["Canal Foto", "Canal Sem Foto"]);

        // Photos are cached per page, so these ids must not collide with other tests.
        config.channels.forEach((channel) => {
            channel.id = `photo-${channel.id}`;
        });
        showDestinationPicker({ config, onSend: vi.fn(), loadChannelPhoto });
        await Promise.resolve();
        await Promise.resolve();

        expect(loadChannelPhoto.mock.calls.map(([channelId]) => channelId)).toEqual(["photo-c1", "photo-c2"]);
        expect(rows()[0]?.querySelector(".x2tg-picker__avatar img")?.getAttribute("src")).toBe("data:image/jpeg;base64,BBBB");
        expect(rows()[1]?.querySelector(".x2tg-picker__avatar img")).toBeNull();
        expect(rows()[1]?.querySelector(".x2tg-picker__avatar")?.textContent).toBe("CS");

        closeDestinationPicker();
        showDestinationPicker({ config, onSend: vi.fn(), loadChannelPhoto });

        expect(loadChannelPhoto).toHaveBeenCalledTimes(2);
        expect(rows()[0]?.querySelector(".x2tg-picker__avatar img")?.getAttribute("src")).toBe("data:image/jpeg;base64,BBBB");
    });

    it("shows an empty state when nothing is configured", () => {
        showDestinationPicker({ config: configWith([]), onSend: vi.fn() });

        expect(rows()).toHaveLength(0);
        expect(document.querySelector(".x2tg-picker__status")?.textContent).toBe("No destinations yet. Add one in the extension settings.");
    });
});

describe("showDestinationPicker search", () => {
    it("filters locally ignoring accents and case", () => {
        showDestinationPicker({ config: configWith(["São Paulo News", "Rio Daily", "Sao Bento"]), onSend: vi.fn() });
        typeQuery("SAO");

        expect(labels()).toEqual(["São Paulo News", "Sao Bento"]);
        expect(activeLabel()).toBe("São Paulo News");

        typeQuery("nada disso");
        expect(rows()).toHaveLength(0);
        expect(document.querySelector(".x2tg-picker__status")?.textContent).toBe("Nothing found.");
    });

    it("debounces a server search and merges results without duplicates", () => {
        vi.useFakeTimers();
        const { fake } = openWithAccount();

        fake.emit({ type: DialogsPortMessageType.PAGE, entries: [dialog(1, "Ana Souza")], done: true });
        typeQuery("an");
        typeQuery("ana");

        expect(fake.posted).toEqual([]);
        expect(document.querySelector(".x2tg-picker__status")?.textContent).toBe("Searching...");

        vi.advanceTimersByTime(250);

        const searches = fake.posted.filter((message) => (message as { type: string }).type === DialogsRequestType.SEARCH);

        expect(searches).toEqual([{ type: DialogsRequestType.SEARCH, requestId: 1, query: "ana" }]);

        fake.emit({
            type: DialogsPortMessageType.SEARCH_RESULTS,
            requestId: 1,
            entries: [dialog(1, "Ana Souza"), dialog(2, "Ana Clara", { username: "anaclara" }), dialog(3, "Ana Admin", { canPost: false })]
        });

        expect(labels()).toEqual(["Ana Souza", "Ana Clara"]);
        expect(routeLabels()[1]).toBe("Telegram account · Gio");
    });

    it("ignores stale search results", () => {
        vi.useFakeTimers();
        const { fake } = openWithAccount();

        typeQuery("bo");
        vi.advanceTimersByTime(250);
        typeQuery("bob");
        vi.advanceTimersByTime(250);
        fake.emit({ type: DialogsPortMessageType.SEARCH_RESULTS, requestId: 1, entries: [dialog(9, "Bolsonaro Fan")] });

        expect(labels()).not.toContain("Bolsonaro Fan");
    });

    it("does not search the server with a single character or when signed out", () => {
        vi.useFakeTimers();
        const fake = createFakePort();

        showDestinationPicker({ config: configWith([], true), onSend: vi.fn(), connectDialogs: () => fake.port });
        fake.emit({ type: DialogsPortMessageType.SESSION, snapshot: { state: TelegramUserSessionState.LOGGED_OUT, hasCredentials: false } });
        typeQuery("ana");
        vi.advanceTimersByTime(500);

        expect(fake.posted).toEqual([]);
        expect(document.querySelector(".x2tg-picker__status")?.textContent).toContain("Connect your Telegram account");

        fake.emit({ type: DialogsPortMessageType.SESSION, snapshot: { state: TelegramUserSessionState.READY, hasCredentials: true } });
        typeQuery("a");
        vi.advanceTimersByTime(500);
        expect(fake.posted).toEqual([]);
    });
});

describe("showDestinationPicker live Telegram chats", () => {
    it("renders sections, applies live updates and requests avatars once", () => {
        const { fake } = openWithAccount();

        expect(document.querySelector(".x2tg-picker__status")?.textContent).toBe("Loading your chats...");

        fake.emit({ type: DialogsPortMessageType.PAGE, entries: [dialog(1, "Ana", { hasAvatar: true }), dialog(2, "Bruno")], done: false });
        fake.emit({ type: DialogsPortMessageType.UPDATE, action: { type: "UPSERT", entry: dialog(3, "Carla", { lastMessageAt: 99 }) } });

        const sectionTitles = Array.from(document.querySelectorAll(".x2tg-picker__section-title")).map((element) => element.textContent);

        expect(sectionTitles).toEqual(["Bot channels", "Your Telegram"]);
        expect(labels()).toEqual(["Notícias", "Carla", "Bruno", "Ana"]);

        const avatarRequests = fake.posted.filter((message) => (message as { type: string }).type === DialogsRequestType.GET_AVATAR);

        expect(avatarRequests).toEqual([{ type: DialogsRequestType.GET_AVATAR, peerId: 1 }]);

        fake.emit({ type: DialogsPortMessageType.AVATAR, peerId: 1, dataUrl: "data:image/jpeg;base64,AAAA" });
        expect(rows()[3]?.querySelector(".x2tg-picker__avatar img")?.getAttribute("src")).toBe("data:image/jpeg;base64,AAAA");

        fake.emit({ type: DialogsPortMessageType.UPDATE, action: { type: "REMOVE", peerId: 2 } });
        expect(labels()).toEqual(["Notícias", "Carla", "Ana"]);
    });

    it("shows a recent Telegram chat under Recent and closes the port on close", () => {
        const fake = createFakePort();
        const config = configWith(["Canal A"], true);

        config.recentDestinations = [{ ref: { type: DestinationRefType.TELEGRAM_PEER, connectionId: "acc", peerId: 5, kind: TelegramPeerKind.GROUP, title: "Família" }, usedAt: 1 }];
        showDestinationPicker({ config, onSend: vi.fn(), connectDialogs: () => fake.port });
        fake.emit({ type: DialogsPortMessageType.PAGE, entries: [dialog(5, "Família", { kind: TelegramPeerKind.GROUP })], done: true });

        expect(document.querySelector(".x2tg-picker__section-title")?.textContent).toBe("Recent");
        expect(labels()).toEqual(["Família", "Canal A"]);

        closeDestinationPicker();
        expect(fake.port.disconnect).toHaveBeenCalled();
    });

    it("notes only chats pinned in Telegram, in words", () => {
        const { fake } = openWithAccount();

        fake.emit({
            type: DialogsPortMessageType.PAGE,
            entries: [dialog(1, "Ana", { isPinned: true, pinnedRank: 0 }), dialog(2, "Bruno")],
            done: true
        });

        const pinnedLabels = rows()
            .filter((row) => row.querySelector(".x2tg-picker__badge--tg-pin"))
            .map((row) => row.querySelector(".x2tg-picker__label")?.textContent);

        expect(pinnedLabels).toEqual(["Ana"]);
        expect(document.querySelector(".x2tg-picker__badge--tg-pin")?.textContent?.trim()).toBe("Pinned");
        expect(document.querySelector<HTMLElement>(".x2tg-picker__badge--tg-pin")?.title).toBe("Pinned in Telegram");
        expect(rows().find((row) => row.textContent?.includes("Bruno"))?.querySelector(".x2tg-picker__badges")).toBeNull();
    });
});

describe("showDestinationPicker Telegram folders", () => {
    const folders = [
        { id: 2, title: "NSFW", tagColor: TelegramFolderColor.RED },
        { id: 5, title: "Arte" }
    ];

    function openWithFolders(): FakePort {
        const { fake } = openWithAccount();

        fake.emit({ type: DialogsPortMessageType.FOLDERS, folders });
        fake.emit({
            type: DialogsPortMessageType.PAGE,
            entries: [dialog(1, "Ana", { folderIds: [2, 5] }), dialog(2, "Bruno", { folderIds: [5] }), dialog(3, "Carla")],
            done: true
        });
        return fake;
    }

    function badgeTexts(label: string): string[] {
        const row = rows().find((candidate) => candidate.querySelector(".x2tg-picker__label")?.textContent === label);

        return Array.from(row?.querySelectorAll(".x2tg-picker__badge") ?? []).map((badge) => badge.textContent ?? "");
    }

    it("shows colored tags only for folders with a tag color", () => {
        openWithFolders();

        expect(badgeTexts("Ana")).toEqual(["NSFW"]);
        expect(badgeTexts("Bruno")).toEqual([]);
        expect(document.querySelector(".x2tg-picker__badge--red")?.getAttribute("title")).toBe("In the NSFW Telegram folder");
    });

    it("finds chats by the name of a folder holding them, tagged or not", () => {
        openWithFolders();

        typeQuery("arte");
        expect(labels()).toEqual(["Bruno", "Ana"]);

        typeQuery("nsfw");
        expect(labels()).toEqual(["Ana"]);
    });

    it("shows tags on the saved list as soon as a fresh page brings folders, without reordering", () => {
        const { fake } = openWithAccount();

        fake.emit({ type: DialogsPortMessageType.CACHED, entries: [dialog(1, "Ana"), dialog(2, "Bruno")] });
        fake.emit({ type: DialogsPortMessageType.FOLDERS, folders });
        expect(badgeTexts("Ana")).toEqual([]);

        fake.emit({ type: DialogsPortMessageType.PAGE, entries: [dialog(1, "Ana", { folderIds: [2], lastMessageAt: 99 })], done: false });

        expect(badgeTexts("Ana")).toEqual(["NSFW"]);
        expect(labels()).toEqual(["Notícias", "Bruno", "Ana"]);
    });

    it("puts a kind icon before group, channel and bot titles only", () => {
        const { fake } = openWithAccount();

        fake.emit({
            type: DialogsPortMessageType.PAGE,
            entries: [
                dialog(1, "Ana"),
                dialog(2, "Grupo", { kind: TelegramPeerKind.GROUP }),
                dialog(3, "Canal", { kind: TelegramPeerKind.CHANNEL }),
                dialog(4, "Robô", { kind: TelegramPeerKind.BOT })
            ],
            done: true
        });

        const kindTitles = rows().map((row) => row.querySelector(".x2tg-picker__kind-icon")?.getAttribute("title") ?? null);

        expect(labels()).toEqual(["Notícias", "Robô", "Canal", "Grupo", "Ana"]);
        expect(kindTitles).toEqual([null, "Bot", "Channel", "Group", null]);
    });
});

describe("showDestinationPicker without accounts", () => {
    it("does not open a port when no account is connected", () => {
        const connect = vi.fn();

        showDestinationPicker({ config: configWith(["Canal A"]), onSend: vi.fn(), connectDialogs: connect });
        expect(connect).not.toHaveBeenCalled();
    });
});

describe("showDestinationPicker with several accounts", () => {
    function openWithTwoAccounts(onSend = vi.fn()): { ports: Map<string, FakePort>; onSend: typeof onSend } {
        const ports = new Map<string, FakePort>();
        const config = configWith([], true);

        config.connections.push({ id: "acc-2", type: SendConnectionType.TELEGRAM_ACCOUNT, displayName: "Ana" });
        showDestinationPicker({
            config,
            onSend,
            connectDialogs: (connectionId) => {
                const fake = createFakePort(`DIALOGS:${connectionId}`);

                ports.set(connectionId, fake);
                return fake.port;
            }
        });

        for (const fake of ports.values()) {
            fake.emit({ type: DialogsPortMessageType.SESSION, snapshot: { state: TelegramUserSessionState.READY, hasCredentials: true } });
        }

        return { ports, onSend };
    }

    it("opens one port per account and merges their chats with the account name", () => {
        const { ports, onSend } = openWithTwoAccounts();

        expect(Array.from(ports.keys())).toEqual(["acc", "acc-2"]);

        ports.get("acc")?.emit({ type: DialogsPortMessageType.PAGE, entries: [dialog(1, "Grupo", { lastMessageAt: 10 })], done: true });
        ports.get("acc-2")?.emit({ type: DialogsPortMessageType.PAGE, entries: [dialog(1, "Grupo", { lastMessageAt: 20 })], done: true });

        expect(labels()).toEqual(["Grupo", "Grupo"]);
        expect(routeLabels()).toEqual(["Telegram account · Ana", "Telegram account · Gio"]);

        rows()[0]?.click();
        document.querySelector<HTMLButtonElement>(".x2tg-picker__send")?.click();

        expect(onSend).toHaveBeenCalledWith([{
            ref: { type: DestinationRefType.TELEGRAM_PEER, connectionId: "acc-2", peerId: 1, kind: TelegramPeerKind.USER, title: "Grupo" },
            label: "Grupo"
        }]);
    });

    it("asks the owning account for each chat photo and closes every port", () => {
        const { ports } = openWithTwoAccounts();

        ports.get("acc")?.emit({ type: DialogsPortMessageType.PAGE, entries: [dialog(7, "Bia", { hasAvatar: true })], done: true });
        ports.get("acc-2")?.emit({ type: DialogsPortMessageType.PAGE, entries: [dialog(8, "Caio", { hasAvatar: true })], done: true });

        const avatarRequests = (connectionId: string): unknown[] => ports.get(connectionId)?.posted
            .filter((message) => (message as { type: string }).type === DialogsRequestType.GET_AVATAR) ?? [];

        expect(avatarRequests("acc")).toEqual([{ type: DialogsRequestType.GET_AVATAR, peerId: 7 }]);
        expect(avatarRequests("acc-2")).toEqual([{ type: DialogsRequestType.GET_AVATAR, peerId: 8 }]);

        closeDestinationPicker();

        for (const fake of ports.values()) {
            expect(fake.port.disconnect).toHaveBeenCalled();
        }
    });

    it("searches every ready account and keeps chats while one account is signed out", () => {
        vi.useFakeTimers();
        const { ports } = openWithTwoAccounts();

        ports.get("acc-2")?.emit({ type: DialogsPortMessageType.SESSION, snapshot: { state: TelegramUserSessionState.LOGGED_OUT, hasCredentials: true } });
        ports.get("acc")?.emit({ type: DialogsPortMessageType.PAGE, entries: [dialog(1, "Ana Souza")], done: true });
        typeQuery("ana");
        vi.advanceTimersByTime(250);

        const searches = (connectionId: string): unknown[] => ports.get(connectionId)?.posted
            .filter((message) => (message as { type: string }).type === DialogsRequestType.SEARCH) ?? [];

        expect(searches("acc")).toHaveLength(1);
        expect(searches("acc-2")).toHaveLength(0);
        expect(labels()).toEqual(["Ana Souza"]);
    });
});

describe("showDestinationPicker cached chats", () => {
    it("shows the saved list right away and reorders once the fresh load finishes", () => {
        const { fake } = openWithAccount();

        fake.emit({ type: DialogsPortMessageType.CACHED, entries: [dialog(1, "Ana", { lastMessageAt: 20 }), dialog(2, "Bruno", { lastMessageAt: 10 })] });

        expect(labels()).toEqual(["Notícias", "Ana", "Bruno"]);
        expect(document.querySelector(".x2tg-picker__status")).toBeNull();

        rows()[2]?.click();
        fake.emit({ type: DialogsPortMessageType.PAGE, entries: [dialog(2, "Bruno", { lastMessageAt: 30 })], done: false });

        expect(labels()).toEqual(["Notícias", "Ana", "Bruno"]);

        fake.emit({ type: DialogsPortMessageType.PAGE, entries: [dialog(3, "Carla", { lastMessageAt: 5 })], done: true });

        expect(labels()).toEqual(["Notícias", "Bruno", "Carla"]);
        expect(rows()[1]?.getAttribute("aria-selected")).toBe("true");
    });

    it("ignores a saved list that arrives after fresh pages", () => {
        const { fake } = openWithAccount();

        fake.emit({ type: DialogsPortMessageType.PAGE, entries: [dialog(3, "Carla")], done: false });
        fake.emit({ type: DialogsPortMessageType.CACHED, entries: [dialog(1, "Ana")] });

        expect(labels()).toEqual(["Notícias", "Carla"]);
    });
});

describe("showDestinationPicker multi-select", () => {
    it("toggles with Space and click and sends the selection in order", () => {
        const onSend = vi.fn();

        showDestinationPicker({ config: configWith(["Canal A", "Canal B", "Canal C"]), onSend });
        press(" ");
        rows()[2]?.click();

        expect(document.querySelector(".x2tg-picker__count")?.textContent).toBe("2 selected · Ctrl+Enter sends");
        expect(document.querySelector(".x2tg-picker__send")?.textContent).toBe("Send (2)");

        press("Enter", { ctrlKey: true });

        expect(onSend).toHaveBeenCalledWith([
            expect.objectContaining({ label: "Canal A" }),
            expect.objectContaining({ label: "Canal C" })
        ]);
    });

    it("toggles from the checkbox or the row, and unselects again", () => {
        const onSend = vi.fn();

        showDestinationPicker({ config: configWith(["Canal A", "Canal B"]), onSend });
        rows()[0]?.querySelector<HTMLElement>(".x2tg-picker__check")?.click();
        rows()[1]?.click();
        rows()[1]?.click();

        expect(onSend).not.toHaveBeenCalled();
        expect(rows()[0]?.getAttribute("aria-selected")).toBe("true");
        expect(rows()[1]?.getAttribute("aria-selected")).toBe("false");

        document.querySelector<HTMLButtonElement>(".x2tg-picker__send")?.click();
        expect(onSend).toHaveBeenCalledWith([expect.objectContaining({ label: "Canal A" })]);
    });

    it("stops at the selection limit and tells the user", () => {
        const labelsList = Array.from({ length: MaxDestinationsPerSend + 1 }, (_, index) => `Canal ${index + 1}`);

        showDestinationPicker({ config: configWith(labelsList), onSend: vi.fn() });

        for (const row of rows()) {
            row.dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
        }

        expect(rows().filter((row) => row.getAttribute("aria-selected") === "true")).toHaveLength(MaxDestinationsPerSend);
        expect(document.querySelector(".x2tg-picker__count")?.textContent).toBe(`You can pick up to ${MaxDestinationsPerSend} destinations.`);
    });

    it("keeps the selection while the query changes", () => {
        const onSend = vi.fn();

        showDestinationPicker({ config: configWith(["Alpha", "Beta"]), onSend });
        press(" ");
        typeQuery("beta");
        rows()[0]?.click();
        press("Enter", { ctrlKey: true });

        expect(onSend.mock.calls[0]?.[0].map((destination: { label: string }) => destination.label)).toEqual(["Alpha", "Beta"]);
    });
});

describe("showDestinationPicker pin to top", () => {
    function pinToggle(row: HTMLElement | undefined): HTMLElement {
        return row!.querySelector<HTMLElement>(".x2tg-picker__pin-toggle")!;
    }

    it("pins a row to the top without selecting it, saves it, and unpins it again", () => {
        const savePinToggle = vi.fn().mockResolvedValue(undefined);

        showDestinationPicker({ config: configWith(["Canal A", "Canal B"]), onSend: vi.fn(), savePinToggle });
        expect(pinToggle(rows()[1]).getAttribute("aria-label")).toBe("Pin to top");

        pinToggle(rows()[1]).click();

        const sectionTitles = Array.from(document.querySelectorAll(".x2tg-picker__section-title")).map((element) => element.textContent);

        expect(sectionTitles).toEqual(["Pinned", "Bot channels"]);
        expect(labels()).toEqual(["Canal B", "Canal A"]);
        expect(rows()[0]?.getAttribute("aria-selected")).toBe("false");
        expect(pinToggle(rows()[0]).getAttribute("aria-pressed")).toBe("true");
        expect(pinToggle(rows()[0]).getAttribute("aria-label")).toBe("Unpin from top");
        expect(savePinToggle).toHaveBeenCalledWith({ type: DestinationRefType.CHANNEL, channelId: "c2" });

        pinToggle(rows()[0]).click();

        expect(labels()).toEqual(["Canal A", "Canal B"]);
        expect(savePinToggle).toHaveBeenCalledTimes(2);
    });

    it("shows saved pins first and refuses pins past the limit", () => {
        const config = configWith(Array.from({ length: MaxPinnedDestinations + 1 }, (_, index) => `Canal ${index + 1}`));
        const savePinToggle = vi.fn().mockResolvedValue(undefined);

        config.pinnedDestinations = config.channels.slice(0, MaxPinnedDestinations).reverse()
            .map((channel) => ({ type: DestinationRefType.CHANNEL, channelId: channel.id }));
        showDestinationPicker({ config, onSend: vi.fn(), savePinToggle });

        expect(labels()[0]).toBe(`Canal ${MaxPinnedDestinations}`);

        pinToggle(rows().at(-1)).click();

        expect(savePinToggle).not.toHaveBeenCalled();
        expect(document.querySelector(".x2tg-picker__count")?.textContent).toBe(`You can pin up to ${MaxPinnedDestinations} destinations.`);
    });
});

describe("showDestinationPicker reorder pinned", () => {
    function openWithPins(labels: string[], pinCount: number) {
        const config = configWith(labels);
        const savePinOrder = vi.fn().mockResolvedValue(undefined);
        const onSend = vi.fn();

        config.pinnedDestinations = config.channels.slice(0, pinCount).map((channel) => ({ type: DestinationRefType.CHANNEL, channelId: channel.id }));
        showDestinationPicker({ config, onSend, savePinOrder });
        return { savePinOrder, onSend };
    }

    function layOut(): void {
        rows().forEach((row, index) => {
            row.getBoundingClientRect = () => ({ top: index * 40, bottom: index * 40 + 40, height: 40, left: 0, right: 300, width: 300, x: 0, y: index * 40, toJSON: () => ({}) }) as DOMRect;
        });
    }

    function pointer(target: EventTarget, type: string, clientY: number): void {
        target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientY, button: 0 }));
    }

    it("drags a pinned row below another, saves the order and does not select it", () => {
        const { savePinOrder } = openWithPins(["A", "B", "C", "D"], 3);

        layOut();

        const row = rows()[0]!;

        pointer(row, "pointerdown", 20);
        pointer(window, "pointermove", 30);
        expect(document.querySelector(".x2tg-picker__list--reordering")).not.toBeNull();
        pointer(window, "pointermove", 105);
        expect(rows()[1]?.style.transform).toBe("translateY(-40px)");
        pointer(window, "pointerup", 105);
        row.click();

        expect(labels()).toEqual(["B", "C", "A", "D"]);
        expect(savePinOrder).toHaveBeenCalledWith(["c2", "c3", "c1"].map((channelId) => ({ type: DestinationRefType.CHANNEL, channelId })));
        expect(document.querySelector(".x2tg-picker__item--selected")).toBeNull();
        expect(document.querySelector(".x2tg-picker__list--reordering")).toBeNull();
        expect(document.querySelector(".x2tg-picker-overlay")).not.toBeNull();
    });

    it("treats a short press as a click and keeps rows outside Pinned fixed", () => {
        const { savePinOrder } = openWithPins(["A", "B", "C"], 2);

        layOut();
        pointer(rows()[0]!, "pointerdown", 20);
        pointer(window, "pointermove", 22);
        pointer(window, "pointerup", 22);
        rows()[0]?.click();

        expect(rows()[0]?.getAttribute("aria-selected")).toBe("true");

        pointer(rows()[2]!, "pointerdown", 100);
        pointer(window, "pointermove", 10);
        pointer(window, "pointerup", 10);

        expect(labels()).toEqual(["A", "B", "C"]);
        expect(savePinOrder).not.toHaveBeenCalled();
    });

    it("moves the active pinned row with Alt+Arrow keys", () => {
        const { savePinOrder } = openWithPins(["A", "B", "C"], 2);

        press("ArrowDown", { altKey: true });
        expect(labels()).toEqual(["B", "A", "C"]);
        expect(activeLabel()).toBe("A");

        press("ArrowDown", { altKey: true });
        expect(labels()).toEqual(["B", "A", "C"]);

        press("ArrowUp", { altKey: true });
        expect(labels()).toEqual(["A", "B", "C"]);
        expect(savePinOrder).toHaveBeenCalledTimes(2);
    });
});

describe("getDestinationsKey", () => {
    it("is order-insensitive", () => {
        const a = { ref: { type: DestinationRefType.CHANNEL, channelId: "a" } as const, label: "A" };
        const b = { ref: { type: DestinationRefType.TELEGRAM_PEER, connectionId: "acc", peerId: 2, kind: TelegramPeerKind.USER, title: "B" } as const, label: "B" };

        expect(getDestinationsKey([a, b])).toBe(getDestinationsKey([b, a]));
    });
});
