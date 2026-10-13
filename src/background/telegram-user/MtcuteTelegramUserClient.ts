import {
    Chat,
    Dialog,
    IdbStorage,
    InputMedia,
    TelegramClient,
    User,
    WebCryptoProvider,
    type Message,
    type Peer,
    type RawUpdateInfo,
    type TextWithEntities,
    type tl
} from "@mtcute/web";
import { t } from "../../core/i18n/I18n";
import { LegacyAccountConnectionId } from "../../core/storage/Connections";
import type { TelegramApiCredentials } from "../../core/telegram-user/Credentials";
import {
    DialogListActionType,
    TelegramFolderColorById,
    canPostToPeer,
    resolvePeerKind,
    type DialogListAction,
    type TelegramDialogEntry,
    type TelegramFolder,
    type TelegramPeerFacts
} from "../../core/telegram-user/Dialogs";
import { isSessionRevokedError } from "../../core/telegram-user/Errors";
import type { FormattedText } from "../../core/telegram-user/FormattedText";
import type { TelegramUserAccount } from "../../core/telegram-user/SessionTypes";
import { runWithStallGuard } from "../../core/telegram-user/StallGuard";
import type {
    OutgoingMediaFile,
    QrLoginParams,
    TelegramUserClient,
    UploadProgressCallback
} from "../../core/telegram-user/TelegramUserClient";

/** IndexedDB database holding the auth key and peer cache of the first (pre-v4) account. */
export const TelegramUserDatabaseName = "x2tg-telegram-user";

/**
 * IndexedDB database of one account connection. The account migrated from a single-account
 * config keeps the original database so it stays logged in.
 */
export function getTelegramUserDatabaseName(connectionId: string): string {
    return connectionId === LegacyAccountConnectionId ? TelegramUserDatabaseName : `${TelegramUserDatabaseName}-${connectionId}`;
}

/** WASM shipped next to background.js by the build. */
const MTCUTE_WASM_FILE = "mtcute.wasm";

/** Below the 30 s service worker idle limit; WebSocket traffic keeps the worker alive (Chrome 116+). */
const PING_INTERVAL_MS = 20_000;

/** Longest gap without upload progress (or server reply) before a send is cancelled. */
const SEND_IDLE_TIMEOUT_MS = 60_000;

const DIALOG_PAGE_SIZE = 100;
const PEER_REFRESH_UPDATES = new Set(["updateChannel", "updateChat", "updateFolderPeers"]);
const PIN_UPDATES = new Set(["updateDialogPinned", "updatePinnedDialogs"]);

/** Dialog placement known from the last load, reused when updates only carry the peer. */
interface DialogPlacement {
    isPinned: boolean;
    pinnedRank?: number;
    isArchived: boolean;
    lastMessageAt: number;
    folderIds?: number[];
}

/** A loaded folder and the test that tells whether a dialog belongs to it. */
interface FolderMatcher {
    folder: TelegramFolder;
    includes: (dialog: Dialog) => boolean;
}

/**
 * mtcute-backed {@link TelegramUserClient}. The only module that imports mtcute,
 * so it must never be reached from content scripts or the options page.
 */
export class MtcuteTelegramUserClient implements TelegramUserClient {
    private readonly client: TelegramClient;
    private readonly dialogListeners = new Set<(action: DialogListAction) => void>();
    private readonly placements = new Map<number, DialogPlacement>();
    private folderMatchers: FolderMatcher[] = [];
    private updatesStarted = false;

    public constructor(credentials: TelegramApiCredentials, databaseName: string) {
        this.client = new TelegramClient({
            apiId: credentials.apiId,
            apiHash: credentials.apiHash,
            storage: new IdbStorage(databaseName),
            crypto: new WebCryptoProvider({ wasmInput: chrome.runtime.getURL(MTCUTE_WASM_FILE) }),

            initConnectionOptions: {
                deviceModel: "Chrome",
                appVersion: chrome.runtime.getManifest().version
            },

            network: {
                pingInterval: PING_INTERVAL_MS
            }
        });

        this.client.onNewMessage.add((message) => {
            this.handleNewMessage(message);
        });

        this.client.onRawUpdate.add((info) => {
            this.handleRawUpdate(info);
        });
    }

    public async connect(): Promise<void> {
        await this.client.connect();
    }

    public async destroy(): Promise<void> {
        this.dialogListeners.clear();
        await this.client.destroy();
    }

