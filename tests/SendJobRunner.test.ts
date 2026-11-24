import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pending = vi.hoisted(() => ({
    handleSendPost: vi.fn(),
    validateSendPostRequest: vi.fn(() => null)
}));

vi.mock("../src/background/handlers/SendPostHandler", () => pending);

import {
    activeSendJobs,
    deliverSendResult,
    isKeepaliveRunning,
    runSendJob
} from "../src/background/SendJobRunner";
import { ContentMessageType } from "../src/core/network/SendProgress";
import { RuntimeMessageType, type SendPostMessage } from "../src/core/types/Messages";
import { SocialPlatformId } from "../src/platforms/types";

function message(requestId = "r1"): SendPostMessage {
    return {
        type: RuntimeMessageType.SEND_POST,
        platformId: SocialPlatformId.X,
        requestId,
        destinations: [],
        postUrl: "https://x.com/a/status/1"
    };
}

const sender = { tab: { id: 7 } } as unknown as chrome.runtime.MessageSender;

// The real catalog mock installed by tests/setup.ts, before this file replaces globalThis.chrome.
const realI18n = chrome.i18n;

beforeEach(() => {
    pending.handleSendPost.mockReset();
    Object.assign(globalThis, {
        chrome: {
            runtime: {
                id: "test-extension-id",
                getURL: (path: string) => `chrome-extension://test/${path}`,
                getPlatformInfo: vi.fn(async () => ({ os: "win", arch: "x86-64" })),
                lastError: undefined
            },
            i18n: realI18n,
            tabs: {
                query: vi.fn(async () => []),
                sendMessage: vi.fn(async () => undefined)
            },
            notifications: { create: vi.fn() }
        }
    });
});

afterEach(() => {
    vi.useRealTimers();
});

describe("runSendJob", () => {
    it("keeps the worker alive while a job runs and stops when it ends", async () => {
        let resolveSend: (value: { ok: boolean }) => void = () => undefined;

        pending.handleSendPost.mockImplementation(() => new Promise((resolve) => {
            resolveSend = resolve;
        }));

        const running = runSendJob(message(), sender);

        await Promise.resolve();
        expect(activeSendJobs()).toBe(1);
        expect(isKeepaliveRunning()).toBe(true);

        resolveSend({ ok: true });
        await running;

        expect(activeSendJobs()).toBe(0);
        expect(isKeepaliveRunning()).toBe(false);
    });

    it("delivers the outcome to the tab that started the send", async () => {
        pending.handleSendPost.mockResolvedValue({ ok: true, outcomes: [{ label: "Canal", ok: true }] });

        await runSendJob(message("r2"), sender);

        expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(7, {
            type: ContentMessageType.SEND_POST_DONE,
            requestId: "r2",
            result: { ok: true, outcomes: [{ label: "Canal", ok: true }] }
        });
        expect(chrome.notifications.create).not.toHaveBeenCalled();
    });

    it("notifies instead of failing when the send throws", async () => {
        pending.handleSendPost.mockRejectedValue(new Error("boom"));

        const result = await runSendJob(message("r3"), sender);

        expect(result.ok).toBe(false);
        expect(result.error).toBe("Internal extension error.");
        expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(1);
        expect(activeSendJobs()).toBe(0);
    });
});

describe("deliverSendResult", () => {
    it("falls back to a notification when the tab is gone", async () => {
        vi.mocked(chrome.tabs.sendMessage).mockRejectedValue(new Error("Could not establish connection"));

        await deliverSendResult(9, "r4", { ok: true, outcomes: [{ label: "Canal", ok: true }] });

        expect(chrome.notifications.create).toHaveBeenCalledTimes(1);
        const [, options] = vi.mocked(chrome.notifications.create).mock.calls[0];

        expect(options).toMatchObject({
            type: "basic",
            title: "Sent to Telegram",
            message: "Sent to Canal"
        });
    });

    it("notifies without a tab id", async () => {
        await deliverSendResult(undefined, "r5", { ok: false, error: "Falhou" });

        expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
        expect(chrome.notifications.create).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ title: "Send failed", message: "Falhou" }),
            expect.any(Function)
        );
    });

    it("only logs when the notifications API is unavailable", async () => {
        delete (chrome as { notifications?: unknown }).notifications;

        await expect(deliverSendResult(undefined, "r6", { ok: true })).resolves.toBeUndefined();
    });
});
