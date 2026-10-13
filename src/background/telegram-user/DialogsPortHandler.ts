import { DialogListActionType, reduceDialogList, type TelegramDialogEntry } from "../../core/telegram-user/Dialogs";
import { loadCachedDialogs, loadCachedFolders, saveCachedDialogs, saveCachedFolders } from "../../core/telegram-user/DialogsCache";
import {
    DialogsPortMessageType,
    DialogsRequestType,
    type DialogsPortMessage,
    type DialogsRequest
} from "../../core/telegram-user/PortProtocol";
import { TelegramUserSessionState } from "../../core/telegram-user/SessionTypes";
import { bytesToBase64 } from "../../core/telegram/TelegramFileUtils";
import type { TelegramUserSession } from "./TelegramUserSession";

const SEARCH_LIMIT = 20;
const AVATAR_CACHE_LIMIT = 500;
/** Opening the picker asks for every visible photo at once; Telegram throttles bursts of downloads. */
const AVATAR_MAX_CONCURRENT = 4;
const AVATAR_RETRY_AFTER_MS = 30_000;

/** Per account: avatars as data URLs, shared by all pickers for the worker lifetime. */
const avatarCaches = new WeakMap<TelegramUserSession, Map<number, string | null>>();
const pendingAvatarLoads = new WeakMap<TelegramUserSession, Map<number, Promise<string | null>>>();
/** Per account: when a photo download last failed, so failures are retried later instead of cached. */
const failedAvatarLoads = new WeakMap<TelegramUserSession, Map<number, number>>();

let activeAvatarDownloads = 0;
const avatarDownloadQueue: (() => void)[] = [];

/**
 * Serves one destination picker: pushes the session state, streams dialogs page by page,
 * forwards live updates and answers search and avatar requests until the port closes.
 */
export function handleDialogsPort(port: chrome.runtime.Port, session: TelegramUserSession): void {
    let disconnected = false;
    let streaming = false;
    let release: (() => void) | null = null;
    let unsubscribeSession: (() => void) | null = null;
    let unsubscribeClient: (() => void) | null = null;
    let cachedAtStart: TelegramDialogEntry[] = [];

    const post = (message: DialogsPortMessage): void => {
        if (disconnected) {
            return;
        }

        try {
            port.postMessage(message);
        } catch (err) {
            console.debug("[telegram-user] dialogs port post failed: %O", err);
        }
    };

    const startStream = async (): Promise<void> => {
        streaming = true;
        release = session.acquire();

        try {
            const client = await session.getClient();

            if (disconnected) {
                return;
            }

            unsubscribeClient = client.onDialogAction((action) => {
                post({ type: DialogsPortMessageType.UPDATE, action });
            });

            // Folders first: each dialog page then carries the folders its chats belong to.
            const folders = await client.loadFolders().catch((err: unknown) => {
                console.debug("[telegram-user] folders load failed: %O", err);
                return null;
            });

            if (folders) {
                console.debug("[telegram-user] %d folders of %s loaded", folders.length, session.connectionId);
                post({ type: DialogsPortMessageType.FOLDERS, folders });
                void saveCachedFolders(session.connectionId, folders);
            }

            let pages = 0;
            let loaded: TelegramDialogEntry[] = [];

            await client.loadDialogs((entries) => {
                pages++;
                loaded = reduceDialogList(loaded, { type: DialogListActionType.PAGE, entries });
                post({ type: DialogsPortMessageType.PAGE, entries, done: false });

                // Saved every page: a picker closed mid-load (or an idle worker) must still leave a cache behind.
                void saveCachedDialogs(session.connectionId, reduceDialogList(cachedAtStart, { type: DialogListActionType.PAGE, entries: loaded }));
            });

            console.debug("[telegram-user] dialogs of %s streamed in %d pages (%d chats)", session.connectionId, pages, loaded.length);
            post({ type: DialogsPortMessageType.PAGE, entries: [], done: true });
            await saveCachedDialogs(session.connectionId, loaded);
        } catch (err) {
            console.debug("[telegram-user] dialogs stream failed: %O", err);
            streaming = false;
            release?.();
            release = null;
        }
    };

    port.onMessage.addListener((request: DialogsRequest) => {
        void handleRequest(request, session, post);
    });

    port.onDisconnect.addListener(() => {
        disconnected = true;
        unsubscribeSession?.();
        unsubscribeClient?.();
        release?.();
        release = null;
    });

    void Promise.all([loadCachedDialogs(session.connectionId), loadCachedFolders(session.connectionId)]).then(([cached, cachedFolders]) => {
        cachedAtStart = cached;

        if (cachedFolders.length > 0) {
            post({ type: DialogsPortMessageType.FOLDERS, folders: cachedFolders });
        }

        if (cached.length > 0) {
            console.debug("[telegram-user] serving %d cached chats of %s", cached.length, session.connectionId);
            post({ type: DialogsPortMessageType.CACHED, entries: cached });
        }

        return session.initialize();
    }).then(() => {
        if (disconnected) {
            return;
        }

        unsubscribeSession = session.subscribe((snapshot) => {
            post({ type: DialogsPortMessageType.SESSION, snapshot });

            if (snapshot.state === TelegramUserSessionState.READY && !streaming) {
                void startStream();
            }
        });
    });
}

