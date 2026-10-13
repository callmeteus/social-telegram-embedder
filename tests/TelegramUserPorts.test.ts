import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleAuthPort } from "../src/background/telegram-user/AuthPortHandler";
import { handleDialogsPort, loadAvatar } from "../src/background/telegram-user/DialogsPortHandler";
import { DialogListActionType, TelegramFolderColor, type TelegramDialogEntry } from "../src/core/telegram-user/Dialogs";
import {
    AuthCommandType,
    AuthPortMessageType,
    DialogsPortMessageType,
    DialogsRequestType
} from "../src/core/telegram-user/PortProtocol";
import { TelegramUserSessionState } from "../src/core/telegram-user/SessionTypes";
import { TelegramPeerKind } from "../src/core/types/DestinationRef";
import { createFakePort } from "./helpers/FakePort";
import { createSessionHarness, SampleCredentials } from "./helpers/SessionHarness";

function entry(peerId: number): TelegramDialogEntry {
    return { peerId, kind: TelegramPeerKind.USER, title: `P${peerId}`, canPost: true, isPinned: false, isArchived: false, lastMessageAt: 0, hasAvatar: false };
}

const ofType = (posted: unknown[], type: string) => posted.filter((message) => (message as { type: string }).type === type);

const localStore = new Map<string, unknown>();

