import enMessages from "../../../_locales/en/messages.json";
import ptMessages from "../../../_locales/pt_BR/messages.json";
import { parseTelegramUserPortName } from "../../core/telegram-user/PortProtocol";
import {
    createDefaultExtensionConfig,
    DestinationProvider,
    SendConnectionType,
    type ExtensionConfig
} from "../../core/types/Config";

const DEV_RUNTIME_ID = "dev-preview";
const STORAGE_LOCAL_KEY = "x2tg-dev-chrome-storage-sync";
const CONFIG_STORAGE_KEY = "xToTelegramConfig";

type LocaleCatalog = Record<string, { message: string }>;
type StorageListener = (changes: Record<string, unknown>, area: string) => void;

const storageListeners: StorageListener[] = [];

/** Bot usernames answered by the fake getMe, by token. */
const DevBotUsernames: Record<string, string> = {
    "123456:dev-preview": "folfa_bot",
    "654321:dev-news": "noticias_bot"
};

/**
 * Installs a minimal chrome.* polyfill for local options UI development.
 */
export function installChromeDevShim(): void {
    if (typeof globalThis.chrome !== "undefined" && globalThis.chrome.runtime?.id === DEV_RUNTIME_ID) {
        return;
    }

    const localeCatalog = pickLocaleCatalog();

    globalThis.chrome = {
        runtime: {
            id: DEV_RUNTIME_ID,
            connect: createDevAccountPort
        },
        i18n: {
            getMessage(messageName: string, substitutions?: string | string[]): string {
                const entry = localeCatalog[messageName];

                if (!entry?.message) {
                    return messageName;
                }

                return applySubstitutions(entry.message, substitutions);
            },
            getUILanguage(): string {
                return navigator.language.replace("-", "_");
            }
        },
        storage: {
            onChanged: {
                addListener(listener: StorageListener): void {
                    // Dev preview only has same-page storage events.
                    storageListeners.push(listener);
                }
            },
            sync: {
                async get(
                    keys?: string | string[] | Record<string, unknown> | null
                ): Promise<Record<string, unknown>> {
                    const store = readStorageStore();

                    if (keys === undefined || keys === null) {
                        return { ...store };
                    }

                    if (typeof keys === "string") {
                        return { [keys]: store[keys] };
                    }

                    if (Array.isArray(keys)) {
                        const result: Record<string, unknown> = {};

                        for (const key of keys) {
                            result[key] = store[key];
                        }

                        return result;
                    }

                    const defaults = keys as Record<string, unknown>;
                    const result: Record<string, unknown> = {};

                    for (const key of Object.keys(defaults)) {
                        result[key] = store[key] ?? defaults[key];
                    }

                    return result;
                },
                async set(items: Record<string, unknown>): Promise<void> {
                    const store = readStorageStore();
                    Object.assign(store, items);
                    writeStorageStore(store);

                    for (const listener of storageListeners) {
                        setTimeout(() => listener(items, "sync"), 0);
                    }
                }
            },
            local: {
                async get(): Promise<Record<string, unknown>> {
                    return {};
                },
                async set(): Promise<void> {
                    // Account credentials are not persisted in the options preview.
                }
            }
        }
    } as unknown as typeof chrome;

    if (new URLSearchParams(location.search).get("bot") === "ready") {
        installDevBot();
    }
}

/**
 * `?bot=ready`: seeds two bots with destinations (plus an account with `account=ready`)
 * and answers token checks without the network.
 */
