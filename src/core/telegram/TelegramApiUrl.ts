/**
 * Builds the Bot API URL for the current runtime (extension vs local Vite preview).
 */
export function buildTelegramBotApiUrl(botToken: string, method: string): string {
    return `${getApiRoot()}/bot${botToken}/${method}`;
}

/**
 * Builds the download URL for a file path returned by getFile.
 */
export function buildTelegramBotFileUrl(botToken: string, filePath: string): string {
    return `${getApiRoot()}/file/bot${botToken}/${filePath}`;
}

function getApiRoot(): string {
    return isOptionsDevPreviewHost() ? "/tg" : "https://api.telegram.org";
}

function isOptionsDevPreviewHost(): boolean {
    if (typeof globalThis.location === "undefined") {
        return false;
    }

    return /dev\.html$/i.test(globalThis.location.pathname);
}
