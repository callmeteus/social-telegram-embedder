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
            <button aria-label="Like">Like</button>
            <button aria-label="Comment">Comment</button>
            <button aria-label="Share">Share</button>
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

        const share = document.querySelector('[aria-label="Share"]');
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
                    <button aria-label="Like">Like</button>
                    <button aria-label="Comment">Comment</button>
                    <button aria-label="Share">Share</button>
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
                    <button aria-label="Curtir">Like</button>
                    <button aria-label="Comentar">Comment</button>
                    <button aria-label="Compartilhar">Share</button>
                </div>
            </article>
        `;

        injectInstagramContent(document);

        expect(document.querySelectorAll(".x2tg-send-button--instagram")).toHaveLength(1);
    });
});
