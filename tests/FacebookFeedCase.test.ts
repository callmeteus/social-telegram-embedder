import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    collectFacebookActionBars,
    findActionBar,
    findPostRootFromProfile
} from "../src/platforms/facebook/content/ActionBar";
import { injectFacebookContent } from "../src/platforms/facebook/content/InjectButton";
import { extractPostUrlFromElement } from "../src/platforms/facebook/url/FacebookUrl";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function loadFixtureLine(lineNumber: number): string {
    const lines = readFileSync(join(fixturesDir, "facebook-cases.html"), "utf8").split(/\r?\n/);
    return lines[lineNumber - 1] ?? "";
}

describe("facebook feed case diagnostics", () => {
    it("finds photo URL but no action bar in truncated feed markup", () => {
        document.body.innerHTML = loadFixtureLine(1);

        const profileName = document.querySelector('[data-ad-rendering-role="profile_name"]')!;
        const postRoot = findPostRootFromProfile(profileName);

        expect(extractPostUrlFromElement(postRoot)).toContain("/photo/?fbid=");
        expect(findActionBar(postRoot)).toBeNull();
        expect(collectFacebookActionBars(document)).toHaveLength(0);
    });

    it("injects once an action bar is present in the post card", () => {
        document.body.innerHTML = `
            ${loadFixtureLine(1)}
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
});
