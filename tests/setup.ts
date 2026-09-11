import enMessages from "../_locales/en/messages.json";

/**
 * Minimal chrome.i18n mock for unit tests using English catalog strings.
 */
function getMessage(name: string, substitutions?: string | string[]): string {
    const entry = enMessages[name as keyof typeof enMessages];

    if (!entry || typeof entry !== "object" || !("message" in entry)) {
        return name;
    }

    let message = entry.message;
    const subs = substitutions === undefined
        ? []
        : Array.isArray(substitutions)
            ? substitutions
            : [substitutions];

    for (let index = 0; index < subs.length; index++) {
        message = message.replace(`$${index + 1}`, subs[index] ?? "");
    }

    return message;
}

Object.assign(globalThis, {
    chrome: {
        i18n: {
            getMessage,
            getUILanguage: () => "en"
        }
    }
});
