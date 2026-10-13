import { vi } from "vitest";
import type { DialogListAction } from "../../src/core/telegram-user/Dialogs";
import type { TelegramUserAccount } from "../../src/core/telegram-user/SessionTypes";
import type { QrLoginParams, TelegramUserClient } from "../../src/core/telegram-user/TelegramUserClient";

/** Telegram RPC-style error, shaped like mtcute's (`text` plus optional `seconds`). */
export function rpcError(text: string, seconds?: number): Error {
    return Object.assign(new Error(`Telegram error: ${text}`), { text, seconds });
}

/** Mock client: every method is a vi.fn with harmless defaults, overridable per test. */
export type FakeTelegramUserClient = {
    [K in keyof TelegramUserClient]: TelegramUserClient[K] & ReturnType<typeof vi.fn>;
} & {
    /** Fires listeners registered with onSessionRevoked. */
    revoke(): void;
    /** Fires listeners registered with onDialogAction. */
    emitDialogAction(action: DialogListAction): void;
};

export const SampleAccount: TelegramUserAccount = { id: 777, displayName: "Gio" };

/**
 * Creates a mock {@link TelegramUserClient}.
 */
export function createFakeTelegramUserClient(): FakeTelegramUserClient {
    const revokeListeners = new Set<() => void>();
    const dialogListeners = new Set<(action: DialogListAction) => void>();

    const client = {
        connect: vi.fn(async () => {}),
        destroy: vi.fn(async () => {}),
        getAuthorizedAccount: vi.fn(async () => SampleAccount),
        startUpdates: vi.fn(async () => {}),
        signInQr: vi.fn(async (_params: QrLoginParams) => SampleAccount),
        getPasswordHint: vi.fn(async () => "pet"),
        sendCode: vi.fn(async () => ({ phoneCodeHash: "hash" })),
        signIn: vi.fn(async () => SampleAccount),
        checkPassword: vi.fn(async () => SampleAccount),
        logOut: vi.fn(async () => {}),
        loadFolders: vi.fn(async () => []),
        loadDialogs: vi.fn(async () => {}),
        searchPeers: vi.fn(async () => []),
        getAvatar: vi.fn(async () => null),
        sendText: vi.fn(async () => {}),
        sendMedia: vi.fn(async () => {}),
        sendMediaGroup: vi.fn(async () => {}),
        onDialogAction: vi.fn((listener: (action: DialogListAction) => void) => {
            dialogListeners.add(listener);
            return () => dialogListeners.delete(listener);
        }),
        onSessionRevoked: vi.fn((listener: () => void) => {
            revokeListeners.add(listener);
            return () => revokeListeners.delete(listener);
        }),
        revoke() {
            for (const listener of [...revokeListeners]) {
                listener();
            }
        },
        emitDialogAction(action: DialogListAction) {
            for (const listener of [...dialogListeners]) {
                listener(action);
            }
        }
    };

    return client as unknown as FakeTelegramUserClient;
}
