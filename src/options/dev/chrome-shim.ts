import enMessages from "../../../_locales/en/messages.json";
import ptMessages from "../../../_locales/pt_BR/messages.json";

const DEV_RUNTIME_ID = "dev-preview";
const STORAGE_LOCAL_KEY = "x2tg-dev-chrome-storage-sync";

type LocaleCatalog = Record<string, { message: string }>;

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
            id: DEV_RUNTIME_ID
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
                }
            }
        }
    } as typeof chrome;
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
