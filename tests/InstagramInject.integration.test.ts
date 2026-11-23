import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    INSTAGRAM_INJECTED_ATTR,
    injectInstagramContent
} from "../src/platforms/instagram/content/InjectButton";

const postMarkup = `
    <article>
        <header><a href="/traveler">traveler</a></header>
        <img src="https://scontent-abc.cdninstagram.com/v/photo1.jpg">
        <a href="/p/ABC123def45/">permalink</a>
        <div class="actions">
            <div role="button"><svg aria-label="Like"></svg></div>
            <div role="button"><svg aria-label="Comment"></svg></div>
            <div role="button"><svg aria-label="Share"></svg></div>
        </div>
    </article>
`;

describe("injectInstagramContent", () => {
    beforeEach(() => {
        document.body.innerHTML = postMarkup;
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("injects the send button right after the share action", () => {
        injectInstagramContent(document);

        const share = document.querySelector('svg[aria-label="Share"]')?.closest('[role="button"]');
        const button = document.querySelector(".x2tg-send-button--instagram");

        expect(button).not.toBeNull();
        expect(share?.nextElementSibling).toBe(button);
        expect(button?.getAttribute("aria-label")).toBe("Send to Telegram");
        expect(button?.getAttribute("title")).toBe("Send to Telegram");
        expect(button?.querySelectorAll("svg path")).toHaveLength(1);
    });

    it("marks the action bar and never injects the button twice", () => {
        injectInstagramContent(document);
        injectInstagramContent(document);

        expect(document.querySelectorAll(".x2tg-send-button--instagram")).toHaveLength(1);
        expect(document.querySelector(".actions")?.getAttribute(INSTAGRAM_INJECTED_ATTR)).toBe("true");
    });

    it("does not inject when the post URL cannot be resolved", () => {
        vi.stubGlobal("location", {
            href: "https://www.instagram.com/"
        });
        document.body.innerHTML = `
            <article>
                <div class="actions">
                    <div role="button"><svg aria-label="Like"></svg></div>
                    <div role="button"><svg aria-label="Comment"></svg></div>
                    <div role="button"><svg aria-label="Share"></svg></div>
                </div>
            </article>
        `;

        injectInstagramContent(document);

        expect(document.querySelector(".x2tg-send-button--instagram")).toBeNull();
    });

    it("injects on a reel action bar with localized share labels", () => {
        document.body.innerHTML = `
            <article>
                <video src="https://scontent-abc.cdninstagram.com/v/clip.mp4"></video>
                <a href="/reel/XYZ987abc12/">permalink</a>
                <div class="actions">
                    <div role="button"><svg aria-label="Curtir"></svg></div>
                    <div role="button"><svg aria-label="Comentar"></svg></div>
                    <div role="button"><svg aria-label="Compartilhar"></svg></div>
                </div>
            </article>
        `;

        injectInstagramContent(document);

        expect(document.querySelectorAll(".x2tg-send-button--instagram")).toHaveLength(1);
    });
});
