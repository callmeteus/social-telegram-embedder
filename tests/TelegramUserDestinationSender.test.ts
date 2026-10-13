import { afterEach, describe, expect, it, vi } from "vitest";
import { TelegramUserDestinationSender } from "../src/core/destinations/TelegramUserDestinationSender";
import { DestinationRefType, TelegramPeerKind, type TelegramPeerDestinationRef } from "../src/core/types/DestinationRef";
import type { FetchedSocialPost, SocialMediaItem } from "../src/platforms/types";
import { createFakeTelegramUserClient, rpcError } from "./helpers/FakeTelegramUserClient";

const Peer: TelegramPeerDestinationRef = { type: DestinationRefType.TELEGRAM_PEER, peerId: -100123, kind: TelegramPeerKind.CHANNEL, title: "News" };

function photo(index: number): SocialMediaItem {
    return { kind: "photo", url: `https://example.com/${index}.jpg`, prefetchedBlob: new Blob(["p"], { type: "image/jpeg" }) };
}

function post(media: SocialMediaItem[], text = "Hello & bye"): FetchedSocialPost {
    return { embedUrl: "https://fixupx.com/a/status/1", sourceUrl: "https://x.com/a/status/1", text, media };
}

function stubFetch(response: { ok: boolean; status: number; blob?: Blob }): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn(async () => ({
        ok: response.ok,
        status: response.status,
        body: null,
        headers: new Headers(),
        blob: async () => response.blob ?? new Blob()
    }));

    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("TelegramUserDestinationSender", () => {
    it("sends a text-only post with the caption and link", async () => {
        const client = createFakeTelegramUserClient();
        const sender = new TelegramUserDestinationSender(client, Peer);

        expect(await sender.sendSocialPost(post([]))).toEqual({ ok: true });

        const [peerId, text] = client.sendText.mock.calls[0] as [number, { text: string; bold: unknown[] }];

        expect(peerId).toBe(-100123);
        expect(text.text).toContain("Hello & bye");
        expect(text.text).toContain("https://fixupx.com/a/status/1");
    });

    it("downloads and sends a single photo with upload progress", async () => {
        const client = createFakeTelegramUserClient();
        const progress = vi.fn();
        const fetchMock = stubFetch({ ok: true, status: 200, blob: new Blob(["img"], { type: "image/png" }) });

        client.sendMedia.mockImplementation(async (_peer: number, _file: unknown, _caption: unknown, onUpload?: (uploaded: number, total: number) => void) => {
            onUpload?.(50, 100);
        });

        const result = await new TelegramUserDestinationSender(client, Peer)
            .sendSocialPost(post([{ kind: "photo", url: "https://example.com/a.jpg" }]), progress);

        expect(result).toEqual({ ok: true });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(client.sendMedia.mock.calls[0]?.[1]).toMatchObject({ kind: "photo", fileName: "social-media-1.png" });
        expect(progress).toHaveBeenCalledWith(expect.objectContaining({ percent: 50 }));
    });

    it("sends a video from prefetched bytes without downloading again", async () => {
        const client = createFakeTelegramUserClient();
        const fetchMock = stubFetch({ ok: true, status: 200 });
        const video: SocialMediaItem = { kind: "video", url: "https://video.example/v.mp4", prefetchedBlob: new Blob(["v"], { type: "video/mp4" }) };

        await new TelegramUserDestinationSender(client, Peer).sendSocialPost(post([video]));

        expect(fetchMock).not.toHaveBeenCalled();
        expect(client.sendMedia.mock.calls[0]?.[1]).toMatchObject({ kind: "video", fileName: "social-media-1.mp4" });
    });

    it("sends an album with the caption on the first message", async () => {
        const client = createFakeTelegramUserClient();

        await new TelegramUserDestinationSender(client, Peer).sendSocialPost(post([photo(1), photo(2), photo(3)]));

        expect(client.sendMediaGroup).toHaveBeenCalledTimes(1);
        expect(client.sendMediaGroup.mock.calls[0]?.[1]).toHaveLength(3);
        expect(client.sendMediaGroup.mock.calls[0]?.[2]).toMatchObject({ text: expect.stringContaining("Hello") });
        expect(client.sendText).not.toHaveBeenCalled();
    });

    it("splits more than 10 media into albums and sends a follow-up link", async () => {
        const client = createFakeTelegramUserClient();
        const media = Array.from({ length: 12 }, (_, index) => photo(index));

        await new TelegramUserDestinationSender(client, Peer).sendSocialPost(post(media));

        expect(client.sendMediaGroup.mock.calls.map((call) => (call[1] as unknown[]).length)).toEqual([10, 2]);
        expect(client.sendMediaGroup.mock.calls[1]?.[2]).toBeUndefined();
        expect(client.sendText).toHaveBeenCalledTimes(1);
        expect((client.sendText.mock.calls[0]?.[1] as { text: string }).text).toContain("https://fixupx.com/a/status/1");
    });

    it("maps a failed download to a friendly message", async () => {
        const client = createFakeTelegramUserClient();

        stubFetch({ ok: false, status: 404 });

        const result = await new TelegramUserDestinationSender(client, Peer)
            .sendSocialPost(post([{ kind: "photo", url: "https://example.com/gone.jpg" }]));

        expect(result.ok).toBe(false);
        expect(result.error).not.toContain("404");
        expect(client.sendMedia).not.toHaveBeenCalled();
    });

    it("maps Telegram errors and reports flood waits", async () => {
        const client = createFakeTelegramUserClient();
        const sender = new TelegramUserDestinationSender(client, Peer);

        client.sendText.mockRejectedValueOnce(rpcError("CHAT_WRITE_FORBIDDEN"));
        expect(await sender.sendLink("https://x.com/a/status/1")).toEqual({ ok: false, error: "You cannot post in this chat.", floodWaitSeconds: undefined });

        client.sendText.mockRejectedValueOnce(rpcError("FLOOD_WAIT_%d", 30));
        expect(await sender.sendLink("https://x.com/a/status/1")).toMatchObject({ ok: false, floodWaitSeconds: 30 });
    });

    it("sends a plain test message", async () => {
        const client = createFakeTelegramUserClient();

        expect(await new TelegramUserDestinationSender(client, Peer).sendTestMessage()).toEqual({ ok: true });
        expect(client.sendText.mock.calls[0]?.[1]).toMatchObject({ bold: [] });
    });
});
