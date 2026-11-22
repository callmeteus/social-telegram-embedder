import { TelegramPeerKind } from "../types/DestinationRef";

/** A chat of the user account as shown in the destination picker. */
export interface TelegramDialogEntry {
    /** Marked peer id (users positive, chats and channels negative). */
    peerId: number;
    kind: TelegramPeerKind;
    title: string;
    username?: string;
    /** Whether the account can post messages here. Entries without rights are never listed. */
    canPost: boolean;
    isPinned: boolean;
    /** Position among pinned dialogs, lower first. */
    pinnedRank?: number;
    isArchived: boolean;
    /** Last activity, epoch milliseconds. */
    lastMessageAt: number;
    hasAvatar: boolean;
    /** Ids of the account's Telegram folders that contain the chat; unknown when absent. */
    folderIds?: number[];
    /** Forum topic thread id inside this peer. The peer is the parent group when set. */
    topicId?: number;
    /** Title of the parent group of a forum topic, used in the picker label and search. */
    parentTitle?: string;
}

/**
 * Stable key of a dialog entry; topics of one group need distinct keys.
 */
export function getDialogEntryKey(entry: Pick<TelegramDialogEntry, "peerId" | "topicId">): string {
    return entry.topicId === undefined
        ? `peer:${entry.peerId}`
        : `peer:${entry.peerId}:topic:${entry.topicId}`;
}

/** Telegram folder tag colors, in the order of the API color ids (0 to 6). */
export enum TelegramFolderColor {
    RED = "RED",
    ORANGE = "ORANGE",
    VIOLET = "VIOLET",
    GREEN = "GREEN",
    CYAN = "CYAN",
    BLUE = "BLUE",
    PINK = "PINK"
}

/** Folder tag colors indexed by the API color id. */
export const TelegramFolderColorById: readonly TelegramFolderColor[] = [
    TelegramFolderColor.RED,
    TelegramFolderColor.ORANGE,
    TelegramFolderColor.VIOLET,
    TelegramFolderColor.GREEN,
    TelegramFolderColor.CYAN,
    TelegramFolderColor.BLUE,
    TelegramFolderColor.PINK
];

/** A chat folder of the user account, in the account's folder order. */
export interface TelegramFolder {
    id: number;
    title: string;
    /** Set when the folder shows a colored tag on its chats (Telegram's "folder tags"). */
    tagColor?: TelegramFolderColor;
}

/** Library-agnostic facts about a peer, used to decide kind and posting rights. */
export interface TelegramPeerFacts {
    type: "user" | "chat";
    isBot?: boolean;
    isDeleted?: boolean;
    /** Chat type for `type: "chat"` (group, supergroup, channel, gigagroup, monoforum, community). */
    chatType?: string;
    isCreator?: boolean;
    isAdmin?: boolean;
    canPostAsAdmin?: boolean;
    isBanned?: boolean;
    isMember?: boolean;
    /** Effective send-messages permission for the account, when known. */
    canSendMessages?: boolean | null;
}

/**
 * Resolves the picker kind for a peer, or null when it cannot be a destination.
 */
export function resolvePeerKind(facts: TelegramPeerFacts): TelegramPeerKind | null {
    if (facts.type === "user") {
        if (facts.isDeleted) {
            return null;
        }

        return facts.isBot ? TelegramPeerKind.BOT : TelegramPeerKind.USER;
    }

    if (facts.chatType === "channel") {
        return TelegramPeerKind.CHANNEL;
    }

    if (facts.chatType === "group" || facts.chatType === "supergroup" || facts.chatType === "gigagroup") {
        return TelegramPeerKind.GROUP;
    }

    return null;
}

/**
 * Returns true when the account can post to the peer.
 * Channels and broadcast groups need creator or post-messages admin rights.
 */
export function canPostToPeer(facts: TelegramPeerFacts): boolean {
    const kind = resolvePeerKind(facts);

    if (!kind) {
        return false;
    }

    if (kind === TelegramPeerKind.USER || kind === TelegramPeerKind.BOT) {
        return true;
    }

    if (facts.isBanned || facts.isMember === false) {
        return false;
    }

    if (kind === TelegramPeerKind.CHANNEL || facts.chatType === "gigagroup") {
        return Boolean(facts.isCreator || facts.canPostAsAdmin);
    }

    if (facts.isCreator || facts.isAdmin) {
        return true;
    }

    return facts.canSendMessages !== false;
}

