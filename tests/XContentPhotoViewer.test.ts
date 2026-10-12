import { describe, expect, it } from "vitest";
import {
    buildXContentPhotoViewerSnapshot,
    isXContentPhotoViewerContext
} from "../src/platforms/x/content/PhotoViewer";

function mockVisibleImage(image: HTMLImageElement, width: number, height: number): void {
    Object.defineProperty(image, "clientWidth", {
        configurable: true,
        value: width
    });
    Object.defineProperty(image, "clientHeight", {
        configurable: true,
        value: height
    });
    image.getBoundingClientRect = () => ({
        width,
        height,
        top: 0,
        left: 0,
        right: width,
        bottom: height,
        x: 0,
        y: 0,
        toJSON: () => ({})
    });
}

describe("isXContentPhotoViewerContext", () => {
    it("detects dedicated photo routes", () => {
        const location = {
            pathname: "/flxJohannes/status/2109634513957527974/photo/1"
        } as Location;

        expect(isXContentPhotoViewerContext(location)).toBe(true);
    });
});

describe("buildXContentPhotoViewerSnapshot", () => {
    it("captures only the largest visible tweet photo and caption", () => {
        document.body.innerHTML = `
            <div aria-modal="true">
                <article data-testid="tweet">
                    <div data-testid="User-Name">
                        <a href="/flxJohannes">Johannes</a>
                    </div>
                    <div data-testid="tweetText">Ledger supply chain</div>
                </article>
                <img src="https://pbs.twimg.com/media/thumb-small.jpg" alt="" />
                <img src="https://pbs.twimg.com/media/ledger-large.jpg?name=large" alt="" />
            </div>
        `;

        const images = Array.from(document.querySelectorAll("img")) as HTMLImageElement[];
        mockVisibleImage(images[0], 80, 80);
        mockVisibleImage(images[1], 900, 600);

        const location = {
            pathname: "/flxJohannes/status/2109634513957527974/photo/1"
        } as Location;

        const snapshot = buildXContentPhotoViewerSnapshot(location, document);

        expect(snapshot).toEqual({
            text: "@<b>flxJohannes</b>\n\nLedger supply chain",
            media: [{
                kind: "photo",
                url: "https://pbs.twimg.com/media/ledger-large.jpg?name=orig"
            }]
        });
    });
});
