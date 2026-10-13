import { Bot, Check, Megaphone, Pin, UserRound, Users } from "lucide-static";
import { createTelegramIconElement } from "../../icons/TelegramIcon";
import { createLucideSvgElement } from "../../../core/ui/LucideIcon";
import { t } from "../../../core/i18n/I18n";
import { SendConnectionType } from "../../../core/types/Config";
import { TelegramPeerKind } from "../../../core/types/DestinationRef";
import { getAvatarKey, isTelegramPickerItem, type PickerFolderTag, type PickerItem, type PickerRoute } from "./PickerModel";

/** Class of the per-row "pin to top" toggle; clicks on it must not toggle the selection. */
export const PickerPinToggleClass = "x2tg-picker__pin-toggle";

/** Row state that changes without rebuilding the row. */
export interface PickerRowState {
    selected: boolean;
    active: boolean;
    /** Pinned to the top of the picker by the user. */
    pinnedToTop: boolean;
    avatarUrl?: string | null;
}

/**
 * Builds a destination row: selection checkbox, avatar (with a Telegram badge), title, the bot or
 * account it is sent through, Telegram badges (pinned, folder tags), and a "pin to top" toggle.
 */
export function createPickerRow(item: PickerItem, state: PickerRowState): HTMLButtonElement {
    const row = document.createElement("button");

    row.type = "button";
    row.className = "x2tg-picker__item";
    row.setAttribute("role", "option");
    row.dataset.key = item.key;

    const check = document.createElement("span");

    check.className = "x2tg-picker__check";
    check.setAttribute("role", "checkbox");
    check.title = t("pickerToggleSelection");
    check.appendChild(createLucideSvgElement(Check, 12));
    row.appendChild(check);

    row.appendChild(createLeadingVisual(item, state.avatarUrl));

    const text = document.createElement("span");
    const label = document.createElement("span");

    text.className = "x2tg-picker__text";
    label.className = "x2tg-picker__label";
    label.textContent = item.title;
    text.appendChild(createTitleLine(item, label));

    if (item.route) {
        text.appendChild(createMeta(item.route));
    }

    if (item.pinnedInTelegram || (item.folderTags?.length ?? 0) > 0) {
        text.appendChild(createBadges(Boolean(item.pinnedInTelegram), item.folderTags ?? []));
    }

    row.appendChild(text);

    const pinToggle = document.createElement("span");

    pinToggle.className = PickerPinToggleClass;
    pinToggle.setAttribute("role", "button");
    pinToggle.appendChild(createLucideSvgElement(Pin, 14));
    row.appendChild(pinToggle);

    applyPickerRowState(row, state);

    return row;
}

/**
 * Updates selection and active styling of an existing row.
 */
export function applyPickerRowState(row: HTMLElement, state: Pick<PickerRowState, "selected" | "active" | "pinnedToTop">): void {
    const pinLabel = state.pinnedToTop ? t("pickerUnpinFromTop") : t("pickerPinToTop");
    const pinToggle = row.querySelector(`.${PickerPinToggleClass}`);

    row.classList.toggle("x2tg-picker__item--active", state.active);
    row.classList.toggle("x2tg-picker__item--selected", state.selected);
    row.classList.toggle("x2tg-picker__item--pinned", state.pinnedToTop);
    row.setAttribute("aria-selected", String(state.selected));
    row.querySelector(".x2tg-picker__check")?.setAttribute("aria-checked", String(state.selected));
    pinToggle?.setAttribute("aria-pressed", String(state.pinnedToTop));
    pinToggle?.setAttribute("aria-label", pinLabel);
    pinToggle?.setAttribute("title", pinLabel);
}

/** Icon and tooltip shown before the title of group, channel and bot chats, like Telegram does. */
const KindIcons: Partial<Record<TelegramPeerKind, { icon: string; titleKey: string }>> = {
    [TelegramPeerKind.GROUP]: { icon: Users, titleKey: "pickerKindGroup" },
    [TelegramPeerKind.CHANNEL]: { icon: Megaphone, titleKey: "pickerKindChannel" },
    [TelegramPeerKind.BOT]: { icon: Bot, titleKey: "pickerKindBot" }
};

