/** Login and connection states of the Telegram user session. */
export enum TelegramUserSessionState {
    LOGGED_OUT = "LOGGED_OUT",
    AWAITING_QR = "AWAITING_QR",
    AWAITING_CODE = "AWAITING_CODE",
    AWAITING_PASSWORD = "AWAITING_PASSWORD",
    CONNECTING = "CONNECTING",
    READY = "READY",
    ERROR = "ERROR"
}

/** User-facing error categories; translated by the UI, never raw API text. */
export enum TelegramUserErrorCode {
    /** api_id/api_hash rejected (API_ID_INVALID, API_ID_PUBLISHED_FLOOD). */
    INVALID_APP_CREDENTIALS = "INVALID_APP_CREDENTIALS",
    INVALID_CREDENTIALS_FORMAT = "INVALID_CREDENTIALS_FORMAT",
    /** Credentials cannot change while an account is connected. */
    CREDENTIALS_LOCKED = "CREDENTIALS_LOCKED",
    MISSING_CREDENTIALS = "MISSING_CREDENTIALS",
    FLOOD_WAIT = "FLOOD_WAIT",
    SLOW_MODE = "SLOW_MODE",
    INVALID_PHONE = "INVALID_PHONE",
    WRONG_CODE = "WRONG_CODE",
    CODE_EXPIRED = "CODE_EXPIRED",
    WRONG_PASSWORD = "WRONG_PASSWORD",
    SESSION_REVOKED = "SESSION_REVOKED",
    NO_RIGHTS = "NO_RIGHTS",
    PEER_NOT_FOUND = "PEER_NOT_FOUND",
    NOT_CONNECTED = "NOT_CONNECTED",
    NETWORK = "NETWORK",
    /** Upload or send stopped making progress and was cancelled. */
    SEND_STALLED = "SEND_STALLED",
    /** The account that just logged in is already connected on another entry. */
    ACCOUNT_ALREADY_CONNECTED = "ACCOUNT_ALREADY_CONNECTED",
    UNKNOWN = "UNKNOWN"
}

/** A classified error with optional wait time. */
export interface TelegramUserError {
    code: TelegramUserErrorCode;
    waitSeconds?: number;
}

/** The connected account. */
export interface TelegramUserAccount {
    id: number;
    displayName: string;
    username?: string;
}

/** Everything the UI needs to render the session; contains no secrets. */
export interface TelegramUserSessionSnapshot {
    state: TelegramUserSessionState;
    hasCredentials: boolean;
    account?: TelegramUserAccount;
    qr?: {
        url: string;
        expiresAt: number;
        scanned: boolean;
    };
    passwordHint?: string;
    error?: TelegramUserError;
}
