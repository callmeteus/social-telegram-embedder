import {
    DialogListActionType,
    reduceDialogList,
    type TelegramDialogEntry,
    type TelegramFolder
} from "../../../core/telegram-user/Dialogs";
import {
    buildTelegramUserPortName,
    DialogsPortMessageType,
    DialogsRequestType,
    TelegramUserPortName,
    type DialogsPortMessage,
    type DialogsRequest
} from "../../../core/telegram-user/PortProtocol";
import type { TelegramUserSessionSnapshot } from "../../../core/telegram-user/SessionTypes";

/** Callbacks fired as data arrives from the background. */
export interface DialogsConnectionHandlers {
    onSession(snapshot: TelegramUserSessionSnapshot): void;
    /** Current ordered list; `done` once the initial load finished. */
    onDialogs(dialogs: TelegramDialogEntry[], done: boolean): void;
    onFolders(folders: TelegramFolder[]): void;
    onSearchResults(requestId: number, entries: TelegramDialogEntry[]): void;
    onAvatar(peerId: number, dataUrl: string | null): void;
}

/** Opens the dialogs port of one Telegram account; replaceable in tests. */
export type DialogsPortFactory = (connectionId: string) => chrome.runtime.Port;

/**
 * Opens the real dialogs port of a Telegram account connection.
 */
export function connectDialogsPort(connectionId: string): chrome.runtime.Port {
    return chrome.runtime.connect({ name: buildTelegramUserPortName(TelegramUserPortName.DIALOGS, connectionId) });
}

/**
 * Picker side of the dialogs port: keeps the live dialog list via the shared reducer.
 * When a saved list arrives first, it is shown as-is until the fresh load finishes, then
 * replaced in one go so the rows only reorder once.
 */
export class DialogsConnection {
    private readonly port: chrome.runtime.Port;
    private readonly handlers: DialogsConnectionHandlers;
    private dialogs: TelegramDialogEntry[] = [];
    private cached: TelegramDialogEntry[] | null = null;
    private done = false;
    private closed = false;
    private nextRequestId = 1;

    public constructor(
        connectionId: string,
        handlers: DialogsConnectionHandlers,
        connect: DialogsPortFactory = connectDialogsPort
    ) {
        this.handlers = handlers;
        this.port = connect(connectionId);

        this.port.onMessage.addListener((message: DialogsPortMessage) => {
            this.handleMessage(message);
        });

        this.port.onDisconnect.addListener(() => {
            this.closed = true;
        });
    }

    /**
     * Asks the background to search Telegram; returns the request id echoed in the results.
     */
    public search(query: string): number {
        const requestId = this.nextRequestId++;

        this.post({ type: DialogsRequestType.SEARCH, requestId, query });
        return requestId;
    }

    /** Requests a chat photo. */
    public requestAvatar(peerId: number): void {
        this.post({ type: DialogsRequestType.GET_AVATAR, peerId });
    }

    /** Closes the port so the background can go idle. */
    public close(): void {
        if (this.closed) {
            return;
        }

        this.closed = true;
        this.port.disconnect();
    }

    private post(request: DialogsRequest): void {
        if (this.closed) {
            return;
        }

        try {
            this.port.postMessage(request);
        } catch {
            this.closed = true;
        }
    }

    private emitDialogs(): void {
        this.handlers.onDialogs(this.cached ?? this.dialogs, this.done);
    }

    /**
     * Copies fresh folder membership onto the saved rows without reordering them, so tags and
     * folder search work before a long load finishes. Returns true when anything changed.
     */
    private patchCachedFolders(entries: TelegramDialogEntry[]): boolean {
        const fresh = new Map(entries.map((entry) => [entry.peerId, entry.folderIds]));
        let changed = false;

        this.cached = (this.cached ?? []).map((entry) => {
            const folderIds = fresh.get(entry.peerId);

            if (!folderIds || folderIds.join() === (entry.folderIds ?? []).join()) {
                return entry;
            }

            changed = true;
            return { ...entry, folderIds };
        });

        return changed;
    }

    private handleMessage(message: DialogsPortMessage): void {
        switch (message.type) {
            case DialogsPortMessageType.SESSION:
                this.handlers.onSession(message.snapshot);
                return;
            case DialogsPortMessageType.CACHED:
                if (this.done || this.dialogs.length > 0) {
                    return;
                }

                this.cached = reduceDialogList([], { type: DialogListActionType.PAGE, entries: message.entries });
                this.emitDialogs();
                return;
            case DialogsPortMessageType.FOLDERS:
                this.handlers.onFolders(message.folders);
                return;
            case DialogsPortMessageType.PAGE:
                this.dialogs = reduceDialogList(this.dialogs, { type: DialogListActionType.PAGE, entries: message.entries });
                this.done = this.done || message.done;

                if (this.done) {
                    this.cached = null;
                    this.emitDialogs();
                } else
                if (!this.cached) {
                    this.emitDialogs();
                } else
                if (this.patchCachedFolders(message.entries)) {
                    this.emitDialogs();
                }

                return;
            case DialogsPortMessageType.UPDATE:
                this.dialogs = reduceDialogList(this.dialogs, message.action);

                if (this.cached) {
                    this.cached = reduceDialogList(this.cached, message.action);
                }

                this.emitDialogs();
                return;
            case DialogsPortMessageType.SEARCH_RESULTS:
                this.handlers.onSearchResults(message.requestId, message.entries);
                return;
            case DialogsPortMessageType.AVATAR:
                this.handlers.onAvatar(message.peerId, message.dataUrl);
        }
    }
}
