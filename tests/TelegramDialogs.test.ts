import { describe, expect, it } from "vitest";
import {
    DialogListActionType,
    canPostToPeer,
    reduceDialogList,
    resolvePeerKind,
    type TelegramDialogEntry
} from "../src/core/telegram-user/Dialogs";
import { TelegramPeerKind } from "../src/core/types/DestinationRef";

function entry(peerId: number, overrides: Partial<TelegramDialogEntry> = {}): TelegramDialogEntry {
    return {
        peerId,
        kind: TelegramPeerKind.USER,
        title: `Chat ${peerId}`,
        canPost: true,
        isPinned: false,
        isArchived: false,
        lastMessageAt: 0,
        hasAvatar: false,
        ...overrides
    };
}

const ids = (list: TelegramDialogEntry[]): number[] => list.map((item) => item.peerId);

describe("reduceDialogList", () => {
    it("orders pinned by rank, then active chats by activity, archived last", () => {
        const list = reduceDialogList([], {
            type: DialogListActionType.PAGE,
            entries: [
                entry(1, { lastMessageAt: 50 }),
                entry(2, { isArchived: true, lastMessageAt: 999 }),
                entry(3, { isPinned: true, pinnedRank: 1 }),
                entry(4, { lastMessageAt: 80 }),
                entry(5, { isPinned: true, pinnedRank: 0 })
            ]
        });

        expect(ids(list)).toEqual([5, 3, 4, 1, 2]);
    });

    it("drops entries without posting rights", () => {
        const list = reduceDialogList([], {
            type: DialogListActionType.PAGE,
            entries: [entry(1), entry(2, { canPost: false })]
        });

        expect(ids(list)).toEqual([1]);
    });

    it("merges later pages without losing newer activity", () => {
        let list = reduceDialogList([], { type: DialogListActionType.PAGE, entries: [entry(1, { lastMessageAt: 100 })] });

        list = reduceDialogList(list, { type: DialogListActionType.PAGE, entries: [entry(1, { lastMessageAt: 10 }), entry(2, { lastMessageAt: 50 })] });

        expect(list.find((item) => item.peerId === 1)?.lastMessageAt).toBe(100);
        expect(ids(list)).toEqual([1, 2]);
    });

    it("upserts renames and new chats, and removes a chat that lost rights", () => {
        let list = reduceDialogList([], { type: DialogListActionType.PAGE, entries: [entry(1, { lastMessageAt: 10 }), entry(2, { lastMessageAt: 20 })] });

        list = reduceDialogList(list, { type: DialogListActionType.UPSERT, entry: entry(1, { title: "Renamed", lastMessageAt: 5 }) });
        expect(list.find((item) => item.peerId === 1)?.title).toBe("Renamed");

        list = reduceDialogList(list, { type: DialogListActionType.UPSERT, entry: entry(3, { lastMessageAt: 30 }) });
        expect(ids(list)).toEqual([3, 2, 1]);

        list = reduceDialogList(list, { type: DialogListActionType.UPSERT, entry: entry(2, { canPost: false }) });
        expect(ids(list)).toEqual([3, 1]);
    });

    it("removes chats and ignores touches for unknown ones", () => {
        const list = reduceDialogList([], { type: DialogListActionType.PAGE, entries: [entry(1), entry(2)] });
        const removed = reduceDialogList(list, { type: DialogListActionType.REMOVE, peerId: 1 });

        expect(ids(removed)).toEqual([2]);
        expect(reduceDialogList(removed, { type: DialogListActionType.TOUCH, peerId: 99, at: 1 })).toBe(removed);
    });

    it("moves a chat up on new activity", () => {
        const list = reduceDialogList([], { type: DialogListActionType.PAGE, entries: [entry(1, { lastMessageAt: 10 }), entry(2, { lastMessageAt: 20 })] });

        expect(ids(reduceDialogList(list, { type: DialogListActionType.TOUCH, peerId: 1, at: 30 }))).toEqual([1, 2]);
    });

    it("forgets the pin rank when a chat is unpinned", () => {
        let list = reduceDialogList([], { type: DialogListActionType.PAGE, entries: [entry(1, { isPinned: true, pinnedRank: 0 })] });

        list = reduceDialogList(list, { type: DialogListActionType.UPSERT, entry: entry(1, { isPinned: false }) });
        expect(list[0]?.pinnedRank).toBeUndefined();
    });

    it("keeps known folders when an update does not carry them, and takes new ones when it does", () => {
        let list = reduceDialogList([], { type: DialogListActionType.PAGE, entries: [entry(1, { folderIds: [2, 5] })] });

        list = reduceDialogList(list, { type: DialogListActionType.UPSERT, entry: entry(1, { title: "Renamed" }) });
        expect(list[0]?.folderIds).toEqual([2, 5]);

        list = reduceDialogList(list, { type: DialogListActionType.UPSERT, entry: entry(1, { folderIds: [] }) });
        expect(list[0]?.folderIds).toEqual([]);
    });
});

describe("resolvePeerKind", () => {
    it("maps users, bots, groups and channels", () => {
        expect(resolvePeerKind({ type: "user" })).toBe(TelegramPeerKind.USER);
        expect(resolvePeerKind({ type: "user", isBot: true })).toBe(TelegramPeerKind.BOT);
        expect(resolvePeerKind({ type: "chat", chatType: "group" })).toBe(TelegramPeerKind.GROUP);
        expect(resolvePeerKind({ type: "chat", chatType: "supergroup" })).toBe(TelegramPeerKind.GROUP);
        expect(resolvePeerKind({ type: "chat", chatType: "gigagroup" })).toBe(TelegramPeerKind.GROUP);
        expect(resolvePeerKind({ type: "chat", chatType: "channel" })).toBe(TelegramPeerKind.CHANNEL);
    });

    it("rejects deleted accounts and unsupported chat types", () => {
        expect(resolvePeerKind({ type: "user", isDeleted: true })).toBeNull();
        expect(resolvePeerKind({ type: "chat", chatType: "monoforum" })).toBeNull();
    });
});

describe("canPostToPeer", () => {
    it("allows people and bots", () => {
        expect(canPostToPeer({ type: "user" })).toBe(true);
        expect(canPostToPeer({ type: "user", isBot: true })).toBe(true);
    });

    it("allows channels only for the creator or admins with post rights", () => {
        expect(canPostToPeer({ type: "chat", chatType: "channel" })).toBe(false);
        expect(canPostToPeer({ type: "chat", chatType: "channel", isAdmin: true })).toBe(false);
        expect(canPostToPeer({ type: "chat", chatType: "channel", isAdmin: true, canPostAsAdmin: true })).toBe(true);
        expect(canPostToPeer({ type: "chat", chatType: "channel", isCreator: true })).toBe(true);
        expect(canPostToPeer({ type: "chat", chatType: "gigagroup" })).toBe(false);
    });

    it("respects group bans, membership and send permissions", () => {
        expect(canPostToPeer({ type: "chat", chatType: "supergroup" })).toBe(true);
        expect(canPostToPeer({ type: "chat", chatType: "supergroup", canSendMessages: false })).toBe(false);
        expect(canPostToPeer({ type: "chat", chatType: "supergroup", canSendMessages: false, isAdmin: true })).toBe(true);
        expect(canPostToPeer({ type: "chat", chatType: "group", isBanned: true, isCreator: true })).toBe(false);
        expect(canPostToPeer({ type: "chat", chatType: "group", isMember: false })).toBe(false);
        expect(canPostToPeer({ type: "user", isDeleted: true })).toBe(false);
    });
});
