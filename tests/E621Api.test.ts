import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchE621Post, mapE621Post } from "../src/platforms/e621/api/E621Api";

const sourceUrl = "https://e621.net/posts/3000000";

const photoPost = {
    id: 3000000,
    description: "We do a <b>little</b> trolling.",
    tags: ["solo"],
    files: {
        meta: {
            ext: "png",
            size: 98689
        },
        original: {
            url: "https://static1.e621.net/data/10/75/art.png"
        },
        sample: {
            jpg: "https://static1.e621.net/data/sample/10/75/art.jpg"
        }
    }
};

describe("mapE621Post", () => {
    it("maps the original image and plain-text caption", () => {
        const post = mapE621Post(photoPost, sourceUrl);

        expect(post?.embedUrl).toBe(sourceUrl);
        expect(post?.sourceUrl).toBe(sourceUrl);
        expect(post?.text).toBe("We do a little trolling.");
        expect(post?.media).toEqual([
            {
                kind: "photo",
                url: "https://static1.e621.net/data/10/75/art.png"
            }
        ]);
    });

    it("maps videos and gifs to their Telegram kinds", () => {
        const video = mapE621Post({
            files: {
                meta: {
                    ext: "webm"
                },
                original: {
                    url: "https://static1.e621.net/data/clip.webm"
                }
            }
        }, sourceUrl);
        const gif = mapE621Post({
            files: {
                meta: {
                    ext: "gif"
                },
                original: {
                    url: "https://static1.e621.net/data/loop.gif"
                }
            }
        }, sourceUrl);

        expect(video?.media[0].kind).toBe("video");
        expect(gif?.media[0].kind).toBe("gif");
    });

    it("uses the sample when the original exceeds the photo upload limit", () => {
        const post = mapE621Post({
            files: {
                meta: {
                    ext: "png",
                    size: 12 * 1024 * 1024
                },
                original: {
                    url: "https://static1.e621.net/data/huge.png"
                },
                sample: {
                    jpg: "https://static1.e621.net/data/sample/huge.jpg"
                }
            }
        }, sourceUrl);

        expect(post?.media[0].url).toBe("https://static1.e621.net/data/sample/huge.jpg");
    });

    it("returns null when no media URL can be resolved", () => {
        expect(mapE621Post({ id: 1, files: { meta: { ext: "png" } } }, sourceUrl)).toBeNull();
        expect(mapE621Post({}, sourceUrl)).toBeNull();
    });
});

describe("fetchE621Post", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("resolves the post through the JSON endpoint", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => photoPost
        });
        vi.stubGlobal("fetch", fetchMock);

        const post = await fetchE621Post(sourceUrl);

        expect(fetchMock).toHaveBeenCalledWith(
            "https://e621.net/posts/3000000.json",
            expect.objectContaining({ credentials: "omit" })
        );
        expect(post?.media[0].url).toBe("https://static1.e621.net/data/10/75/art.png");
    });

    it("returns null on an unsuccessful response", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

        expect(await fetchE621Post(sourceUrl)).toBeNull();
    });

    it("returns null for an invalid post URL without fetching", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        expect(await fetchE621Post("https://example.com/posts/1")).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
