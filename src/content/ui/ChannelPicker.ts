import type { TelegramChannel } from "../../core/types/Config";
import { t } from "../../core/i18n/I18n";
import { sortChannelsForPicker } from "../../core/storage/Storage";
import { SocialPlatformId } from "../../platforms/types";

let activeOverlay: HTMLElement | null = null;
let outsideClickHandler: ((event: MouseEvent) => void) | null = null;
let escapeHandler: ((event: KeyboardEvent) => void) | null = null;

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
    picker.setAttribute("role", "dialog");
    picker.setAttribute("aria-modal", "true");

    if (platformId === SocialPlatformId.FACEBOOK) {
        picker.classList.add("x2tg-picker--facebook");
    }

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

    overlay.appendChild(picker);
    document.body.appendChild(overlay);

    activeOverlay = overlay;

    outsideClickHandler = (event: MouseEvent) => {
        const target = event.target as Node | null;

        if (!target || picker.contains(target)) {
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
    if (activeOverlay) {
        activeOverlay.remove();
        activeOverlay = null;
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
