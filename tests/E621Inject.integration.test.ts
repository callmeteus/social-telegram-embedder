import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { injectE621Content } from "../src/platforms/e621/content/InjectButton";
import { extractE621CaptionText, findE621InsertRow } from "../src/platforms/e621/content/ControlStrip";

const postMarkup = `
    <section id="image-container" data-id="3000000"><img id="image"></section>
    <section id="ptbr-wrapper">
        <div class="ptbr-row">
            <div class="ptbr-vote"></div>
            <div class="ptbr-resize">
                <select id="image-resize-selector"><option>Sample (850px)</option></select>
            </div>
        </div>
        <div class="ptbr-row">
            <button class="st-button">Fullscreen</button>
            <button class="st-button" aria-label="More Options">...</button>
        </div>
    </section>
`;

describe("injectE621Content", () => {
    beforeEach(() => {
        vi.stubGlobal("location", {
            href: "https://e621.net/posts/3000000",
            hostname: "e621.net"
        });
        document.body.innerHTML = postMarkup;
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("injects the send button as the last control of the toolbar row", () => {
        injectE621Content(document);

        const rows = document.querySelectorAll("#ptbr-wrapper .ptbr-row");
        const lastRow = rows[rows.length - 1];
        const button = lastRow?.querySelector(".x2tg-send-button--e621");

        expect(button).not.toBeNull();
        expect(lastRow?.lastElementChild).toBe(button);
        expect(button?.classList.contains("st-button")).toBe(true);
        expect(button?.classList.contains("kinetic")).toBe(true);
        expect(button?.querySelectorAll("svg path")).toHaveLength(2);
        expect(button?.textContent).toBe("");
    });

    it("keeps the accessible name localized through i18n", () => {
        injectE621Content(document);

        const button = document.querySelector(".x2tg-send-button--e621");

        expect(button?.getAttribute("aria-label")).toBe("Send to Telegram");
        expect(button?.getAttribute("title")).toBe("Send to Telegram");
    });

    it("does not duplicate the button on repeated scans", () => {
        injectE621Content(document);
        injectE621Content(document);

        expect(document.querySelectorAll(".x2tg-send-button--e621")).toHaveLength(1);
    });

    it("does not inject outside a post view", () => {
        vi.stubGlobal("location", {
            href: "https://e621.net/posts?tags=solo",
            hostname: "e621.net"
        });
        document.body.innerHTML = postMarkup;

        injectE621Content(document);

        expect(document.querySelector(".x2tg-send-button--e621")).toBeNull();
    });
});

describe("extractE621CaptionText", () => {
    it("reads the description from the E621 post payload", () => {
        document.body.innerHTML = `
            <script id="post-data" type="text/plain">
                ${btoa(JSON.stringify({ description: "Hello <b>world</b>." }))}
            </script>
        `;

        expect(extractE621CaptionText(document)).toBe("Hello world.");
    });
});

describe("findE621InsertRow", () => {
    it("returns the last toolbar row so the button is the final control", () => {
        document.body.innerHTML = postMarkup;
        const strip = document.querySelector("#ptbr-wrapper");

        if (!strip) {
            throw new Error("control strip fixture is missing");
        }

        const rows = strip.querySelectorAll(".ptbr-row");

        expect(findE621InsertRow(strip)).toBe(rows[rows.length - 1]);
    });
});
