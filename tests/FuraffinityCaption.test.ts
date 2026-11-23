import { describe, expect, it } from "vitest";
import {
    buildFuraffinityCaptionHtml,
    parseFuraffinityTitle,
    plainFuraffinityText
} from "../src/platforms/furaffinity/text/FuraffinityCaption";

describe("parseFuraffinityTitle", () => {
    it("splits the artist out of a FurAffinity page title", () => {
        expect(parseFuraffinityTitle("Cool Art by Artist on Fur Affinity [dot] net")).toEqual({
            title: "Cool Art",
            artist: "Artist"
        });
    });

    it("keeps the whole title when no artist is present", () => {
        expect(parseFuraffinityTitle("Untitled")).toEqual({
            title: "Untitled",
            artist: ""
        });
    });
});

describe("plainFuraffinityText", () => {
    it("strips markup, decodes entities and collapses blank lines", () => {
        expect(plainFuraffinityText("Hello <b>world</b>.<br><br>Bye &amp; thanks")).toBe("Hello world.\n\nBye & thanks");
    });
});

describe("buildFuraffinityCaptionHtml", () => {
    it("renders the artist as a bold header and escapes the title", () => {
        expect(buildFuraffinityCaptionHtml("A <b>Title</b>", "Artist & Co", "Line one<br>Line two"))
            .toBe("<b>Artist &amp; Co</b>\n\nA Title\n\nLine one\nLine two");
    });

    it("omits an empty artist header", () => {
        expect(buildFuraffinityCaptionHtml("Title", "", "")).toBe("Title");
    });
});
