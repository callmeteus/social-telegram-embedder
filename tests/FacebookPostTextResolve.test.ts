import { describe, expect, it } from "vitest";
import { parseFacebookPostBodyFromHtml } from "../src/platforms/facebook/api/OpenGraphFetch";
import {
    isFacebookTruncatedText,
    isOnlyFacebookExpandLink,
    stripFacebookExpandSuffix
} from "../src/platforms/facebook/content/PostTextUtils";

describe("PostTextUtils", () => {
    it("detects collapsed see-more labels", () => {
        expect(isOnlyFacebookExpandLink("... Ver mais")).toBe(true);
        expect(isOnlyFacebookExpandLink("See more")).toBe(true);
        expect(isFacebookTruncatedText("Commission info... Ver mais")).toBe(true);
    });

    it("strips see-more suffixes", () => {
        expect(stripFacebookExpandSuffix("Commission info... Ver mais"))
            .toBe("Commission info");
    });
});

describe("parseFacebookPostBodyFromHtml", () => {
    it("reads full text from og:description", () => {
        const html = `
            <meta property="og:description" content="Art: Jayrnski commission for Little Puppy Moon" />
        `;

        expect(parseFacebookPostBodyFromHtml(html))
            .toBe("Art: Jayrnski commission for Little Puppy Moon");
    });

    it("prefers the longest embedded message text", () => {
        const html = `
            <meta property="og:description" content="Short preview" />
            <script>"message_text":"Full commission caption with artist credits"</script>
        `;

        expect(parseFacebookPostBodyFromHtml(html))
            .toBe("Full commission caption with artist credits");
    });
});
