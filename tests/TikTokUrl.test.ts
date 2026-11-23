import { describe, expect, it } from "vitest";
import {
    normalizeTikTokPostUrl,
    parseTikTokPostUrl,
    tikTokPostUrlFromPage
} from "../src/platforms/tiktok/url/TikTokUrl";

describe("normalizeTikTokPostUrl", () => {
    it("normalizes a canonical video URL and drops tracking parameters", () => {
        expect(normalizeTikTokPostUrl("https://www.tiktok.com/@chef/video/7123456789012345678?_r=1&utm_source=share#other"))
            .toBe("https://www.tiktok.com/@chef/video/7123456789012345678");
    });

    it("promotes a bare host to www", () => {
        expect(normalizeTikTokPostUrl("https://tiktok.com/@chef/video/42/"))
            .toBe("https://www.tiktok.com/@chef/video/42");
    });

    it("keeps short links for later redirect resolution", () => {
        expect(normalizeTikTokPostUrl("https://vm.tiktok.com/ZSabc123/?utm_source=share"))
            .toBe("https://vm.tiktok.com/ZSabc123");
        expect(normalizeTikTokPostUrl("https://vt.tiktok.com/ZSxyz789"))
            .toBe("https://vt.tiktok.com/ZSxyz789");
        expect(normalizeTikTokPostUrl("https://www.tiktok.com/t/ZSabc123/"))
            .toBe("https://www.tiktok.com/t/ZSabc123");
    });

    it("recognizes embed, legacy and player video paths", () => {
        expect(normalizeTikTokPostUrl("https://www.tiktok.com/embed/v3/12345"))
            .toBe("https://www.tiktok.com/embed/v3/12345");
        expect(normalizeTikTokPostUrl("https://m.tiktok.com/v/12345.html"))
            .toBe("https://www.tiktok.com/v/12345.html");
    });

    it("rejects non-video URLs, foreign hosts and malformed input", () => {
        expect(normalizeTikTokPostUrl("https://www.tiktok.com/@chef")).toBeNull();
        expect(normalizeTikTokPostUrl("https://www.tiktok.com/@chef/video/not-a-number")).toBeNull();
        expect(normalizeTikTokPostUrl("https://vm.tiktok.com/")).toBeNull();
        expect(normalizeTikTokPostUrl("https://example.com/@chef/video/1")).toBeNull();
        expect(normalizeTikTokPostUrl("not a url")).toBeNull();
    });
});

describe("parseTikTokPostUrl", () => {
    it("returns the video id for a canonical URL", () => {
        expect(parseTikTokPostUrl("https://www.tiktok.com/@chef/video/99/")?.videoId).toBe("99");
    });

    it("returns a short code instead of a video id for short links", () => {
        const identity = parseTikTokPostUrl("https://vm.tiktok.com/ZSabc123");

        expect(identity?.videoId).toBeNull();
        expect(identity?.shortCode).toBe("ZSabc123");
    });
});

describe("tikTokPostUrlFromPage", () => {
    it("prefers the page URL when it is a video view", () => {
        document.head.innerHTML = "";

        expect(tikTokPostUrlFromPage({
            href: "https://www.tiktok.com/@chef/video/555?lang=en"
        }, document)).toBe("https://www.tiktok.com/@chef/video/555");
    });

    it("falls back to the Open Graph URL", () => {
        document.head.innerHTML = '<meta property="og:url" content="https://www.tiktok.com/@chef/video/777">';

        expect(tikTokPostUrlFromPage({
            href: "https://www.tiktok.com/login"
        }, document)).toBe("https://www.tiktok.com/@chef/video/777");
    });

    it("returns null when the page has no video to share", () => {
        document.head.innerHTML = "";

        expect(tikTokPostUrlFromPage({
            href: "https://www.tiktok.com/"
        }, document)).toBeNull();
    });
});