    public async getAuthorizedAccount(): Promise<TelegramUserAccount | null> {
        const self = await this.client.storage.self.fetch();

        if (!self) {
            return null;
        }

        return mapAccount(await this.client.getMe());
    }

    public async startUpdates(): Promise<void> {
        if (this.updatesStarted) {
            return;
        }

        this.updatesStarted = true;
        await this.client.startUpdatesLoop();
    }

    public async signInQr(params: QrLoginParams): Promise<TelegramUserAccount> {
        const user = await this.client.signInQr({
            abortSignal: params.signal,
            onUrlUpdated: (url, expires) => params.onUrl(url, expires),
            onQrScanned: () => params.onScanned(),
            password: () => params.password(),
            invalidPasswordCallback: () => params.onInvalidPassword()
        });

        return mapAccount(user);
    }

    public async getPasswordHint(): Promise<string | null> {
        return this.client.getPasswordHint();
    }

    public async sendCode(phone: string): Promise<{ phoneCodeHash: string } | { account: TelegramUserAccount }> {
        const result = await this.client.sendCode({ phone });

        if (result instanceof User) {
            return { account: mapAccount(result) };
        }

        return { phoneCodeHash: result.phoneCodeHash };
    }

    public async signIn(phone: string, phoneCodeHash: string, code: string): Promise<TelegramUserAccount> {
        return mapAccount(await this.client.signIn({ phone, phoneCodeHash, phoneCode: code }));
    }

    public async checkPassword(password: string): Promise<TelegramUserAccount> {
        return mapAccount(await this.client.checkPassword(password));
    }

    public async logOut(): Promise<void> {
        await this.client.logOut();
    }

    public async loadFolders(): Promise<TelegramFolder[]> {
        const result = await this.client.getFolders();
        const tagsEnabled = Boolean(result.tagsEnabled);
        const selfId = (await this.client.storage.self.fetch())?.userId;

        this.folderMatchers = result.filters
            .filter((raw): raw is tl.RawDialogFilter | tl.RawDialogFilterChatlist => raw._ !== "dialogFilterDefault")
            .map((raw) => createFolderMatcher(raw, tagsEnabled, selfId));

        return this.folderMatchers.map((matcher) => matcher.folder);
    }

    public async loadDialogs(onPage: (entries: TelegramDialogEntry[]) => void): Promise<void> {
        let page: TelegramDialogEntry[] = [];
        let pinnedRank = 0;
        let inFolders = 0;
        const folderTotals = new Map<number, { total: number; postable: number }>();

        for await (const dialog of this.client.iterDialogs({ archived: "keep", chunkSize: DIALOG_PAGE_SIZE })) {
            const placement: DialogPlacement = {
                isPinned: dialog.isPinned,
                pinnedRank: dialog.isPinned ? pinnedRank++ : undefined,
                isArchived: dialog.isArchived,
                lastMessageAt: dialog.lastMessage?.date.getTime() ?? 0,
                folderIds: this.matchFolders(dialog)
            };
            const entry = mapPeerToEntry(dialog.peer, placement);

            this.placements.set(dialog.peer.id, placement);

            for (const folderId of placement.folderIds ?? []) {
                const totals = folderTotals.get(folderId) ?? { total: 0, postable: 0 };

                totals.total++;
                totals.postable += entry?.canPost ? 1 : 0;
                folderTotals.set(folderId, totals);
            }

            if (entry?.canPost) {
                page.push(entry);
                inFolders += placement.folderIds && placement.folderIds.length > 0 ? 1 : 0;
            }

            if (page.length >= DIALOG_PAGE_SIZE) {
                onPage(page);
                page = [];
            }
        }

        console.debug("[telegram-user] %d chats matched %d folders", inFolders, this.folderMatchers.length);

        for (const matcher of this.folderMatchers) {
            const totals = folderTotals.get(matcher.folder.id) ?? { total: 0, postable: 0 };

            console.debug(
                "[telegram-user] folder \"%s\": %d chats, %d accept posts from this account",
                matcher.folder.title,
                totals.total,
                totals.postable
            );
        }
        onPage(page);
    }

