import { describe, expect, it } from "vitest";
import { normalizeTelegramChatId } from "../src/core/telegram/NormalizeChatId";

describe("normalizeTelegramChatId", () => {
    it("keeps @username unchanged", () => {
        expect(normalizeTelegramChatId("@meuCanal")).toBe("@meuCanal");
    });

    it("keeps -100... ids unchanged", () => {
        expect(normalizeTelegramChatId("-100987654321")).toBe("-100987654321");
    });

    it("prefixes bare channel id from Telegram client", () => {
        expect(normalizeTelegramChatId("1194845578")).toBe("-1001194845578");
    });

    it("strips thousand separators from Telegram client id display", () => {
        expect(normalizeTelegramChatId("1.194.845.578")).toBe("-1001194845578");
    });

    it("trims whitespace", () => {
        expect(normalizeTelegramChatId("  1194845578  ")).toBe("-1001194845578");
    });

    it("fixes a single leading minus on the Telegram client id", () => {
        expect(normalizeTelegramChatId("-1194845578")).toBe("-1001194845578");
    });

    it("keeps short legacy group ids with a minus", () => {
        expect(normalizeTelegramChatId("-12345")).toBe("-12345");
    });
});
