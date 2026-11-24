import { isExtensionContextError } from "./BrowserApi";
import { runtime } from "./BrowserApi";

/**
 * Returns true when this content script can still talk to the extension.
 */
export function isExtensionContextValid(): boolean {
    try {
        return Boolean(runtime?.id);
    } catch {
        return false;
    }
}

export { isExtensionContextError };

/**
 * Sends a runtime message from the content script, or undefined when the extension was reloaded.
 */
export async function sendRuntimeMessage<T>(message: unknown): Promise<T | undefined> {
    if (!isExtensionContextValid()) {
        return undefined;
    }

    try {
        return await runtime.sendMessage(message) as T;
    } catch (err) {
        if (isExtensionContextError(err)) {
            return undefined;
        }

        throw err;
    }
}
