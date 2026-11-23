import { getUiLanguage, t } from "../core/i18n/I18n";
import { isConfigReady, loadConfig } from "../core/storage/Storage";
import { SocialPlatformId } from "../platforms/types";
import { resolvePopupStatus, type PopupStatus } from "./SiteStatus";

const statusCard = document.querySelector<HTMLElement>("#status-card");
const statusBadge = document.querySelector<HTMLElement>("#status-badge");
const statusTitle = document.querySelector<HTMLElement>("#status-title");
const statusSite = document.querySelector<HTMLElement>("#status-site");
const statusHost = document.querySelector<HTMLElement>("#status-host");
const statusDescription = document.querySelector<HTMLElement>("#status-description");
const openSettings = document.querySelector<HTMLButtonElement>("#open-settings");

void init();

/**
 * Reads the active tab and renders the site status on popup open.
 */
async function init(): Promise<void> {
    applyStaticI18n();
    openSettings?.addEventListener("click", openOptionsPage);

    const url = await getActiveTabUrl();
    let configReady = false;

    try {
        configReady = isConfigReady(await loadConfig());
    } catch (err) {
        console.error("[popup] could not load config: %O", err);
    }

    renderStatus(resolvePopupStatus(url, configReady));
}

/**
 * Returns the URL of the active tab in the current window, when the browser exposes it.
 */
async function getActiveTabUrl(): Promise<string | undefined> {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        return tab?.url;
    } catch (err) {
        console.error("[popup] could not read the active tab: %O", err);
        return undefined;
    }
}

/**
 * Applies localized copy to the static popup markup.
 */
function applyStaticI18n(): void {
    const uiLanguage = getUiLanguage();

    document.documentElement.lang = uiLanguage.startsWith("pt") ? "pt-BR" : "en";
    document.title = t("extName");

    for (const element of Array.from(document.querySelectorAll<HTMLElement>("[data-i18n]"))) {
        const key = element.dataset.i18n;

        if (key) {
            element.textContent = t(key);
        }
    }
}

/**
 * Updates the status card and highlights the chip of the current site.
 */
function renderStatus(status: PopupStatus): void {
    const siteLabel = status.site?.label ?? t("popupSiteUnknown");
    const host = status.host ?? t("popupSiteUnknown");
    let badgeKey: string;
    let title: string;
    let descriptionKey: string;

    if (status.state === "active") {
        badgeKey = "popupStatusActiveBadge";
        title = t("popupStatusActiveTitle", siteLabel);
        descriptionKey = "popupStatusActiveDescription";
    } else if (status.state === "setup") {
        badgeKey = "popupStatusSetupBadge";
        title = t("popupStatusSetupTitle", siteLabel);
        descriptionKey = "popupStatusSetupDescription";
    } else {
        badgeKey = "popupStatusUnsupportedBadge";
        title = t("popupStatusUnsupportedTitle");
        descriptionKey = "popupStatusUnsupportedDescription";
    }

    if (statusCard) {
        statusCard.dataset.state = status.state;
    }

    if (statusBadge) {
        statusBadge.textContent = t(badgeKey);
    }

    if (statusTitle) {
        statusTitle.textContent = title;
    }

    if (statusDescription) {
        statusDescription.textContent = t(descriptionKey);
    }

    if (statusSite && statusHost) {
        statusSite.hidden = !status.host;
        statusHost.textContent = host;
    }

    highlightCurrentSite(status);
}

/**
 * Marks the supported-site chip that matches the active tab.
 */
function highlightCurrentSite(status: PopupStatus): void {
    let currentSite: string | undefined;

    if (status.site?.id === SocialPlatformId.X) {
        currentSite = "x";
    } else if (status.site?.id === SocialPlatformId.FACEBOOK) {
        currentSite = "facebook";
    } else if (status.site?.id === SocialPlatformId.E621) {
        currentSite = "e621";
    } else if (status.site?.id === SocialPlatformId.INSTAGRAM) {
        currentSite = "instagram";
    } else if (status.site?.id === SocialPlatformId.FURAFINITY) {
        currentSite = "furaffinity";
    }

    for (const chip of Array.from(document.querySelectorAll<HTMLElement>(".site-chip"))) {
        chip.classList.toggle("site-chip--current", chip.dataset.site === currentSite);
    }
}

/**
 * Opens the full settings page in a browser tab.
 */
function openOptionsPage(): void {
    if (typeof chrome.runtime.openOptionsPage === "function") {
        chrome.runtime.openOptionsPage();
        return;
    }

    void chrome.tabs.create({ url: chrome.runtime.getURL("options.html") });
}
