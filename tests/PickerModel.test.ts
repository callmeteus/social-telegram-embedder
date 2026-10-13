import { describe, expect, it } from "vitest";
import {
    buildPickerSections,
    normalizeSearchText,
    PickerSectionId,
    type PickerAccountInput,
    type PickerModelInput
} from "../src/content/ui/picker/PickerModel";
import { TelegramFolderColor, type TelegramDialogEntry } from "../src/core/telegram-user/Dialogs";
import { DestinationProvider, SendConnectionType, type SendConnection } from "../src/core/types/Config";
import { DestinationRefType, TelegramPeerKind } from "../src/core/types/DestinationRef";

function dialog(peerId: number, title: string, overrides: Partial<TelegramDialogEntry> = {}): TelegramDialogEntry {
    return { peerId, kind: TelegramPeerKind.USER, title, canPost: true, isPinned: false, isArchived: false, lastMessageAt: 0, hasAvatar: false, ...overrides };
}

const Bot: SendConnection = { id: "bot", type: SendConnectionType.TELEGRAM_BOT, botToken: "1:a", username: "news_bot" };
const Account: SendConnection = { id: "acc", type: SendConnectionType.TELEGRAM_ACCOUNT, displayName: "Gio" };
const OtherAccount: SendConnection = { id: "acc-2", type: SendConnectionType.TELEGRAM_ACCOUNT, displayName: "Ana" };

const channels = [
    { id: "c1", label: "Notícias", provider: DestinationProvider.TELEGRAM, chatId: "-1001", connectionId: "bot" } as const
];

function account(dialogs: TelegramDialogEntry[], searchResults: TelegramDialogEntry[] = [], connectionId = "acc"): PickerAccountInput {
    return { connectionId, dialogs, searchResults };
}

function input(overrides: Partial<PickerModelInput>): PickerModelInput {
    return { channels: [], recentDestinations: [], pinnedDestinations: [], connections: [Account], accounts: [], query: "", ...overrides };
}

describe("normalizeSearchText", () => {
    it("lowercases, trims and strips accents", () => {
        expect(normalizeSearchText("  São JOÃO Ação ")).toBe("sao joao acao");
    });
});