async function handleRequest(
    request: DialogsRequest,
    session: TelegramUserSession,
    post: (message: DialogsPortMessage) => void
): Promise<void> {
    if (request.type === DialogsRequestType.SEARCH) {
        const query = request.query.trim().slice(0, 64);

        try {
            const client = await session.getClient();
            const entries = query.length >= 2 ? await client.searchPeers(query, SEARCH_LIMIT) : [];

            post({ type: DialogsPortMessageType.SEARCH_RESULTS, requestId: request.requestId, entries });
        } catch (err) {
            console.debug("[telegram-user] search failed: %O", err);
            post({ type: DialogsPortMessageType.SEARCH_RESULTS, requestId: request.requestId, entries: [] });
        }

        return;
    }

    if (request.type === DialogsRequestType.GET_AVATAR) {
        post({ type: DialogsPortMessageType.AVATAR, peerId: request.peerId, dataUrl: await loadAvatar(session, request.peerId) });
    }
}

/**
 * Loads a chat or user photo through an account as a data URL, cached for the worker lifetime.
 */
export function loadAvatar(session: TelegramUserSession, peerId: number): Promise<string | null> {
    const avatarCache = getOrCreate(avatarCaches, session);

    if (avatarCache.has(peerId)) {
        return Promise.resolve(avatarCache.get(peerId) ?? null);
    }

    const failedAt = getOrCreate(failedAvatarLoads, session).get(peerId);

    if (failedAt !== undefined && Date.now() - failedAt < AVATAR_RETRY_AFTER_MS) {
        return Promise.resolve(null);
    }

    const pendingAvatars = getOrCreate(pendingAvatarLoads, session);
    let pending = pendingAvatars.get(peerId);

    if (!pending) {
        pending = fetchAvatar(session, peerId, avatarCache).finally(() => pendingAvatars.delete(peerId));
        pendingAvatars.set(peerId, pending);
    }

    return pending;
}

function getOrCreate<V>(caches: WeakMap<TelegramUserSession, Map<number, V>>, session: TelegramUserSession): Map<number, V> {
    let cache = caches.get(session);

    if (!cache) {
        cache = new Map();
        caches.set(session, cache);
    }

    return cache;
}

async function fetchAvatar(session: TelegramUserSession, peerId: number, avatarCache: Map<number, string | null>): Promise<string | null> {
    let dataUrl: string | null;

    await acquireAvatarSlot();

    try {
        const client = await session.getClient();
        const bytes = await client.getAvatar(peerId);

        dataUrl = bytes ? `data:image/jpeg;base64,${bytesToBase64(bytes)}` : null;
    } catch (err) {
        console.debug("[telegram-user] avatar load failed for %d, retrying later: %O", peerId, err);
        getOrCreate(failedAvatarLoads, session).set(peerId, Date.now());
        return null;
    } finally {
        releaseAvatarSlot();
    }

    getOrCreate(failedAvatarLoads, session).delete(peerId);

    if (avatarCache.size >= AVATAR_CACHE_LIMIT) {
        const oldest = avatarCache.keys().next().value;

        if (oldest !== undefined) {
            avatarCache.delete(oldest);
        }
    }

    avatarCache.set(peerId, dataUrl);
    return dataUrl;
}

function acquireAvatarSlot(): Promise<void> {
    if (activeAvatarDownloads < AVATAR_MAX_CONCURRENT) {
        activeAvatarDownloads++;
        return Promise.resolve();
    }

    return new Promise((resolve) => avatarDownloadQueue.push(resolve));
}

function releaseAvatarSlot(): void {
    const next = avatarDownloadQueue.shift();

    if (next) {
        next();
    } else {
        activeAvatarDownloads--;
    }
}
