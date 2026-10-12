import { afterEach, describe, expect, it, vi } from "vitest";
import { TelegramClient } from "../src/core/telegram/TelegramClient";

describe("TelegramClient sendMediaGroup", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("uploads Twitter photos instead of passing CDN URLs to Telegram", async () => {
        const imageBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);

            if (url.includes("pbs.twimg.com/media/photo-a.jpg")) {
                return {
                    ok: true,
                    headers: new Headers({ "content-type": "image/jpeg", "content-length": String(imageBytes.length) }),
                    body: null,
                    blob: async () => new Blob([imageBytes], { type: "image/jpeg" })
                };
            }

            if (url.includes("pbs.twimg.com/media/photo-b.jpg")) {
                return {
                    ok: true,
                    headers: new Headers({ "content-type": "image/jpeg", "content-length": String(imageBytes.length) }),
                    body: null,
                    blob: async () => new Blob([imageBytes], { type: "image/jpeg" })
                };
            }

            if (url.includes("api.telegram.org")) {
                return {
                    ok: true,
                    json: async () => ({ ok: true })
                };
            }

            throw new Error(`Unexpected fetch: ${url}`);
        });

        vi.stubGlobal("fetch", fetchMock);

        const client = new TelegramClient("123456:ABCDEF");

        await client.sendSocialPost("-1001194845578", {
            embedUrl: "https://fixupx.com/artist_daimo/status/2109071488238100947",
            text: "@<b>artist_daimo</b>\n\nJuno loves being a good little exhibitionist puppy",
            media: [
                { kind: "photo", url: "https://pbs.twimg.com/media/photo-a.jpg?name=small" },
                { kind: "photo", url: "https://pbs.twimg.com/media/photo-b.jpg?name=360x360" }
            ]
        });

        const mediaGroupCall = fetchMock.mock.calls.find((call) => String(call[0]).includes("sendMediaGroup"));

        expect(mediaGroupCall).toBeTruthy();

        const requestBody = (mediaGroupCall![1] as RequestInit).body;

        expect(requestBody).toBeInstanceOf(FormData);

        const formData = requestBody as FormData;
        const mediaJson = formData.get("media");

        expect(typeof mediaJson).toBe("string");

        const media = JSON.parse(String(mediaJson)) as Array<Record<string, string>>;

        expect(media[0].media).toBe("attach://file0");
        expect(media[0].caption).toContain("@<b>artist_daimo</b>");
        expect(media[0].parse_mode).toBe("HTML");
        expect(media[1].media).toBe("attach://file1");

        const twitterDownloads = fetchMock.mock.calls.filter((call) => String(call[0]).includes("pbs.twimg.com"));

        expect(twitterDownloads).toHaveLength(2);
        expect(String(twitterDownloads[0][0])).toContain("photo-a.jpg?name=orig");
        expect(String(twitterDownloads[1][0])).toContain("photo-b.jpg?name=orig");
    });
});