describe("buildPickerSections", () => {
    it("matches every word of the query against title and username", () => {
        const sections = buildPickerSections(input({
            accounts: [account([dialog(1, "Ana Souza", { username: "anas" }), dialog(2, "Ana Lima"), dialog(3, "Bruno")])],
            query: "@ANAS"
        }));

        expect(sections[0]?.items.map((item) => item.title)).toEqual(["Ana Souza"]);

        const multiWord = buildPickerSections(input({
            accounts: [account([dialog(1, "Ana Souza"), dialog(2, "Ana Lima")])],
            query: "lima ana"
        }));

        expect(multiWord[0]?.items.map((item) => item.title)).toEqual(["Ana Lima"]);
    });

    it("hides chats and recent peers of accounts that are not connected", () => {
        const sections = buildPickerSections(input({
            channels: [...channels],
            connections: [Bot],
            recentDestinations: [{ ref: { type: DestinationRefType.TELEGRAM_PEER, connectionId: "acc", peerId: 9, kind: TelegramPeerKind.USER, title: "Ana" }, usedAt: 1 }],
            accounts: [account([dialog(9, "Ana")])]
        }));

        expect(sections.map((section) => section.id)).toEqual([PickerSectionId.BOT_CHANNELS]);
    });

    it("keeps a recent chat visible before the live list arrives and lists it once", () => {
        const recent = { ref: { type: DestinationRefType.TELEGRAM_PEER, connectionId: "acc", peerId: 9, kind: TelegramPeerKind.GROUP, title: "Família" } as const, usedAt: 1 };
        const before = buildPickerSections(input({ recentDestinations: [recent] }));
        const after = buildPickerSections(input({
            recentDestinations: [recent],
            accounts: [account([dialog(9, "Família Silva", { kind: TelegramPeerKind.GROUP }), dialog(10, "Outro")], [dialog(9, "Família Silva")])]
        }));

        expect(before.map((section) => [section.id, section.items.map((item) => item.title)])).toEqual([[PickerSectionId.RECENT, ["Família"]]]);
        expect(after.map((section) => [section.id, section.items.map((item) => item.title)])).toEqual([
            [PickerSectionId.RECENT, ["Família Silva"]],
            [PickerSectionId.TELEGRAM_ACCOUNT, ["Outro"]]
        ]);
    });

    it("ignores server results when the query is empty and drops results without rights", () => {
        const empty = buildPickerSections(input({ accounts: [account([], [dialog(1, "Ana")])] }));
        const filtered = buildPickerSections(input({
            accounts: [account([], [dialog(1, "Ana"), dialog(2, "Ana Canal", { canPost: false })])],
            query: "ana"
        }));

        expect(empty).toEqual([]);
        expect(filtered[0]?.items.map((item) => item.title)).toEqual(["Ana"]);
    });

    it("merges chats of every account: pinned first, then by last activity", () => {
        const sections = buildPickerSections(input({
            connections: [Account, OtherAccount],
            accounts: [
                account([dialog(1, "Fixado Gio", { isPinned: true }), dialog(2, "Antigo", { lastMessageAt: 10 })]),
                account([dialog(3, "Fixado Ana", { isPinned: true }), dialog(4, "Novo", { lastMessageAt: 50 })], [], "acc-2")
            ]
        }));

        expect(sections[0]?.items.map((item) => item.title)).toEqual(["Fixado Gio", "Fixado Ana", "Novo", "Antigo"]);
    });

    it("lists the same chat once per account, each sending through its own account", () => {
        const sections = buildPickerSections(input({
            connections: [Account, OtherAccount],
            accounts: [account([dialog(5, "Grupo")]), account([dialog(5, "Grupo")], [], "acc-2")]
        }));
        const refs = sections[0]?.items.map((item) => item.ref);

        expect(refs).toEqual([
            expect.objectContaining({ connectionId: "acc", peerId: 5 }),
            expect.objectContaining({ connectionId: "acc-2", peerId: 5 })
        ]);
    });

    it("names the bot or account each destination is sent through", () => {
        const UnnamedBot: SendConnection = { id: "bot", type: SendConnectionType.TELEGRAM_BOT, botToken: "2:b", username: "" };
        const sections = buildPickerSections(input({
            channels: [...channels],
            connections: [Bot, Account],
            accounts: [account([dialog(1, "Ana", { username: "ana", isPinned: true })])]
        }));
        const unnamed = buildPickerSections(input({ channels: [...channels], connections: [UnnamedBot] }));

        expect(sections.map((section) => section.items[0]?.route)).toEqual([
            { type: SendConnectionType.TELEGRAM_BOT, label: "Telegram bot · @news_bot" },
            { type: SendConnectionType.TELEGRAM_ACCOUNT, label: "Telegram account · Gio" }
        ]);
        expect(sections[1]?.items[0]?.pinnedInTelegram).toBe(true);
        expect(unnamed[0]?.items[0]?.route?.label).toBe("Telegram bot");
    });

    it("searches by connection name only when its kind has several connections", () => {
        const single = buildPickerSections(input({ accounts: [account([dialog(1, "Grupo A")])], query: "gio" }));

        expect(single).toEqual([]);
    });

    it("puts pinned destinations first, in pin order, and lists them once", () => {
        const pinnedPeer = { type: DestinationRefType.TELEGRAM_PEER, connectionId: "acc", peerId: 2, kind: TelegramPeerKind.USER, title: "Bia (salvo)" } as const;
        const sections = buildPickerSections(input({
            channels: [...channels],
            connections: [Bot, Account],
            pinnedDestinations: [pinnedPeer, { type: DestinationRefType.CHANNEL, channelId: "c1" }],
            recentDestinations: [{ ref: { type: DestinationRefType.CHANNEL, channelId: "c1" }, usedAt: 1 }],
            accounts: [account([dialog(1, "Ana"), dialog(2, "Bia")])]
        }));

        expect(sections.map((section) => [section.id, section.items.map((item) => item.title)])).toEqual([
            [PickerSectionId.PINNED, ["Bia", "Notícias"]],
            [PickerSectionId.TELEGRAM_ACCOUNT, ["Ana"]]
        ]);
    });

    it("keeps a pinned chat visible before the live list arrives and skips pins of missing channels", () => {
        const sections = buildPickerSections(input({
            pinnedDestinations: [
                { type: DestinationRefType.TELEGRAM_PEER, connectionId: "acc", peerId: 2, kind: TelegramPeerKind.USER, title: "Bia" },
                { type: DestinationRefType.CHANNEL, channelId: "gone" }
            ]
        }));

        expect(sections.map((section) => [section.id, section.items.map((item) => item.title)])).toEqual([[PickerSectionId.PINNED, ["Bia"]]]);
    });

    it("finds destinations by connection name when there are several", () => {
        const sections = buildPickerSections(input({
            connections: [Account, OtherAccount],
            accounts: [account([dialog(1, "Grupo A")]), account([dialog(2, "Grupo B")], [], "acc-2")],
            query: "grupo ana"
        }));

        expect(sections[0]?.items.map((item) => item.title)).toEqual(["Grupo B"]);
    });

    it("tags chats with their colored folders and finds them by any folder name", () => {
        const folders = [{ id: 2, title: "NSFW", tagColor: TelegramFolderColor.RED }, { id: 5, title: "Canais - Art" }];
        const accounts = [{ ...account([dialog(1, "Ana", { folderIds: [2, 5] }), dialog(2, "Bruno", { folderIds: [5] }), dialog(3, "Carla")]), folders }];
        const all = buildPickerSections(input({ accounts }));
        const byFolder = buildPickerSections(input({ accounts, query: "canais art" }));

        expect(all[0]?.items.map((item) => [item.title, item.folderTags])).toEqual([
            ["Ana", [{ title: "NSFW", color: TelegramFolderColor.RED }]],
            ["Bruno", []],
            ["Carla", []]
        ]);
        expect(byFolder[0]?.items.map((item) => item.title)).toEqual(["Ana", "Bruno"]);
    });
});
