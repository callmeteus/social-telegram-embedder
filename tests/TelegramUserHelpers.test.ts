import { afterEach, describe, expect, it, vi } from "vitest";
import {
    TelegramCredentialsField,
    clearTelegramApiCredentials,
    loadTelegramApiCredentials,
    parseTelegramApiCredentials,
    saveTelegramApiCredentials
} from "../src/core/telegram-user/Credentials";
import {
    classifyTelegramUserError,
    formatTelegramUserError,
    isPasswordNeededError,
    isSessionRevokedError
} from "../src/core/telegram-user/Errors";
import { telegramHtmlToFormattedText } from "../src/core/telegram-user/FormattedText";
import { TelegramUserErrorCode } from "../src/core/telegram-user/SessionTypes";

const SampleHash = "0123456789abcdef0123456789abcdef";

function installLocalStorage(initial: Record<string, unknown> = {}): Record<string, unknown> {
    const store = { ...initial };

    (globalThis.chrome as unknown as { storage: unknown }).storage = {
        local: {
            get: vi.fn(async (key: string) => ({ [key]: store[key] })),
            set: vi.fn(async (items: Record<string, unknown>) => Object.assign(store, items)),
            remove: vi.fn(async (key: string) => {
                delete store[key];
            })
        }
    };
    return store;
}

afterEach(() => {
    delete (globalThis.chrome as unknown as { storage?: unknown }).storage;
});

describe("parseTelegramApiCredentials", () => {
    it("accepts a numeric api_id and a 32-character hex api_hash, trimming and lowercasing", () => {
        expect(parseTelegramApiCredentials(" 12345 ", ` ${SampleHash.toUpperCase()} `))
            .toEqual({ ok: true, credentials: { apiId: 12345, apiHash: SampleHash } });
        expect(parseTelegramApiCredentials(987, SampleHash)).toEqual({ ok: true, credentials: { apiId: 987, apiHash: SampleHash } });
    });

    it("rejects malformed api_id values", () => {
        for (const apiId of ["", "0", "-5", "12a", "1234567890123", null, undefined, 1.5]) {
            expect(parseTelegramApiCredentials(apiId, SampleHash)).toEqual({ ok: false, field: TelegramCredentialsField.API_ID });
        }
    });

    it("rejects malformed api_hash values", () => {
        for (const apiHash of ["", "abc", SampleHash + "0", "g".repeat(32), null]) {
            expect(parseTelegramApiCredentials("1", apiHash)).toEqual({ ok: false, field: TelegramCredentialsField.API_HASH });
        }
    });
});

describe("credentials storage", () => {
    it("saves to device-local storage, loads and clears", async () => {
        const store = installLocalStorage();

        await saveTelegramApiCredentials({ apiId: 1, apiHash: SampleHash });
        expect(store.telegramUserCredentials).toEqual({ apiId: 1, apiHash: SampleHash });
        expect(await loadTelegramApiCredentials()).toEqual({ apiId: 1, apiHash: SampleHash });

        await clearTelegramApiCredentials();
        expect(await loadTelegramApiCredentials()).toBeNull();
    });

    it("ignores tampered stored values", async () => {
        installLocalStorage({ telegramUserCredentials: { apiId: "x", apiHash: "nope" } });

        expect(await loadTelegramApiCredentials()).toBeNull();
    });
});

