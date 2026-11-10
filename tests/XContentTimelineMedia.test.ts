import { describe, expect, it, vi } from "vitest";
import { showTimelineMediaPicker } from "../src/content/ui/TimelineMediaPicker";
import {
    extractXContentTimelinePhotoUrls,
    extractXContentTimelinePhotos
} from "../src/platforms/x/content/TimelineMedia";
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

describe("extractXContentTimelinePhotos", () => {
    it("keeps the URL the tweet already loaded and upgrades only the send URL", () => {
        document.body.innerHTML = `
            <article data-testid="tweet">
                <div data-testid="tweetPhoto">
                    <img src="https://pbs.twimg.com/media/photo-a.jpg?name=small" />
                </div>
            </article>
        `;

        const photos = extractXContentTimelinePhotos(document.querySelector("article")!);

        expect(photos).toEqual([{
            previewUrl: "https://pbs.twimg.com/media/photo-a.jpg?name=small",
            sendUrl: "https://pbs.twimg.com/media/photo-a.jpg?name=orig"
        }]);
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

    it("shows the tweet preview eagerly and sends the high-resolution URL", () => {
        const onOne = vi.fn();

        showTimelineMediaPicker(
            [
                { previewUrl: "https://pbs.twimg.com/media/photo-a.jpg?name=small", sendUrl: "https://pbs.twimg.com/media/photo-a.jpg?name=orig" },
                { previewUrl: "https://pbs.twimg.com/media/photo-b.jpg?name=small", sendUrl: "https://pbs.twimg.com/media/photo-b.jpg?name=orig" }
            ],
            vi.fn(),
            onOne
        );

        const images = Array.from(document.querySelectorAll<HTMLImageElement>(".x2tg-picker__thumb img"));

        expect(images.map((image) => image.src)).toEqual([
            "https://pbs.twimg.com/media/photo-a.jpg?name=small",
            "https://pbs.twimg.com/media/photo-b.jpg?name=small"
        ]);
        expect(images.every((image) => image.loading === "eager")).toBe(true);

        (document.querySelectorAll(".x2tg-picker__thumb")[1] as HTMLButtonElement).click();

        expect(onOne).toHaveBeenCalledWith("https://pbs.twimg.com/media/photo-b.jpg?name=orig");
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
