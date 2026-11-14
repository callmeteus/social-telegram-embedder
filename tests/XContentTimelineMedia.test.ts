import { describe, expect, it, vi } from "vitest";
import { showTimelineMediaPicker } from "../src/content/ui/TimelineMediaPicker";
import {
    extractXContentTimelinePhotoUrls,
    extractXContentTimelinePhotos,
    hasXContentVideoMedia,
    readXContentHiddenMediaCount
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

    it("ignores the poster frame X renders for a GIF or video", () => {
        document.body.innerHTML = `
            <article data-testid="tweet">
                <div data-testid="tweetPhoto">
                    <div data-testid="videoComponent">
                        <video poster="https://pbs.twimg.com/tweet_video_thumb/G7vo8z4XQAAC7Cr.jpg"></video>
                    </div>
                    <img src="https://pbs.twimg.com/tweet_video_thumb/G7vo8z4XQAAC7Cr.jpg" />
                </div>
            </article>
        `;

        expect(extractXContentTimelinePhotos(document.querySelector("article")!)).toEqual([]);
    });

    it("ignores a video poster image that is outside a video container", () => {
        document.body.innerHTML = `
            <article data-testid="tweet">
                <div data-testid="tweetPhoto">
                    <img src="https://pbs.twimg.com/amplify_video_thumb/12345/img/abc.jpg" />
                </div>
            </article>
        `;

        expect(extractXContentTimelinePhotos(document.querySelector("article")!)).toEqual([]);
    });

    it("keeps real photos when a video poster follows them", () => {
        document.body.innerHTML = `
            <article data-testid="tweet">
                <div data-testid="tweetPhoto">
                    <img src="https://pbs.twimg.com/media/photo-a.jpg?name=small" />
                </div>
                <div data-testid="tweetPhoto">
                    <img src="https://pbs.twimg.com/tweet_video_thumb/G7vo8z4XQAAC7Cr.jpg" />
                </div>
            </article>
        `;

        const photos = extractXContentTimelinePhotos(document.querySelector("article")!);

        expect(photos.map((photo) => photo.sendUrl)).toEqual([
            "https://pbs.twimg.com/media/photo-a.jpg?name=orig"
        ]);
    });
});

describe("readXContentHiddenMediaCount", () => {
    it("reads the +N badge X shows over a truncated media grid", () => {
        document.body.innerHTML = `
            <article data-testid="tweet">
                <div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/a?format=jpg&name=small" /></div>
                <div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/b?format=jpg&name=small" /></div>
                <div data-testid="tweetPhoto">
                    <img src="https://pbs.twimg.com/media/c?format=jpg&name=small" />
                    <div><div><span>+14</span></div></div>
                </div>
            </article>
        `;

        expect(readXContentHiddenMediaCount(document.querySelector("article")!)).toBe(14);
    });

    it("returns zero when the grid shows every attachment", () => {
        document.body.innerHTML = `
            <article data-testid="tweet">
                <div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/a?format=jpg&name=small" /></div>
                <div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/b?format=jpg&name=small" /></div>
            </article>
        `;

        expect(readXContentHiddenMediaCount(document.querySelector("article")!)).toBe(0);
    });

    it("ignores numeric text that is not a media overflow badge", () => {
        document.body.innerHTML = `
            <article data-testid="tweet">
                <div data-testid="tweetText">+14</div>
                <div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/a?format=jpg&name=small" /></div>
            </article>
        `;

        expect(readXContentHiddenMediaCount(document.querySelector("article")!)).toBe(0);
    });
});

describe("hasXContentVideoMedia", () => {
    it("detects a GIF or video through its video element", () => {
        document.body.innerHTML = `
            <article data-testid="tweet">
                <div data-testid="tweetPhoto">
                    <div data-testid="videoComponent"><video></video></div>
                </div>
            </article>
        `;

        expect(hasXContentVideoMedia(document.querySelector("article")!)).toBe(true);
    });

    it("detects a GIF from its poster even when several photos surround it", () => {
        document.body.innerHTML = `
            <article data-testid="tweet">
                <div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/a?format=jpg&name=small" /></div>
                <div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/tweet_video_thumb/abc.jpg" /></div>
            </article>
        `;

        expect(hasXContentVideoMedia(document.querySelector("article")!)).toBe(true);
    });

    it("returns false for a photo-only post", () => {
        document.body.innerHTML = `
            <article data-testid="tweet">
                <div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/a?format=jpg&name=small" /></div>
            </article>
        `;

        expect(hasXContentVideoMedia(document.querySelector("article")!)).toBe(false);
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
