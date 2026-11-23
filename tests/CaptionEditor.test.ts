import { describe, expect, it } from "vitest";
import {
    captionHtmlFromElement,
    createCaptionEditor,
    renderCaptionHtml
} from "../src/content/ui/picker/CaptionEditor";
import { buildCaptionDraftHtml, resolveTelegramCaption, toCaptionSourceUrl } from "../src/core/telegram/Caption";
import { sanitizeCaptionHtml, TelegramCaptionLimit } from "../src/core/telegram/CaptionHtml";

function surfaceOf(editor: { element: HTMLElement }): HTMLElement {
    return editor.element.querySelector<HTMLElement>(".x2tg-caption__editor")!;
}

function aboveToggleOf(editor: { element: HTMLElement }): HTMLButtonElement {
    return editor.element.querySelector<HTMLButtonElement>(".x2tg-caption__option")!;
}

describe("createCaptionEditor", () => {
    it("prefills bold ranges and line breaks from the draft", () => {
        const editor = createCaptionEditor({ initialHtml: "@<b>user</b>\n\nhttps://x.com/a/status/1" });
        const surface = surfaceOf(editor);

        expect(surface.querySelector("b")?.textContent).toBe("user");
        expect(surface.querySelectorAll("br")).toHaveLength(2);
        expect(editor.getHtml()).toBe("@<b>user</b>\n\nhttps://x.com/a/status/1");
    });

    it("drops markup the send pipeline does not support", () => {
        const editor = createCaptionEditor();
        const surface = surfaceOf(editor);

        surface.innerHTML = '<b>ok</b><script>bad()</script><img src="x" onerror="alert(1)">';

        expect(editor.getHtml()).toBe("<b>ok</b>");
    });

    it("closes bold left open by the browser", () => {
        const editor = createCaptionEditor();

        surfaceOf(editor).innerHTML = "<b>ok</b><b>open";

        expect(editor.getHtml()).toBe("<b>ok</b><b>open</b>");
    });

    it("turns contenteditable blocks into line breaks", () => {
        const editor = createCaptionEditor();

        surfaceOf(editor).innerHTML = "a<div>b</div>";

        expect(editor.getHtml()).toBe("a\nb");
    });

    it("escapes text typed by the user", () => {
        const editor = createCaptionEditor();

        surfaceOf(editor).textContent = "1 < 2 & 3 > 2";

        expect(editor.getHtml()).toBe("1 &lt; 2 &amp; 3 &gt; 2");
    });

    it("caps the caption at the Telegram limit", () => {
        const editor = createCaptionEditor();

        surfaceOf(editor).textContent = "a".repeat(TelegramCaptionLimit + 50);

        expect(editor.getHtml().length).toBe(TelegramCaptionLimit);
    });

    it("shows the character count of the visible text", () => {
        const editor = createCaptionEditor({ initialHtml: "<b>abc</b>" });

        expect(editor.element.querySelector(".x2tg-caption__count")?.textContent)
            .toBe(`3/${TelegramCaptionLimit}`);
    });

    it("returns an empty caption for an untouched editor", () => {
        expect(createCaptionEditor().getHtml()).toBe("");
    });

    it("starts with the caption-above-media option off and localized", () => {
        const editor = createCaptionEditor();
        const toggle = aboveToggleOf(editor);

        expect(editor.getCaptionAbove()).toBe(false);
        expect(toggle.getAttribute("aria-pressed")).toBe("false");
        expect(toggle.textContent).toBe("Caption above media");
    });

    it("accepts an initial caption-above-media state", () => {
        expect(createCaptionEditor({ captionAbove: true }).getCaptionAbove()).toBe(true);
    });

    it("toggles the caption-above-media option on and off", () => {
        const editor = createCaptionEditor();
        const toggle = aboveToggleOf(editor);

        toggle.click();

        expect(editor.getCaptionAbove()).toBe(true);
        expect(toggle.getAttribute("aria-pressed")).toBe("true");

        toggle.click();

        expect(editor.getCaptionAbove()).toBe(false);
        expect(toggle.getAttribute("aria-pressed")).toBe("false");
    });
});

describe("captionHtmlFromElement / renderCaptionHtml", () => {
    it("round-trips caption HTML through the editor DOM", () => {
        const host = document.createElement("div");

        renderCaptionHtml(host, "linha 1\n<b>linha 2</b>");

        expect(host.querySelectorAll("br")).toHaveLength(1);
        expect(host.querySelector("b")?.textContent).toBe("linha 2");
        expect(captionHtmlFromElement(host)).toBe("linha 1\n<b>linha 2</b>");
    });
});

describe("caption draft and override", () => {
    it("builds the draft from the post text and the source link", () => {
        expect(buildCaptionDraftHtml("@<b>user</b>\n\nHello", "https://x.com/a/status/1"))
            .toBe("@<b>user</b>\n\nHello\n\nhttps://x.com/a/status/1");
    });

    it("drafts only the source link when there is no text", () => {
        expect(buildCaptionDraftHtml("", "https://x.com/a/status/1"))
            .toBe("https://x.com/a/status/1");
    });

    it("shows the canonical x.com link instead of the media proxy", () => {
        expect(toCaptionSourceUrl("https://fixupx.com/Mumux_derg/status/2124545570215805122"))
            .toBe("https://x.com/Mumux_derg/status/2124545570215805122");
        expect(toCaptionSourceUrl("https://fxtwitter.com/jack/status/123?utm=1"))
            .toBe("https://twitter.com/jack/status/123");
        expect(toCaptionSourceUrl("https://www.facebook.com/post/1"))
            .toBe("https://www.facebook.com/post/1");

        expect(buildCaptionDraftHtml("Hey", "https://fixupx.com/Mumux_derg/status/2124545570215805122"))
            .toBe("Hey\n\nhttps://x.com/Mumux_derg/status/2124545570215805122");
        expect(resolveTelegramCaption("", "https://fixupx.com/a/status/1", "Hello"))
            .toBe("Hello\n\nhttps://x.com/a/status/1");
    });

    it("uses the edited caption and falls back to the generated one", () => {
        const post = { embedUrl: "https://x.com/a/status/1", text: "Hello" };

        expect(resolveTelegramCaption("<b>edited</b>", post.embedUrl, post.text)).toBe("<b>edited</b>");
        expect(resolveTelegramCaption("", post.embedUrl, post.text)).toBe("Hello\n\nhttps://x.com/a/status/1");
        expect(resolveTelegramCaption(undefined, post.embedUrl, post.text)).toBe("Hello\n\nhttps://x.com/a/status/1");
    });

    it("sanitizes the edited caption before sending", () => {
        expect(sanitizeCaptionHtml("<script>x</script><b>ok</b>")).toBe("<b>ok</b>");
    });
});
