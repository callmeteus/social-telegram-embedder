import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initTelegramAccountSection } from "../src/options/TelegramAccountSection";
import { AuthCommandType, AuthPortMessageType } from "../src/core/telegram-user/PortProtocol";
import {
    TelegramUserErrorCode,
    TelegramUserSessionState,
    type TelegramUserSessionSnapshot
} from "../src/core/telegram-user/SessionTypes";
import { createFakePort, type FakePort } from "./helpers/FakePort";

const AccountMarkup = (() => {
    const html = readFileSync(resolve(__dirname, "../src/options/OptionsPage.html"), "utf8");
    const match = /<section id="account-section"[\s\S]*?<\/section>/.exec(html);

    if (!match) {
        throw new Error("account section markup not found");
    }

    return match[0];
})();

const byId = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

function open(onLoggedOut = vi.fn()): FakePort {
    const fake = createFakePort("AUTH:acc");

    initTelegramAccountSection({ onLoggedOut }, () => fake.port)?.open("acc");
    return fake;
}

function push(fake: FakePort, snapshot: TelegramUserSessionSnapshot): void {
    fake.emit({ type: AuthPortMessageType.SESSION, snapshot });
}

beforeEach(() => {
    document.body.innerHTML = AccountMarkup;
});

describe("Telegram account section", () => {
    it("asks for app keys first and sends them", () => {
        const fake = open();

        push(fake, { state: TelegramUserSessionState.LOGGED_OUT, hasCredentials: false });

        expect(byId("account-credentials").hidden).toBe(false);
        expect(byId("account-login").hidden).toBe(true);
        expect(byId("account-connected").hidden).toBe(true);
        expect(document.querySelector<HTMLAnchorElement>("#account-credentials a")?.href).toBe("https://my.telegram.org/apps");

        byId<HTMLInputElement>("account-api-id").value = "123";
        byId<HTMLInputElement>("account-api-hash").value = "0123456789abcdef0123456789abcdef";
        byId("account-save-credentials").click();

        expect(fake.posted).toEqual([{ type: AuthCommandType.SAVE_CREDENTIALS, apiId: "123", apiHash: "0123456789abcdef0123456789abcdef" }]);
    });

    it("flags malformed keys inline without sending them", () => {
        const fake = open();

        push(fake, { state: TelegramUserSessionState.LOGGED_OUT, hasCredentials: false });
        byId<HTMLInputElement>("account-api-id").value = "123";
        byId<HTMLInputElement>("account-api-hash").value = "not-a-hash";
        byId("account-save-credentials").click();

        expect(fake.posted).toEqual([]);
        expect(byId("account-api-hash").getAttribute("aria-invalid")).toBe("true");
        expect(byId("account-api-id").getAttribute("aria-invalid")).toBe("false");
        expect(byId("account-status").textContent).toContain("32 letters and numbers");
        expect(document.activeElement).toBe(byId("account-api-hash"));
    });

    it("clears the hash field once keys are saved and moves to the login step", () => {
        const fake = open();

        push(fake, { state: TelegramUserSessionState.LOGGED_OUT, hasCredentials: false });
        byId<HTMLInputElement>("account-api-hash").value = "secret";
        push(fake, { state: TelegramUserSessionState.LOGGED_OUT, hasCredentials: true });

        expect(byId<HTMLInputElement>("account-api-hash").value).toBe("");
        expect(byId("account-credentials").hidden).toBe(true);
        expect(byId("account-login").hidden).toBe(false);
    });

    it("shows the keys step again when Telegram rejects them", () => {
        const fake = open();

        push(fake, { state: TelegramUserSessionState.LOGGED_OUT, hasCredentials: true, error: { code: TelegramUserErrorCode.INVALID_APP_CREDENTIALS } });

        expect(byId("account-credentials").hidden).toBe(false);
        expect(byId("account-status").textContent).toContain("Telegram rejected these app keys");
        expect(byId("account-status").classList.contains("status--error")).toBe(true);
    });

    it("renders the QR code and the scanned hint", () => {
        const fake = open();

        byId("account-start-qr").click();
        push(fake, { state: TelegramUserSessionState.AWAITING_QR, hasCredentials: true, qr: { url: "tg://login?token=abc", expiresAt: 1, scanned: true } });

        expect(fake.posted).toEqual([{ type: AuthCommandType.START_QR }]);
        expect(byId("account-qr").hidden).toBe(false);
        expect(byId("account-qr").querySelector("svg")).toBeTruthy();
        expect(byId("account-start-qr").hidden).toBe(true);
        expect(byId("account-cancel-login").hidden).toBe(false);
        expect(byId("account-edit-credentials").hidden).toBe(true);
        expect(byId("account-status").textContent).toBe("Code scanned. Confirm on your phone.");
    });

    it("switches to phone login and submits phone and code", () => {
        const fake = open();

        push(fake, { state: TelegramUserSessionState.LOGGED_OUT, hasCredentials: true });
        byId("account-use-phone").click();

        expect(byId("account-phone-panel").hidden).toBe(false);
        expect(byId("account-qr-panel").hidden).toBe(true);

        byId<HTMLInputElement>("account-phone").value = "+5511912345678";
        byId("account-send-code").click();
        push(fake, { state: TelegramUserSessionState.AWAITING_CODE, hasCredentials: true });

        expect(byId("account-code-row").hidden).toBe(false);

        byId<HTMLInputElement>("account-code").value = "12345";
        byId<HTMLInputElement>("account-code").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

        expect(fake.posted).toEqual([
            { type: AuthCommandType.CANCEL_LOGIN },
            { type: AuthCommandType.START_PHONE, phone: "+5511912345678" },
            { type: AuthCommandType.SUBMIT_CODE, code: "12345" }
        ]);
    });

    it("asks for the 2FA password with its hint and clears it after submit", () => {
        const fake = open();

        push(fake, { state: TelegramUserSessionState.AWAITING_PASSWORD, hasCredentials: true, passwordHint: "pet" });

        expect(byId("account-password-panel").hidden).toBe(false);
        expect(byId("account-qr-panel").hidden).toBe(true);
        expect(byId("account-password-hint").textContent).toBe("Hint: pet");

        byId<HTMLInputElement>("account-password").value = "secret";
        byId("account-submit-password").click();

        expect(fake.posted).toEqual([{ type: AuthCommandType.SUBMIT_PASSWORD, password: "secret" }]);
        expect(byId<HTMLInputElement>("account-password").value).toBe("");
    });

    it("shows the connected account with avatar and logs out only after confirmation", () => {
        const fake = open();
        const confirmSpy = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);

        push(fake, { state: TelegramUserSessionState.READY, hasCredentials: true, account: { id: 1, displayName: "Gio" } });

        expect(byId("account-connected").hidden).toBe(false);
        expect(byId("account-login").hidden).toBe(true);
        expect(byId("account-name").textContent).toBe("Connected as Gio");
        expect(byId("account-avatar").textContent).toBe("G");

        fake.emit({ type: AuthPortMessageType.ACCOUNT_AVATAR, accountId: 1, dataUrl: "data:image/jpeg;base64,AA==" });
        expect(byId("account-avatar").querySelector("img")?.getAttribute("src")).toBe("data:image/jpeg;base64,AA==");

        byId("account-logout").click();
        expect(fake.posted).toEqual([]);

        byId("account-logout").click();
        expect(fake.posted).toEqual([{ type: AuthCommandType.LOGOUT }]);
        confirmSpy.mockRestore();
    });

    it("goes back to the list once the account is disconnected", () => {
        const onLoggedOut = vi.fn();
        const fake = open(onLoggedOut);
        const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

        push(fake, { state: TelegramUserSessionState.READY, hasCredentials: true, account: { id: 1, displayName: "Gio" } });
        push(fake, { state: TelegramUserSessionState.LOGGED_OUT, hasCredentials: true });
        expect(onLoggedOut).not.toHaveBeenCalled();

        push(fake, { state: TelegramUserSessionState.READY, hasCredentials: true, account: { id: 1, displayName: "Gio" } });
        byId("account-logout").click();
        push(fake, { state: TelegramUserSessionState.LOGGED_OUT, hasCredentials: true });

        expect(onLoggedOut).toHaveBeenCalledTimes(1);
        confirmSpy.mockRestore();
    });

    it("opens one port per account and forgets what the previous account showed", () => {
        const ports = new Map<string, FakePort>();
        const controls = initTelegramAccountSection({ onLoggedOut: vi.fn() }, (connectionId) => {
            const fake = createFakePort(`AUTH:${connectionId}`);

            ports.set(connectionId, fake);
            return fake.port;
        });

        controls?.open("acc");
        push(ports.get("acc")!, { state: TelegramUserSessionState.READY, hasCredentials: true, account: { id: 1, displayName: "Gio" } });
        expect(byId("account-name").textContent).toBe("Connected as Gio");

        controls?.open("acc-new");

        expect(ports.get("acc")?.port.disconnect).toHaveBeenCalled();
        expect(byId("account-connected").hidden).toBe(true);
        expect(byId("account-name").textContent).toBe("");

        push(ports.get("acc")!, { state: TelegramUserSessionState.READY, hasCredentials: true, account: { id: 1, displayName: "Gio" } });
        expect(byId("account-connected").hidden).toBe(true);

        push(ports.get("acc-new")!, { state: TelegramUserSessionState.LOGGED_OUT, hasCredentials: true });
        byId("account-start-qr").click();

        expect(byId("account-login").hidden).toBe(false);
        expect(ports.get("acc-new")?.posted).toEqual([{ type: AuthCommandType.START_QR }]);
        expect(ports.get("acc")?.posted).toEqual([]);
    });

    it("tells the user when the account is already connected", () => {
        const fake = open();

        push(fake, { state: TelegramUserSessionState.LOGGED_OUT, hasCredentials: true, error: { code: TelegramUserErrorCode.ACCOUNT_ALREADY_CONNECTED } });

        expect(byId("account-status").textContent).toBe("This Telegram account is already connected.");
        expect(byId("account-login").hidden).toBe(false);
    });

    it("does nothing when the page has no account card", () => {
        document.body.innerHTML = "";
        const connect = vi.fn();

        expect(initTelegramAccountSection({ onLoggedOut: vi.fn() }, connect)).toBeNull();
        expect(connect).not.toHaveBeenCalled();
    });
});
