import { createLucideSvgElement } from "../core/ui/LucideIcon";
import { Bot, ChevronLeft, Plus, UserRound } from "lucide-static";
import { t } from "../core/i18n/I18n";

/** Which kind of connection the user is adding. */
export enum SetupPath {
    BOT = "BOT",
    ACCOUNT = "ACCOUNT"
}

/** Callbacks of the chooser. */
export interface SetupWizardHandlers {
    onChoose(path: SetupPath): void;
    /** Back to the connections list; only offered when there is one. */
    onBack(): void;
}

/** Handle returned by {@link initSetupWizard}. */
export interface SetupWizardControls {
    /** Shows or hides the chooser; Back is hidden on first run (nothing to go back to). */
    setVisible(visible: boolean, canGoBack: boolean): void;
}

/**
 * Wires the "How do you want to send?" chooser: Telegram account or bot. Shown on first run
 * and whenever the user adds another connection.
 */
export function initSetupWizard(handlers: SetupWizardHandlers): SetupWizardControls | null {
    const root = document.getElementById("setup-wizard");
    const chooseAccount = document.getElementById("setup-choose-account");
    const chooseBot = document.getElementById("setup-choose-bot");
    const back = document.getElementById("setup-back");
    const lead = root?.querySelector<HTMLElement>(".setup-wizard__lead");

    if (!root || !chooseAccount || !chooseBot) {
        return null;
    }

    decorateIcons(chooseAccount, chooseBot);

    chooseAccount.addEventListener("click", () => handlers.onChoose(SetupPath.ACCOUNT));
    chooseBot.addEventListener("click", () => handlers.onChoose(SetupPath.BOT));
    back?.addEventListener("click", () => handlers.onBack());

    return {
        setVisible(visible: boolean, canGoBack: boolean): void {
            root.hidden = !visible;

            if (back) {
                back.hidden = !canGoBack;
            }

            // "Start with one" only reads right before the first connection exists.
            if (lead) {
                lead.hidden = canGoBack;
            }
        }
    };
}

/**
 * Fills the icon slots of the chooser, the detail headers and the "Add" button.
 */
function decorateIcons(accountButton: HTMLElement, botButton: HTMLElement): void {
    accountButton.querySelector(".setup-path__icon")?.replaceChildren(createLucideSvgElement(UserRound, 22));
    botButton.querySelector(".setup-path__icon")?.replaceChildren(createLucideSvgElement(Bot, 22));

    for (const icon of Array.from(document.querySelectorAll<HTMLElement>(".setup-add__icon"))) {
        icon.replaceChildren(createLucideSvgElement(Plus, 16));
    }

    for (const icon of Array.from(document.querySelectorAll<HTMLElement>("[data-route-icon]"))) {
        icon.replaceChildren(createLucideSvgElement(icon.dataset.routeIcon === "bot" ? Bot : UserRound, 18));
    }

    for (const button of Array.from(document.querySelectorAll<HTMLElement>(".path-head__back"))) {
        button.replaceChildren(createLucideSvgElement(ChevronLeft, 18));
        button.setAttribute("aria-label", t("optionsSetupBack"));
    }
}
