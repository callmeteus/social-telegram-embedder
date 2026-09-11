import { describe, expect, it } from "vitest";
import {
    buildTweetCaption,
    chunkTweetMedia,
    extractTweetMediaItems,
    parseFixupxTweetUrl
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
