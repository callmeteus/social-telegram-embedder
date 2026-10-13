import { renderSVG } from "uqr";
import { t } from "../core/i18n/I18n";
import { parseTelegramApiCredentials, TelegramCredentialsField } from "../core/telegram-user/Credentials";
import { formatTelegramUserError } from "../core/telegram-user/Errors";
import {
    AuthCommandType,
    AuthPortMessageType,
    buildTelegramUserPortName,
    TelegramUserPortName,
    type AuthCommand,
    type AuthPortMessage
} from "../core/telegram-user/PortProtocol";
import {
    TelegramUserErrorCode,
    TelegramUserSessionState,
    type TelegramUserSessionSnapshot
} from "../core/telegram-user/SessionTypes";

/** Login method the user picked on this page. */
enum LoginMode {
    QR = "QR",
    PHONE = "PHONE"
}

/** Elements of the account card. */
interface AccountElements {
    credentials: HTMLElement;
    apiIdInput: HTMLInputElement;
    apiHashInput: HTMLInputElement;
    login: HTMLElement;
    qrPanel: HTMLElement;
    qr: HTMLElement;
    startQrButton: HTMLButtonElement;
    phonePanel: HTMLElement;
    phoneInput: HTMLInputElement;
    codeRow: HTMLElement;
    codeInput: HTMLInputElement;
    passwordPanel: HTMLElement;
    passwordInput: HTMLInputElement;
    passwordHint: HTMLElement;
    cancelButton: HTMLButtonElement;
    editCredentialsButton: HTMLButtonElement;
    connected: HTMLElement;
    accountName: HTMLElement;
    accountAvatar: HTMLElement;
    status: HTMLElement;
}

/** Opens the auth port of one account connection; replaceable for the dev preview. */
export type AuthPortFactory = (connectionId: string) => chrome.runtime.Port;

/** Callbacks of the account section. */
export interface TelegramAccountSectionHandlers {
    /** The user disconnected this account; the page goes back to the list. */
    onLoggedOut(): void;
}

/** Handle returned by {@link initTelegramAccountSection}. */
export interface TelegramAccountSectionControls {
    /** Shows the login or connected state of an account; a new id starts a fresh login. */
    open(connectionId: string): void;
    /** Closes the port; an unfinished login is discarded by the background. */
    close(): void;
}

/**
 * Opens the real auth port of an account connection.
 */
export function connectAuthPort(connectionId: string): chrome.runtime.Port {
    return chrome.runtime.connect({ name: buildTelegramUserPortName(TelegramUserPortName.AUTH, connectionId) });
}

/**
 * Wires the "Your Telegram account" card: app credentials, QR or phone login with 2FA,
 * connected state and logout. The background session owns the state; this only renders it.
 */
