/**
 * Builds the Bot API URL for the current runtime (extension vs local Vite preview).
 */
export function buildTelegramBotApiUrl(botToken: string, method: string): string {
    const apiRoot = isOptionsDevPreviewHost() ? "/tg" : "https://api.telegram.org";

    return `${apiRoot}/bot${botToken}/${method}`;
}

function isOptionsDevPreviewHost(): boolean {
    if (typeof globalThis.location === "undefined") {
        return false;
    }

    return /dev\.html$/i.test(globalThis.location.pathname);
}
