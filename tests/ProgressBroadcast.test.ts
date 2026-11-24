import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
    query: vi.fn(),
    sendMessage: vi.fn()
}));

beforeEach(() => {
    api.query.mockReset();
    api.sendMessage.mockReset();
    api.sendMessage.mockResolvedValue(undefined);
    Object.assign(globalThis, {
        chrome: {
            tabs: {
                query: api.query,
                sendMessage: api.sendMessage
            }
        }
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

function tab(id: number, url: string): chrome.tabs.Tab {
    return { id, url } as chrome.tabs.Tab;
}

function tabsWithSupportedSites(): chrome.tabs.Tab[] {
    return [
        tab(1, "https://x.com/home"),
        tab(2, "https://www.facebook.com/"),
        tab(3, "https://www.instagram.com/"),
        tab(4, "https://www.tiktok.com/"),
        tab(5, "https://e621.net/"),
        tab(6, "https://www.furaffinity.net/"),
        tab(7, "https://example.com/"),
        tab(8, "chrome-extension://abc/options.html")
    ];
}

describe("send progress broadcast", () => {
    it("shows the progress toast on every tab of a supported site", async () => {
        api.query.mockResolvedValue(tabsWithSupportedSites());
        const { createProgressBroadcaster } = await import("../src/background/ProgressReporter");

        createProgressBroadcaster("r1")({ message: "Preparing send...", percent: 40 });
        await vi.waitFor(() => expect(api.sendMessage).toHaveBeenCalledTimes(6));

        expect(api.sendMessage).toHaveBeenCalledWith(1, {
            type: "SEND_PROGRESS",
            requestId: "r1",
            message: "Preparing send...",
            percent: 40
        });
        expect(api.sendMessage).toHaveBeenCalledWith(6, expect.objectContaining({ requestId: "r1" }));
        expect(api.sendMessage).not.toHaveBeenCalledWith(7, expect.anything());
        expect(api.sendMessage).not.toHaveBeenCalledWith(8, expect.anything());
    });

    it("closes the progress toast on every supported tab when the send stops being active", async () => {
        api.query.mockResolvedValue(tabsWithSupportedSites());
        const { broadcastProgressEnd } = await import("../src/background/ProgressReporter");

        await broadcastProgressEnd("r2");

        expect(api.sendMessage).toHaveBeenCalledTimes(6);
        expect(api.sendMessage).toHaveBeenCalledWith(1, {
            type: "SEND_PROGRESS_END",
            requestId: "r2"
        });
    });

    it("skips tabs without an id and tabs that reject the message", async () => {
        api.query.mockResolvedValue([
            tab(1, "https://x.com/"),
            { url: "https://x.com/" } as chrome.tabs.Tab,
            tab(3, "https://twitter.com/")
        ]);
        api.sendMessage.mockImplementation(async (tabId: number) => {
            if (tabId === 3) {
                throw new Error("Receiving end does not exist");
            }
        });
        const { broadcastProgressEnd } = await import("../src/background/ProgressReporter");

        await expect(broadcastProgressEnd("r3")).resolves.toBeUndefined();
        expect(api.sendMessage).toHaveBeenCalledTimes(2);
    });

    it("stays quiet when the tab list cannot be read", async () => {
        api.query.mockRejectedValue(new Error("Extension context invalidated"));
        const { broadcastProgressEnd } = await import("../src/background/ProgressReporter");

        await expect(broadcastProgressEnd("r4")).resolves.toBeUndefined();
        expect(api.sendMessage).not.toHaveBeenCalled();
    });
});
