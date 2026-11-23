import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTikTokSnapshot } from "../src/platforms/tiktok/content/TikTokSnapshot";

/** Canonical URL used by the snapshot tests. */
const postUrl = "https://www.tiktok.com/@eventofurzue/video/7708937794424556821";

/** Direct video URL used by the mocked download. */
const videoUrl = "https://v16-webapp-prime.tiktok.com/video/tos/test.mp4";

/**
 * Writes a universal-data script tag into the document for a given payload.
 *
 * @param payload - TikTok universal data structure.
 */
function setUniversalData(payload: unknown): void {
    document.head.innerHTML = "";

    const script = document.createElement("script");
    script.id = "__UNIVERSAL_DATA_FOR_REHYDRATION__";
    script.type = "application/json";
    script.textContent = JSON.stringify(payload);
    document.head.appendChild(script);
}

/**
 * Builds a Response-like object with a blob that supports arrayBuffer in jsdom.
 *
 * @param size - Fake blob size in bytes.
 * @returns A mocked Response.
 */
function makeVideoResponse(size = 8192): Response {
    const bytes = new Uint8Array(size).fill(1);

    return {
        ok: true,
        status: 200,
        blob: async () => ({
            size,
            type: "video/mp4",
            arrayBuffer: async () => bytes.buffer
        })
    } as unknown as Response;
}

/**
 * Builds a realistic universal-data payload for one video.
 *
 * @param overrides - Fields to override on the item struct.
 * @returns The universal data object.
 */
function makePayload(overrides: Record<string, unknown> = {}): unknown {
    return {
        __DEFAULT_SCOPE__: {
            "webapp.video-detail": {
                itemInfo: {
                    itemStruct: {
                        desc: "Primeiro teaser do Furzuê 2027 🦊 #furzue2027",
                        author: { uniqueId: "eventofurzue" },
                        video: {
                            playAddr: videoUrl,
                            bitrateInfo: [
                                {
                                    Bitrate: 1168292,
                                    PlayAddr: {
                                        UrlList: [videoUrl],
                                        Url: videoUrl
                                    }
                                }
                            ]
                        },
                        ...overrides
                    }
                }
            }
        }
    };
}

afterEach(() => {
    vi.unstubAllGlobals();
    document.head.innerHTML = "";
});

describe("buildTikTokSnapshot", () => {
    it("captures the author, description, link and inline video bytes", async () => {
        setUniversalData(makePayload());

        const fetchMock = vi.fn(async () => makeVideoResponse());
        vi.stubGlobal("fetch", fetchMock);

        const snapshot = await buildTikTokSnapshot(postUrl);

        expect(snapshot.text).toBe(
            "@eventofurzue Primeiro teaser do Furzuê 2027 🦊 #furzue2027\n\n" + postUrl
        );
        expect(snapshot.media).toHaveLength(1);
        expect(snapshot.media[0].kind).toBe("video");
        expect(snapshot.media[0].url).toBe(videoUrl);
        expect(snapshot.media[0].inlineBlob?.mimeType).toBe("video/mp4");
        expect(snapshot.media[0].inlineBlob?.base64.length).toBeGreaterThan(0);
        expect(fetchMock).toHaveBeenCalledOnce();
    });

    it("prefers the highest-bitrate UrlList entry", async () => {
        const lowUrl = "https://v16.tiktokcdn.com/video/low.mp4";
        const highUrl = "https://v16.tiktokcdn.com/video/high.mp4";
        setUniversalData(makePayload({
            video: {
                bitrateInfo: [
                    { Bitrate: 100, PlayAddr: { UrlList: [lowUrl] } },
                    { BitRate: 9000, PlayAddr: { UrlList: [highUrl] } }
                ]
            }
        }));

        const fetchMock = vi.fn(async () => makeVideoResponse());
        vi.stubGlobal("fetch", fetchMock);

        const snapshot = await buildTikTokSnapshot(postUrl);

        expect(snapshot.media[0].url).toBe(highUrl);
        expect(fetchMock.mock.calls[0][0]).toBe(highUrl);
    });

    it("falls back to a link-only snapshot when the video cannot be downloaded", async () => {
        setUniversalData(makePayload());
        vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 403 })));

        const snapshot = await buildTikTokSnapshot(postUrl);

        expect(snapshot.text).toContain("Primeiro teaser do Furzuê 2027");
        expect(snapshot.text).toContain(postUrl);
        expect(snapshot.media).toHaveLength(0);
    });

    it("returns an empty snapshot when the universal data is missing", async () => {
        document.head.innerHTML = "";

        const snapshot = await buildTikTokSnapshot(postUrl);

        expect(snapshot.text).toBe("");
        expect(snapshot.media).toHaveLength(0);
    });
});
