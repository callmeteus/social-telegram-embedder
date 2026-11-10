import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spies = vi.hoisted(() => ({
    dismissProgressToast: vi.fn(),
    showToast: vi.fn()
}));

vi.mock("../src/content/ui/Toast", () => ({
    ...spies,
    updateProgressToast: vi.fn(),
    openOptionsPage: vi.fn()
}));

import { handleSendPostDone } from "../src/content/send/SendResultHandler";
import {
    registerPendingSend,
    resetPendingSends,
    wasRecentlySent
} from "../src/content/send/PendingSend";
import { ContentMessageType } from "../src/core/network/SendProgress";

function done(requestId: string, result: Parameters<typeof handleSendPostDone>[0]["result"]) {
    return { type: ContentMessageType.SEND_POST_DONE as const, requestId, result };
}

beforeEach(() => {
    spies.dismissProgressToast.mockClear();
    spies.showToast.mockClear();
    resetPendingSends();
});

afterEach(() => {
    resetPendingSends();
});

describe("handleSendPostDone", () => {
    it("closes the progress toast, shows the outcome and starts the resend debounce", () => {
        registerPendingSend("r1", {
            dedupeKey: "c1:https://x.com/a/status/1",
            destinations: [{ ref: { type: "CHANNEL", channelId: "c1" }, label: "Canal A" }]
        });

        handleSendPostDone(done("r1", { ok: true, outcomes: [{ label: "Canal A", ok: true }] }));

        expect(spies.dismissProgressToast).toHaveBeenCalledWith("r1");
        expect(spies.showToast).toHaveBeenCalledWith("Sent to Canal A", "success");
        expect(wasRecentlySent("c1:https://x.com/a/status/1")).toBe(true);
    });

    it("does not debounce a failed send", () => {
        registerPendingSend("r2", {
            dedupeKey: "c1:https://x.com/a/status/1",
            destinations: [{ ref: { type: "CHANNEL", channelId: "c1" }, label: "Canal A" }]
        });

        handleSendPostDone(done("r2", { ok: false, error: "Falhou" }));

        expect(spies.showToast).toHaveBeenCalledWith("Falhou", "error");
        expect(wasRecentlySent("c1:https://x.com/a/status/1")).toBe(false);
    });

    it("still shows the result when the page was reloaded mid-send", () => {
        handleSendPostDone(done("r3", {
            ok: true,
            outcomes: [
                { label: "Canal A", ok: true },
                { label: "Canal B", ok: true }
            ]
        }));

        expect(spies.dismissProgressToast).toHaveBeenCalledWith("r3");
        expect(spies.showToast).toHaveBeenCalledWith("Sent to 2 destinations", "success");
    });
});
