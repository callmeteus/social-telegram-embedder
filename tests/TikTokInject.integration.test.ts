import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { injectTikTokContent } from "../src/platforms/tiktok/content/InjectButton";
import { extractTikTokCaptionText } from "../src/platforms/tiktok/content/VideoActionBar";

const videoMarkup = `
    <div id="video">
        <div data-e2e="video-actions">
            <button data-e2e="like" aria-label="Like"></button>
            <div>
                <button data-e2e="share" aria-label="Share"></button>
            </div>
        </div>
        <h1 data-e2e="video-desc">Cooking rice #food</h1>
    </div>
`;

describe("injectTikTokContent", () => {
    beforeEach(() => {
        vi.stubGlobal("location", {
            href: "https://www.tiktok.com/@chef/video/7123456789012345678",
            hostname: "www.tiktok.com"
        });
        document.body.innerHTML = videoMarkup;
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("injects the send button beside the share control", () => {
        injectTikTokContent(document);

        const button = document.querySelector(".x2tg-send-button--tiktok");
        const share = document.querySelector('[data-e2e="share"]');

        expect(button).not.toBeNull();
        expect(share?.parentElement?.lastElementChild).toBe(button);
        expect(button?.querySelectorAll("svg path")).toHaveLength(1);
        expect(button?.textContent).toBe("");
    });

    it("keeps the accessible name localized through i18n", () => {
        injectTikTokContent(document);

        const button = document.querySelector(".x2tg-send-button--tiktok");

        expect(button?.getAttribute("aria-label")).toBe("Send to Telegram");
        expect(button?.getAttribute("title")).toBe("Send to Telegram");
    });

    it("does not duplicate the button on repeated scans", () => {
        injectTikTokContent(document);
        injectTikTokContent(document);

        expect(document.querySelectorAll(".x2tg-send-button--tiktok")).toHaveLength(1);
    });

    it("does not inject outside a video view", () => {
        vi.stubGlobal("location", {
            href: "https://www.tiktok.com/@chef",
            hostname: "www.tiktok.com"
        });
        document.body.innerHTML = videoMarkup;

        injectTikTokContent(document);

        expect(document.querySelector(".x2tg-send-button--tiktok")).toBeNull();
    });
});

describe("extractTikTokCaptionText", () => {
    it("reads the rendered video description", () => {
        document.body.innerHTML = videoMarkup;

        expect(extractTikTokCaptionText(document)).toBe("Cooking rice #food");
    });

    it("falls back to Open Graph metadata", () => {
        document.head.innerHTML = '<meta property="og:description" content="A quiet clip.">';
        document.body.innerHTML = '<div data-e2e="video-actions"></div>';

        expect(extractTikTokCaptionText(document)).toBe("A quiet clip.");
    });
});
