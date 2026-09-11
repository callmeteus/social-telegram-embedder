import type { TelegramChannel } from "../../core/types/Config";
import { t } from "../../core/i18n/I18n";
import { sortChannelsForPicker } from "../../core/storage/Storage";

let activePicker: HTMLElement | null = null;
let outsideClickHandler: ((event: MouseEvent) => void) | null = null;
let escapeHandler: ((event: KeyboardEvent) => void) | null = null;

/**
 * Shows a channel picker anchored to a button element.
 */
export function showChannelPicker(
    anchor: HTMLElement,
    channels: TelegramChannel[],
    lastUsedChannelId: string | undefined,
    onSelect: (channel: TelegramChannel) => void
): void {
    closeChannelPicker();

    const sorted = sortChannelsForPicker(channels, lastUsedChannelId);
    const picker = document.createElement("div");
    picker.className = "x2tg-picker";
    picker.setAttribute("role", "menu");

    const title = document.createElement("div");
    title.className = "x2tg-picker__title";
    title.textContent = t("pickerTitle");
    picker.appendChild(title);

    for (const channel of sorted) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "x2tg-picker__item";
        item.setAttribute("role", "menuitem");

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
    }

    document.body.appendChild(picker);
    positionPicker(picker, anchor);
    activePicker = picker;

    outsideClickHandler = (event: MouseEvent) => {
        const target = event.target as Node | null;

        if (!target || picker.contains(target) || anchor.contains(target)) {
            return;
        }

        closeChannelPicker();
    };

    escapeHandler = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
            closeChannelPicker();
        }
    };

    window.setTimeout(() => {
        if (outsideClickHandler) {
            document.addEventListener("click", outsideClickHandler, true);
        }
    }, 0);

    document.addEventListener("keydown", escapeHandler, true);
}

/**
 * Closes the active channel picker if present.
 */
export function closeChannelPicker(): void {
    if (activePicker) {
        activePicker.remove();
        activePicker = null;
    }

    if (outsideClickHandler) {
        document.removeEventListener("click", outsideClickHandler, true);
        outsideClickHandler = null;
    }

    if (escapeHandler) {
        document.removeEventListener("keydown", escapeHandler, true);
        escapeHandler = null;
    }
}

function positionPicker(picker: HTMLElement, anchor: HTMLElement): void {
    const rect = anchor.getBoundingClientRect();
    const pickerRect = picker.getBoundingClientRect();
    const top = rect.bottom + window.scrollY + 8;
    let left = rect.left + window.scrollX - pickerRect.width + rect.width;

    if (left < 8) {
        left = 8;
    }

    const maxLeft = window.innerWidth - pickerRect.width - 8;

    if (left > maxLeft) {
        left = maxLeft;
    }

    picker.style.top = `${top}px`;
    picker.style.left = `${left}px`;
}
