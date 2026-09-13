import type { TelegramChannel } from "../../core/types/Config";
import { t } from "../../core/i18n/I18n";
import { sortChannelsForPicker } from "../../core/storage/Storage";
import { SocialPlatformId } from "../../platforms/types";

let activeOverlay: HTMLElement | null = null;
let outsideClickHandler: ((event: MouseEvent) => void) | null = null;
let keyboardHandler: ((event: KeyboardEvent) => void) | null = null;

interface PickerItemState {
    channel: TelegramChannel;
    element: HTMLButtonElement;
}

/**
 * Shows a centered channel picker modal.
 */
export function showChannelPicker(
    _anchor: HTMLElement,
    channels: TelegramChannel[],
    lastUsedChannelId: string | undefined,
    onSelect: (channel: TelegramChannel) => void,
    platformId: SocialPlatformId = SocialPlatformId.X
): void {
    closeChannelPicker();

    const sorted = sortChannelsForPicker(channels, lastUsedChannelId);
    const overlay = document.createElement("div");
    overlay.className = "x2tg-picker-overlay";

    if (platformId === SocialPlatformId.FACEBOOK) {
        overlay.classList.add("x2tg-picker-overlay--facebook");
    }

    const picker = document.createElement("div");
    picker.className = "x2tg-picker";
    picker.setAttribute("role", "listbox");
    picker.setAttribute("aria-modal", "true");
    picker.setAttribute("aria-label", t("pickerTitle"));

    if (platformId === SocialPlatformId.FACEBOOK) {
        picker.classList.add("x2tg-picker--facebook");
    }

    const title = document.createElement("div");
    title.className = "x2tg-picker__title";
    title.textContent = t("pickerTitle");
    picker.appendChild(title);

    const items: PickerItemState[] = [];

    for (const channel of sorted) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "x2tg-picker__item";
        item.setAttribute("role", "option");

        if (channel.id === lastUsedChannelId) {
            item.classList.add("x2tg-picker__item--recent");
        }

        const label = document.createElement("span");
        label.className = "x2tg-picker__label";
        label.textContent = channel.label;

        item.appendChild(label);

        item.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            closeChannelPicker();
            onSelect(channel);
        });

        picker.appendChild(item);
        items.push({ channel, element: item });
    }

    overlay.appendChild(picker);
    document.body.appendChild(overlay);

    activeOverlay = overlay;

    let activeIndex = 0;

    const setActiveItem = (index: number): void => {
        if (items.length === 0) {
            return;
        }

        const normalizedIndex = (index + items.length) % items.length;

        items[activeIndex]?.element.classList.remove("x2tg-picker__item--active");
        activeIndex = normalizedIndex;
        items[activeIndex].element.classList.add("x2tg-picker__item--active");
        items[activeIndex].element.scrollIntoView?.({ block: "nearest" });
    };

    setActiveItem(0);

    outsideClickHandler = (event: MouseEvent) => {
        const target = event.target as Node | null;

        if (!target || picker.contains(target)) {
            return;
        }

        closeChannelPicker();
    };

    keyboardHandler = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
            event.preventDefault();
            closeChannelPicker();
            return;
        }

        if (items.length === 0) {
            return;
        }

        if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveItem(activeIndex + 1);
            return;
        }

        if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveItem(activeIndex - 1);
            return;
        }

        if (event.key === "Enter") {
            event.preventDefault();
            closeChannelPicker();
            onSelect(items[activeIndex].channel);
        }
    };

    window.setTimeout(() => {
        if (outsideClickHandler) {
            document.addEventListener("click", outsideClickHandler, true);
        }
    }, 0);

    document.addEventListener("keydown", keyboardHandler, true);
}

/**
 * Closes the active channel picker if present.
 */
export function closeChannelPicker(): void {
    if (activeOverlay) {
        activeOverlay.remove();
        activeOverlay = null;
    }

    if (outsideClickHandler) {
        document.removeEventListener("click", outsideClickHandler, true);
        outsideClickHandler = null;
    }

    if (keyboardHandler) {
        document.removeEventListener("keydown", keyboardHandler, true);
        keyboardHandler = null;
    }
}
