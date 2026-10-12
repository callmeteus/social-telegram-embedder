import { describe, expect, it, vi } from "vitest";
import { closeChannelPicker, showChannelPicker } from "../src/content/ui/ChannelPicker";
import { DestinationProvider, type TelegramDestinationChannel } from "../src/core/types/Config";

function telegramChannel(id: string, label: string): TelegramDestinationChannel {
    return { id, label, provider: DestinationProvider.TELEGRAM, chatId: id };
}

describe("showChannelPicker keyboard navigation", () => {
    it("moves selection with arrow keys and confirms with enter", () => {
        const onSelect = vi.fn();

        showChannelPicker(
            document.createElement("button"),
            [
                telegramChannel("-1001", "Canal A"),
                telegramChannel("-1002", "Canal B"),
                telegramChannel("-1003", "Canal C")
            ],
            undefined,
            onSelect
        );

        const items = Array.from(document.querySelectorAll(".x2tg-picker__item"));

        expect(items[0]?.querySelector(".x2tg-picker__destination-icon")).toBeTruthy();
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
        expect(onSelect).toHaveBeenCalledWith(telegramChannel("-1002", "Canal B"));
        expect(document.querySelector(".x2tg-picker-overlay")).toBeNull();
    });

    it("wraps selection from the first item to the last with arrow up", () => {
        showChannelPicker(
            document.createElement("button"),
            [
                telegramChannel("-1001", "Canal A"),
                telegramChannel("-1002", "Canal B")
            ],
            undefined,
            vi.fn()
        );

        const items = Array.from(document.querySelectorAll(".x2tg-picker__item"));

        document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));

        expect(items[1]?.classList.contains("x2tg-picker__item--active")).toBe(true);

        closeChannelPicker();
    });

    it("lists channels from different providers together", () => {
        showChannelPicker(
            document.createElement("button"),
            [
                telegramChannel("-1001", "Canal Telegram"),
                {
                    id: "discord-1",
                    label: "Canal Discord",
                    provider: DestinationProvider.DISCORD,
                    webhookUrl: "https://discord.com/api/webhooks/1/abc"
                }
            ],
            undefined,
            vi.fn()
        );

        const items = Array.from(document.querySelectorAll(".x2tg-picker__item"));

        expect(items.map((item) => item.textContent)).toEqual(["Canal Telegram", "Canal Discord"]);
        expect(items[1]?.querySelector(".x2tg-picker__destination-icon")).toBeNull();

        closeChannelPicker();
    });
});
