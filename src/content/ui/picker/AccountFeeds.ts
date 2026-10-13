import { DialogsConnection, type DialogsPortFactory } from "./DialogsConnection";
import type { TelegramDialogEntry, TelegramFolder } from "../../../core/telegram-user/Dialogs";
import { TelegramUserSessionState, type TelegramUserSessionSnapshot } from "../../../core/telegram-user/SessionTypes";

/** What the picker knows about one Telegram account at a given moment. */
export interface AccountFeed {
    connectionId: string;
    session: TelegramUserSessionSnapshot | null;
    dialogs: TelegramDialogEntry[];
    /** The account's chat folders, in its folder order. */
    folders: TelegramFolder[];
    /** True once the initial chat list finished loading. */
    done: boolean;
    /** Server results for the current query. */
    searchResults: TelegramDialogEntry[];
}

/** Callbacks fired as any account's data changes. */
export interface AccountFeedsHandlers {
    onChange(): void;
    onAvatar(connectionId: string, peerId: number, dataUrl: string | null): void;
}

/** Overall state of the connected accounts, used for the picker status line. */
export enum AccountFeedsStatus {
    NONE = "NONE",
    CONNECTING = "CONNECTING",
    SIGNED_OUT = "SIGNED_OUT",
    LOADING = "LOADING",
    READY = "READY"
}

interface FeedEntry {
    feed: AccountFeed;
    connection: DialogsConnection;
    searchRequestId: number;
    searchPending: boolean;
}

/**
 * Keeps one dialogs connection per Telegram account and exposes their chats, search results
 * and session states to the picker.
 */
export class AccountFeeds {
    private readonly entries = new Map<string, FeedEntry>();

    public constructor(connectionIds: string[], handlers: AccountFeedsHandlers, connect?: DialogsPortFactory) {
        for (const connectionId of connectionIds) {
            const feed: AccountFeed = { connectionId, session: null, dialogs: [], folders: [], done: false, searchResults: [] };
            const connection = new DialogsConnection(connectionId, {
                onSession: (snapshot) => {
                    feed.session = snapshot;
                    handlers.onChange();
                },
                onDialogs: (dialogs, done) => {
                    feed.dialogs = dialogs;
                    feed.done = done;
                    handlers.onChange();
                },
                onFolders: (folders) => {
                    feed.folders = folders;
                    handlers.onChange();
                },
                onSearchResults: (requestId, results) => {
                    const entry = this.entries.get(connectionId);

                    if (!entry || requestId !== entry.searchRequestId) {
                        return;
                    }

                    feed.searchResults = results;
                    entry.searchPending = false;
                    handlers.onChange();
                },
                onAvatar: (peerId, dataUrl) => handlers.onAvatar(connectionId, peerId, dataUrl)
            }, connect);

            this.entries.set(connectionId, { feed, connection, searchRequestId: 0, searchPending: false });
        }
    }

    /** Current data of every account, in connection order. */
    public get feeds(): AccountFeed[] {
        return Array.from(this.entries.values(), (entry) => entry.feed);
    }

    /** True while any account search is in flight. */
    public get searchPending(): boolean {
        return Array.from(this.entries.values()).some((entry) => entry.searchPending);
    }

    /** True when at least one account can search right now. */
    public get canSearch(): boolean {
        return this.feeds.some((feed) => feed.session?.state === TelegramUserSessionState.READY);
    }

    /**
     * Summarizes the accounts: no accounts, none ready yet (connecting or signed out),
     * a ready account still loading its first chats, or ready.
     */
    public get status(): AccountFeedsStatus {
        const feeds = this.feeds;

        if (feeds.length === 0) {
            return AccountFeedsStatus.NONE;
        }

        const ready = feeds.filter((feed) => feed.session?.state === TelegramUserSessionState.READY);

        if (ready.length === 0) {
            const connecting = feeds.some((feed) => !feed.session || feed.session.state === TelegramUserSessionState.CONNECTING);

            return connecting ? AccountFeedsStatus.CONNECTING : AccountFeedsStatus.SIGNED_OUT;
        }

        const loading = ready.every((feed) => !feed.done && feed.dialogs.length === 0);

        return loading ? AccountFeedsStatus.LOADING : AccountFeedsStatus.READY;
    }

    /**
     * Searches every ready account; results replace the previous ones as they arrive.
     */
    public search(query: string): void {
        for (const entry of this.entries.values()) {
            if (entry.feed.session?.state === TelegramUserSessionState.READY) {
                entry.searchPending = true;
                entry.searchRequestId = entry.connection.search(query);
            }
        }
    }

    /** Drops search results and ignores searches still in flight. */
    public clearSearch(): void {
        for (const entry of this.entries.values()) {
            entry.feed.searchResults = [];
            entry.searchPending = false;
            entry.searchRequestId = -1;
        }
    }

    /** Marks searches as about to start so the picker can show "Searching". */
    public markSearchPending(): void {
        for (const entry of this.entries.values()) {
            entry.searchPending = entry.feed.session?.state === TelegramUserSessionState.READY;
        }
    }

    /** Requests a chat photo from the account that owns the chat. */
    public requestAvatar(connectionId: string, peerId: number): void {
        this.entries.get(connectionId)?.connection.requestAvatar(peerId);
    }

    /** Closes every port so the background can go idle. */
    public close(): void {
        for (const entry of this.entries.values()) {
            entry.connection.close();
        }
    }
}
