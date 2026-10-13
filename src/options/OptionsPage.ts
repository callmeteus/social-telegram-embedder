import { initBotConnectionEditor, type BotConnectionEditor } from "./BotConnectionEditor";
import { renderConnectionsList } from "./ConnectionsList";
import { formatOptionsRoute, OptionsView, parseOptionsRoute, type OptionsRoute } from "./OptionsRoute";
import { initSetupWizard, SetupPath, type SetupWizardControls } from "./SetupWizard";
import { initTelegramAccountSection, type TelegramAccountSectionControls } from "./TelegramAccountSection";
import { applyOptionsPageI18n } from "../core/i18n/ApplyOptionsPageI18n";
import { t } from "../core/i18n/I18n";
import { createConnectionId } from "../core/storage/Connections";
import { loadConfig } from "../core/storage/Storage";
import { SendConnectionType, type ExtensionConfig } from "../core/types/Config";

const connectionsView = document.getElementById("connections-view") as HTMLElement;
const connectionsList = document.getElementById("connections-list") as HTMLElement;
const accountSection = document.getElementById("account-section") as HTMLElement;
const botSection = document.getElementById("bot-section") as HTMLElement;
const subtitle = document.querySelector<HTMLElement>(".page__subtitle");

let config: ExtensionConfig | null = null;
let current: OptionsRoute = { view: OptionsView.LIST };
let setupWizard: SetupWizardControls | null = null;
let botEditor: BotConnectionEditor | null = null;
let accountSectionControls: TelegramAccountSectionControls | null = null;

void init();

async function init(): Promise<void> {
    applyToolbarPopupLayoutIfNeeded();
    applyOptionsPageI18n();

    setupWizard = initSetupWizard({
        onChoose: (path) => navigate({
            view: path === SetupPath.BOT ? OptionsView.BOT : OptionsView.ACCOUNT,
            connectionId: createConnectionId()
        }),
        onBack: () => navigate({ view: OptionsView.LIST })
    });
    botEditor = initBotConnectionEditor({ onRemoved: () => navigate({ view: OptionsView.LIST }, { force: true }) });
    accountSectionControls = initTelegramAccountSection({ onLoggedOut: () => navigate({ view: OptionsView.LIST }, { force: true }) });

    document.getElementById("connections-add")?.addEventListener("click", () => navigate({ view: OptionsView.ADD }));
    document.getElementById("bot-back")?.addEventListener("click", () => navigate({ view: OptionsView.LIST }));
    document.getElementById("account-back")?.addEventListener("click", () => navigate({ view: OptionsView.LIST }));

    window.addEventListener("popstate", () => {
        const route = parseOptionsRoute(window.location.hash);

        if (!show(route)) {
            history.pushState(null, "", formatOptionsRoute(current));
        }
    });

    window.addEventListener("beforeunload", (event) => {
        if (botEditor?.isDirty()) {
            event.preventDefault();
            event.returnValue = "";
        }
    });

    chrome.storage.onChanged.addListener((_changes, area) => {
        if (area === "sync") {
            void refreshConfig();
        }
    });

    await refreshConfig();
    show(parseOptionsRoute(window.location.hash), { force: true });
}

async function refreshConfig(): Promise<void> {
    config = await loadConfig();
    renderConnectionsList(connectionsList, config, (connection) => navigate({
        view: connection.type === SendConnectionType.TELEGRAM_BOT ? OptionsView.BOT : OptionsView.ACCOUNT,
        connectionId: connection.id
    }));

    if (current.view === OptionsView.LIST || current.view === OptionsView.ADD) {
        applyVisibility();
    }
}

/**
 * Moves to a screen and records it in the history so the browser Back button returns here.
 */
function navigate(route: OptionsRoute, options: { force?: boolean } = {}): void {
    if (show(route, options)) {
        history.pushState(null, "", formatOptionsRoute(route));
    }
}

/**
 * Switches screens. Leaving a bot with unsaved edits asks first; returns false when the user stays.
 */
function show(route: OptionsRoute, options: { force?: boolean } = {}): boolean {
    const sameScreen = route.view === current.view && route.connectionId === current.connectionId;

    if (!options.force && sameScreen) {
        return false;
    }

    if (!options.force && current.view === OptionsView.BOT && botEditor?.isDirty() && !window.confirm(t("optionsDiscardChanges"))) {
        return false;
    }

    if (current.view === OptionsView.BOT && (route.view !== OptionsView.BOT || !sameScreen)) {
        botEditor?.close();
    }

    if (current.view === OptionsView.ACCOUNT && (route.view !== OptionsView.ACCOUNT || !sameScreen)) {
        accountSectionControls?.close();
    }

    console.debug("[options] view %s %s", route.view, route.connectionId ?? "");
    current = route;
    applyVisibility();

    if (route.view === OptionsView.BOT && route.connectionId) {
        void botEditor?.open(route.connectionId);
    } else
    if (route.view === OptionsView.ACCOUNT && route.connectionId) {
        accountSectionControls?.open(route.connectionId);
    }

    window.scrollTo?.({ top: 0 });
    return true;
}

/**
 * Shows the section of the current screen. With no connections yet, the list is replaced
 * by the chooser (first run).
 */
function applyVisibility(): void {
    const hasConnections = (config?.connections.length ?? 0) > 0;
    const onList = current.view === OptionsView.LIST && hasConnections;
    const onChooser = current.view === OptionsView.ADD || (current.view === OptionsView.LIST && !hasConnections);

    connectionsView.hidden = !onList;
    setupWizard?.setVisible(onChooser, hasConnections);
    botSection.hidden = current.view !== OptionsView.BOT;
    accountSection.hidden = current.view !== OptionsView.ACCOUNT;

    // A detail screen explains itself, so the subtitle steps aside.
    if (subtitle) {
        subtitle.textContent = onChooser && !hasConnections ? t("optionsSetupSubtitle") : t("optionsSubtitle");
        subtitle.hidden = !onList && !onChooser;
    }
}

/**
 * Applies compact layout when the options UI is shown in the toolbar popup.
 */
function applyToolbarPopupLayoutIfNeeded(): void {
    if (!isExtensionToolbarPopup()) {
        return;
    }

    document.documentElement.classList.add("x2tg-options--popup");
}

function isExtensionToolbarPopup(): boolean {
    const params = new URLSearchParams(window.location.search);

    if (params.get("popup") === "1") {
        return true;
    }

    if (params.get("popup") === "0") {
        return false;
    }

    return window.innerWidth > 0 && window.innerWidth < 560;
}