/**
 * First line of a row: the chat kind icon (groups, channels, bots) and the title.
 */
function createTitleLine(item: PickerItem, label: HTMLElement): HTMLElement {
    const kind = item.peerKind ? KindIcons[item.peerKind] : undefined;

    if (!kind) {
        return label;
    }

    const line = document.createElement("span");
    const icon = document.createElement("span");

    line.className = "x2tg-picker__title-line";
    icon.className = "x2tg-picker__kind-icon";
    icon.title = t(kind.titleKey);
    icon.appendChild(createLucideSvgElement(kind.icon, 14));
    line.append(icon, label);

    return line;
}

/**
 * Second line of a row: route icon and "Telegram account · Name".
 */
function createMeta(route: PickerRoute): HTMLElement {
    const meta = document.createElement("span");
    const icon = document.createElement("span");
    const label = document.createElement("span");

    meta.className = "x2tg-picker__meta";
    icon.className = "x2tg-picker__route-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.appendChild(createLucideSvgElement(route.type === SendConnectionType.TELEGRAM_BOT ? Bot : UserRound, 12));
    label.className = "x2tg-picker__route";
    label.textContent = route.label;
    meta.append(icon, label);

    return meta;
}

/**
 * Badge line, styled like Telegram's chat list: "Pinned in Telegram" first, then the colored
 * tags of the folders holding the chat.
 */
function createBadges(pinnedInTelegram: boolean, tags: PickerFolderTag[]): HTMLElement {
    const badges = document.createElement("span");

    badges.className = "x2tg-picker__badges";

    if (pinnedInTelegram) {
        const pin = document.createElement("span");
        const pinText = document.createElement("span");

        pin.className = "x2tg-picker__badge x2tg-picker__badge--tg-pin";
        pin.title = t("pickerPinned");
        pinText.textContent = t("pickerPinnedShort");
        pin.append(createLucideSvgElement(Pin, 10), pinText);
        badges.appendChild(pin);
    }

    for (const tag of tags) {
        const badge = document.createElement("span");

        badge.className = `x2tg-picker__badge x2tg-picker__badge--${tag.color.toLowerCase()}`;
        badge.title = t("pickerFolderTag", tag.title);
        badge.textContent = tag.title;
        badges.appendChild(badge);
    }

    return badges;
}

/**
 * Swaps the initials placeholder for the loaded photo.
 */
export function applyAvatar(row: HTMLElement, dataUrl: string): void {
    const avatar = row.querySelector(".x2tg-picker__avatar");

    if (!avatar || avatar.querySelector("img")) {
        return;
    }

    const image = document.createElement("img");

    image.src = dataUrl;
    image.alt = "";
    avatar.textContent = "";
    avatar.appendChild(image);
}

function createLeadingVisual(item: PickerItem, avatarUrl: string | null | undefined): Element {
    const avatar = document.createElement("span");
    const avatarKey = getAvatarKey(item);

    avatar.className = "x2tg-picker__avatar";
    avatar.setAttribute("aria-hidden", "true");

    if (avatarKey) {
        avatar.dataset.avatarKey = avatarKey;
    }

    avatar.textContent = getInitials(item.title);

    if (avatarUrl) {
        const image = document.createElement("img");

        image.src = avatarUrl;
        image.alt = "";
        avatar.textContent = "";
        avatar.appendChild(image);
    }

    if (!isTelegramPickerItem(item)) {
        return avatar;
    }

    const wrap = document.createElement("span");
    const badge = document.createElement("span");

    wrap.className = "x2tg-picker__avatar-wrap";
    badge.className = "x2tg-picker__avatar-badge";
    badge.title = t("pickerTelegramBadge");
    badge.appendChild(createTelegramIconElement(16));
    wrap.append(avatar, badge);

    return wrap;
}

function getInitials(title: string): string {
    const words = title.trim().split(/\s+/).filter(Boolean);
    const letters = words.slice(0, 2).map((word) => Array.from(word)[0] ?? "");

    return letters.join("").toUpperCase() || "?";
}
