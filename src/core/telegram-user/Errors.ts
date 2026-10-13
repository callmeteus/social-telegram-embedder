import { t } from "../i18n/I18n";
import { TelegramUserErrorCode, type TelegramUserError } from "./SessionTypes";
import { SendStalledMessage } from "./StallGuard";

const RPC_ERROR_CODES: [RegExp, TelegramUserErrorCode][] = [
    [/^API_ID_(INVALID|PUBLISHED_FLOOD)/, TelegramUserErrorCode.INVALID_APP_CREDENTIALS],
    [/^(FLOOD_WAIT|FLOOD_PREMIUM_WAIT)/, TelegramUserErrorCode.FLOOD_WAIT],
    [/^SLOWMODE_WAIT/, TelegramUserErrorCode.SLOW_MODE],
    [/^PHONE_NUMBER_(INVALID|BANNED|FLOOD)/, TelegramUserErrorCode.INVALID_PHONE],
    [/^PHONE_CODE_(INVALID|EMPTY)/, TelegramUserErrorCode.WRONG_CODE],
    [/^PHONE_CODE_EXPIRED/, TelegramUserErrorCode.CODE_EXPIRED],
    [/^PASSWORD_HASH_INVALID/, TelegramUserErrorCode.WRONG_PASSWORD],
    [/^(AUTH_KEY_UNREGISTERED|SESSION_REVOKED|SESSION_EXPIRED|USER_DEACTIVATED)/, TelegramUserErrorCode.SESSION_REVOKED],
    [/^(CHAT_WRITE_FORBIDDEN|CHAT_ADMIN_REQUIRED|CHAT_SEND_\w+_FORBIDDEN|USER_IS_BLOCKED|YOU_BLOCKED_USER|USER_BANNED_IN_CHANNEL|CHAT_RESTRICTED)/, TelegramUserErrorCode.NO_RIGHTS],
    [/^(PEER_ID_INVALID|CHANNEL_PRIVATE|CHANNEL_INVALID|CHAT_ID_INVALID|USERNAME_NOT_OCCUPIED|USERNAME_INVALID)/, TelegramUserErrorCode.PEER_NOT_FOUND],
    [new RegExp(`^${SendStalledMessage}`), TelegramUserErrorCode.SEND_STALLED]
];

/**
 * Maps an mtcute/MTProto error to a user-facing category. Reads only the error text and
 * wait seconds, so it works on any error shape and never exposes raw details.
 */
export function classifyTelegramUserError(err: unknown): TelegramUserError {
    const text = readErrorText(err);

    for (const [pattern, code] of RPC_ERROR_CODES) {
        if (!pattern.test(text)) {
            continue;
        }

        if (code === TelegramUserErrorCode.FLOOD_WAIT || code === TelegramUserErrorCode.SLOW_MODE) {
            return { code, waitSeconds: readWaitSeconds(err) };
        }

        return { code };
    }

    if (/network|websocket|timeout|connection/i.test(text)) {
        return { code: TelegramUserErrorCode.NETWORK };
    }

    return { code: TelegramUserErrorCode.UNKNOWN };
}

/**
 * Returns true when the error means the session no longer exists on the server.
 */
export function isSessionRevokedError(err: unknown): boolean {
    return classifyTelegramUserError(err).code === TelegramUserErrorCode.SESSION_REVOKED;
}

/**
 * Returns true when phone sign-in needs the account's 2FA password.
 */
export function isPasswordNeededError(err: unknown): boolean {
    return readErrorText(err).startsWith("SESSION_PASSWORD_NEEDED");
}

/**
 * Translates a classified error into a plain-language message.
 */
export function formatTelegramUserError(error: TelegramUserError): string {
    switch (error.code) {
        case TelegramUserErrorCode.INVALID_APP_CREDENTIALS:
            return t("tgUserErrorInvalidAppCredentials");
        case TelegramUserErrorCode.INVALID_CREDENTIALS_FORMAT:
            return t("tgUserErrorInvalidCredentialsFormat");
        case TelegramUserErrorCode.CREDENTIALS_LOCKED:
            return t("tgUserErrorCredentialsLocked");
        case TelegramUserErrorCode.MISSING_CREDENTIALS:
            return t("tgUserErrorMissingCredentials");
        case TelegramUserErrorCode.FLOOD_WAIT:
            return t("tgUserErrorFloodWait", formatWait(error.waitSeconds));
        case TelegramUserErrorCode.SLOW_MODE:
            return t("tgUserErrorSlowMode", formatWait(error.waitSeconds));
        case TelegramUserErrorCode.INVALID_PHONE:
            return t("tgUserErrorInvalidPhone");
        case TelegramUserErrorCode.WRONG_CODE:
            return t("tgUserErrorWrongCode");
        case TelegramUserErrorCode.CODE_EXPIRED:
            return t("tgUserErrorCodeExpired");
        case TelegramUserErrorCode.WRONG_PASSWORD:
            return t("tgUserErrorWrongPassword");
        case TelegramUserErrorCode.SESSION_REVOKED:
            return t("tgUserErrorSessionRevoked");
        case TelegramUserErrorCode.NO_RIGHTS:
            return t("tgUserErrorNoRights");
        case TelegramUserErrorCode.PEER_NOT_FOUND:
            return t("tgUserErrorPeerNotFound");
        case TelegramUserErrorCode.NOT_CONNECTED:
            return t("tgUserErrorNotConnected");
        case TelegramUserErrorCode.NETWORK:
            return t("tgUserErrorNetwork");
        case TelegramUserErrorCode.SEND_STALLED:
            return t("tgUserErrorSendStalled");
        case TelegramUserErrorCode.ACCOUNT_ALREADY_CONNECTED:
            return t("tgUserErrorAccountAlreadyConnected");
        default:
            return t("tgUserErrorUnknown");
    }
}

function formatWait(seconds: number | undefined): string {
    const safeSeconds = Math.max(1, Math.ceil(seconds ?? 1));

    if (safeSeconds < 120) {
        return t("durationSeconds", String(safeSeconds));
    }

    return t("durationMinutes", String(Math.ceil(safeSeconds / 60)));
}

function readErrorText(err: unknown): string {
    if (typeof err !== "object" || err === null) {
        return typeof err === "string" ? err : "";
    }

    const record = err as { text?: unknown; message?: unknown };

    if (typeof record.text === "string" && record.text) {
        return record.text;
    }

    return typeof record.message === "string" ? record.message : "";
}

function readWaitSeconds(err: unknown): number | undefined {
    if (typeof err === "object" && err !== null) {
        const seconds = (err as { seconds?: unknown }).seconds;

        if (typeof seconds === "number" && Number.isFinite(seconds)) {
            return seconds;
        }
    }

    const match = /(\d+)/.exec(readErrorText(err) + " " + String((err as { message?: unknown })?.message ?? ""));

    return match ? Number(match[1]) : undefined;
}
