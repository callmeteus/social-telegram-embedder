import { describe, expect, it, vi } from "vitest";
import { showTimelineMediaPicker } from "../src/content/ui/TimelineMediaPicker";
import { extractXContentTimelinePhotoUrls } from "../src/platforms/x/content/TimelineMedia";
import { buildXContentArticleSnapshot } from "../src/platforms/x/content/XPostSnapshot";

describe("extractXContentTimelinePhotoUrls", () => {
    it("returns distinct tweet photos in DOM order", () => {
        document.body.innerHTML = `
            <article data-testid="tweet">
                <div data-testid="tweetPhoto">
                    <img src="https://pbs.twimg.com/media/photo-a.jpg?name=small" />
                </div>
                <div data-testid="tweetPhoto">
                    <img src="https://pbs.twimg.com/media/photo-b.jpg?name=small" />
                </div>
            </article>
        `;

        const article = document.querySelector("article")!;
        const urls = extractXContentTimelinePhotoUrls(article);

        expect(urls).toEqual([
            "https://pbs.twimg.com/media/photo-a.jpg?name=orig",
            "https://pbs.twimg.com/media/photo-b.jpg?name=orig"
        ]);
    });
});

describe("showTimelineMediaPicker", () => {
    it("sends all photos or a single selected photo", () => {
        const onAll = vi.fn();
        const onOne = vi.fn();

        showTimelineMediaPicker(
            [
                "https://pbs.twimg.com/media/photo-a.jpg",
                "https://pbs.twimg.com/media/photo-b.jpg"
            ],
            onAll,
            onOne
        );

        const allButton = document.querySelector(".x2tg-picker__item") as HTMLButtonElement;
        allButton.click();
        expect(onAll).toHaveBeenCalledTimes(1);
        expect(onOne).not.toHaveBeenCalled();

        showTimelineMediaPicker(
            [
                "https://pbs.twimg.com/media/photo-a.jpg",
                "https://pbs.twimg.com/media/photo-b.jpg"
            ],
            onAll,
            onOne
        );

        const thumbs = Array.from(document.querySelectorAll(".x2tg-picker__thumb")) as HTMLButtonElement[];
        thumbs[1].click();

        expect(onOne).toHaveBeenCalledTimes(1);
        expect(onOne).toHaveBeenCalledWith("https://pbs.twimg.com/media/photo-b.jpg");
    });
});

describe("buildXContentArticleSnapshot", () => {
    it("builds caption and selected media", () => {
        document.body.innerHTML = `
            <article data-testid="tweet">
                <div data-testid="User-Name"><a href="/flxJohannes">Johannes</a></div>
                <div data-testid="tweetText">Ledger update</div>
            </article>
        `;

        const article = document.querySelector("article")!;
        const snapshot = buildXContentArticleSnapshot(article, [
            "https://pbs.twimg.com/media/photo-a.jpg"
        ]);

        expect(snapshot).toEqual({
            text: "@<b>flxJohannes</b>\n\nLedger update",
            media: [{ kind: "photo", url: "https://pbs.twimg.com/media/photo-a.jpg" }]
        });
    });
});