export function initTelegramAccountSection(
    handlers: TelegramAccountSectionHandlers,
    connect: AuthPortFactory = connectAuthPort
): TelegramAccountSectionControls | null {
    const elements = queryElements();

    if (!elements) {
        return null;
    }

    let port: chrome.runtime.Port | null = null;
    let snapshot: TelegramUserSessionSnapshot | null = null;
    let mode = LoginMode.QR;
    let editingCredentials = false;
    let loggingOut = false;

    const send = (command: AuthCommand): void => {
        port?.postMessage(command);
    };

    const render = (): void => {
        if (snapshot) {
            renderAccountSection(elements, snapshot, { mode, editingCredentials });
        }
    };

    const handleMessage = (message: AuthPortMessage): void => {
        if (message.type === AuthPortMessageType.ACCOUNT_AVATAR) {
            renderAvatar(elements.accountAvatar, message.dataUrl);
            return;
        }

        if (snapshot?.hasCredentials === false && message.snapshot.hasCredentials) {
            editingCredentials = false;
            elements.apiHashInput.value = "";
        }

        snapshot = message.snapshot;

        if (loggingOut && !snapshot.account && snapshot.state === TelegramUserSessionState.LOGGED_OUT) {
            loggingOut = false;
            handlers.onLoggedOut();
            return;
        }

        render();
    };

    const close = (): void => {
        port?.disconnect();
        port = null;
    };

    onClick("account-save-credentials", () => {
        const parsed = parseTelegramApiCredentials(elements.apiIdInput.value, elements.apiHashInput.value);
        const invalidField = parsed.ok ? null : parsed.field;

        elements.apiIdInput.setAttribute("aria-invalid", String(invalidField === TelegramCredentialsField.API_ID));
        elements.apiHashInput.setAttribute("aria-invalid", String(invalidField === TelegramCredentialsField.API_HASH));

        if (invalidField) {
            renderStatus(elements.status, {
                state: TelegramUserSessionState.LOGGED_OUT,
                hasCredentials: false,
                error: { code: TelegramUserErrorCode.INVALID_CREDENTIALS_FORMAT }
            });
            (invalidField === TelegramCredentialsField.API_ID ? elements.apiIdInput : elements.apiHashInput).focus();
            return;
        }

        send({ type: AuthCommandType.SAVE_CREDENTIALS, apiId: elements.apiIdInput.value, apiHash: elements.apiHashInput.value });
        editingCredentials = false;
    });

    onClick("account-edit-credentials", () => {
        editingCredentials = true;
        render();
    });

    onClick("account-start-qr", () => send({ type: AuthCommandType.START_QR }));

    onClick("account-use-phone", () => {
        mode = LoginMode.PHONE;
        send({ type: AuthCommandType.CANCEL_LOGIN });
        render();
    });

    onClick("account-use-qr", () => {
        mode = LoginMode.QR;
        send({ type: AuthCommandType.CANCEL_LOGIN });
        render();
    });

    onClick("account-send-code", () => send({ type: AuthCommandType.START_PHONE, phone: elements.phoneInput.value }));

    onClick("account-submit-code", () => send({ type: AuthCommandType.SUBMIT_CODE, code: elements.codeInput.value }));

    onClick("account-submit-password", () => {
        send({ type: AuthCommandType.SUBMIT_PASSWORD, password: elements.passwordInput.value });
        elements.passwordInput.value = "";
    });

    onClick("account-cancel-login", () => send({ type: AuthCommandType.CANCEL_LOGIN }));

    onClick("account-logout", () => {
        if (window.confirm(t("optionsAccountLogoutConfirm"))) {
            loggingOut = true;
            send({ type: AuthCommandType.LOGOUT });
        }
    });

    submitOnEnter(elements.codeInput, "account-submit-code");
    submitOnEnter(elements.passwordInput, "account-submit-password");
    submitOnEnter(elements.phoneInput, "account-send-code");

    return {
        open(connectionId: string): void {
            close();
            snapshot = null;
            mode = LoginMode.QR;
            editingCredentials = false;
            loggingOut = false;
            resetAccountSection(elements);

            const opened = connect(connectionId);

            port = opened;
            opened.onMessage.addListener((message: AuthPortMessage) => {
                if (port === opened) {
                    handleMessage(message);
                }
            });
        },

        close
    };
}

/**
 * Clears what the previous account left on screen before the next snapshot arrives.
 */
function resetAccountSection(elements: AccountElements): void {
    elements.credentials.hidden = true;
    elements.login.hidden = true;
    elements.connected.hidden = true;
    elements.phoneInput.value = "";
    elements.codeInput.value = "";
    elements.passwordInput.value = "";
    elements.apiHashInput.value = "";
    elements.accountAvatar.replaceChildren();
    elements.accountName.textContent = "";
    elements.qr.replaceChildren();
    elements.status.textContent = "";
    elements.status.classList.remove("status--success", "status--error");
}

/**
 * Shows the step matching the snapshot: credentials, login (QR, phone, 2FA) or connected.
 */
