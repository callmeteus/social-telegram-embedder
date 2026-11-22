import { describe, expect, it } from "vitest";
import { normalizeTelegramTopicId } from "../src/core/telegram/NormalizeTopicId";

describe("normalizeTelegramTopicId", () => {
    it("accepts positive integers from numbers and strings", () => {
        expect(normalizeTelegramTopicId(42)).toBe(42);
        expect(normalizeTelegramTopicId("42")).toBe(42);
        expect(normalizeTelegramTopicId(" 42 ")).toBe(42);
    });

    it("reads the topic id from links copied from Telegram", () => {
        expect(normalizeTelegramTopicId("https://t.me/c/1948454578/42")).toBe(42);
        expect(normalizeTelegramTopicId("t.me/c/1948454578/42")).toBe(42);
        expect(normalizeTelegramTopicId("https://t.me/meu_grupo/123?thread=123")).toBe(123);
        expect(normalizeTelegramTopicId("https://t.me/c/1948454578/99?thread=99")).toBe(99);
    });

    it("rejects missing, zero, negative and non-topic values", () => {
        expect(normalizeTelegramTopicId(undefined)).toBeUndefined();
        expect(normalizeTelegramTopicId("")).toBeUndefined();
        expect(normalizeTelegramTopicId(0)).toBeUndefined();
        expect(normalizeTelegramTopicId(-5)).toBeUndefined();
        expect(normalizeTelegramTopicId("abc")).toBeUndefined();
        expect(normalizeTelegramTopicId("https://t.me/c/1948454578")).toBeUndefined();
    });
});
