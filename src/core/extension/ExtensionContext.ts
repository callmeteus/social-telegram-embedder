/**
 * Returns true when this content script can still talk to the extension.
 */
export function isExtensionContextValid(): boolean {
    try {
        return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
    } catch {
        return false;
    }
}

/**
 * Returns true when an error was caused by a reloaded or disabled extension.
 */
export function isExtensionContextError(err: unknown): boolean {
    if (!(err instanceof Error)) {
        return false;
    }

    const message = err.message.toLowerCase();

    return message.includes("extension context invalidated")
        || message.includes("could not establish connection")
        || message.includes("message port closed");
}

/**
 * Sends a runtime message from the content script, or undefined when the extension was reloaded.
 */
export async function sendRuntimeMessage<T>(message: unknown): Promise<T | undefined> {
    if (!isExtensionContextValid()) {
        return undefined;
    }

    try {
        return await chrome.runtime.sendMessage(message) as T;
    } catch (err) {
        if (isExtensionContextError(err)) {
            return undefined;
        }

        throw err;
    }
}
