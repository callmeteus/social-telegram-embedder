import { describe, expect, it } from "vitest";
import {
    e621PostUrlFromPage,
    normalizeE621PostUrl,
    parseE621PostUrl
} from "../src/platforms/e621/url/E621Url";

describe("normalizeE621PostUrl", () => {
    it("normalizes a canonical post URL and drops tracking parameters", () => {
        expect(normalizeE621PostUrl("https://e621.net/posts/12345?foo=bar#comments"))
            .toBe("https://e621.net/posts/12345");
    });

    it("normalizes legacy and safe-for-work mirror URLs", () => {
        expect(normalizeE621PostUrl("https://e621.net/post/show/12345"))
            .toBe("https://e621.net/posts/12345");
        expect(normalizeE621PostUrl("https://e926.net/posts/42"))
            .toBe("https://e926.net/posts/42");
    });

    it("rejects non-post URLs and foreign hosts", () => {
        expect(normalizeE621PostUrl("https://e621.net/posts")).toBeNull();
        expect(normalizeE621PostUrl("https://example.com/posts/1")).toBeNull();
        expect(normalizeE621PostUrl("not a url")).toBeNull();
    });
});

describe("parseE621PostUrl", () => {
    it("returns the post id and host", () => {
        expect(parseE621PostUrl("https://e621.net/posts/99/")).toEqual({
            id: "99",
            host: "e621.net"
        });
    });
});

describe("e621PostUrlFromPage", () => {
    it("uses the post id metadata when the page URL is not a post view", () => {
        document.head.innerHTML = '<meta name="post-id" content="777">';

        const url = e621PostUrlFromPage({
            href: "https://e926.net/posts?tags=solo",
            hostname: "e926.net"
        }, document);

        expect(url).toBe("https://e926.net/posts/777");
    });

    it("returns null when there is no post to resolve", () => {
        document.head.innerHTML = "";

        expect(e621PostUrlFromPage({
            href: "https://e621.net/",
            hostname: "e621.net"
        }, document)).toBeNull();
    });
});
