import { afterEach, describe, expect, it, vi } from "vitest";
import {
    TelegramUserSession,
    TelegramUserSessionError
} from "../src/background/telegram-user/TelegramUserSession";
import { TelegramUserErrorCode, TelegramUserSessionState } from "../src/core/telegram-user/SessionTypes";
import type { QrLoginParams } from "../src/core/telegram-user/TelegramUserClient";
import { SampleAccount, rpcError } from "./helpers/FakeTelegramUserClient";
import { SampleCredentials as Credentials, createSessionHarness as createHarness } from "./helpers/SessionHarness";

async function waitForState(session: TelegramUserSession, state: TelegramUserSessionState): Promise<void> {
    await vi.waitFor(() => expect(session.getSnapshot().state).toBe(state));
}

afterEach(() => {
    vi.useRealTimers();
});

describe("TelegramUserSession initialize", () => {
    it("starts logged out without credentials and never connects", async () => {
        const { session, createClient } = createHarness({ credentials: null });

        await session.initialize();

        expect(session.getSnapshot()).toEqual({ state: TelegramUserSessionState.LOGGED_OUT, hasCredentials: false });
        expect(createClient).not.toHaveBeenCalled();
    });

    it("restores a logged-in account lazily from the cache", async () => {
        const { session, createClient } = createHarness({ loggedIn: true });
        const listener = vi.fn();

        session.subscribe(listener);
        await session.initialize();

        expect(session.isLoggedIn()).toBe(true);
        expect(session.getSnapshot()).toMatchObject({ state: TelegramUserSessionState.READY, account: { displayName: "Gio" } });
        expect(createClient).not.toHaveBeenCalled();
        expect(listener).toHaveBeenCalledTimes(2);
    });
});

describe("TelegramUserSession credentials", () => {
    it("validates and saves app credentials", async () => {
        const { session, saveCredentials } = createHarness({ credentials: null });

        await session.saveCredentials("123", Credentials.apiHash.toUpperCase());

        expect(saveCredentials).toHaveBeenCalledWith(Credentials);
        expect(session.getSnapshot()).toEqual({ state: TelegramUserSessionState.LOGGED_OUT, hasCredentials: true });
    });

    it("rejects malformed credentials without saving", async () => {
        const { session, saveCredentials } = createHarness({ credentials: null });

        await session.saveCredentials("abc", "short");

        expect(saveCredentials).not.toHaveBeenCalled();
        expect(session.getSnapshot().error?.code).toBe(TelegramUserErrorCode.INVALID_CREDENTIALS_FORMAT);
    });

    it("refuses to change credentials while logged in", async () => {
        const { session, saveCredentials } = createHarness({ loggedIn: true });

        await session.saveCredentials("456", Credentials.apiHash);

        expect(saveCredentials).not.toHaveBeenCalled();
        expect(session.getSnapshot().error?.code).toBe(TelegramUserErrorCode.CREDENTIALS_LOCKED);
    });

    it("asks for credentials before any login", async () => {
        const { session, createClient } = createHarness({ credentials: null });

        await session.startQrLogin();

        expect(createClient).not.toHaveBeenCalled();
        expect(session.getSnapshot().error?.code).toBe(TelegramUserErrorCode.MISSING_CREDENTIALS);
    });
});

