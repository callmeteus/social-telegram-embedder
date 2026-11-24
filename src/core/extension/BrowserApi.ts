/**
 * Cross-browser extension API bridge.
 *
 * Chrome exposes `chrome.*` (MV3 promises) and Firefox exposes `browser.*`
 * (native promises). This module gives the rest of the codebase a single,
 * promise-based surface. The namespaces are resolved lazily through a Proxy so
 * test suites that swap the global API after import keep working.
 *
 * It also normalizes the handful of genuine browser differences:
 *
 * - notification creation (callback in Chrome, promise in Firefox)
 * - extension URL scheme (`chrome-extension://` vs `moz-extension://`)
 * - extension-context error strings
 */

/** Underlying API object, shaped like `chrome.*` for typing purposes. */
type ExtensionApi = typeof chrome;

/** Global object carrying the extension namespaces. */
type ExtensionScope = {
    chrome?: ExtensionApi;
    browser?: ExtensionApi;
};

/**
 * Resolves the active extension API on every access.
 */
function resolveApi(): ExtensionApi {
    const scope = globalThis as unknown as ExtensionScope;
    const api = scope.browser ?? scope.chrome;

    if (!api) {
        throw new Error("No extension API available");
    }

    return api;
}

/**
 * True when running in Firefox.
 *
 * Newer Chrome versions also expose a `browser.*` alias, so checking for the
 * namespace alone misidentifies Chrome as Firefox. The user agent is the
 * reliable signal here (available in both content scripts and workers).
 */
export function isFirefoxRuntime(): boolean {
    try {
        return /Firefox\//i.test(globalThis.navigator?.userAgent ?? "");
    } catch {
        return false;
    }
}

/** Scheme used by extension URLs in the current browser. */
export function getExtensionUrlScheme(): string {
    return isFirefoxRuntime() ? "moz-extension://" : "chrome-extension://";
}

/** Kept as a live binding for call sites that read it at module scope. */
export const extensionUrlScheme = getExtensionUrlScheme();

/**
 * Creates a lazily-resolving Proxy for a namespace object.
 */
function liveNamespace<T extends object>(select: (api: ExtensionApi) => T): T {
    return new Proxy({} as T, {
        get(_target, property) {
            const namespace = select(resolveApi());
            const value = namespace[property as keyof T];

            return typeof value === "function" ? value.bind(namespace) : value;
        }
    });
}

/** Unified namespaces, resolved at call time. */
export const runtime = liveNamespace((api) => api.runtime);
export const storage = liveNamespace((api) => api.storage);
export const tabs = liveNamespace((api) => api.tabs);
export const scripting = liveNamespace((api) => api.scripting);
export const i18n = liveNamespace((api) => api.i18n);

/** The unified API object. */
export const browserApi = liveNamespace((api) => api);

/**
 * Builds the URL of a packaged extension resource.
 */
export function getExtensionUrl(path: string): string {
    return resolveApi().runtime.getURL(path);
}

/**
 * Returns the extension manifest.
 */
export function getExtensionManifest(): chrome.runtime.Manifest {
    return resolveApi().runtime.getManifest();
}

/**
 * Opens the extension options page.
 */
export async function openOptionsPage(): Promise<void> {
    await resolveApi().runtime.openOptionsPage();
}

/**
 * Returns true when a URL belongs to this extension in the current browser.
 *
 * @param url - Candidate URL from a port sender.
 * @param extensionId - The runtime id passed by the caller.
 */
export function isExtensionPageUrl(url: string | undefined, extensionId: string): boolean {
    if (typeof url !== "string") {
        return false;
    }

    return url.startsWith(`${getExtensionUrlScheme()}${extensionId}/`);
}

/**
 * Creates a notification using a promise regardless of browser.
 *
 * @param id - Notification id.
 * @param options - Notification options.
 */
export async function createNotification(
    id: string,
    options: {
        type: string;
        iconUrl: string;
        title: string;
        message: string;
        priority?: number;
    }
): Promise<void> {
    const api = resolveApi();
    const notifications = api.notifications;

    if (!notifications || typeof notifications.create !== "function") {
        return;
    }

    await new Promise<void>((resolve) => {
        let settled = false;
        const done = (): void => {
            if (!settled) {
                settled = true;
                resolve();
            }
        };

        try {
            const create = notifications.create as unknown as (
                id: string,
                options: unknown,
                callback: () => void
            ) => unknown;
            const maybePromise = create(id, options, () => {
                void api.runtime.lastError;
                done();
            });

            if (maybePromise && typeof (maybePromise as Promise<unknown>).then === "function") {
                void (maybePromise as Promise<unknown>).then(done, done);
            }
        } catch {
            done();
        }
    });
}

/**
 * Returns true when an error indicates the extension context was destroyed.
 *
 * @param err - Error thrown by an extension API call.
 */
export function isExtensionContextError(err: unknown): boolean {
    if (!(err instanceof Error)) {
        return false;
    }

    const message = err.message.toLowerCase();

    return message.includes("extension context invalidated")
        || message.includes("could not establish connection")
        || message.includes("message port closed")
        || message.includes("receiving end does not exist")
        || (isFirefoxRuntime() && message.includes("extension context"));
}
