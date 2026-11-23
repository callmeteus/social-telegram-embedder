import { describe, expect, it } from "vitest";
import {
    instagramPostUrlFromPage,
    normalizeInstagramPostUrl,
    parseInstagramPostUrl
} from "../src/platforms/instagram/url/InstagramUrl";

describe("normalizeInstagramPostUrl", () => {
    it("normalizes post, reel and legacy TV URLs", () => {
        expect(normalizeInstagramPostUrl("https://www.instagram.com/p/ABC123def45/"))
            .toBe("https://www.instagram.com/p/ABC123def45/");
        expect(normalizeInstagramPostUrl("https://www.instagram.com/reel/XYZ987abc12/"))
            .toBe("https://www.instagram.com/reel/XYZ987abc12/");
        expect(normalizeInstagramPostUrl("https://www.instagram.com/tv/LEGACY12345/"))
            .toBe("https://www.instagram.com/reel/LEGACY12345/");
    });

    it("collapses the reels alias and drops tracking parameters", () => {
        expect(normalizeInstagramPostUrl("https://www.instagram.com/reels/ABC123def45/?igshid=xyz&utm_source=ig_web#comments"))
            .toBe("https://www.instagram.com/reel/ABC123def45/");
    });

    it("canonicalizes the host and accepts relative URLs", () => {
        expect(normalizeInstagramPostUrl("https://instagram.com/p/ABC123def45/?img_index=2"))
            .toBe("https://www.instagram.com/p/ABC123def45/");
        expect(normalizeInstagramPostUrl("/p/ABC123def45/"))
            .toBe("https://www.instagram.com/p/ABC123def45/");
    });

    it("rejects feeds, stories, profiles and foreign hosts", () => {
        expect(normalizeInstagramPostUrl("https://www.instagram.com/")).toBeNull();
        expect(normalizeInstagramPostUrl("https://www.instagram.com/stories/user/123/")).toBeNull();
        expect(normalizeInstagramPostUrl("https://www.instagram.com/someuser/")).toBeNull();
        expect(normalizeInstagramPostUrl("https://example.com/p/ABC123def45/")).toBeNull();
        expect(normalizeInstagramPostUrl("not a url")).toBeNull();
    });
});

describe("parseInstagramPostUrl", () => {
    it("returns the shortcode and the supported post type", () => {
        expect(parseInstagramPostUrl("https://www.instagram.com/p/ABC123def45/"))
            .toEqual({
                shortcode: "ABC123def45",
                kind: "post"
            });
        expect(parseInstagramPostUrl("https://www.instagram.com/reel/XYZ987abc12/")?.kind)
            .toBe("reel");
    });
});

describe("instagramPostUrlFromPage", () => {
    it("resolves the URL of the current page", () => {
        expect(instagramPostUrlFromPage({
            href: "https://www.instagram.com/reels/ABC123def45/?igshid=1"
        })).toBe("https://www.instagram.com/reel/ABC123def45/");
    });

    it("returns null outside a post or reel view", () => {
        expect(instagramPostUrlFromPage({
            href: "https://www.instagram.com/explore/"
        })).toBeNull();
    });
});
