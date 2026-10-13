const CREDENTIALS_STORAGE_KEY = "telegramUserCredentials";
const API_HASH_PATTERN = /^[0-9a-f]{32}$/;

/** App credentials the user creates at my.telegram.org. Device-local, never synced. */
export interface TelegramApiCredentials {
    apiId: number;
    apiHash: string;
}

/** Which credentials field failed validation. */
export enum TelegramCredentialsField {
    API_ID = "API_ID",
    API_HASH = "API_HASH"
}

/** Result of parsing credentials typed by the user. */
export type ParsedTelegramCredentials =
    | { ok: true; credentials: TelegramApiCredentials }
    | { ok: false; field: TelegramCredentialsField };

/**
 * Validates raw form input: api_id is a positive integer, api_hash is 32 hex characters.
 */
export function parseTelegramApiCredentials(rawApiId: unknown, rawApiHash: unknown): ParsedTelegramCredentials {
    const apiIdText = typeof rawApiId === "number" ? String(rawApiId) : String(rawApiId ?? "").trim();
    const apiHash = String(rawApiHash ?? "").trim().toLowerCase();

    if (!/^\d{1,12}$/.test(apiIdText) || Number(apiIdText) <= 0) {
        return { ok: false, field: TelegramCredentialsField.API_ID };
    }

    if (!API_HASH_PATTERN.test(apiHash)) {
        return { ok: false, field: TelegramCredentialsField.API_HASH };
    }

    return { ok: true, credentials: { apiId: Number(apiIdText), apiHash } };
}

/**
 * Reads stored credentials, or null when missing or malformed.
 */
export async function loadTelegramApiCredentials(): Promise<TelegramApiCredentials | null> {
    const result = await chrome.storage.local.get(CREDENTIALS_STORAGE_KEY);
    const stored = result[CREDENTIALS_STORAGE_KEY] as { apiId?: unknown; apiHash?: unknown } | undefined;

    if (!stored) {
        return null;
    }

    const parsed = parseTelegramApiCredentials(stored.apiId, stored.apiHash);

    return parsed.ok ? parsed.credentials : null;
}

/**
 * Persists credentials in chrome.storage.local (this device only).
 */
export async function saveTelegramApiCredentials(credentials: TelegramApiCredentials): Promise<void> {
    await chrome.storage.local.set({ [CREDENTIALS_STORAGE_KEY]: credentials });
}

/**
 * Removes stored credentials.
 */
export async function clearTelegramApiCredentials(): Promise<void> {
    await chrome.storage.local.remove(CREDENTIALS_STORAGE_KEY);
}
