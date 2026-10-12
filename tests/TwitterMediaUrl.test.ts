import { describe, expect, it } from "vitest";
import {
    isTwitterTimelinePhotoUrl,
    preferTwitterLargeMediaUrl
} from "../src/core/media/TwitterMediaUrl";

describe("preferTwitterLargeMediaUrl", () => {
    it("upgrades timeline thumbnail name sizes to canonical orig URLs", () => {
        expect(
            preferTwitterLargeMediaUrl(
                "https://pbs.twimg.com/media/HURjTRVbIAEtr_h?format=jpg&name=360x360"
            )
        ).toBe("https://pbs.twimg.com/media/HURjTRVbIAEtr_h.jpg?name=orig");

        expect(
            preferTwitterLargeMediaUrl("https://pbs.twimg.com/media/photo-a.jpg?name=small")
        ).toBe("https://pbs.twimg.com/media/photo-a.jpg?name=orig");
    });

    it("keeps canonical FxTwitter API photo URLs stable", () => {
        expect(
            preferTwitterLargeMediaUrl("https://pbs.twimg.com/media/ledger-large.jpg?name=large")
        ).toBe("https://pbs.twimg.com/media/ledger-large.jpg?name=orig");
    });

    it("leaves non-Twitter URLs unchanged", () => {
        const external = "https://example.com/photo.jpg";

        expect(preferTwitterLargeMediaUrl(external)).toBe(external);
        expect(isTwitterTimelinePhotoUrl(external)).toBe(false);
    });
});
