import { describe, expect, it } from "vitest";
import { formatDownloadProgressMessage } from "../src/core/network/FetchProgress";

describe("formatDownloadProgressMessage", () => {
    it("formats percent when total size is known", () => {
        const result = formatDownloadProgressMessage(2, 4, 500, 1000);

        expect(result.message).toBe("Downloading media 2 of 4... 50%");
        expect(result.percent).toBe(50);
    });

    it("formats kilobytes when total size is unknown", () => {
        const result = formatDownloadProgressMessage(1, 1, 2048, null);

        expect(result.message).toBe("Downloading media... 2 KB");
        expect(result.percent).toBeUndefined();
    });

    it("caps percent at 100", () => {
        const result = formatDownloadProgressMessage(1, 2, 1200, 1000);

        expect(result.message).toBe("Downloading media 1 of 2... 100%");
        expect(result.percent).toBe(100);
    });
});
