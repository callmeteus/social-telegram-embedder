import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { injectFacebookContent } from "../src/platforms/facebook/content/InjectButton";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function loadFixtureLine(fileName: string, lineNumber: number): string {
    const lines = readFileSync(join(fixturesDir, fileName), "utf8").split(/\r?\n/);
    return lines[lineNumber - 1] ?? "";
}

describe("injectFacebookContent integration", () => {
    it("injects on feed posts once the action bar is present", () => {
        document.body.innerHTML = `
            ${loadFixtureLine("facebook-cases.html", 1)}
            <div class="actions">
                <div data-ad-rendering-role="like_button"></div>
                <div data-ad-rendering-role="comment_button"></div>
                <div role="button">
                    <div data-ad-rendering-role="share_button"></div>
                </div>
            </div>
        `;

        injectFacebookContent(document);

        expect(document.querySelector(".x2tg-send-button-slot")).not.toBeNull();
    });

    it("injects on post modal markup with pfbid permalink", () => {
        document.body.innerHTML = loadFixtureLine("facebook-cases.html", 5);

        injectFacebookContent(document);

        expect(document.querySelector(".x2tg-send-button-slot")).not.toBeNull();
    });
});
