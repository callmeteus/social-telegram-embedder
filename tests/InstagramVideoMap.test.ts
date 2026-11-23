import { afterEach, describe, expect, it } from "vitest";
import {
    getMp4ForBlob,
    startInstagramVideoMapListener
} from "../src/content/media/InstagramVideoMap";

/** Message namespace used by the MAIN-world injector. */
const NAMESPACE = "__x2tg_video_map__";

afterEach(() => {
    window.removeEventListener("message", () => undefined);
});

describe("InstagramVideoMap", () => {
    it("maps a blob URL to its CDN mp4 URL from a page message", () => {
        startInstagramVideoMapListener();

        const blobUrl = "blob:https://www.instagram.com/abc-123";
        const mp4Url = "https://scontent.cdninstagram.com/video.mp4";

        window.dispatchEvent(new MessageEvent("message", {
            source: window,
            data: {
                [NAMESPACE]: true,
                blobUrl,
                mp4Url
            }
        }));

        expect(getMp4ForBlob(blobUrl)).toBe(mp4Url);
    });

    it("ignores messages from other frames and other namespaces", () => {
        startInstagramVideoMapListener();

        window.dispatchEvent(new MessageEvent("message", {
            source: null,
            data: {
                [NAMESPACE]: true,
                blobUrl: "blob:other-frame",
                mp4Url: "https://scontent.cdninstagram.com/other.mp4"
            }
        }));
        window.dispatchEvent(new MessageEvent("message", {
            source: window,
            data: {
                blobUrl: "blob:other-namespace",
                mp4Url: "https://scontent.cdninstagram.com/other.mp4"
            }
        }));

        expect(getMp4ForBlob("blob:other-frame")).toBeUndefined();
        expect(getMp4ForBlob("blob:other-namespace")).toBeUndefined();
    });
});
