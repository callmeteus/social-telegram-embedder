import { describe, expect, it } from "vitest";
import {
    furaffinityPostUrlFromPage,
    normalizeFuraffinityPostUrl,
    parseFuraffinityPostUrl
} from "../src/platforms/furaffinity/url/FuraffinityUrl";

describe("normalizeFuraffinityPostUrl", () => {
    it("normalizes a canonical view URL and drops tracking parameters", () => {
        expect(normalizeFuraffinityPostUrl("https://www.furaffinity.net/view/12345/?foo=bar#comments"))
            .toBe("https://www.furaffinity.net/view/12345");
    });

    it("normalizes apex hosts, full URLs and relative URLs", () => {
        expect(normalizeFuraffinityPostUrl("https://furaffinity.net/view/42"))
            .toBe("https://www.furaffinity.net/view/42");
        expect(normalizeFuraffinityPostUrl("https://www.furaffinity.net/full/99/"))
            .toBe("https://www.furaffinity.net/view/99");
        expect(normalizeFuraffinityPostUrl("/view/7"))
            .toBe("https://www.furaffinity.net/view/7");
    });

    it("rejects non-submission URLs and foreign hosts", () => {
        expect(normalizeFuraffinityPostUrl("https://www.furaffinity.net/gallery/artist")).toBeNull();
        expect(normalizeFuraffinityPostUrl("https://www.furaffinity.net/view/not-a-number")).toBeNull();
        expect(normalizeFuraffinityPostUrl("https://example.com/view/1")).toBeNull();
        expect(normalizeFuraffinityPostUrl("not a url")).toBeNull();
    });
});

describe("parseFuraffinityPostUrl", () => {
    it("returns the submission id and canonical host", () => {
        expect(parseFuraffinityPostUrl("https://www.furaffinity.net/view/99/")).toEqual({
            id: "99",
            host: "furaffinity.net"
        });
    });
});

describe("furaffinityPostUrlFromPage", () => {
    it("uses the canonical link when the current URL is not a view", () => {
        document.head.innerHTML = '<link rel="canonical" href="https://www.furaffinity.net/view/777/">';

        const url = furaffinityPostUrlFromPage({
            href: "https://www.furaffinity.net/gallery/artist",
            hostname: "www.furaffinity.net"
        }, document);

        expect(url).toBe("https://www.furaffinity.net/view/777");
    });

    it("returns null when there is no submission to resolve", () => {
        document.head.innerHTML = "";

        expect(furaffinityPostUrlFromPage({
            href: "https://www.furaffinity.net/",
            hostname: "www.furaffinity.net"
        }, document)).toBeNull();
    });
});
