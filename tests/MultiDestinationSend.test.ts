import { describe, expect, it, vi } from "vitest";
import {
    TelegramUserSendDelayMs,
    dedupeDestinationRefs,
    sendToDestinations,
    type MultiDestinationSendDeps,
    type ResolvedDestination
} from "../src/background/handlers/MultiDestinationSend";
import type { DestinationSender } from "../src/core/destinations";
import { DestinationRefType, TelegramPeerKind, type DestinationRef } from "../src/core/types/DestinationRef";
import type { SendResult } from "../src/core/types/Results";
import type { FetchedSocialPost } from "../src/platforms/types";

const channel = (channelId: string): DestinationRef => ({ type: DestinationRefType.CHANNEL, channelId });
const peer = (peerId: number, title = `Peer ${peerId}`, connectionId = "acc"): DestinationRef => ({
    type: DestinationRefType.TELEGRAM_PEER,
    connectionId,
    peerId,
    kind: TelegramPeerKind.USER,
    title
});
const label = (ref: DestinationRef): string => (ref.type === DestinationRefType.CHANNEL ? ref.channelId : ref.title);

const Post: FetchedSocialPost = {
    embedUrl: "https://fixupx.com/a/status/1",
    sourceUrl: "https://x.com/a/status/1",
    text: "hi",
    media: [{ kind: "photo", url: "https://example.com/1.jpg" }]
};

function fakeSender(): DestinationSender {
    return {
        sendSocialPost: vi.fn(),
        sendLink: vi.fn(async () => ({ ok: true })),
        sendTestMessage: vi.fn()
    } as unknown as DestinationSender;
}

interface Setup {
    deps: MultiDestinationSendDeps & { [K in keyof MultiDestinationSendDeps]: ReturnType<typeof vi.fn> };
    sendPost: ReturnType<typeof vi.fn>;
    senders: Map<string, DestinationSender>;
}

function setup(results: Record<string, SendResult> = {}, unresolved: Record<string, string> = {}): Setup {
    const senders = new Map<string, DestinationSender>();
    const deps = {
        resolveDestination: vi.fn(async (ref: DestinationRef): Promise<ResolvedDestination> => {
            const name = label(ref);

            if (unresolved[name]) {
                return { label: name, sender: null, error: unresolved[name] };
            }

            const sender = fakeSender();

            senders.set(name, sender);
            return { label: name, sender };
        }),
        prefetchMedia: vi.fn(async (post: FetchedSocialPost) => ({
            ...post,
            media: post.media.map((item) => ({ ...item, prefetchedBlob: new Blob(["x"]) }))
        })),
        sleep: vi.fn(async () => {})
    };
    const sendPost = vi.fn(async (sender: DestinationSender) => {
        const name = [...senders.entries()].find(([, value]) => value === sender)?.[0] ?? "";

        return results[name] ?? { ok: true };
    });

    return { deps: deps as Setup["deps"], sendPost, senders };
}

