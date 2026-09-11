import { describe, expect, it } from "vitest";
import {
    extractTweetUrlFromActionBar,
    extractTweetUrlFromElement,
    toFixupxTweetUrl,
    tweetUrlFromPage
} from "../src/platforms/x/url/FixupxUrl";

describe("toFixupxTweetUrl", () => {
    it("converts x.com links to fixupx.com", () => {
        expect(toFixupxTweetUrl("https://x.com/jack/status/123?s=20")).toBe(
            "https://fixupx.com/jack/status/123"
        );
    });

    it("converts twitter.com links to fxtwitter.com", () => {
        expect(toFixupxTweetUrl("https://twitter.com/jack/status/456")).toBe(
            "https://fxtwitter.com/jack/status/456"
        );
    });

    it("returns null for non-tweet URLs", () => {
        expect(toFixupxTweetUrl("https://x.com/jack")).toBeNull();
    });
});

describe("tweetUrlFromPage", () => {
    it("builds fixupx URL from tweet page path", () => {
        const location = {
            pathname: "/jack/status/789"
        } as Location;

        expect(tweetUrlFromPage(location)).toBe("https://fixupx.com/jack/status/789");
    });
});

describe("extractTweetUrlFromElement", () => {
    it("extracts fixupx URL from tweet anchor", () => {
        document.body.innerHTML = `
            <article data-testid="tweet">
                <a href="/jack/status/999">10h</a>
            </article>
        `;

        const tweet = document.querySelector("article")!;
        expect(extractTweetUrlFromElement(tweet)).toBe(
            "https://fixupx.com/jack/status/999"
        );
    });
});

describe("extractTweetUrlFromActionBar", () => {
    it("extracts fixupx URL from analytics link", () => {
        document.body.innerHTML = `
            <div role="group">
                <a href="/sunnywoofs_/status/2098185262895448215/analytics">2 mil</a>
            </div>
        `;

        const actionBar = document.querySelector('[role="group"]')!;
        expect(extractTweetUrlFromActionBar(actionBar)).toBe(
            "https://fixupx.com/sunnywoofs_/status/2098185262895448215"
        );
    });
});
