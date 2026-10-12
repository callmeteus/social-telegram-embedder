import { describe, expect, it } from "vitest";
import { narrowMediaForPhotoViewer } from "../src/platforms/facebook/content/PhotoViewerMedia";

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

describe("narrowMediaForPhotoViewer", () => {
    it("keeps only the focused photo when a Facebook photo dialog is open", () => {
        document.body.innerHTML = `
            <div role="dialog">
                <img data-visualcompletion="media-vc-image" src="https://cdn.example/thumb.jpg" />
                <img data-visualcompletion="media-vc-image" src="https://cdn.example/focus.jpg" />
            </div>
        `;

        const images = Array.from(document.querySelectorAll("img")) as HTMLImageElement[];
        mockVisibleImage(images[0], 120, 120);
        mockVisibleImage(images[1], 960, 720);

        const dialog = document.querySelector('[role="dialog"]')!;
        const location = {
            pathname: "/photo/",
            search: ""
        } as Location;

        const narrowed = narrowMediaForPhotoViewer(dialog, location, [
            { kind: "photo", url: "https://cdn.example/thumb.jpg" },
            { kind: "photo", url: "https://cdn.example/focus.jpg" },
            { kind: "photo", url: "https://cdn.example/other.jpg" }
        ]);

        expect(narrowed).toEqual([
            { kind: "photo", url: "https://cdn.example/focus.jpg" }
        ]);
    });
});