describe("sendToDestinations", () => {
    it("keeps the single-destination path unchanged: no prefetch, no prefix, no delay", async () => {
        const { deps, sendPost } = setup();
        const onProgress = vi.fn();

        sendPost.mockImplementation(async (_sender, _post, progress?: (update: { message: string }) => void) => {
            progress?.({ message: "Uploading" });
            return { ok: true };
        });

        const { result, succeeded } = await sendToDestinations(
            { platform: { sendPost }, post: Post, normalizedUrl: "u", destinations: [channel("a")], onProgress },
            deps
        );

        expect(result).toEqual({ ok: true, outcomes: [{ label: "a", ok: true, error: undefined }] });
        expect(succeeded).toEqual([channel("a")]);
        expect(deps.prefetchMedia).not.toHaveBeenCalled();
        expect(deps.sleep).not.toHaveBeenCalled();
        expect(onProgress).toHaveBeenCalledWith({ message: "Uploading" });
    });

    it("downloads media once and reuses it for every destination, with per-destination progress", async () => {
        const { deps, sendPost } = setup();
        const onProgress = vi.fn();

        sendPost.mockImplementation(async (_sender, post: FetchedSocialPost, progress?: (update: { message: string }) => void) => {
            expect(post.media[0]?.prefetchedBlob).toBeInstanceOf(Blob);
            progress?.({ message: "Uploading" });
            return { ok: true };
        });

        const { result } = await sendToDestinations(
            { platform: { sendPost }, post: Post, normalizedUrl: "u", destinations: [channel("a"), peer(1, "Ana")], onProgress },
            deps
        );

        expect(result.ok).toBe(true);
        expect(deps.prefetchMedia).toHaveBeenCalledTimes(1);
        expect(sendPost).toHaveBeenCalledTimes(2);
        expect(onProgress).toHaveBeenCalledWith({ message: "[1/2] a: Uploading" });
        expect(onProgress).toHaveBeenCalledWith({ message: "[2/2] Ana: Uploading" });
    });

    it("waits between consecutive Telegram account sends only", async () => {
        const { deps, sendPost } = setup();

        await sendToDestinations(
            { platform: { sendPost }, post: Post, normalizedUrl: "u", destinations: [peer(1), peer(2), channel("a"), peer(3)] },
            deps
        );

        expect(deps.sleep).toHaveBeenCalledTimes(1);
        expect(deps.sleep).toHaveBeenCalledWith(TelegramUserSendDelayMs);
    });

    it("does not wait between sends from different accounts", async () => {
        const { deps, sendPost } = setup();

        await sendToDestinations(
            { platform: { sendPost }, post: Post, normalizedUrl: "u", destinations: [peer(1, "A", "acc"), peer(2, "B", "acc-2"), peer(3, "C", "acc-2")] },
            deps
        );

        expect(deps.sleep).toHaveBeenCalledTimes(1);
    });

    it("skips only the account that hit a flood wait", async () => {
        const { deps, sendPost } = setup({ A: { ok: false, error: "Wait", floodWaitSeconds: 30 } });

        const { succeeded } = await sendToDestinations(
            { platform: { sendPost }, post: Post, normalizedUrl: "u", destinations: [peer(1, "A", "acc"), peer(2, "B", "acc-2"), peer(3, "C", "acc")] },
            deps
        );

        expect(sendPost).toHaveBeenCalledTimes(2);
        expect(succeeded).toEqual([peer(2, "B", "acc-2")]);
    });

    it("keeps going after a failure and summarizes partial success", async () => {
        const { deps, sendPost } = setup({ b: { ok: false, error: "No rights" } }, { c: "Not connected" });

        const { result, succeeded } = await sendToDestinations(
            { platform: { sendPost }, post: Post, normalizedUrl: "u", destinations: [channel("a"), channel("b"), channel("c")] },
            deps
        );

        expect(result.ok).toBe(false);
        expect(result.error).toBe("Sent to 1 of 3 destinations. Failed: b (No rights); c (Not connected)");
        expect(result.outcomes?.map((outcome) => outcome.ok)).toEqual([true, false, false]);
        expect(succeeded).toEqual([channel("a")]);
    });

    it("skips remaining account sends after a flood wait but still sends to bot channels", async () => {
        const { deps, sendPost } = setup({ "Peer 1": { ok: false, error: "Wait", floodWaitSeconds: 60 } });

        const { result, succeeded } = await sendToDestinations(
            { platform: { sendPost }, post: Post, normalizedUrl: "u", destinations: [peer(1), peer(2), channel("a")] },
            deps
        );

        expect(sendPost).toHaveBeenCalledTimes(2);
        expect(result.outcomes?.[1]).toEqual({ label: "Peer 2", ok: false, error: "Telegram asked to wait 60 s before trying again." });
        expect(succeeded).toEqual([channel("a")]);
        expect(deps.sleep).not.toHaveBeenCalled();
    });

    it("sends only the link when the post could not be fetched", async () => {
        const { deps, sendPost, senders } = setup();

        const { result } = await sendToDestinations(
            { platform: { sendPost }, post: null, normalizedUrl: "https://x.com/a/status/1", destinations: [channel("a"), channel("b")] },
            deps
        );

        expect(result.ok).toBe(true);
        expect(sendPost).not.toHaveBeenCalled();
        expect(deps.prefetchMedia).not.toHaveBeenCalled();
        expect(senders.get("b")?.sendLink).toHaveBeenCalledWith("https://x.com/a/status/1");
    });
});

describe("dedupeDestinationRefs", () => {
    it("drops malformed refs and duplicates, keeping the first", () => {
        expect(dedupeDestinationRefs([channel("a"), peer(1), channel("a"), { type: "X" }, peer(1, "Other"), null])).toEqual([channel("a"), peer(1)]);
        expect(dedupeDestinationRefs([peer(1, "A", "acc"), peer(1, "A", "acc-2")])).toHaveLength(2);
        expect(dedupeDestinationRefs("nope")).toEqual([]);
    });
});
