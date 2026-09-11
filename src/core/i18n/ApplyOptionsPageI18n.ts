import { getUiLanguage, t } from "./I18n";

/**
 * Applies localized copy to the options page static markup.
 */
export function applyOptionsPageI18n(): void {
    const uiLanguage = getUiLanguage();
    document.documentElement.lang = uiLanguage.startsWith("pt") ? "pt-BR" : "en";
    document.title = t("optionsPageTitle");

    for (const element of Array.from(document.querySelectorAll("[data-i18n]"))) {
        const key = element.getAttribute("data-i18n");

        if (!key) {
            continue;
        }

        element.textContent = t(key);
    }

    for (const element of Array.from(document.querySelectorAll("[data-i18n-placeholder]"))) {
        if (!(element instanceof HTMLInputElement)) {
            continue;
        }

        const key = element.getAttribute("data-i18n-placeholder");

        if (!key) {
            continue;
        }

        element.placeholder = t(key);
    }

    for (const element of Array.from(document.querySelectorAll("[data-i18n-title]"))) {
        if (!(element instanceof HTMLElement)) {
            continue;
        }

        const key = element.getAttribute("data-i18n-title");

        if (!key) {
            continue;
        }

        element.title = t(key);
    }
}

/**
 * Applies localized copy to a cloned channel row template fragment.
 */
export function applyChannelRowI18n(root: ParentNode): void {
    for (const element of Array.from(root.querySelectorAll("[data-i18n]"))) {
        const key = element.getAttribute("data-i18n");

        if (!key) {
            continue;
        }

        element.textContent = t(key);
    }

    for (const element of Array.from(root.querySelectorAll("[data-i18n-placeholder]"))) {
        if (!(element instanceof HTMLInputElement)) {
            continue;
        }

        const key = element.getAttribute("data-i18n-placeholder");

        if (!key) {
            continue;
        }

        element.placeholder = t(key);
    }

    for (const element of Array.from(root.querySelectorAll("[data-i18n-title]"))) {
        if (!(element instanceof HTMLElement)) {
            continue;
        }

        const key = element.getAttribute("data-i18n-title");

        if (!key) {
            continue;
        }

        element.title = t(key);
    }
}