    public async searchPeers(query: string, limit: number): Promise<TelegramDialogEntry[]> {
        const found = await this.client.call({ _: "contacts.search", q: query, limit });
        const users = new Map(found.users.map((user) => [user.id, user]));
        const chats = new Map(found.chats.map((chat) => [chat.id, chat]));
        const entries: TelegramDialogEntry[] = [];

        for (const peer of [...found.myResults, ...found.results]) {
            const resolved = resolveFoundPeer(peer, users, chats);
            const entry = resolved ? mapPeerToEntry(resolved, this.placementFor(resolved.id)) : null;

            if (entry?.canPost) {
                entries.push(entry);
            }
        }

        return entries;
    }

    public async getAvatar(peerId: number): Promise<Uint8Array | null> {
        const peer = await this.client.getPeer(peerId);
        const photo = peer.photo;

        if (!photo) {
            return null;
        }

        return this.client.downloadAsBuffer(photo.small);
    }

    public onDialogAction(listener: (action: DialogListAction) => void): () => void {
        this.dialogListeners.add(listener);

        return () => {
            this.dialogListeners.delete(listener);
        };
    }

    public onSessionRevoked(listener: () => void): () => void {
        const handler = (err: Error): void => {
            if (isSessionRevokedError(err)) {
                listener();
            }
        };

        this.client.onError.add(handler);

        return () => {
            this.client.onError.remove(handler);
        };
    }

    public async sendText(peerId: number, text: FormattedText): Promise<void> {
        await runWithStallGuard(async (abortSignal) => {
            await this.client.sendText(peerId, toTextWithEntities(text), { abortSignal });
        }, SEND_IDLE_TIMEOUT_MS);
    }

    public async sendMedia(
        peerId: number,
        file: OutgoingMediaFile,
        caption?: FormattedText,
        onProgress?: UploadProgressCallback
    ): Promise<void> {
        console.debug("[telegram-user] sending %s (%d bytes) to %d", file.kind, file.blob.size, peerId);

        await runWithStallGuard(async (abortSignal, touch) => {
            await this.client.sendMedia(peerId, toInputMedia(file, caption, false), {
                abortSignal,
                progressCallback: (uploaded, total) => {
                    touch();
                    logUploadProgress(0, uploaded, total);
                    onProgress?.(uploaded, total);
                }
            });
        }, SEND_IDLE_TIMEOUT_MS);

        console.debug("[telegram-user] sent %s to %d", file.kind, peerId);
    }

    public async sendMediaGroup(
        peerId: number,
        files: OutgoingMediaFile[],
        caption?: FormattedText,
        onProgress?: (index: number, uploaded: number, total: number) => void
    ): Promise<void> {
        const medias = files.map((file, index) => toInputMedia(file, index === 0 ? caption : undefined, true));

        console.debug("[telegram-user] sending album of %d files to %d", files.length, peerId);

        await runWithStallGuard(async (abortSignal, touch) => {
            await this.client.sendMediaGroup(peerId, medias, {
                abortSignal,
                progressCallback: (index, uploaded, total) => {
                    touch();
                    logUploadProgress(index, uploaded, total);
                    onProgress?.(index, uploaded, total);
                }
            });
        }, SEND_IDLE_TIMEOUT_MS);

        console.debug("[telegram-user] sent album to %d", peerId);
    }

    private matchFolders(dialog: Dialog): number[] {
        return this.folderMatchers.filter((matcher) => matcher.includes(dialog)).map((matcher) => matcher.folder.id);
    }

    private placementFor(peerId: number): DialogPlacement {
        return this.placements.get(peerId) ?? { isPinned: false, isArchived: false, lastMessageAt: 0 };
    }

    private emit(action: DialogListAction): void {
        for (const listener of this.dialogListeners) {
            listener(action);
        }
    }

    private handleNewMessage(message: Message): void {
        const peer = message.chat;
        const placement = { ...this.placementFor(peer.id), lastMessageAt: message.date.getTime() };
        const entry = mapPeerToEntry(peer, placement);

        this.placements.set(peer.id, placement);

        if (!entry) {
            return;
        }

        this.emit(entry.canPost
            ? { type: DialogListActionType.UPSERT, entry }
            : { type: DialogListActionType.REMOVE, peerId: entry.peerId });
    }

