import { describe, expect, it, vi } from "vitest";
import { resolveFacebookPostMedia } from "../src/platforms/facebook/content/VideoMediaResolve";

describe("resolveFacebookPostMedia blob reels", () => {
    it("reads an existing blob video without clicking or playing the player", async () => {
        const bytes = new Uint8Array(120_000);
        const blobUrl = "blob:https://www.facebook.com/test-video";

        vi.stubGlobal("fetch", vi.fn(async () => ({
            ok: true,
            async blob() {
                return {
                    size: bytes.length,
                    type: "video/mp4",
                    async arrayBuffer() {
                        return bytes.buffer;
                    }
                };
            }
        })));

        document.body.innerHTML = `
            <div class="reel-root" data-video-id="1615803920134742">
                <video src="${blobUrl}"></video>
            </div>
        `;

        const media = await resolveFacebookPostMedia(document.querySelector(".reel-root")!);

        expect(media).toHaveLength(1);
        expect(media[0]?.kind).toBe("video");
        expect(media[0]?.inlineBlob?.mimeType).toBe("video/mp4");
        expect(media[0]?.inlineBlob?.base64.length).toBeGreaterThan(1000);
    });

    it("prefers direct fbcdn URLs from performance entries over blob activation", async () => {
        const directUrl = "https://video.xx.fbcdn.net/v/reel.mp4?efg=abc";

        performance.clearResourceTimings();
        performance.getEntriesByType("resource");

        Object.defineProperty(performance, "getEntriesByType", {
            configurable: true,
            value: () => [{ name: directUrl }]
        });

        document.body.innerHTML = `
            <div class="reel-root" data-video-id="1615803920134742">
                <video poster="https://cdn.example/poster.jpg"></video>
            </div>
        `;

        const media = await resolveFacebookPostMedia(document.querySelector(".reel-root")!);

        expect(media).toEqual([
            {
                kind: "video",
                url: directUrl
            }
        ]);
    });

    it("keeps only the photo of a photo post with music, ignoring the hidden audio player", async () => {
        const fetchSpy = vi.fn();
        const photoUrl = "https://scontent.fbcdn.net/v/photo.jpg";

        vi.stubGlobal("fetch", fetchSpy);
        document.body.innerHTML = `
            <div class="post-root">
                <img data-imgperflogname="feedImage" src="${photoUrl}">
                <video playsinline src="blob:https://www.facebook.com/music" style="display: none;"></video>
                <div aria-label="Video player" role="group"><div aria-label="Reproduzir áudio" role="button"></div></div>
            </div>
        `;

        const media = await resolveFacebookPostMedia(document.querySelector(".post-root")!);

        expect(media).toEqual([{ kind: "photo", url: photoUrl }]);
        expect(fetchSpy).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });

    it("still reads a hidden player inside a real video host", async () => {
        const bytes = new Uint8Array(120_000);

        vi.stubGlobal("fetch", vi.fn(async () => ({
            ok: true,
            async blob() {
                return { size: bytes.length, type: "video/mp4", async arrayBuffer() { return bytes.buffer; } };
            }
        })));
        Object.defineProperty(performance, "getEntriesByType", { configurable: true, value: () => [] });
        document.body.innerHTML = `
            <div class="reel-root" data-video-id="42">
                <video src="blob:https://www.facebook.com/reel" style="display: none;"></video>
            </div>
        `;

        const media = await resolveFacebookPostMedia(document.querySelector(".reel-root")!);

        expect(media.map((item) => item.kind)).toEqual(["video"]);
        vi.unstubAllGlobals();
    });
});
