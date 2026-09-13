import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    findReelSnapshotRoot
} from "../src/platforms/facebook/content/ActionBar";
import { injectFacebookContent } from "../src/platforms/facebook/content/InjectButton";
import { extractPostSnapshot } from "../src/platforms/facebook/content/PostDom";
import {
    extractReelPostUrl,
    isFacebookReelViewerPage
} from "../src/platforms/facebook/url/FacebookUrl";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

describe("findReelSnapshotRoot", () => {
    it("scopes to the active reel instead of the multi-reel viewer wrapper", () => {
        document.body.innerHTML = `
            <div role="main">
                <div class="reel-column">
                    <div class="reel-root" data-video-id="1758743321721989">
                        <video></video>
                        <div class="caption">guys... i think i am in trouble...</div>
                    </div>
                    <div class="side-actions">
                        <div aria-label="Curtir" role="button"></div>
                        <div aria-label="Comentar" role="button"></div>
                        <div aria-label="Compartilhar" role="button"></div>
                    </div>
                </div>
                <div class="reel-column">
                    <div data-video-id="1355248403241157">
                        <video></video>
                    </div>
                </div>
            </div>
        `;

        const actionBar = document.querySelector(".side-actions")!;
        const snapshotRoot = findReelSnapshotRoot(actionBar);

        expect(snapshotRoot.classList.contains("reel-column")).toBe(true);
        expect(snapshotRoot.querySelector("[data-video-id]")?.getAttribute("data-video-id")).toBe("1758743321721989");
        expect(snapshotRoot.textContent).toContain("guys... i think i am in trouble...");
    });
});

describe("extractReelPostUrl", () => {
    it("prefers the reel video id over unrelated feed links in the document", () => {
        document.body.innerHTML = `
            <div class="reel-root" data-video-id="1758743321721989">
                <video></video>
            </div>
            <a href="/raisa.pereira.2025/posts/pfbid0WrongPost">feed behind</a>
        `;

        const snapshotRoot = document.querySelector(".reel-root")!;

        expect(extractReelPostUrl(snapshotRoot, {
            href: "https://www.facebook.com/reel/1758743321721989/"
        } as Location)).toBe("https://www.facebook.com/reel/1758743321721989/");
    });
});

describe("injectFacebookContent reel viewer", () => {
    it("wires the send button to the active reel, not a feed post behind it", async () => {
        const fixture = readFileSync(join(fixturesDir, "facebook-reel-viewer.html"), "utf8");

        document.body.innerHTML = `
            ${fixture}
            <article class="feed-post">
                <div data-ad-rendering-role="profile_name">Raisa Pereira 2025</div>
                <a href="/raisa.pereira.2025/posts/pfbid0WrongPost">mention</a>
                <div class="feed-actions">
                    <div data-ad-rendering-role="like_button"></div>
                    <div data-ad-rendering-role="comment_button"></div>
                    <div role="button"><div data-ad-rendering-role="share_button"></div></div>
                </div>
            </article>
        `;

        Object.defineProperty(window, "location", {
            configurable: true,
            value: {
                href: "https://www.facebook.com/reel/1758743321721989/"
            }
        });

        injectFacebookContent(document);

        const reelButton = document.querySelector(".x2tg-send-button--facebook-reel");
        expect(reelButton).not.toBeNull();

        const reelActionBar = reelButton?.closest(".side-actions");
        const snapshotRoot = reelActionBar ? findReelSnapshotRoot(reelActionBar) : null;
        expect(snapshotRoot).not.toBeNull();

        const snapshot = extractPostSnapshot(
            snapshotRoot!,
            extractReelPostUrl(snapshotRoot!, window.location)
        );

        expect(snapshot.text).toContain("<b>Lupus et Vulpes</b>");
        expect(snapshot.text).toContain("guys... i think i am in trouble...");
        expect(snapshot.text).not.toContain("Raisa Pereira 2025");
        expect(extractReelPostUrl(snapshotRoot!, window.location)).toBe(
            "https://www.facebook.com/reel/1758743321721989/"
        );
    });
});

describe("isFacebookReelViewerPage", () => {
    it("detects dedicated reel pages", () => {
        expect(isFacebookReelViewerPage({
            pathname: "/reel/1758743321721989/"
        } as Location)).toBe(true);

        expect(isFacebookReelViewerPage({
            pathname: "/"
        } as Location)).toBe(false);
    });
});
