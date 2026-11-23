import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    FURAFFINITY_INJECTED_ATTR,
    injectFuraffinityContent
} from "../src/platforms/furaffinity/content/InjectButton";
import { buildFuraffinitySnapshot, findFuraffinityInsertRow } from "../src/platforms/furaffinity/content/SubmissionView";

const submissionMarkup = `
    <section class="submission-content">
        <div class="submission-artist-container">
            <a class="submission-artist" href="/user/artist">Artist</a>
            <h2 class="submission-title">Cool Art</h2>
        </div>
        <img id="submission-img" src="//d.facdn.net/art/artist/12345/cool.jpg">
        <div class="submission-description">Hello <b>world</b>.</div>
        <div class="submission-controls"></div>
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

        const button = document.querySelector(".submission-controls .x2tg-send-button--furaffinity");

        expect(button).not.toBeNull();
        expect(document.querySelector(".submission-controls")?.lastElementChild).toBe(button);
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
                url: "https://d.facdn.net/art/artist/12345/cool.jpg"
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
    it("returns the control row when the submission has one", () => {
        document.body.innerHTML = submissionMarkup;
        const submission = document.querySelector(".submission-content");
        const controls = document.querySelector(".submission-controls");

        if (!submission || !controls) {
            throw new Error("submission fixture is missing");
        }

        expect(findFuraffinityInsertRow(submission)).toBe(controls);
    });
});
