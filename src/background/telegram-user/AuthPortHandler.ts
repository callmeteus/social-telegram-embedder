import { loadAvatar } from "./DialogsPortHandler";
import type { TelegramUserSession } from "./TelegramUserSession";
import {
    AuthCommandType,
    AuthPortMessageType,
    type AuthCommand,
    type AuthPortMessage
} from "../../core/telegram-user/PortProtocol";
import { TelegramUserSessionState } from "../../core/telegram-user/SessionTypes";

/** Open options pages per session. */
const openAuthPorts = new WeakMap<TelegramUserSession, number>();

/**
 * Serves the options page account section of one connection: pushes session snapshots and
 * runs login commands. When the last page showing it closes, a login in progress is cancelled
 * and `onLastClose` runs (used to drop accounts whose login never finished).
 */
export function handleAuthPort(
    port: chrome.runtime.Port,
    session: TelegramUserSession,
    onLastClose?: () => Promise<void>
): void {
    let unsubscribe: (() => void) | null = null;
    let disconnected = false;

    openAuthPorts.set(session, (openAuthPorts.get(session) ?? 0) + 1);

    port.onMessage.addListener((command: AuthCommand) => {
        void runCommand(command, session).catch((err: unknown) => {
            console.error("[telegram-user] command %s failed: %O", command?.type, err);
        });
    });

    port.onDisconnect.addListener(() => {
        disconnected = true;
        unsubscribe?.();

        const remaining = Math.max(0, (openAuthPorts.get(session) ?? 1) - 1);

        openAuthPorts.set(session, remaining);

        if (remaining === 0) {
            void session.cancelLogin()
                .then(() => onLastClose?.())
                .catch((err: unknown) => {
                    console.error("[telegram-user] cleanup after the last options page failed: %O", err);
                });
        }
    });

    void session.initialize().then(() => {
        if (disconnected) {
            return;
        }

        let avatarAccountId = 0;

        unsubscribe = session.subscribe((snapshot) => {
            post(port, { type: AuthPortMessageType.SESSION, snapshot });

            const accountId = snapshot.state === TelegramUserSessionState.READY ? snapshot.account?.id ?? 0 : 0;

            if (accountId && accountId !== avatarAccountId) {
                avatarAccountId = accountId;
                void loadAvatar(session, accountId).then((dataUrl) => {
                    if (!disconnected) {
                        post(port, { type: AuthPortMessageType.ACCOUNT_AVATAR, accountId, dataUrl });
                    }
                });
            }
        });
    });
}

function post(port: chrome.runtime.Port, message: AuthPortMessage): void {
    try {
        port.postMessage(message);
    } catch (err) {
        console.debug("[telegram-user] auth port post failed: %O", err);
    }
}

async function runCommand(command: AuthCommand, session: TelegramUserSession): Promise<void> {
    console.debug("[telegram-user] command %s", command.type);

    switch (command.type) {
        case AuthCommandType.SAVE_CREDENTIALS:
            return session.saveCredentials(String(command.apiId ?? ""), String(command.apiHash ?? ""));
        case AuthCommandType.START_QR:
            return session.startQrLogin();
        case AuthCommandType.START_PHONE:
            return session.startPhoneLogin(String(command.phone ?? ""));
        case AuthCommandType.SUBMIT_CODE:
            return session.submitCode(String(command.code ?? ""));
        case AuthCommandType.SUBMIT_PASSWORD:
            return session.submitPassword(String(command.password ?? ""));
        case AuthCommandType.CANCEL_LOGIN:
            return session.cancelLogin();
        case AuthCommandType.LOGOUT:
            return session.logout();
        default:
            console.debug("[telegram-user] unknown auth command ignored");
    }
}
