import type { DialogListAction, TelegramDialogEntry, TelegramFolder } from "./Dialogs";
import type { FormattedText } from "./FormattedText";
import type { TelegramUserAccount } from "./SessionTypes";

/** Media file ready to upload through MTProto. */
export interface OutgoingMediaFile {
    kind: "photo" | "video" | "gif";
    blob: Blob;
    fileName: string;
}

/** Upload progress for one file: bytes uploaded out of total. */
export type UploadProgressCallback = (uploaded: number, total: number) => void;

/** Sending surface used by the Telegram account destination. */
export interface TelegramUserMessenger {
    sendText(peerId: number, text: FormattedText): Promise<void>;
    sendMedia(peerId: number, file: OutgoingMediaFile, caption?: FormattedText, onProgress?: UploadProgressCallback): Promise<void>;
    sendMediaGroup(
        peerId: number,
        files: OutgoingMediaFile[],
        caption?: FormattedText,
        onProgress?: (index: number, uploaded: number, total: number) => void
    ): Promise<void>;
}

/** Callbacks for the QR login flow. */
export interface QrLoginParams {
    onUrl(url: string, expiresAt: Date): void;
    onScanned(): void;
    /** Called when the account has a 2FA password; resolves with what the user typed. */
    password(): Promise<string>;
    onInvalidPassword(): void;
    signal: AbortSignal;
}

/**
 * Library-agnostic Telegram user client. The mtcute adapter is the only implementation
 * that touches the network; everything else depends on this interface.
 */
export interface TelegramUserClient extends TelegramUserMessenger {
    connect(): Promise<void>;
    destroy(): Promise<void>;
    /** The authorized account, verified against the server, or null when the session is not logged in. */
    getAuthorizedAccount(): Promise<TelegramUserAccount | null>;
    startUpdates(): Promise<void>;
    signInQr(params: QrLoginParams): Promise<TelegramUserAccount>;
    getPasswordHint(): Promise<string | null>;
    sendCode(phone: string): Promise<{ phoneCodeHash: string } | { account: TelegramUserAccount }>;
    /** Throws SESSION_PASSWORD_NEEDED when the account has 2FA. */
    signIn(phone: string, phoneCodeHash: string, code: string): Promise<TelegramUserAccount>;
    checkPassword(password: string): Promise<TelegramUserAccount>;
    logOut(): Promise<void>;
    /**
     * Loads the account's chat folders. Dialogs loaded afterwards carry the ids of the
     * folders they belong to.
     */
    loadFolders(): Promise<TelegramFolder[]>;
    /** Streams dialogs the account can post to, page by page, in server order. */
    loadDialogs(onPage: (entries: TelegramDialogEntry[]) => void): Promise<void>;
    searchPeers(query: string, limit: number): Promise<TelegramDialogEntry[]>;
    /** Small profile photo as JPEG bytes, or null. */
    getAvatar(peerId: number): Promise<Uint8Array | null>;
    onDialogAction(listener: (action: DialogListAction) => void): () => void;
    onSessionRevoked(listener: () => void): () => void;
}
