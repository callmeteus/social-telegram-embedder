import { afterEach, describe, expect, it, vi } from "vitest";
import {
    fetchTikTokPost,
    isTikTokChallengePage,
    mapTikTokVideoDetail
} from "../src/platforms/tiktok/api/TikTokApi";

const sourceUrl = "https://www.tiktok.com/@chef/video/7123456789012345678";
const highBitrateUrl = "https://v16.tiktokcdn.com/video/high.mp4";

const universalData = {
    __DEFAULT_SCOPE__: {
        "webapp.video-detail": {
            itemInfo: {
                itemStruct: {
                    desc: "Cooking rice <b>perfectly</b> #food",
                    video: {
                        bitrateInfo: [
                            {
                                BitRate: 900,
                                PlayAddr: {
                                    Url: "https://v16.tiktokcdn.com/video/low.mp4"
                                }
                            },
                            {
                                BitRate: 2500,
                                PlayAddr: {
                                    Url: "https:\\/\\/v16.tiktokcdn.com\\/video\\/high.mp4"
                                }
                            }
                        ],
                        playAddr: "https://v16.tiktokcdn.com/video/fallback.mp4"
                    }
                }
            }
        }
    }
};

const embedHtml = `<html><body>
    <script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">
        ${JSON.stringify(universalData)}
    </script>
</body></html>`;

describe("mapTikTokVideoDetail", () => {
    it("maps the highest bitrate video and plain-text caption", () => {
        const post = mapTikTokVideoDetail(universalData, null, sourceUrl);

        expect(post?.embedUrl).toBe(sourceUrl);
        expect(post?.sourceUrl).toBe(sourceUrl);
        expect(post?.text).toBe("Cooking rice perfectly #food");
        expect(post?.media).toEqual([
            {
                kind: "video",
                url: highBitrateUrl
            }
        ]);
    });

    it("uses the oEmbed title when the payload has no description", () => {
        const withoutDescription = {
            __DEFAULT_SCOPE__: {
                "webapp.video-detail": {
                    itemInfo: {
                        itemStruct: {
                            video: {
                                playAddr: highBitrateUrl
                            }
                        }
                    }
                }
            }
        };

        const post = mapTikTokVideoDetail(withoutDescription, null, sourceUrl, {
            title: "Short clip by @chef"
        });

        expect(post?.text).toBe("Short clip by @chef");
    });

    it("reads legacy SIGI_STATE item modules", () => {
        const legacy = {
            ItemModule: {
                "12345": {
                    desc: "Legacy clip",
                    video: {
                        downloadAddr: "https://v16.tiktokcdn.com/video/legacy.mp4"
                    }
                }
            }
        };

        const post = mapTikTokVideoDetail(legacy, "12345", sourceUrl);

        expect(post?.text).toBe("Legacy clip");
        expect(post?.media[0].url).toBe("https://v16.tiktokcdn.com/video/legacy.mp4");
    });

    it("returns null when the payload has no direct video URL", () => {
        expect(mapTikTokVideoDetail({
            __DEFAULT_SCOPE__: {
                "webapp.video-detail": {
                    itemInfo: {
                        itemStruct: {
                            desc: "Login required",
                            video: {}
                        }
                    }
                }
            }
        }, null, sourceUrl)).toBeNull();
        expect(mapTikTokVideoDetail({}, null, sourceUrl)).toBeNull();
    });
});

describe("isTikTokChallengePage", () => {
    it("detects anti-bot and login challenge markers", () => {
        expect(isTikTokChallengePage("<html>Please complete the captcha</html>")).toBe(true);
        expect(isTikTokChallengePage("<html>Redirecting to verify.tiktok.com</html>")).toBe(true);
    });

    it("accepts a normal embed page", () => {
        expect(isTikTokChallengePage(embedHtml)).toBe(false);
    });
});

describe("fetchTikTokPost", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("resolves the video through oEmbed and the embeddable player", async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ title: "Cooking rice #food" })
            })
            .mockResolvedValueOnce({
                ok: true,
                text: async () => embedHtml
            });
        vi.stubGlobal("fetch", fetchMock);

        const post = await fetchTikTokPost(sourceUrl);

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[0][0]).toContain("https://www.tiktok.com/oembed?url=");
        expect(fetchMock.mock.calls[1][0]).toBe("https://www.tiktok.com/embed/v3/7123456789012345678");
        expect(post?.media[0].url).toBe(highBitrateUrl);
    });

    it("follows a short link before resolving the video", async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                url: sourceUrl,
                ok: true
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ title: "Short clip" })
            })
            .mockResolvedValueOnce({
                ok: true,
                text: async () => embedHtml
            });
        vi.stubGlobal("fetch", fetchMock);

        const post = await fetchTikTokPost("https://vm.tiktok.com/ZSabc123");

        expect(post?.sourceUrl).toBe(sourceUrl);
        expect(post?.media[0].url).toBe(highBitrateUrl);
    });

    it("returns null on an anti-bot challenge so the caller sends a link only", async () => {
        vi.stubGlobal("fetch", vi.fn()
            .mockResolvedValueOnce({ ok: false })
            .mockResolvedValueOnce({
                ok: true,
                text: async () => "<html>Please complete the captcha</html>"
            }));

        expect(await fetchTikTokPost(sourceUrl)).toBeNull();
    });

    it("returns null for an invalid post URL without fetching", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        expect(await fetchTikTokPost("https://example.com/@chef/video/1")).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
