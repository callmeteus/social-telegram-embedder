import { handleAuthPort } from "./AuthPortHandler";
import { handleDialogsPort } from "./DialogsPortHandler";
import type { TelegramUserSessionRegistry } from "./TelegramUserSessionRegistry";
import { isValidConnectionId } from "../../core/storage/Connections";
import { parseTelegramUserPortName, TelegramUserPortName } from "../../core/telegram-user/PortProtocol";

/**
 * Routes a runtime port to the Telegram account handlers of the connection named in the port.
 * Ports from other extensions are dropped; the login port is accepted only from this
 * extension's own pages (not content scripts).
 * Returns false when the port was rejected or is not a Telegram account port.
 */
export function routeTelegramUserPort(port: chrome.runtime.Port, sessions: TelegramUserSessionRegistry, extensionId: string): boolean {
    const sender = port.sender;

    if (sender?.id !== extensionId) {
        console.debug("[telegram-user] rejected port %s from another sender", port.name);
        port.disconnect();
        return false;
    }

    const parsed = parseTelegramUserPortName(port.name);

    if (!parsed) {
        return false;
    }

    if (!isValidConnectionId(parsed.connectionId)) {
        console.debug("[telegram-user] rejected port with an invalid connection id");
        port.disconnect();
        return false;
    }

    if (parsed.kind === TelegramUserPortName.AUTH) {
        if (!isExtensionPage(sender.url, extensionId)) {
            console.debug("[telegram-user] rejected login port outside extension pages");
            port.disconnect();
            return false;
        }

        handleAuthPort(port, sessions.get(parsed.connectionId), () => sessions.discardIfLoggedOut(parsed.connectionId));
        return true;
    }

    handleDialogsPort(port, sessions.get(parsed.connectionId));
    return true;
}

function isExtensionPage(url: string | undefined, extensionId: string): boolean {
    return typeof url === "string" && url.startsWith(`chrome-extension://${extensionId}/`);
}
