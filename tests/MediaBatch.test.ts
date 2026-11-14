import { describe, expect, it } from "vitest";
import { groupSocialMediaForTelegram } from "../src/core/telegram/MediaBatch";
import type { SocialMediaItem } from "../src/platforms/types";

const photo = (index: number): SocialMediaItem => ({
    kind: "photo",
    url: `https://pbs.twimg.com/media/photo-${index}.jpg?name=orig`
});

const gif: SocialMediaItem = {
    kind: "gif",
    url: "https://video.twimg.com/tweet_video/abc.mp4"
};

describe("groupSocialMediaForTelegram", () => {
    it("keeps photos in albums of ten", () => {
        const groups = groupSocialMediaForTelegram(Array.from({ length: 20 }, (_, index) => photo(index)));

        expect(groups.map((group) => group.length)).toEqual([10, 10]);
    });

    it("sends a GIF alone so it is not downgraded to a video inside an album", () => {
        const media = [photo(0), photo(1), gif, photo(2)];

        const groups = groupSocialMediaForTelegram(media);

        expect(groups.map((group) => group.map((item) => item.kind))).toEqual([
            ["photo", "photo"],
            ["gif"],
            ["photo"]
        ]);
    });

    it("fills albums up to ten across a GIF", () => {
        const media = [...Array.from({ length: 9 }, (_, index) => photo(index)), gif, ...Array.from({ length: 5 }, (_, index) => photo(index + 9))];

        const groups = groupSocialMediaForTelegram(media);

        expect(groups.map((group) => group.length)).toEqual([9, 1, 5]);
        expect(groups[1][0].kind).toBe("gif");
    });

    it("keeps every media item exactly once, in order", () => {
        const media = [...Array.from({ length: 4 }, (_, index) => photo(index)), gif, ...Array.from({ length: 15 }, (_, index) => photo(index + 4))];

        const flat = groupSocialMediaForTelegram(media).flat();

        expect(flat).toEqual(media);
    });

    it("returns no groups for an empty post", () => {
        expect(groupSocialMediaForTelegram([])).toEqual([]);
    });
});