    private handleRawUpdate(info: RawUpdateInfo): void {
        const update = info.update;

        if (PIN_UPDATES.has(update._)) {
            void this.refreshPinned().catch((err: unknown) => {
                console.debug("[telegram-user] pinned refresh failed: %O", err);
            });
            return;
        }

        if (!PEER_REFRESH_UPDATES.has(update._)) {
            return;
        }

        for (const peerId of collectUpdatePeerIds(update)) {
            void this.refreshPeer(peerId).catch((err: unknown) => {
                console.debug("[telegram-user] peer refresh failed: %O", err);
            });
        }
    }

    private async refreshPeer(peerId: number): Promise<void> {
        const [dialog] = await this.client.getPeerDialogs(peerId).catch(() => [null]);

        if (!dialog) {
            this.placements.delete(peerId);
            this.emit({ type: DialogListActionType.REMOVE, peerId });
            return;
        }

        const previous = this.placementFor(peerId);
        const placement: DialogPlacement = {
            isPinned: dialog.isPinned,
            pinnedRank: dialog.isPinned ? previous.pinnedRank : undefined,
            isArchived: dialog.isArchived,
            lastMessageAt: Math.max(previous.lastMessageAt, dialog.lastMessage?.date.getTime() ?? 0),
            folderIds: this.matchFolders(dialog)
        };
        const entry = mapPeerToEntry(dialog.peer, placement);

        this.placements.set(peerId, placement);

        this.emit(entry?.canPost
            ? { type: DialogListActionType.UPSERT, entry }
            : { type: DialogListActionType.REMOVE, peerId });
    }

    private async refreshPinned(): Promise<void> {
        const pinnedNow = new Set<number>();
        let pinnedRank = 0;

        for await (const dialog of this.client.iterDialogs({ pinned: "only", archived: "keep" })) {
            const previous = this.placementFor(dialog.peer.id);
            const placement: DialogPlacement = { ...previous, isPinned: true, pinnedRank: pinnedRank++, folderIds: this.matchFolders(dialog) };
            const entry = mapPeerToEntry(dialog.peer, placement);

            pinnedNow.add(dialog.peer.id);
            this.placements.set(dialog.peer.id, placement);

            if (entry?.canPost) {
                this.emit({ type: DialogListActionType.UPSERT, entry });
            }
        }

        for (const [peerId, placement] of this.placements) {
            if (placement.isPinned && !pinnedNow.has(peerId)) {
                this.placements.set(peerId, { ...placement, isPinned: false, pinnedRank: undefined });
                void this.refreshPeer(peerId);
            }
        }
    }
}

/**
 * Deletes a local session database (auth key and cached peers).
 */
export function wipeTelegramUserDatabase(databaseName: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(databaseName);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error ?? new Error("[telegram-user] failed to delete session database"));
        request.onblocked = () => resolve();
    });
}

function mapAccount(user: User): TelegramUserAccount {
    return {
        id: user.id,
        displayName: user.displayName,
        username: user.username ?? undefined
    };
}

function toPeerFacts(peer: Peer): TelegramPeerFacts {
    if (peer.type === "user") {
        return { type: "user", isBot: peer.isBot, isDeleted: peer.isDeleted };
    }

    const ownCanSend = peer.permissions?.canSendMessages ?? true;
    const defaultCanSend = peer.defaultPermissions?.canSendMessages ?? true;

    return {
        type: "chat",
        chatType: peer.chatType,
        isCreator: peer.isCreator,
        isAdmin: peer.isAdmin,
        canPostAsAdmin: Boolean(peer.adminRights?.postMessages),
        isBanned: peer.isBanned,
        isMember: peer.isMember,
        canSendMessages: ownCanSend && defaultCanSend
    };
}

function mapPeerToEntry(peer: Peer, placement: DialogPlacement): TelegramDialogEntry | null {
    const facts = toPeerFacts(peer);
    const kind = resolvePeerKind(facts);

    if (!kind) {
        return null;
    }

    const isSelf = peer.type === "user" && peer.isSelf;

    return {
        peerId: peer.id,
        kind,
        title: isSelf ? t("tgUserSavedMessages") : peer.displayName,
        username: peer.username ?? undefined,
        canPost: canPostToPeer(facts),
        isPinned: placement.isPinned,
        pinnedRank: placement.pinnedRank,
        isArchived: placement.isArchived,
        lastMessageAt: placement.lastMessageAt,
        hasAvatar: Boolean(peer.photo),
        folderIds: placement.folderIds
    };
}

/**
 * Builds the membership test of a folder. Folder-pinned chats live only in `pinnedPeers`, so
 * they are matched explicitly; "Saved Messages" (`inputPeerSelf`) is swapped for the account's
 * own user id because mtcute cannot mark it.
 */