describe("classifyTelegramUserError", () => {
    const rpc = (text: string, extra: Record<string, unknown> = {}) => Object.assign(new Error(`Telegram error: ${text}`), { text, ...extra });

    it.each([
        ["API_ID_INVALID", TelegramUserErrorCode.INVALID_APP_CREDENTIALS],
        ["API_ID_PUBLISHED_FLOOD", TelegramUserErrorCode.INVALID_APP_CREDENTIALS],
        ["PHONE_NUMBER_INVALID", TelegramUserErrorCode.INVALID_PHONE],
        ["PHONE_CODE_INVALID", TelegramUserErrorCode.WRONG_CODE],
        ["PHONE_CODE_EXPIRED", TelegramUserErrorCode.CODE_EXPIRED],
        ["PASSWORD_HASH_INVALID", TelegramUserErrorCode.WRONG_PASSWORD],
        ["AUTH_KEY_UNREGISTERED", TelegramUserErrorCode.SESSION_REVOKED],
        ["SESSION_REVOKED", TelegramUserErrorCode.SESSION_REVOKED],
        ["CHAT_WRITE_FORBIDDEN", TelegramUserErrorCode.NO_RIGHTS],
        ["CHAT_SEND_PHOTOS_FORBIDDEN", TelegramUserErrorCode.NO_RIGHTS],
        ["USER_IS_BLOCKED", TelegramUserErrorCode.NO_RIGHTS],
        ["PEER_ID_INVALID", TelegramUserErrorCode.PEER_NOT_FOUND],
        ["CHANNEL_PRIVATE", TelegramUserErrorCode.PEER_NOT_FOUND],
        ["SOMETHING_ELSE", TelegramUserErrorCode.UNKNOWN]
    ])("maps %s", (text, code) => {
        expect(classifyTelegramUserError(rpc(text)).code).toBe(code);
    });

    it("reads wait seconds from the error object or the text", () => {
        expect(classifyTelegramUserError(rpc("FLOOD_WAIT_%d", { seconds: 42 }))).toEqual({ code: TelegramUserErrorCode.FLOOD_WAIT, waitSeconds: 42 });
        expect(classifyTelegramUserError({ text: "SLOWMODE_WAIT_30" })).toEqual({ code: TelegramUserErrorCode.SLOW_MODE, waitSeconds: 30 });
    });

    it("treats connection failures as network errors and tolerates odd inputs", () => {
        expect(classifyTelegramUserError(new Error("WebSocket connection closed")).code).toBe(TelegramUserErrorCode.NETWORK);
        expect(classifyTelegramUserError(null).code).toBe(TelegramUserErrorCode.UNKNOWN);
        expect(classifyTelegramUserError("PHONE_CODE_EXPIRED").code).toBe(TelegramUserErrorCode.CODE_EXPIRED);
    });

    it("detects revoked sessions and 2FA prompts", () => {
        expect(isSessionRevokedError(rpc("AUTH_KEY_UNREGISTERED"))).toBe(true);
        expect(isSessionRevokedError(rpc("FLOOD_WAIT_5"))).toBe(false);
        expect(isPasswordNeededError(rpc("SESSION_PASSWORD_NEEDED"))).toBe(true);
        expect(isPasswordNeededError(rpc("PHONE_CODE_INVALID"))).toBe(false);
    });
});

describe("formatTelegramUserError", () => {
    it("gives plain-language messages with readable waits", () => {
        expect(formatTelegramUserError({ code: TelegramUserErrorCode.FLOOD_WAIT, waitSeconds: 45 }))
            .toBe("Telegram asked to wait 45 s before trying again.");
        expect(formatTelegramUserError({ code: TelegramUserErrorCode.FLOOD_WAIT, waitSeconds: 600 }))
            .toBe("Telegram asked to wait 10 min before trying again.");
        expect(formatTelegramUserError({ code: TelegramUserErrorCode.WRONG_PASSWORD })).toBe("Wrong password. Try again.");
    });

    it("has a message for every error code", () => {
        for (const code of Object.values(TelegramUserErrorCode)) {
            const message = formatTelegramUserError({ code, waitSeconds: 5 });

            expect(message).not.toMatch(/^tgUser/);
            expect(message).not.toMatch(/[A-Z]{3,}_[A-Z]+/);
        }
    });
});

describe("telegramHtmlToFormattedText", () => {
    it("turns bold tags into ranges and unescapes entities", () => {
        expect(telegramHtmlToFormattedText("<b>Ana &amp; Bia</b> said &lt;hi&gt;"))
            .toEqual({ text: "Ana & Bia said <hi>", bold: [{ offset: 0, length: 9 }] });
    });

    it("strips unknown tags and ignores empty or unclosed bold", () => {
        expect(telegramHtmlToFormattedText("<i>x</i><b></b> y <b>z")).toEqual({ text: "x y z", bold: [] });
    });

    it("uses UTF-16 offsets for emoji", () => {
        expect(telegramHtmlToFormattedText("😀 <b>ok</b>")).toEqual({ text: "😀 ok", bold: [{ offset: 3, length: 2 }] });
    });
});
