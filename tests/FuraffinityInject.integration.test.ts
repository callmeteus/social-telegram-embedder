import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    FURAFFINITY_INJECTED_ATTR,
    injectFuraffinityContent
} from "../src/platforms/furaffinity/content/InjectButton";
import { buildFuraffinitySnapshot, findFuraffinityInsertRow } from "../src/platforms/furaffinity/content/SubmissionView";

const submissionMarkup = `
    <div class="submission-details">
        <section class="submission-description">
            <div class="submission-description-artist">
                <a href="/user/artist"><span class="c-usernameBlockSimple__displayName">Artist</span></a>
                <div class="submission-title"><h2>Cool Art</h2></div>
            </div>
            <div class="section-body">
                <div class="submission-description-text">
                    Hello <b>world</b>.
                    <div class="submission-footer">My TG channel</div>
                </div>
            </div>
        </section>
    </div>
    <section class="submission-content">
        <img id="submissionImg" src="//d.furaffinity.net/art/artist/12345/cool.jpg">
        <div class="submission-controls"></div>
        <div id="submission-options">
            <a class="button standard mobile-fix" href="/fav/12345">+Fav</a>
            <a class="button standard mobile-fix" href="/newpm/artist">Note</a>
            <a class="button standard mobile-fix" href="//d.facdn.net/art/artist/12345/cool.jpg">Download</a>
        </div>
    </section>
`;

describe("injectFuraffinityContent", () => {
    beforeEach(() => {
        vi.stubGlobal("location", {
            href: "https://www.furaffinity.net/view/12345/",
            hostname: "www.furaffinity.net"
        });
        document.body.innerHTML = submissionMarkup;
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("injects the send button into the submission control row", () => {
        injectFuraffinityContent(document);

        const button = document.querySelector("#submission-options .x2tg-send-button--furaffinity");

        expect(button).not.toBeNull();
        expect(document.querySelector("#submission-options")?.lastElementChild).toBe(button);
        expect(button?.classList.contains("button")).toBe(true);
        expect(button?.classList.contains("standard")).toBe(true);
        expect(button?.querySelectorAll("svg path")).toHaveLength(1);
        expect(button?.textContent).toBe("");
    });

    it("keeps the accessible name localized through i18n", () => {
        injectFuraffinityContent(document);

        const button = document.querySelector(".x2tg-send-button--furaffinity");

        expect(button?.getAttribute("aria-label")).toBe("Send to Telegram");
        expect(button?.getAttribute("title")).toBe("Send to Telegram");
    });

    it("does not duplicate the button on repeated scans", () => {
        injectFuraffinityContent(document);
        injectFuraffinityContent(document);

        expect(document.querySelectorAll(".x2tg-send-button--furaffinity")).toHaveLength(1);
        expect(document.querySelector(".submission-content")?.getAttribute(FURAFFINITY_INJECTED_ATTR)).toBe("true");
    });

    it("does not inject outside a submission view", () => {
        vi.stubGlobal("location", {
            href: "https://www.furaffinity.net/gallery/artist",
            hostname: "www.furaffinity.net"
        });
        document.body.innerHTML = submissionMarkup;

        injectFuraffinityContent(document);

        expect(document.querySelector(".x2tg-send-button--furaffinity")).toBeNull();
    });
});

describe("buildFuraffinitySnapshot", () => {
    it("maps the visible submission into the payload sent to the worker", () => {
        document.body.innerHTML = submissionMarkup;
        const submission = document.querySelector(".submission-content");

        if (!submission) {
            throw new Error("submission fixture is missing");
        }

        const snapshot = buildFuraffinitySnapshot(submission);

        expect(snapshot?.text).toBe("<b>Artist</b>\n\nCool Art\n\nHello world.");
        expect(snapshot?.media).toEqual([
            {
                kind: "photo",
                url: "https://d.furaffinity.net/art/artist/12345/cool.jpg"
            }
        ]);
    });

    it("returns null when the view has no media", () => {
        document.body.innerHTML = '<section class="submission-content"><h2 class="submission-title">Text only</h2></section>';
        const submission = document.querySelector(".submission-content");

        if (!submission) {
            throw new Error("submission fixture is missing");
        }

        expect(buildFuraffinitySnapshot(submission)).toBeNull();
    });
});

describe("findFuraffinityInsertRow", () => {
    it("prefers the native submission-options row", () => {
        document.body.innerHTML = submissionMarkup;
        const submission = document.querySelector(".submission-content");
        const controls = document.querySelector("#submission-options");

        if (!submission || !controls) {
            throw new Error("submission fixture is missing");
        }

        expect(findFuraffinityInsertRow(submission)).toBe(controls);
    });
});