/** Changes applied to the picker's dialog list. */
export enum DialogListActionType {
    /** A page of dialogs from the initial load, in server order. */
    PAGE = "PAGE",
    /** Insert or replace an entry (rename, new chat, rights change). */
    UPSERT = "UPSERT",
    /** Remove an entry (left, kicked, deleted). */
    REMOVE = "REMOVE",
    /** New activity in a chat: moves it up. */
    TOUCH = "TOUCH"
}

/** An action for {@link reduceDialogList}. */
export type DialogListAction =
    | { type: DialogListActionType.PAGE; entries: TelegramDialogEntry[] }
    | { type: DialogListActionType.UPSERT; entry: TelegramDialogEntry }
    | { type: DialogListActionType.REMOVE; peerId: number }
    | { type: DialogListActionType.TOUCH; peerId: number; at: number };

/**
 * Applies an action to a dialog list and returns a new list ordered like Telegram:
 * pinned first (by pin order), then active chats by last activity, archived chats last.
 * Entries without posting rights are dropped.
 */
export function reduceDialogList(list: TelegramDialogEntry[], action: DialogListAction): TelegramDialogEntry[] {
    const byKey = new Map(list.map((entry) => [getDialogEntryKey(entry), entry]));

    if (action.type === DialogListActionType.PAGE) {
        for (const entry of action.entries) {
            const key = getDialogEntryKey(entry);

            byKey.set(key, mergeEntry(byKey.get(key), entry));
        }
    } else
    if (action.type === DialogListActionType.UPSERT) {
        const key = getDialogEntryKey(action.entry);

        byKey.set(key, mergeEntry(byKey.get(key), action.entry));
    } else
    if (action.type === DialogListActionType.REMOVE) {
        const groupKey = `peer:${action.peerId}`;

        byKey.delete(groupKey);

        for (const key of Array.from(byKey.keys())) {
            if (key.startsWith(`${groupKey}:topic:`)) {
                byKey.delete(key);
            }
        }
    } else {
        const groupKey = `peer:${action.peerId}`;
        const existing = byKey.get(groupKey);

        if (!existing) {
            return list;
        }

        byKey.set(groupKey, { ...existing, lastMessageAt: Math.max(existing.lastMessageAt, action.at) });
    }

    return sortDialogEntries(Array.from(byKey.values()).filter((entry) => entry.canPost));
}

/**
 * Sorts entries in picker order without mutating the input.
 */
export function sortDialogEntries(entries: TelegramDialogEntry[]): TelegramDialogEntry[] {
    return [...entries].sort((left, right) => {
        if (left.isPinned !== right.isPinned) {
            return left.isPinned ? -1 : 1;
        }

        if (left.isPinned && right.isPinned) {
            return (left.pinnedRank ?? Number.MAX_SAFE_INTEGER) - (right.pinnedRank ?? Number.MAX_SAFE_INTEGER);
        }

        if (left.isArchived !== right.isArchived) {
            return left.isArchived ? 1 : -1;
        }

        return right.lastMessageAt - left.lastMessageAt;
    });
}

/** Keeps the newest activity, the known pin rank and folders when a fresher snapshot lacks them. */
function mergeEntry(existing: TelegramDialogEntry | undefined, incoming: TelegramDialogEntry): TelegramDialogEntry {
    if (!existing) {
        return incoming;
    }

    return {
        ...incoming,
        lastMessageAt: Math.max(existing.lastMessageAt, incoming.lastMessageAt),
        pinnedRank: incoming.isPinned ? incoming.pinnedRank ?? existing.pinnedRank : undefined,
        folderIds: incoming.folderIds ?? existing.folderIds,
        parentTitle: incoming.parentTitle ?? existing.parentTitle,
        topicId: incoming.topicId ?? existing.topicId
    };
}