function installDevBot(): void {
    const store = readStorageStore();
    const config = createDefaultExtensionConfig();

    config.connections = [
        { id: "dev-bot", type: SendConnectionType.TELEGRAM_BOT, botToken: "123456:dev-preview", username: "folfa_bot" },
        { id: "dev-news-bot", type: SendConnectionType.TELEGRAM_BOT, botToken: "654321:dev-news", username: "noticias_bot" }
    ];

    if (new URLSearchParams(location.search).get("account") === "ready") {
        config.connections.push({ id: "dev-account", type: SendConnectionType.TELEGRAM_ACCOUNT, displayName: "Dev Preview", accountId: 1 });
    }

    config.channels = [
        { id: "dev-1", label: "Lewds da Folfa", provider: DestinationProvider.TELEGRAM, chatId: "-1001194845578", connectionId: "dev-bot" },
        { id: "dev-2", label: "Notícias", provider: DestinationProvider.TELEGRAM, chatId: "@noticias", connectionId: "dev-bot" },
        { id: "dev-3", label: "Plantão", provider: DestinationProvider.TELEGRAM, chatId: "@plantao", connectionId: "dev-news-bot" }
    ];
    store[CONFIG_STORAGE_KEY] = config;
    writeStorageStore(store);

    const realFetch = globalThis.fetch.bind(globalThis);

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

        if (url.startsWith("/tg/") && url.endsWith("/getMe")) {
            const token = decodeURIComponent(url.split("/")[2]?.replace(/^bot/, "") ?? "");

            return new Response(JSON.stringify({ ok: true, result: { username: DevBotUsernames[token] ?? "novo_dev_bot" } }), {
                headers: { "Content-Type": "application/json" }
            });
        }

        return realFetch(input, init);
    };
}

function readDevConfig(): ExtensionConfig | null {
    const config = readStorageStore()[CONFIG_STORAGE_KEY];

    return config && typeof config === "object" ? config as ExtensionConfig : null;
}

/** Account card previews selectable with `?account=` in the dev page. */
const DevAccountSnapshots: Record<string, Record<string, unknown>> = {
    "logged-out": { state: "LOGGED_OUT", hasCredentials: false },
    keys: { state: "LOGGED_OUT", hasCredentials: true },
    qr: { state: "AWAITING_QR", hasCredentials: true, qr: { url: "tg://login?token=dev-preview", expiresAt: Date.now() + 30000, scanned: false } },
    password: { state: "AWAITING_PASSWORD", hasCredentials: true, passwordHint: "pet" },
    ready: { state: "READY", hasCredentials: true, account: { id: 1, displayName: "Dev Preview" } }
};

/**
 * Fake account port: a saved account replies as connected; a new one with the snapshot chosen
 * by the `account` query parameter.
 */
function createDevAccountPort(options?: { name?: string }): chrome.runtime.Port {
    const connectionId = parseTelegramUserPortName(options?.name ?? "")?.connectionId;
    const saved = readDevConfig()?.connections.find((connection) => connection.id === connectionId);
    const variant = new URLSearchParams(location.search).get("account") ?? "logged-out";
    const snapshot = saved?.type === SendConnectionType.TELEGRAM_ACCOUNT
        ? { ...DevAccountSnapshots.ready, account: { id: saved.accountId ?? 1, displayName: saved.displayName } }
        : DevAccountSnapshots[variant === "ready" ? "keys" : variant] ?? DevAccountSnapshots["logged-out"];
    const port = {
        name: options?.name ?? "dev-account",
        postMessage(message: unknown): void {
            console.debug("[dev-shim] account command %o", message);
        },
        disconnect(): void {},
        onMessage: {
            addListener(listener: (message: unknown) => void): void {
                setTimeout(() => listener({ type: "SESSION", snapshot }), 0);
            }
        },
        onDisconnect: { addListener(): void {} }
    };

    return port as unknown as chrome.runtime.Port;
}

function pickLocaleCatalog(): LocaleCatalog {
    const language = navigator.language.toLowerCase();

    if (language.startsWith("pt")) {
        return ptMessages as LocaleCatalog;
    }

    return enMessages as LocaleCatalog;
}

function applySubstitutions(template: string, substitutions?: string | string[]): string {
    if (!substitutions) {
        return template;
    }

    const values = Array.isArray(substitutions) ? substitutions : [substitutions];

    return values.reduce(
        (message, value, index) => message.replace(`$${index + 1}`, value),
        template
    );
}

function readStorageStore(): Record<string, unknown> {
    try {
        const raw = localStorage.getItem(STORAGE_LOCAL_KEY);

        if (!raw) {
            return {};
        }

        const parsed = JSON.parse(raw) as Record<string, unknown>;

        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function writeStorageStore(store: Record<string, unknown>): void {
    localStorage.setItem(STORAGE_LOCAL_KEY, JSON.stringify(store));
}