beforeEach(() => {
    localStore.clear();
    vi.stubGlobal("chrome", {
        storage: {
            local: {
                async get(key: string) {
                    return localStore.has(key) ? { [key]: localStore.get(key) } : {};
                },

                async set(items: Record<string, unknown>) {
                    for (const [key, value] of Object.entries(items)) {
                        localStore.set(key, value);
                    }
                },

                async remove(keys: string | string[]) {
                    for (const key of Array.isArray(keys) ? keys : [keys]) {
                        localStore.delete(key);
                    }
                }
            }
        }
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("handleDialogsPort", () => {
    it("serves the saved chat list first and saves the fresh list after a full load", async () => {
        const { session, client } = createSessionHarness({ loggedIn: true });
        const fake = createFakePort();

        localStore.set("telegramUserDialogsCache:acc", [entry(9)]);
        client.loadDialogs.mockImplementation(async (onPage: (entries: TelegramDialogEntry[]) => void) => {
            onPage([entry(1)]);
        });

        handleDialogsPort(fake.port, session);

        await vi.waitFor(() => expect(localStore.get("telegramUserDialogsCache:acc")).toEqual([entry(1)]));
        expect(fake.posted[0]).toEqual({ type: DialogsPortMessageType.CACHED, entries: [entry(9)] });
        fake.remoteDisconnect();
    });

    it("saves the chats loaded so far, merged with the previous list, even when the load never finishes", async () => {
        const { session, client } = createSessionHarness({ loggedIn: true });
        const fake = createFakePort();

        localStore.set("telegramUserDialogsCache:acc", [entry(9)]);
        client.loadDialogs.mockImplementation((onPage: (entries: TelegramDialogEntry[]) => void) => {
            onPage([{ ...entry(1), lastMessageAt: 10 }]);
            return new Promise(() => undefined);
        });

        handleDialogsPort(fake.port, session);

        await vi.waitFor(() => expect(localStore.get("telegramUserDialogsCache:acc")).toEqual([{ ...entry(1), lastMessageAt: 10 }, entry(9)]));
        expect(ofType(fake.posted, DialogsPortMessageType.PAGE)).toHaveLength(1);
        fake.remoteDisconnect();
    });

    it("sends saved folders first, then loads fresh folders before the chats and saves them", async () => {
        const { session, client } = createSessionHarness({ loggedIn: true });
        const fake = createFakePort();
        const fresh = [{ id: 2, title: "NSFW", tagColor: TelegramFolderColor.RED }];

        localStore.set("telegramUserFoldersCache:acc", [{ id: 1, title: "Old" }, { id: "bad" }]);
        client.loadFolders.mockResolvedValue(fresh);
        client.loadDialogs.mockImplementation(async (onPage: (entries: TelegramDialogEntry[]) => void) => {
            expect(client.loadFolders).toHaveBeenCalled();
            onPage([{ ...entry(1), folderIds: [2] }]);
        });

        handleDialogsPort(fake.port, session);

        await vi.waitFor(() => expect(localStore.get("telegramUserFoldersCache:acc")).toEqual(fresh));
        expect(ofType(fake.posted, DialogsPortMessageType.FOLDERS)).toEqual([
            { type: DialogsPortMessageType.FOLDERS, folders: [{ id: 1, title: "Old" }] },
            { type: DialogsPortMessageType.FOLDERS, folders: fresh }
        ]);
        fake.remoteDisconnect();
    });

    it("still streams the chats when the folders fail to load", async () => {
        const { session, client } = createSessionHarness({ loggedIn: true });
        const fake = createFakePort();

        client.loadFolders.mockRejectedValue(new Error("FLOOD_WAIT"));
        client.loadDialogs.mockImplementation(async (onPage: (entries: TelegramDialogEntry[]) => void) => {
            onPage([entry(1)]);
        });

        handleDialogsPort(fake.port, session);

        await vi.waitFor(() => expect(localStore.get("telegramUserDialogsCache:acc")).toEqual([entry(1)]));
        expect(ofType(fake.posted, DialogsPortMessageType.FOLDERS)).toHaveLength(0);
        fake.remoteDisconnect();
    });

    it("skips the saved list when there is none or it is unreadable", async () => {
        const { session } = createSessionHarness();
        const fake = createFakePort();

        localStore.set("telegramUserDialogsCache:acc", [{ peerId: "bad" }]);
        handleDialogsPort(fake.port, session);

        await vi.waitFor(() => expect(fake.posted).toHaveLength(1));
        expect(ofType(fake.posted, DialogsPortMessageType.CACHED)).toHaveLength(0);
    });

    it("tells a logged-out picker the session state and never connects", async () => {
        const { session, createClient } = createSessionHarness();
        const fake = createFakePort();

        handleDialogsPort(fake.port, session);

        await vi.waitFor(() => expect(fake.posted).toHaveLength(1));
        expect(fake.posted[0]).toEqual({ type: DialogsPortMessageType.SESSION, snapshot: { state: TelegramUserSessionState.LOGGED_OUT, hasCredentials: true } });
        expect(createClient).not.toHaveBeenCalled();
    });

    it("streams dialog pages, then live updates, and releases the connection on close", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        const { session, client } = createSessionHarness({ loggedIn: true, idleTimeoutMs: 1000 });
        const fake = createFakePort();

        client.loadDialogs.mockImplementation(async (onPage: (entries: TelegramDialogEntry[]) => void) => {
            onPage([entry(1)]);
            onPage([entry(2)]);
        });

        handleDialogsPort(fake.port, session);

        await vi.waitFor(() => expect(ofType(fake.posted, DialogsPortMessageType.PAGE)).toHaveLength(3));
        expect(ofType(fake.posted, DialogsPortMessageType.PAGE)).toEqual([
            { type: DialogsPortMessageType.PAGE, entries: [entry(1)], done: false },
            { type: DialogsPortMessageType.PAGE, entries: [entry(2)], done: false },
            { type: DialogsPortMessageType.PAGE, entries: [], done: true }
        ]);

        client.emitDialogAction({ type: DialogListActionType.REMOVE, peerId: 1 });
        expect(ofType(fake.posted, DialogsPortMessageType.UPDATE)).toEqual([
            { type: DialogsPortMessageType.UPDATE, action: { type: DialogListActionType.REMOVE, peerId: 1 } }
        ]);

        await vi.advanceTimersByTimeAsync(5000);
        expect(client.destroy).not.toHaveBeenCalled();

        fake.remoteDisconnect();
        client.emitDialogAction({ type: DialogListActionType.REMOVE, peerId: 2 });
        expect(ofType(fake.posted, DialogsPortMessageType.UPDATE)).toHaveLength(1);

        await vi.advanceTimersByTimeAsync(1000);
        expect(client.destroy).toHaveBeenCalled();
        vi.useRealTimers();
    });

    it("answers searches, enforcing a minimum length, and returns empty results on failure", async () => {
        const { session, client } = createSessionHarness({ loggedIn: true });
        const fake = createFakePort();

        client.searchPeers.mockResolvedValueOnce([entry(5)]).mockRejectedValueOnce(new Error("boom"));
        handleDialogsPort(fake.port, session);

        fake.emit({ type: DialogsRequestType.SEARCH, requestId: 1, query: "  an  " });
        fake.emit({ type: DialogsRequestType.SEARCH, requestId: 2, query: "a" });
        fake.emit({ type: DialogsRequestType.SEARCH, requestId: 3, query: "bob" });

        await vi.waitFor(() => expect(ofType(fake.posted, DialogsPortMessageType.SEARCH_RESULTS)).toHaveLength(3));

        const results = Object.fromEntries(ofType(fake.posted, DialogsPortMessageType.SEARCH_RESULTS)
            .map((message) => [(message as { requestId: number }).requestId, (message as { entries: unknown[] }).entries]));

        expect(results).toEqual({ 1: [entry(5)], 2: [], 3: [] });
        expect(client.searchPeers).toHaveBeenCalledWith("an", 20);
        expect(client.searchPeers).toHaveBeenCalledTimes(2);
    });

    it("serves avatars as cached data URLs", async () => {
        const { session, client } = createSessionHarness({ loggedIn: true });
        const fake = createFakePort();

        client.getAvatar.mockResolvedValue(new Uint8Array([1, 2, 3]));
        handleDialogsPort(fake.port, session);
        fake.emit({ type: DialogsRequestType.GET_AVATAR, peerId: 4242 });
        fake.emit({ type: DialogsRequestType.GET_AVATAR, peerId: 4242 });

        await vi.waitFor(() => expect(ofType(fake.posted, DialogsPortMessageType.AVATAR)).toHaveLength(2));
        expect(ofType(fake.posted, DialogsPortMessageType.AVATAR)[0]).toEqual({ type: DialogsPortMessageType.AVATAR, peerId: 4242, dataUrl: "data:image/jpeg;base64,AQID" });
        expect(client.getAvatar).toHaveBeenCalledTimes(1);
    });

    it("does not remember a failed photo download as a chat without photo", async () => {
        const { session, client } = createSessionHarness({ loggedIn: true });

        client.getAvatar.mockRejectedValueOnce(new Error("FLOOD_WAIT_3")).mockResolvedValue(new Uint8Array([1, 2, 3]));

        expect(await loadAvatar(session, 777)).toBeNull();
        expect(await loadAvatar(session, 777)).toBeNull();
        expect(client.getAvatar).toHaveBeenCalledTimes(1);

        vi.spyOn(Date, "now").mockReturnValue(Date.now() + 31_000);

        expect(await loadAvatar(session, 777)).toBe("data:image/jpeg;base64,AQID");
        expect(client.getAvatar).toHaveBeenCalledTimes(2);
        vi.restoreAllMocks();
    });

    it("downloads at most four photos at a time", async () => {
        const { session, client } = createSessionHarness({ loggedIn: true });
        const releases: (() => void)[] = [];
        let running = 0;
        let peak = 0;

        client.getAvatar.mockImplementation(async () => {
            running++;
            peak = Math.max(peak, running);
            await new Promise<void>((resolve) => releases.push(resolve));
            running--;
            return new Uint8Array([1]);
        });

        const loads = Promise.all(Array.from({ length: 10 }, (_, index) => loadAvatar(session, 900 + index)));

        await vi.waitFor(() => expect(releases).toHaveLength(4));
        expect(client.getAvatar).toHaveBeenCalledTimes(4);

        await vi.waitFor(() => {
            releases.splice(0).forEach((release) => release());
            expect(client.getAvatar).toHaveBeenCalledTimes(10);
        });
        releases.splice(0).forEach((release) => release());

        expect((await loads).every((url) => url === "data:image/jpeg;base64,AQ==")).toBe(true);
        expect(peak).toBe(4);
    });
});

describe("handleAuthPort", () => {
    it("pushes snapshots and runs login commands", async () => {
        const { session, saveCredentials } = createSessionHarness({ credentials: null });
        const fake = createFakePort();

        handleAuthPort(fake.port, session);
        await vi.waitFor(() => expect(fake.posted).toHaveLength(1));

        fake.emit({ type: AuthCommandType.SAVE_CREDENTIALS, apiId: String(SampleCredentials.apiId), apiHash: SampleCredentials.apiHash });

        await vi.waitFor(() => expect(saveCredentials).toHaveBeenCalledWith(SampleCredentials));
        expect(fake.posted.at(-1)).toEqual({ type: AuthPortMessageType.SESSION, snapshot: { state: TelegramUserSessionState.LOGGED_OUT, hasCredentials: true } });
        fake.remoteDisconnect();
    });

    it("sends the account avatar once logged in", async () => {
        const { session, client } = createSessionHarness();
        const fake = createFakePort();

        client.getAvatar.mockResolvedValue(new Uint8Array([9]));
        handleAuthPort(fake.port, session);
        fake.emit({ type: AuthCommandType.START_QR });

        await vi.waitFor(() => expect(ofType(fake.posted, AuthPortMessageType.ACCOUNT_AVATAR)).toHaveLength(1));
        expect(ofType(fake.posted, AuthPortMessageType.ACCOUNT_AVATAR)[0]).toEqual({ type: AuthPortMessageType.ACCOUNT_AVATAR, accountId: 777, dataUrl: "data:image/jpeg;base64,CQ==" });
        fake.remoteDisconnect();
    });

    it("cancels a login when the last options page closes", async () => {
        const { session, client } = createSessionHarness();
        const first = createFakePort();
        const second = createFakePort();

        client.signInQr.mockImplementation(() => new Promise(() => {}));
        handleAuthPort(first.port, session);
        handleAuthPort(second.port, session);
        first.emit({ type: AuthCommandType.START_QR });

        await vi.waitFor(() => expect(client.signInQr).toHaveBeenCalled());

        first.remoteDisconnect();
        expect(client.destroy).not.toHaveBeenCalled();

        second.remoteDisconnect();
        await vi.waitFor(() => expect(session.getSnapshot().state).toBe(TelegramUserSessionState.LOGGED_OUT));
        expect(client.destroy).toHaveBeenCalled();
    });

    it("ignores unknown or malformed commands", async () => {
        const { session } = createSessionHarness();
        const fake = createFakePort();
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        handleAuthPort(fake.port, session);
        fake.emit({ type: "DELETE_EVERYTHING" });
        fake.emit(null);

        await vi.waitFor(() => expect(errorSpy).toHaveBeenCalled());
        expect(session.getSnapshot().state).toBe(TelegramUserSessionState.LOGGED_OUT);
        errorSpy.mockRestore();
        fake.remoteDisconnect();
    });
});
