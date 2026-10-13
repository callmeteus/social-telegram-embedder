import type { DialogListAction, TelegramDialogEntry, TelegramFolder } from "./Dialogs";
import type { TelegramUserSessionSnapshot } from "./SessionTypes";

/** Long-lived chrome.runtime port kinds; the port name is `<kind>:<connectionId>`. */
export enum TelegramUserPortName {
    /** Options page: login commands in, session snapshots out. */
    AUTH = "telegram-user-auth",
    /** Destination picker: dialogs, live updates, search and avatars. */
    DIALOGS = "telegram-user-dialogs"
}

/**
 * Port name for one account connection.
 */
export function buildTelegramUserPortName(kind: TelegramUserPortName, connectionId: string): string {
    return `${kind}:${connectionId}`;
}

/**
 * Splits a port name into its kind and connection id, or null when it is not an account port.
 */
export function parseTelegramUserPortName(name: string): { kind: TelegramUserPortName; connectionId: string } | null {
    const separator = name.indexOf(":");

    if (separator === -1) {
        return null;
    }

    const prefix = name.slice(0, separator);
    const kind = Object.values(TelegramUserPortName).find((value) => value === prefix);

    return kind ? { kind, connectionId: name.slice(separator + 1) } : null;
}

/** Commands sent from the options page over the auth port. */
export enum AuthCommandType {
    SAVE_CREDENTIALS = "SAVE_CREDENTIALS",
    START_QR = "START_QR",
    START_PHONE = "START_PHONE",
    SUBMIT_CODE = "SUBMIT_CODE",
    SUBMIT_PASSWORD = "SUBMIT_PASSWORD",
    CANCEL_LOGIN = "CANCEL_LOGIN",
    LOGOUT = "LOGOUT"
}

/** A command from the options page. */
export type AuthCommand =
    | { type: AuthCommandType.SAVE_CREDENTIALS; apiId: string; apiHash: string }
    | { type: AuthCommandType.START_QR }
    | { type: AuthCommandType.START_PHONE; phone: string }
    | { type: AuthCommandType.SUBMIT_CODE; code: string }
    | { type: AuthCommandType.SUBMIT_PASSWORD; password: string }
    | { type: AuthCommandType.CANCEL_LOGIN }
    | { type: AuthCommandType.LOGOUT };

/** Message kinds pushed to the options page over the auth port. */
export enum AuthPortMessageType {
    SESSION = "SESSION",
    /** Profile photo of the connected account. */
    ACCOUNT_AVATAR = "ACCOUNT_AVATAR"
}

/** Messages pushed to the options page over the auth port. */
export type AuthPortMessage =
    | { type: AuthPortMessageType.SESSION; snapshot: TelegramUserSessionSnapshot }
    | { type: AuthPortMessageType.ACCOUNT_AVATAR; accountId: number; dataUrl: string | null };

/** Requests sent from the picker over the dialogs port. */
export enum DialogsRequestType {
    SEARCH = "SEARCH",
    GET_AVATAR = "GET_AVATAR"
}

/** A request from the picker. */
export type DialogsRequest =
    | { type: DialogsRequestType.SEARCH; requestId: number; query: string }
    | { type: DialogsRequestType.GET_AVATAR; peerId: number };

/** Messages pushed to the picker over the dialogs port. */
export enum DialogsPortMessageType {
    SESSION = "SESSION",
    /** Chat list saved after the previous load, shown until the fresh load finishes. */
    CACHED = "CACHED",
    /** The account's chat folders (saved ones first, then fresh ones). */
    FOLDERS = "FOLDERS",
    /** Initial load page; `done` marks the last one. */
    PAGE = "PAGE",
    /** Live change while the picker is open. */
    UPDATE = "UPDATE",
    SEARCH_RESULTS = "SEARCH_RESULTS",
    AVATAR = "AVATAR"
}

/** A message for the picker. */
export type DialogsPortMessage =
    | { type: DialogsPortMessageType.SESSION; snapshot: TelegramUserSessionSnapshot }
    | { type: DialogsPortMessageType.CACHED; entries: TelegramDialogEntry[] }
    | { type: DialogsPortMessageType.FOLDERS; folders: TelegramFolder[] }
    | { type: DialogsPortMessageType.PAGE; entries: TelegramDialogEntry[]; done: boolean }
    | { type: DialogsPortMessageType.UPDATE; action: DialogListAction }
    | { type: DialogsPortMessageType.SEARCH_RESULTS; requestId: number; entries: TelegramDialogEntry[] }
    | { type: DialogsPortMessageType.AVATAR; peerId: number; dataUrl: string | null };
