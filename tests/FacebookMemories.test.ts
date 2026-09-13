import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    collectFacebookActionBars,
    collectReelViewerActionBars,
    findShareControl
} from "../src/platforms/facebook/content/ActionBar";
import { injectFacebookContent } from "../src/platforms/facebook/content/InjectButton";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const memoriesFixturePath = "C:/Users/Gio/.cursor/projects/c-Users-Gio-Documents-Projetos/uploads/Untitled-1-L1-L1-0.txt";

describe("facebook memories layout", () => {
    it("does not style the send button as a reel control", () => {
        document.body.innerHTML = readFileSync(memoriesFixturePath, "utf8")
            .replace(/x2tg-send-button[^" ]*/g, "")
            .replace(/data-x2tg-fb-[^=]*="true"/g, "");

        injectFacebookContent(document);

        const button = document.querySelector(".x2tg-send-button");

        expect(button).not.toBeNull();
        expect(button?.classList.contains("x2tg-send-button--facebook-reel")).toBe(false);
        expect(button?.classList.contains("x2tg-send-button--facebook")).toBe(true);
        expect(button?.textContent?.trim()).not.toMatch(/compartilhar/i);
    });

    it("reports reel bars only for compact side-rail controls", () => {
        document.body.innerHTML = readFileSync(memoriesFixturePath, "utf8");

        expect(collectFacebookActionBars(document)).toHaveLength(0);

        const reelBars = collectReelViewerActionBars(document);
        const shareControl = findShareControl(document.body);

        expect(reelBars.some((bar) => bar.contains(shareControl!))).toBe(false);
    });
});
