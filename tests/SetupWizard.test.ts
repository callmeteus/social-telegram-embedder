import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initSetupWizard, SetupPath } from "../src/options/SetupWizard";

const WizardMarkup = (() => {
    const html = readFileSync(resolve(__dirname, "../src/options/OptionsPage.html"), "utf8");
    const wizard = /<section id="setup-wizard"[\s\S]*?<\/section>/.exec(html)?.[0];

    if (!wizard) {
        throw new Error("setup wizard markup not found");
    }

    return wizard;
})();

const byId = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

beforeEach(() => {
    document.body.innerHTML = WizardMarkup;
});

describe("SetupWizard", () => {
    it("reports the chosen kind of connection", () => {
        const onChoose = vi.fn();

        initSetupWizard({ onChoose, onBack: vi.fn() });
        byId("setup-choose-account").click();
        byId("setup-choose-bot").click();

        expect(onChoose.mock.calls).toEqual([[SetupPath.ACCOUNT], [SetupPath.BOT]]);
    });

    it("hides Back on first run and offers it when adding another connection", () => {
        const onBack = vi.fn();
        const wizard = initSetupWizard({ onChoose: vi.fn(), onBack });

        wizard?.setVisible(true, false);
        expect(byId("setup-wizard").hidden).toBe(false);
        expect(byId("setup-back").hidden).toBe(true);
        expect(document.querySelector<HTMLElement>(".setup-wizard__lead")?.hidden).toBe(false);

        wizard?.setVisible(true, true);
        expect(byId("setup-back").hidden).toBe(false);
        expect(document.querySelector<HTMLElement>(".setup-wizard__lead")?.hidden).toBe(true);
        expect(byId("setup-back").getAttribute("aria-label")).toBe("Back");

        byId("setup-back").click();
        expect(onBack).toHaveBeenCalledTimes(1);

        wizard?.setVisible(false, true);
        expect(byId("setup-wizard").hidden).toBe(true);
    });

    it("draws the icons of both choices", () => {
        initSetupWizard({ onChoose: vi.fn(), onBack: vi.fn() });

        expect(byId("setup-choose-account").querySelector(".setup-path__icon svg")).toBeTruthy();
        expect(byId("setup-choose-bot").querySelector(".setup-path__icon svg")).toBeTruthy();
    });

    it("does nothing when the page has no chooser", () => {
        document.body.innerHTML = "";

        expect(initSetupWizard({ onChoose: vi.fn(), onBack: vi.fn() })).toBeNull();
    });
});
