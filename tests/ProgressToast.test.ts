import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dismissProgressToast, updateProgressToast } from "../src/content/ui/Toast";

const INDETERMINATE_CLASS = "x2tg-toast__progress-track--indeterminate";

function track(): HTMLElement {
    return document.querySelector(".x2tg-toast__progress-track")!;
}

function bar(): HTMLElement {
    return document.querySelector(".x2tg-toast__progress-bar")!;
}

function elapsed(): string {
    return document.querySelector(".x2tg-toast__elapsed")?.textContent ?? "";
}

describe("progress toast", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = "";
    });

    afterEach(() => {
        dismissProgressToast("req");
        vi.runAllTimers();
        vi.useRealTimers();
    });

    it("keeps an animated bar visible while no percentage is known", () => {
        updateProgressToast("req", "Enviando mídia para o Telegram...");

        expect(track().classList.contains(INDETERMINATE_CLASS)).toBe(true);
        expect(bar().style.width).toBe("");
    });

    it("switches to the real percentage once it arrives and back when it is gone", () => {
        updateProgressToast("req", "Enviando mídia para o Telegram...");
        updateProgressToast("req", "Enviando mídia para o Telegram...", 42);

        expect(track().classList.contains(INDETERMINATE_CLASS)).toBe(false);
        expect(bar().style.width).toBe("42%");

        updateProgressToast("req", "Enviando link complementar...");

        expect(track().classList.contains(INDETERMINATE_CLASS)).toBe(true);
    });

    it("clamps out-of-range percentages", () => {
        updateProgressToast("req", "Baixando mídia...", 140);

        expect(bar().style.width).toBe("100%");
    });

    it("shows the elapsed time only after a few seconds without finishing", () => {
        updateProgressToast("req", "Enviando mídia para o Telegram...");

        vi.advanceTimersByTime(2000);
        expect(elapsed()).toBe("");

        vi.advanceTimersByTime(10_000);
        expect(elapsed()).toContain("12");
    });

    it("stops counting once the toast is dismissed", () => {
        updateProgressToast("req", "Enviando mídia para o Telegram...");
        dismissProgressToast("req");
        vi.advanceTimersByTime(5000);

        expect(document.querySelector(".x2tg-toast--progress")).toBeNull();
        expect(vi.getTimerCount()).toBe(0);
    });
});