function createFolderMatcher(raw: tl.RawDialogFilter | tl.RawDialogFilterChatlist, tagsEnabled: boolean, selfId: number | undefined): FolderMatcher {
    const tagColor = tagsEnabled && raw.color !== undefined ? TelegramFolderColorById[raw.color] : undefined;
    const folder: TelegramFolder = { id: raw.id, title: raw.title.text, tagColor };
    const toMarkable = (peers: tl.TypeInputPeer[]): tl.TypeInputPeer[] => peers.flatMap((peer) => {
        if (peer._ === "inputPeerSelf") {
            return selfId === undefined ? [] : [{ _: "inputPeerUser", userId: selfId } as tl.TypeInputPeer];
        }

        return peer._ === "inputPeerEmpty" ? [] : [peer];
    });
    const pinnedPeers = toMarkable(raw.pinnedPeers);
    const normalized = raw._ === "dialogFilter"
        ? { ...raw, pinnedPeers, includePeers: toMarkable(raw.includePeers), excludePeers: toMarkable(raw.excludePeers) }
        : { ...raw, pinnedPeers, includePeers: toMarkable(raw.includePeers) };

    try {
        const pinnedIds = new Set(pinnedPeers.map((peer) => markInputPeerId(peer)));
        const matches = Dialog.filterFolder(normalized, false);

        return { folder, includes: (dialog) => pinnedIds.has(dialog.peer.id) || matches(dialog) };
    } catch (err) {
        console.debug("[telegram-user] folder %d has peers that cannot be matched: %O", raw.id, err);
        return { folder, includes: () => false };
    }
}

function markInputPeerId(peer: tl.TypeInputPeer): number | null {
    if (peer._ === "inputPeerUser" || peer._ === "inputPeerUserFromMessage") {
        return peer.userId;
    }

    if (peer._ === "inputPeerChat") {
        return -peer.chatId;
    }

    if (peer._ === "inputPeerChannel" || peer._ === "inputPeerChannelFromMessage") {
        return -1_000_000_000_000 - peer.channelId;
    }

    return null;
}

function resolveFoundPeer(
    peer: tl.TypePeer,
    users: Map<number, tl.TypeUser>,
    chats: Map<number, tl.TypeChat>
): Peer | null {
    if (peer._ === "peerUser") {
        const raw = users.get(peer.userId);
        return raw ? new User(raw) : null;
    }

    const raw = chats.get(peer._ === "peerChat" ? peer.chatId : peer.channelId);

    return raw ? new Chat(raw) : null;
}

function collectUpdatePeerIds(update: tl.TypeUpdate): number[] {
    if (update._ === "updateChannel") {
        return [-1_000_000_000_000 - update.channelId];
    }

    if (update._ === "updateChat") {
        return [-update.chatId];
    }

    if (update._ === "updateFolderPeers") {
        return update.folderPeers.map((folderPeer) => markPeerId(folderPeer.peer));
    }

    return [];
}

function markPeerId(peer: tl.TypePeer): number {
    if (peer._ === "peerUser") {
        return peer.userId;
    }

    if (peer._ === "peerChat") {
        return -peer.chatId;
    }

    return -1_000_000_000_000 - peer.channelId;
}

function logUploadProgress(index: number, uploaded: number, total: number): void {
    if (uploaded === total || uploaded === 0) {
        console.debug("[telegram-user] upload file %d: %d/%d bytes", index, uploaded, total);
    }
}

function toTextWithEntities(text: FormattedText): TextWithEntities {
    return {
        text: text.text,
        entities: text.bold.map((range) => ({ _: "messageEntityBold", offset: range.offset, length: range.length }))
    };
}

function toInputMedia(file: OutgoingMediaFile, caption: FormattedText | undefined, inAlbum: boolean) {
    const params = {
        caption: caption ? toTextWithEntities(caption) : undefined,
        fileName: file.fileName,
        fileMime: file.blob.type || undefined,
        fileSize: file.blob.size
    };

    if (file.kind === "photo") {
        return InputMedia.photo(file.blob, params);
    }

    if (file.kind === "gif" && !inAlbum) {
        return InputMedia.animation(file.blob, params);
    }

    return InputMedia.video(file.blob, { ...params, supportsStreaming: true });
}
