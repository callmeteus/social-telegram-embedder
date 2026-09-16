import { afterEach, describe, expect, it, vi } from "vitest";
import {
    buildTweetCaption,
    buildTweetPostText,
    chunkTweetMedia,
    extractTweetMediaItems,
    fetchTweetByFixupxUrl,
    parseFixupxTweetUrl,
    pickTelegramSafeVideoUrl
} from "../src/platforms/x/api/FixupxApi";

describe("parseFixupxTweetUrl", () => {
    it("parses fixupx tweet URLs", () => {
        expect(parseFixupxTweetUrl("https://fixupx.com/jack/status/1234567890")).toEqual({
            username: "jack",
            statusId: "1234567890"
        });
    });
});

describe("extractTweetMediaItems", () => {
    it("uses media.all order when available", () => {
        const media = extractTweetMediaItems({
            all: [
                { type: "photo", url: "https://pbs.twimg.com/photo1.jpg" },
                { type: "photo", url: "https://pbs.twimg.com/photo2.jpg" },
                { type: "gif", url: "https://video.twimg.com/gif.mp4" }
            ]
        });

        expect(media).toEqual([
            { kind: "photo", url: "https://pbs.twimg.com/photo1.jpg" },
            { kind: "photo", url: "https://pbs.twimg.com/photo2.jpg" },
            { kind: "gif", url: "https://video.twimg.com/gif.mp4" }
        ]);
    });

    it("falls back to photos and videos arrays", () => {
        const media = extractTweetMediaItems({
            photos: [{ url: "https://pbs.twimg.com/photo.jpg" }],
            videos: [{ url: "https://video.twimg.com/video.mp4", type: "video" }]
        });

        expect(media).toEqual([
            { kind: "photo", url: "https://pbs.twimg.com/photo.jpg" },
            { kind: "video", url: "https://video.twimg.com/video.mp4" }
        ]);
    });

    it("picks a lower bitrate video variant for long Telegram uploads", () => {
        const media = extractTweetMediaItems({
            all: [{
                type: "video",
                url: "https://video.twimg.com/amplify_video/1/vid/avc1/1920x1080/top.mp4",
                duration: 249.6,
                formats: [
                    { url: "https://video.twimg.com/amplify_video/1/vid/avc1/480x270/low.mp4", bitrate: 256000, container: "mp4" },
                    { url: "https://video.twimg.com/amplify_video/1/vid/avc1/640x360/mid.mp4", bitrate: 832000, container: "mp4" },
                    { url: "https://video.twimg.com/amplify_video/1/vid/avc1/1280x720/high.mp4", bitrate: 2176000, container: "mp4" },
                    { url: "https://video.twimg.com/amplify_video/1/vid/avc1/1920x1080/top.mp4", bitrate: 10368000, container: "mp4" }
                ]
            }]
        });

        expect(media).toEqual([
            { kind: "video", url: "https://video.twimg.com/amplify_video/1/vid/avc1/1280x720/high.mp4" }
        ]);
    });
});

describe("pickTelegramSafeVideoUrl", () => {
    it("falls back to the lowest mp4 when every estimate exceeds the bot limit", () => {
        expect(pickTelegramSafeVideoUrl({
            url: "https://video.twimg.com/top.mp4",
            duration: 0,
            formats: [
                { url: "https://video.twimg.com/top.mp4", bitrate: 10368000, container: "mp4" },
                { url: "https://video.twimg.com/low.mp4", bitrate: 256000, container: "mp4" }
            ]
        })).toBe("https://video.twimg.com/low.mp4");
    });
});

describe("buildTweetCaption", () => {
    it("includes tweet text and fixupx link", () => {
        expect(buildTweetCaption("https://fixupx.com/jack/status/1", "Olá mundo"))
            .toBe("Olá mundo\n\nhttps://fixupx.com/jack/status/1");
    });

    it("returns only link when tweet has no text", () => {
        expect(buildTweetCaption("https://fixupx.com/jack/status/1", "   "))
            .toBe("https://fixupx.com/jack/status/1");
    });
});

describe("buildTweetPostText", () => {
    it("includes author name for regular tweets", () => {
        expect(buildTweetPostText({
            text: "Art:lichee",
            author: {
                name: "Lily Van Hauntt",
                screen_name: "lilyvanhauntt"
            }
        })).toBe([
            "@<b>lilyvanhauntt</b>",
            "Art:lichee"
        ].join("\n\n"));
    });

    it("uses original author and reposter for retweets", () => {
        expect(buildTweetPostText({
            text: "RT @lilyvanhauntt: Art:lichee",
            author: {
                name: "Arioch Iankoski",
                screen_name: "ariooch"
            },
            retweet: {
                text: "Art:lichee",
                author: {
                    name: "Lily Van Hauntt",
                    screen_name: "lilyvanhauntt"
                }
            }
        })).toBe([
            "@<b>ariooch</b> 🔁 @<b>lilyvanhauntt</b>",
            "Art:lichee"
        ].join("\n\n"));
    });

    it("parses legacy RT prefix when retweet object is missing", () => {
        expect(buildTweetPostText({
            text: "RT @lilyvanhauntt: Art:lichee",
            author: {
                name: "Arioch Iankoski",
                screen_name: "ariooch"
            }
        })).toBe([
            "@<b>ariooch</b> 🔁 @<b>lilyvanhauntt</b>",
            "Art:lichee"
        ].join("\n\n"));
    });
});

describe("chunkTweetMedia", () => {
    it("splits media into batches of ten", () => {
        const media = Array.from({ length: 11 }, (_, index) => ({
            kind: "photo" as const,
            url: `https://pbs.twimg.com/${index}.jpg`
        }));

        expect(chunkTweetMedia(media)).toHaveLength(2);
        expect(chunkTweetMedia(media)[0]).toHaveLength(10);
        expect(chunkTweetMedia(media)[1]).toHaveLength(1);
    });
});

describe("fetchTweetByFixupxUrl", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it("retries transient FxTwitter API failures before succeeding", async () => {
        vi.useFakeTimers();

        const fetchMock = vi.fn()
            .mockRejectedValueOnce(new Error("network"))
            .mockResolvedValueOnce({
                ok: false,
                status: 503,
                json: async () => ({})
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    code: 200,
                    message: "OK",
                    tweet: {
                        url: "https://x.com/jack/status/1234567890",
                        text: "Hello",
                        author: { screen_name: "jack" },
                        media: {
                            photos: [{ url: "https://pbs.twimg.com/photo.jpg" }]
                        }
                    }
                })
            });

        vi.stubGlobal("fetch", fetchMock);

        const resultPromise = fetchTweetByFixupxUrl("https://fixupx.com/jack/status/1234567890");

        await vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(result).toEqual({
            fixupxUrl: "https://fixupx.com/jack/status/1234567890",
            originalUrl: "https://x.com/jack/status/1234567890",
            text: "@<b>jack</b>\n\nHello",
            media: [{ kind: "photo", url: "https://pbs.twimg.com/photo.jpg" }]
        });
    });

    it("returns null after exhausting all retry attempts", async () => {
        vi.useFakeTimers();

        const fetchMock = vi.fn().mockRejectedValue(new Error("network"));
        vi.stubGlobal("fetch", fetchMock);

        const resultPromise = fetchTweetByFixupxUrl("https://fixupx.com/jack/status/1234567890");

        await vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(fetchMock).toHaveBeenCalledTimes(4);
        expect(result).toBeNull();
    });
});
