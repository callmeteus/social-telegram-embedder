import type { TelegramDialogEntry, TelegramFolder } from "./Dialogs";

const DIALOGS_CACHE_STORAGE_PREFIX = "telegramUserDialogsCache:";
const FOLDERS_CACHE_STORAGE_PREFIX = "telegramUserFoldersCache:";
const DIALOGS_CACHE_LIMIT = 1000;

function storageKey(connectionId: string): string {
    return `${DIALOGS_CACHE_STORAGE_PREFIX}${connectionId}`;
}

function foldersStorageKey(connectionId: string): string {
    return `${FOLDERS_CACHE_STORAGE_PREFIX}${connectionId}`;
}

/**
 * Reads the chat list an account saved after its last full load, so the picker can show it
 * while the fresh list is still loading. Returns an empty list when missing or unreadable.
 */
export async function loadCachedDialogs(connectionId: string): Promise<TelegramDialogEntry[]> {
    try {
        const key = storageKey(connectionId);
        const result = await chrome.storage.local.get(key);
        const stored: unknown = result[key];

        return Array.isArray(stored) ? stored.filter(isDialogEntry) : [];
    } catch (err) {
        console.debug("[telegram-user] dialogs cache read failed: %O", err);
        return [];
    }
}

/**
 * Saves an account's latest full chat list (this device only; cleared with its session).
 */
export async function saveCachedDialogs(connectionId: string, entries: TelegramDialogEntry[]): Promise<void> {
    try {
        await chrome.storage.local.set({ [storageKey(connectionId)]: entries.slice(0, DIALOGS_CACHE_LIMIT) });
    } catch (err) {
        console.debug("[telegram-user] dialogs cache write failed: %O", err);
    }
}

/**
 * Reads the chat folders an account saved after its last load. Returns an empty list when
 * missing or unreadable.
 */
export async function loadCachedFolders(connectionId: string): Promise<TelegramFolder[]> {
    try {
        const key = foldersStorageKey(connectionId);
        const result = await chrome.storage.local.get(key);
        const stored: unknown = result[key];

        return Array.isArray(stored) ? stored.filter(isFolder) : [];
    } catch (err) {
        console.debug("[telegram-user] folders cache read failed: %O", err);
        return [];
    }
}

/**
 * Saves an account's chat folders (this device only; cleared with its session).
 */
export async function saveCachedFolders(connectionId: string, folders: TelegramFolder[]): Promise<void> {
    try {
        await chrome.storage.local.set({ [foldersStorageKey(connectionId)]: folders });
    } catch (err) {
        console.debug("[telegram-user] folders cache write failed: %O", err);
    }
}

/**
 * Removes an account's saved chat list and folders.
 */
export async function clearCachedDialogs(connectionId: string): Promise<void> {
    await chrome.storage.local.remove([storageKey(connectionId), foldersStorageKey(connectionId)]);
}

function isDialogEntry(value: unknown): value is TelegramDialogEntry {
    const entry = value as Partial<TelegramDialogEntry> | null;

    return typeof entry === "object" && entry !== null
        && typeof entry.peerId === "number"
        && typeof entry.title === "string"
        && typeof entry.kind === "string"
        && typeof entry.lastMessageAt === "number";
}

function isFolder(value: unknown): value is TelegramFolder {
    const folder = value as Partial<TelegramFolder> | null;

    return typeof folder === "object" && folder !== null
        && typeof folder.id === "number"
        && typeof folder.title === "string";
}