describe("TelegramUserSession QR login", () => {
    it("shows the QR, then asks for the 2FA password with its hint, and logs in", async () => {
        const { session, client, cache } = createHarness();

        client.signInQr.mockImplementation(async (params: QrLoginParams) => {
            params.onUrl("tg://login?token=abc", new Date(5000));
            params.onScanned();
            expect(await params.password()).toBe("secret");
            return SampleAccount;
        });

        const login = session.startQrLogin();

        await waitForState(session, TelegramUserSessionState.AWAITING_PASSWORD);
        expect(session.getSnapshot().passwordHint).toBe("pet");

        await session.submitPassword("secret");
        await login;

        expect(session.getSnapshot()).toEqual({ state: TelegramUserSessionState.READY, hasCredentials: true, account: SampleAccount });
        expect(cache).toEqual({ enabled: true, displayName: "Gio", accountId: SampleAccount.id });
        expect(client.startUpdates).toHaveBeenCalled();
    });

    it("refuses an account already connected on another connection and wipes the new login", async () => {
        const { session, client, cache, wipeSessionStorage } = createHarness({ connectedElsewhere: [SampleAccount.id] });

        client.signInQr.mockResolvedValue(SampleAccount);
        await session.startQrLogin();

        expect(session.isLoggedIn()).toBe(false);
        expect(session.getSnapshot()).toMatchObject({
            state: TelegramUserSessionState.LOGGED_OUT,
            error: { code: TelegramUserErrorCode.ACCOUNT_ALREADY_CONNECTED }
        });
        expect(client.logOut).toHaveBeenCalled();
        expect(wipeSessionStorage).toHaveBeenCalled();
        expect(cache.enabled).toBe(false);
    });

    it("publishes QR url and scanned flag", async () => {
        const { session, client } = createHarness();
        const snapshots: unknown[] = [];

        session.subscribe((snapshot) => snapshots.push(snapshot));
        client.signInQr.mockImplementation(async (params: QrLoginParams) => {
            params.onUrl("tg://login?token=abc", new Date(5000));
            params.onScanned();
            return SampleAccount;
        });

        await session.startQrLogin();

        expect(snapshots).toContainEqual(expect.objectContaining({ qr: { url: "tg://login?token=abc", expiresAt: 5000, scanned: false } }));
        expect(snapshots).toContainEqual(expect.objectContaining({ qr: { url: "tg://login?token=abc", expiresAt: 5000, scanned: true } }));
    });

    it("keeps waiting for the password after a wrong one and shows the error", async () => {
        const { session, client } = createHarness();

        client.signInQr.mockImplementation(async (params: QrLoginParams) => {
            if (await params.password() !== "right") {
                params.onInvalidPassword();
                await params.password();
            }

            return SampleAccount;
        });

        const login = session.startQrLogin();

        await waitForState(session, TelegramUserSessionState.AWAITING_PASSWORD);
        await session.submitPassword("wrong");
        await vi.waitFor(() => expect(session.getSnapshot().error?.code).toBe(TelegramUserErrorCode.WRONG_PASSWORD));
        expect(session.getSnapshot().state).toBe(TelegramUserSessionState.AWAITING_PASSWORD);

        await session.submitPassword("right");
        await login;
        expect(session.getSnapshot().state).toBe(TelegramUserSessionState.READY);
    });

    it("sends the user back to the credentials step when Telegram rejects the app keys", async () => {
        const { session, client } = createHarness();

        client.connect.mockRejectedValue(rpcError("API_ID_INVALID"));
        await session.startQrLogin();

        expect(session.getSnapshot()).toMatchObject({ state: TelegramUserSessionState.LOGGED_OUT, error: { code: TelegramUserErrorCode.INVALID_APP_CREDENTIALS } });
        expect(client.destroy).toHaveBeenCalled();
    });

    it("cancels a pending login and disconnects", async () => {
        const { session, client } = createHarness();

        client.signInQr.mockImplementation((params: QrLoginParams) => new Promise((_, reject) => {
            params.onUrl("tg://login?token=abc", new Date(5000));
            params.signal.addEventListener("abort", () => reject(new Error("aborted")));
        }));

        const login = session.startQrLogin();

        await waitForState(session, TelegramUserSessionState.AWAITING_QR);
        await session.cancelLogin();
        await login;

        expect(session.getSnapshot()).toEqual({ state: TelegramUserSessionState.LOGGED_OUT, hasCredentials: true });
        expect(client.destroy).toHaveBeenCalled();
    });
});

describe("TelegramUserSession phone login", () => {
    it("goes phone, code, password, ready", async () => {
        const { session, client } = createHarness();

        client.signIn.mockRejectedValue(rpcError("SESSION_PASSWORD_NEEDED"));

        await session.startPhoneLogin("+55 (11) 91234-5678");
        expect(client.sendCode).toHaveBeenCalledWith("+5511912345678");
        expect(session.getSnapshot().state).toBe(TelegramUserSessionState.AWAITING_CODE);

        await session.submitCode(" 12345 ");
        expect(client.signIn).toHaveBeenCalledWith("+5511912345678", "hash", "12345");
        expect(session.getSnapshot()).toMatchObject({ state: TelegramUserSessionState.AWAITING_PASSWORD, passwordHint: "pet" });

        await session.submitPassword("secret");
        expect(client.checkPassword).toHaveBeenCalledWith("secret");
        expect(session.getSnapshot().state).toBe(TelegramUserSessionState.READY);
    });

    it("keeps the code step on a wrong code and the password step on a wrong password", async () => {
        const { session, client } = createHarness();

        client.signIn.mockRejectedValueOnce(rpcError("PHONE_CODE_INVALID")).mockRejectedValueOnce(rpcError("SESSION_PASSWORD_NEEDED"));
        client.checkPassword.mockRejectedValueOnce(rpcError("PASSWORD_HASH_INVALID"));

        await session.startPhoneLogin("+5511912345678");
        await session.submitCode("1");
        expect(session.getSnapshot()).toMatchObject({ state: TelegramUserSessionState.AWAITING_CODE, error: { code: TelegramUserErrorCode.WRONG_CODE } });

        await session.submitCode("2");
        await session.submitPassword("bad");
        expect(session.getSnapshot()).toMatchObject({ state: TelegramUserSessionState.AWAITING_PASSWORD, error: { code: TelegramUserErrorCode.WRONG_PASSWORD } });

        await session.submitPassword("good");
        expect(session.getSnapshot().state).toBe(TelegramUserSessionState.READY);
    });

    it("rejects too short phone numbers without contacting Telegram", async () => {
        const { session, createClient } = createHarness();

        await session.startPhoneLogin("12");

        expect(createClient).not.toHaveBeenCalled();
        expect(session.getSnapshot().error?.code).toBe(TelegramUserErrorCode.INVALID_PHONE);
    });

    it("reports flood waits with the wait time", async () => {
        const { session, client } = createHarness();

        client.sendCode.mockRejectedValue(rpcError("FLOOD_WAIT_%d", 120));
        await session.startPhoneLogin("+5511912345678");

        expect(session.getSnapshot()).toMatchObject({
            state: TelegramUserSessionState.LOGGED_OUT,
            error: { code: TelegramUserErrorCode.FLOOD_WAIT, waitSeconds: 120 }
        });
    });

    it("ends with an expired code back at logged out", async () => {
        const { session, client } = createHarness();

        client.signIn.mockRejectedValue(rpcError("PHONE_CODE_EXPIRED"));
        await session.startPhoneLogin("+5511912345678");
        await session.submitCode("1");

        expect(session.getSnapshot()).toMatchObject({ state: TelegramUserSessionState.LOGGED_OUT, error: { code: TelegramUserErrorCode.CODE_EXPIRED } });
    });
});

