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
});
