import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyTelegramUserError } from "../src/core/telegram-user/Errors";
import { TelegramUserErrorCode } from "../src/core/telegram-user/SessionTypes";
import { runWithStallGuard, SendStalledError } from "../src/core/telegram-user/StallGuard";

afterEach(() => {
    vi.useRealTimers();
});

describe("runWithStallGuard", () => {
    it("resolves with the task result when it finishes in time", async () => {
        await expect(runWithStallGuard(async () => "done", 1000)).resolves.toBe("done");
    });

    it("passes task errors through unchanged", async () => {
        const failure = new Error("CHAT_WRITE_FORBIDDEN");

        await expect(runWithStallGuard(async () => {
            throw failure;
        }, 1000)).rejects.toBe(failure);
    });

    it("rejects and aborts the signal when the task never reports progress", async () => {
        vi.useFakeTimers();

        let taskSignal: AbortSignal | undefined;
        const result = runWithStallGuard((signal) => {
            taskSignal = signal;
            return new Promise<never>(() => undefined);
        }, 1000);
        const assertion = expect(result).rejects.toBeInstanceOf(SendStalledError);

        await vi.advanceTimersByTimeAsync(1000);
        await assertion;
        expect(taskSignal?.aborted).toBe(true);
    });

    it("keeps waiting while progress keeps coming", async () => {
        vi.useFakeTimers();

        let finish: (value: string) => void = () => undefined;
        let report: () => void = () => undefined;
        const result = runWithStallGuard((_signal, touch) => {
            report = touch;
            return new Promise<string>((resolve) => {
                finish = resolve;
            });
        }, 1000);

        for (let step = 0; step < 5; step++) {
            await vi.advanceTimersByTimeAsync(800);
            report();
        }

        finish("sent");
        await expect(result).resolves.toBe("sent");
    });

    it("is classified as a stalled send", () => {
        expect(classifyTelegramUserError(new SendStalledError(60_000)).code).toBe(TelegramUserErrorCode.SEND_STALLED);
    });
});