function renderAccountSection(
    elements: AccountElements,
    snapshot: TelegramUserSessionSnapshot,
    view: { mode: LoginMode; editingCredentials: boolean }
): void {
    const connected = isConnectedState(snapshot);
    const credentialsRejected = snapshot.error?.code === TelegramUserErrorCode.INVALID_APP_CREDENTIALS
        || snapshot.error?.code === TelegramUserErrorCode.INVALID_CREDENTIALS_FORMAT;
    const showCredentials = !connected && (!snapshot.hasCredentials || view.editingCredentials || credentialsRejected);
    const state = snapshot.state;
    const loginInProgress = state === TelegramUserSessionState.AWAITING_QR
        || state === TelegramUserSessionState.AWAITING_CODE
        || state === TelegramUserSessionState.AWAITING_PASSWORD
        || (state === TelegramUserSessionState.CONNECTING && !connected);

    elements.credentials.hidden = !showCredentials;
    elements.login.hidden = connected || showCredentials;
    elements.connected.hidden = !connected;
    elements.credentials.closest(".card--account")?.setAttribute(
        "data-step",
        connected ? "ready" : showCredentials ? "keys" : "login"
    );

    elements.passwordPanel.hidden = state !== TelegramUserSessionState.AWAITING_PASSWORD;
    elements.passwordHint.textContent = snapshot.passwordHint ? t("optionsAccountPasswordHint", snapshot.passwordHint) : "";

    const usePhone = view.mode === LoginMode.PHONE;
    const awaitingPassword = state === TelegramUserSessionState.AWAITING_PASSWORD;

    elements.qrPanel.hidden = usePhone || awaitingPassword;
    elements.phonePanel.hidden = !usePhone || awaitingPassword;
    elements.codeRow.hidden = state !== TelegramUserSessionState.AWAITING_CODE;
    elements.startQrButton.hidden = state === TelegramUserSessionState.AWAITING_QR;
    elements.cancelButton.hidden = !loginInProgress;
    elements.editCredentialsButton.hidden = loginInProgress;

    if (state === TelegramUserSessionState.AWAITING_QR && snapshot.qr) {
        elements.qr.innerHTML = renderSVG(snapshot.qr.url, { border: 2 });
        elements.qr.hidden = false;
    } else {
        elements.qr.replaceChildren();
        elements.qr.hidden = true;
    }

    elements.accountName.textContent = snapshot.account?.displayName
        ? t("optionsAccountConnectedAs", snapshot.account.displayName)
        : t("optionsAccountConnected");

    if (!elements.accountAvatar.querySelector("img")) {
        elements.accountAvatar.textContent = (snapshot.account?.displayName ?? "?").trim().charAt(0).toUpperCase() || "?";
    }

    renderStatus(elements.status, snapshot);
}

function renderStatus(element: HTMLElement, snapshot: TelegramUserSessionSnapshot): void {
    element.classList.remove("status--success", "status--error");

    if (snapshot.error) {
        element.textContent = formatTelegramUserError(snapshot.error);
        element.classList.add("status--error");
        return;
    }

    switch (snapshot.state) {
        case TelegramUserSessionState.CONNECTING:
            element.textContent = t("optionsAccountConnecting");
            return;
        case TelegramUserSessionState.AWAITING_QR:
            element.textContent = snapshot.qr?.scanned ? t("optionsAccountQrScanned") : "";
            return;
        case TelegramUserSessionState.AWAITING_CODE:
            element.textContent = t("optionsAccountCodeSent");
            return;
        case TelegramUserSessionState.READY:
            element.textContent = t("optionsAccountReady");
            element.classList.add("status--success");
            return;
        default:
            element.textContent = "";
    }
}

function renderAvatar(container: HTMLElement, dataUrl: string | null): void {
    if (!dataUrl) {
        return;
    }

    const image = document.createElement("img");

    image.src = dataUrl;
    image.alt = "";
    container.replaceChildren(image);
}

function isConnectedState(snapshot: TelegramUserSessionSnapshot): boolean {
    return Boolean(snapshot.account) && (
        snapshot.state === TelegramUserSessionState.READY
        || snapshot.state === TelegramUserSessionState.CONNECTING
        || snapshot.state === TelegramUserSessionState.ERROR
    );
}

function onClick(id: string, handler: () => void): void {
    document.getElementById(id)?.addEventListener("click", (event) => {
        event.preventDefault();
        handler();
    });
}

function submitOnEnter(input: HTMLInputElement, buttonId: string): void {
    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            document.getElementById(buttonId)?.click();
        }
    });
}

function queryElements(): AccountElements | null {
    const byId = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;
    const credentials = byId("account-credentials");

    if (!credentials) {
        return null;
    }

    return {
        credentials,
        apiIdInput: byId<HTMLInputElement>("account-api-id")!,
        apiHashInput: byId<HTMLInputElement>("account-api-hash")!,
        login: byId("account-login")!,
        qrPanel: byId("account-qr-panel")!,
        qr: byId("account-qr")!,
        startQrButton: byId<HTMLButtonElement>("account-start-qr")!,
        phonePanel: byId("account-phone-panel")!,
        phoneInput: byId<HTMLInputElement>("account-phone")!,
        codeRow: byId("account-code-row")!,
        codeInput: byId<HTMLInputElement>("account-code")!,
        passwordPanel: byId("account-password-panel")!,
        passwordInput: byId<HTMLInputElement>("account-password")!,
        passwordHint: byId("account-password-hint")!,
        cancelButton: byId<HTMLButtonElement>("account-cancel-login")!,
        editCredentialsButton: byId<HTMLButtonElement>("account-edit-credentials")!,
        connected: byId("account-connected")!,
        accountName: byId("account-name")!,
        accountAvatar: byId("account-avatar")!,
        status: byId("account-status")!
    };
}
