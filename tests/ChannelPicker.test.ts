import { describe, expect, it, vi } from "vitest";
import { closeChannelPicker, showChannelPicker } from "../src/content/ui/ChannelPicker";

describe("showChannelPicker keyboard navigation", () => {
    it("moves selection with arrow keys and confirms with enter", () => {
        const onSelect = vi.fn();

        showChannelPicker(
            document.createElement("button"),
            [
                { id: "-1001", label: "Canal A", chatId: "-1001" },
                { id: "-1002", label: "Canal B", chatId: "-1002" },
                { id: "-1003", label: "Canal C", chatId: "-1003" }
            ],
            undefined,
            onSelect
        );

        const items = Array.from(document.querySelectorAll(".x2tg-picker__item"));

        expect(items[0]?.classList.contains("x2tg-picker__item--active")).toBe(true);

        document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
        expect(items[0]?.classList.contains("x2tg-picker__item--active")).toBe(false);
        expect(items[1]?.classList.contains("x2tg-picker__item--active")).toBe(true);

        document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
        expect(items[2]?.classList.contains("x2tg-picker__item--active")).toBe(true);

        document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
        expect(items[1]?.classList.contains("x2tg-picker__item--active")).toBe(true);

        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(onSelect).toHaveBeenCalledWith({ id: "-1002", label: "Canal B", chatId: "-1002" });
        expect(document.querySelector(".x2tg-picker-overlay")).toBeNull();
    });

    it("wraps selection from the first item to the last with arrow up", () => {
        showChannelPicker(
            document.createElement("button"),
            [
                { id: "-1001", label: "Canal A", chatId: "-1001" },
                { id: "-1002", label: "Canal B", chatId: "-1002" }
            ],
            undefined,
            vi.fn()
        );

        const items = Array.from(document.querySelectorAll(".x2tg-picker__item"));

        document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));

        expect(items[1]?.classList.contains("x2tg-picker__item--active")).toBe(true);

        closeChannelPicker();
    });
});