describe("TelegramUserSession connected use", () => {
    it("connects lazily once for concurrent callers", async () => {
        const { session, client, createClient } = createHarness({ loggedIn: true });

        const [first, second] = await Promise.all([session.getClient(), session.getClient()]);

        expect(first).toBe(client);
        expect(second).toBe(client);
        expect(createClient).toHaveBeenCalledTimes(1);
        expect(client.connect).toHaveBeenCalledTimes(1);
    });

    it("throws NOT_CONNECTED when logged out", async () => {
        const { session } = createHarness();

        await expect(session.getClient()).rejects.toMatchObject({ error: { code: TelegramUserErrorCode.NOT_CONNECTED } });
    });

    it("wipes everything when the server says the session is gone", async () => {
        const { session, client, wipeSessionStorage, cache } = createHarness({ loggedIn: true });

        client.getAuthorizedAccount.mockResolvedValue(null);

        await expect(session.getClient()).rejects.toBeInstanceOf(TelegramUserSessionError);
        expect(wipeSessionStorage).toHaveBeenCalled();
        expect(cache.enabled).toBe(false);
        expect(session.getSnapshot()).toMatchObject({ state: TelegramUserSessionState.LOGGED_OUT, error: { code: TelegramUserErrorCode.SESSION_REVOKED } });
    });

    it("handles a revocation pushed while connected", async () => {
        const { session, client, wipeSessionStorage } = createHarness({ loggedIn: true });

        await session.getClient();
        client.revoke();

        await vi.waitFor(() => expect(wipeSessionStorage).toHaveBeenCalled());
        expect(session.isLoggedIn()).toBe(false);
    });

    it("reports network failures without logging out", async () => {
        const { session, client } = createHarness({ loggedIn: true });

        client.connect.mockRejectedValue(new Error("WebSocket connection failed"));

        await expect(session.getClient()).rejects.toMatchObject({ error: { code: TelegramUserErrorCode.NETWORK } });
        expect(session.isLoggedIn()).toBe(true);
        expect(session.getSnapshot().state).toBe(TelegramUserSessionState.ERROR);
    });

    it("disconnects after the idle timeout unless held", async () => {
        vi.useFakeTimers();
        const { session, client } = createHarness({ loggedIn: true, idleTimeoutMs: 1000 });

        const release = session.acquire();

        await session.getClient();
        await vi.advanceTimersByTimeAsync(5000);
        expect(client.destroy).not.toHaveBeenCalled();

        release();
        release();
        await vi.advanceTimersByTimeAsync(999);
        expect(client.destroy).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1);
        expect(client.destroy).toHaveBeenCalledTimes(1);
        expect(session.isLoggedIn()).toBe(true);
    });
});

describe("TelegramUserSession logout", () => {
    it("revokes on the server and wipes local data", async () => {
        const { session, client, wipeSessionStorage, cache } = createHarness({ loggedIn: true });

        await session.logout();

        expect(client.logOut).toHaveBeenCalled();
        expect(wipeSessionStorage).toHaveBeenCalled();
        expect(cache).toEqual({ enabled: false, displayName: "" });
        expect(session.getSnapshot()).toEqual({ state: TelegramUserSessionState.LOGGED_OUT, hasCredentials: true });
    });

    it("still wipes local data when the server call fails", async () => {
        const { session, client, wipeSessionStorage } = createHarness({ loggedIn: true });

        client.logOut.mockRejectedValue(new Error("offline"));
        await session.logout();

        expect(wipeSessionStorage).toHaveBeenCalled();
        expect(session.isLoggedIn()).toBe(false);
    });
});

describe("TelegramUserSession discardLocalData", () => {
    it("wipes an unfinished login", async () => {
        const { session, wipeSessionStorage } = createHarness();

        await session.initialize();
        await session.discardLocalData();

        expect(wipeSessionStorage).toHaveBeenCalled();
    });

    it("never wipes a logged-in account", async () => {
        const { session, wipeSessionStorage } = createHarness({ loggedIn: true });

        await session.initialize();
        await session.discardLocalData();

        expect(wipeSessionStorage).not.toHaveBeenCalled();
        expect(session.isLoggedIn()).toBe(true);
    });
});
