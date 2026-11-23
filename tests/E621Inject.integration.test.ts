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
        <div class="ptbr-row"><button>Fullscreen</button></div>
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

    it("injects the send button in the size selector row, after the existing controls", () => {
        injectE621Content(document);

        const row = document.querySelector(".ptbr-row");
        const slot = row?.querySelector(".x2tg-send-button-slot--e621");
        const resizeSlot = document.querySelector("#image-resize-selector")?.parentElement;

        expect(slot).not.toBeNull();
        expect(slot?.previousElementSibling).toBe(resizeSlot);
        expect(slot?.querySelector("button")?.getAttribute("aria-label")).toBe("Send to Telegram");
        expect(slot?.querySelector("button")?.textContent).toBe("Send to Telegram");
    });

    it("does not duplicate the button on repeated scans", () => {
        injectE621Content(document);
        injectE621Content(document);

        expect(document.querySelectorAll(".x2tg-send-button-slot--e621")).toHaveLength(1);
    });

    it("does not inject outside a post view", () => {
        vi.stubGlobal("location", {
            href: "https://e621.net/posts?tags=solo",
            hostname: "e621.net"
        });
        document.body.innerHTML = postMarkup;

        injectE621Content(document);

        expect(document.querySelector(".x2tg-send-button-slot--e621")).toBeNull();
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
    it("falls back to the last toolbar row when there is no size selector", () => {
        document.body.innerHTML = postMarkup;
        document.querySelector("#image-resize-selector")?.remove();
        const strip = document.querySelector("#ptbr-wrapper");

        if (!strip) {
            throw new Error("control strip fixture is missing");
        }

        const rows = strip.querySelectorAll(".ptbr-row");

        expect(findE621InsertRow(strip)).toBe(rows[rows.length - 1]);
    });
});
