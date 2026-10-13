import { vi } from "vitest";

/** In-memory `chrome.runtime.Port` double with helpers to push messages and inspect posts. */
export interface FakePort {
    port: chrome.runtime.Port;
    posted: unknown[];
    disconnected: boolean;
    /** Delivers a message to every onMessage listener. */
    emit(message: unknown): void;
    /** Fires onDisconnect listeners as if the other side closed. */
    remoteDisconnect(): void;
}

/**
 * Creates a fake port; `sender` is copied onto `port.sender` for origin checks.
 */
export function createFakePort(name = "fake", sender?: chrome.runtime.MessageSender): FakePort {
    const messageListeners: Array<(message: unknown, port: chrome.runtime.Port) => void> = [];
    const disconnectListeners: Array<(port: chrome.runtime.Port) => void> = [];
    const fake: FakePort = {
        port: undefined as unknown as chrome.runtime.Port,
        posted: [],
        disconnected: false,
        emit(message) {
            for (const listener of [...messageListeners]) {
                listener(message, fake.port);
            }
        },
        remoteDisconnect() {
            fake.disconnected = true;

            for (const listener of [...disconnectListeners]) {
                listener(fake.port);
            }
        }
    };

    fake.port = {
        name,
        sender,
        postMessage: vi.fn((message: unknown) => {
            if (fake.disconnected) {
                throw new Error("Attempting to use a disconnected port object");
            }

            fake.posted.push(message);
        }),
        disconnect: vi.fn(() => {
            fake.disconnected = true;
        }),
        onMessage: {
            addListener: (listener: (message: unknown, port: chrome.runtime.Port) => void) => messageListeners.push(listener),
            removeListener: (listener: (message: unknown, port: chrome.runtime.Port) => void) => {
                messageListeners.splice(messageListeners.indexOf(listener), 1);
            }
        },
        onDisconnect: {
            addListener: (listener: (port: chrome.runtime.Port) => void) => disconnectListeners.push(listener),
            removeListener: (listener: (port: chrome.runtime.Port) => void) => {
                disconnectListeners.splice(disconnectListeners.indexOf(listener), 1);
            }
        }
    } as unknown as chrome.runtime.Port;

    return fake;
}
