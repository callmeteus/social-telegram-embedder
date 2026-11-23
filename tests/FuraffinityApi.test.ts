import { afterEach, describe, expect, it, vi } from "vitest";
import {
    fetchFuraffinityPost,
    mapFuraffinitySubmission,
    selectFuraffinityMedia
} from "../src/platforms/furaffinity/api/FuraffinityApi";

const sourceUrl = "https://www.furaffinity.net/view/12345";

const submissionHtml = `
    <html>
        <head>
            <title>Cool Art by Artist on Fur Affinity [dot] net</title>
            <meta property="og:title" content="Cool Art by Artist on Fur Affinity [dot] net">
            <meta property="og:description" content="Hello &lt;b&gt;world&lt;/b&gt;.">
            <meta property="og:image" content="//d.facdn.net/art/artist/12345/cool.jpg">
        </head>
        <body></body>
    </html>
`;

describe("mapFuraffinitySubmission", () => {
    it("maps the Open Graph image and builds the caption", () => {
        const post = mapFuraffinitySubmission(submissionHtml, sourceUrl);

        expect(post?.embedUrl).toBe(sourceUrl);
        expect(post?.sourceUrl).toBe(sourceUrl);
        expect(post?.text).toBe("<b>Artist</b>\n\nCool Art\n\nHello world.");
        expect(post?.media).toEqual([
            {
                kind: "photo",
                url: "https://d.facdn.net/art/artist/12345/cool.jpg"
            }
        ]);
    });

    it("maps gif and video media to their Telegram kinds", () => {
        const gif = mapFuraffinitySubmission(`
            <meta property="og:image" content="https://d.facdn.net/art/artist/loop.gif">
        `, sourceUrl);
        const video = mapFuraffinitySubmission(`
            <meta property="og:image" content="https://d.facdn.net/art/artist/poster.jpg">
            <video src="https://d.facdn.net/art/artist/clip.mp4"></video>
        `, sourceUrl);

        expect(gif?.media[0].kind).toBe("gif");
        expect(video?.media[0]).toEqual({
            kind: "video",
            url: "https://d.facdn.net/art/artist/clip.mp4"
        });
    });

    it("returns null when no media URL can be resolved", () => {
        expect(mapFuraffinitySubmission('<meta property="og:title" content="No image">', sourceUrl)).toBeNull();
        expect(selectFuraffinityMedia("")).toEqual([]);
    });
});

describe("fetchFuraffinityPost", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("resolves the submission through its public view page", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            text: async () => submissionHtml
        });
        vi.stubGlobal("fetch", fetchMock);

        const post = await fetchFuraffinityPost(sourceUrl);

        expect(fetchMock).toHaveBeenCalledWith(sourceUrl, expect.objectContaining({ credentials: "omit" }));
        expect(post?.media[0].url).toBe("https://d.facdn.net/art/artist/12345/cool.jpg");
    });

    it("returns null on an unsuccessful response", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

        expect(await fetchFuraffinityPost(sourceUrl)).toBeNull();
    });

    it("returns null for an invalid URL without fetching", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        expect(await fetchFuraffinityPost("https://example.com/view/1")).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
