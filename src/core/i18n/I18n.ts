/**
 * Returns localized copy for an extension message key.
 * Chrome picks the locale from the browser language automatically.
 */
export function t(messageName: string, substitutions?: string | string[]): string {
    try {
        const message = chrome.i18n.getMessage(messageName, substitutions);

        if (message) {
            return message;
        }

        return messageName;
    } catch {
        return messageName;
    }
}

/**
 * Returns the UI language tag reported by the browser (e.g. en, pt_BR).
 */
export function getUiLanguage(): string {
    try {
        return chrome.i18n.getUILanguage();
    } catch {
        return "en";
    }
}
