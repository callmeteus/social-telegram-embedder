import { describe, expect, it, vi } from "vitest";

vi.mock("../src/background/telegram-user", () => ({
    telegramUserSessions: { get: vi.fn(() => ({ acquire: vi.fn(() => () => {}), getClient: vi.fn() })) },
    TelegramUserSessionError: class extends Error {}
}));

import { handleSendPost } from "../src/background/handlers/SendPostHandler";
import { RuntimeMessageType, type SendPostMessage } from "../src/core/types";
import { DestinationRefType, MaxDestinationsPerSend, TelegramPeerKind } from "../src/core/types/DestinationRef";
import { SocialPlatformId } from "../src/platforms/types";

function message(destinations: unknown[]): SendPostMessage {
    return {
        type: RuntimeMessageType.SEND_POST,
        platformId: SocialPlatformId.X,
        postUrl: "https://x.com/a/status/1",
        requestId: "r1",
        destinations
    } as unknown as SendPostMessage;
}

describe("handleSendPost destination checks", () => {
    it("refuses more destinations than the per-send cap", async () => {
        const destinations = Array.from({ length: MaxDestinationsPerSend + 1 }, (_, index) => ({
            type: DestinationRefType.TELEGRAM_PEER,
            connectionId: "acc",
            peerId: index + 1,
            kind: TelegramPeerKind.USER,
            title: `P${index}`
        }));

        expect(await handleSendPost(message(destinations), {})).toEqual({
            ok: false,
            error: `Pick at most ${MaxDestinationsPerSend} destinations per send.`
        });
    });

    it("counts duplicates once before applying the cap", async () => {
        const same = { type: DestinationRefType.TELEGRAM_PEER, connectionId: "acc", peerId: 1, kind: TelegramPeerKind.USER, title: "P" };
        const result = await handleSendPost({ ...message(Array.from({ length: 20 }, () => same)), postUrl: "not a url" }, {});

        expect(result.error).not.toContain("destinations per send");
    });

    it("rejects a request without valid destinations", async () => {
        expect((await handleSendPost(message([{ type: "BOGUS" }]), {})).ok).toBe(false);
    });
});
