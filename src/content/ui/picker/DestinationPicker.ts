import { X } from "lucide-static";
import { AccountFeeds, AccountFeedsStatus } from "./AccountFeeds";
import type { DialogsPortFactory } from "./DialogsConnection";
import {
    buildPickerSections,
    getAvatarKey,
    getPeerAvatarKey,
    PickerSectionId,
    type PickerItem,
    type PickerSection
} from "./PickerModel";
import { applyAvatar, applyPickerRowState, createPickerRow, PickerPinToggleClass } from "./PickerRow";
import { PickerPinnedRowClass, PinnedReorder } from "./PinnedReorder";
import { capturePickerSendGhost } from "./SendMorph";
import { sendRuntimeMessage } from "../../../core/extension/ExtensionContext";
import { t } from "../../../core/i18n/I18n";
import { createLucideSvgElement } from "../../../core/ui/LucideIcon";
import { getAccountConnections } from "../../../core/storage/Connections";
import { movePinnedRef, savePinnedDestinations, togglePinnedDestination, togglePinnedRef } from "../../../core/storage/Storage";
import type { ExtensionConfig } from "../../../core/types/Config";
import {
    MaxDestinationsPerSend,
    MaxPinnedDestinations,
    getDestinationRefKey,
    type DestinationRef
} from "../../../core/types/DestinationRef";
import { RuntimeMessageType, type ChannelPhotoResponse } from "../../../core/types/Messages";
import { SocialPlatformId } from "../../../platforms/types";

const SEARCH_DEBOUNCE_MS = 250;
const RENDER_BATCH = 80;
const SCROLL_LOAD_THRESHOLD_PX = 120;
const KEY_EVENTS = ["keydown", "keyup", "keypress"] as const;
const SEND_SHORTCUT_LABEL = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ Enter" : "Ctrl+Enter";

/** Footer notice replacing the selection summary until the next selection change. */
enum FooterNotice {
    NONE = "NONE",
    SELECTION_LIMIT = "SELECTION_LIMIT",
    PIN_LIMIT = "PIN_LIMIT"
}

/** A destination chosen in the picker. */
export interface PickedDestination {
    ref: DestinationRef;
    label: string;
}

/** Options for {@link showDestinationPicker}. */
export interface DestinationPickerOptions {
    config: ExtensionConfig;
    platformId?: SocialPlatformId;
    /** Called once with one or more destinations (in selection order). */
    onSend(destinations: PickedDestination[]): void;
    /** Overrides the dialogs port of each Telegram account (tests). */
    connectDialogs?: DialogsPortFactory;
    /** Overrides how bot channel photos are loaded (tests). */
    loadChannelPhoto?: (channelId: string) => Promise<string | null>;
    /** Overrides how a pin to the top is saved (tests). */
    savePinToggle?: (ref: DestinationRef) => Promise<unknown>;
    /** Overrides how a new pin order is saved (tests). */
    savePinOrder?: (refs: DestinationRef[]) => Promise<unknown>;
}

/** Avatars survive across picker openings for the page lifetime, keyed by {@link getAvatarKey}. */
const avatarCache = new Map<string, string | null>();
const requestedAvatars = new Set<string>();

let activePicker: DestinationPickerView | null = null;

/**
 * Opens the destination picker: search bar, Recent / Bot channels / Telegram account sections,
 * live Telegram chats, and multi-select with a "Send to N" action.
 */
export function showDestinationPicker(options: DestinationPickerOptions): void {
    closeDestinationPicker();
    activePicker = new DestinationPickerView(options);
}

/**
 * Closes the picker if open; the selection is discarded.
 */
export function closeDestinationPicker(): void {
    activePicker?.destroy();
    activePicker = null;
}

class DestinationPickerView {
    private readonly options: DestinationPickerOptions;
    private readonly overlay: HTMLElement;
    private readonly picker: HTMLElement;
    private readonly searchInput: HTMLInputElement;
    private readonly list: HTMLElement;
    private readonly footer: HTMLElement;
    private readonly footerCount: HTMLElement;
    private readonly sendButton: HTMLButtonElement;
    private readonly accounts: AccountFeeds;
    private readonly reorder: PinnedReorder;
    /** Keys of the visible Pinned rows, in order (for Alt+Arrow moves). */
    private pinnedRowKeys: string[] = [];
    private renderPending = false;
    private readonly selection = new Map<string, PickedDestination>();
    private readonly rows = new Map<string, HTMLElement>();
    private flatItems: PickerItem[] = [];
    private activeKey: string | null = null;
    private query = "";
    private searchTimer: ReturnType<typeof setTimeout> | null = null;
    private renderLimit = RENDER_BATCH;
    private notice = FooterNotice.NONE;
    private pinned: DestinationRef[];
    private readonly keyHandler = (event: KeyboardEvent): void => this.handleKey(event);
    private readonly outsideClickHandler = (event: MouseEvent): void => this.handleOutsideClick(event);

    public constructor(options: DestinationPickerOptions) {
        this.options = options;
        this.pinned = options.config.pinnedDestinations;
        this.overlay = document.createElement("div");
        this.overlay.className = "x2tg-picker-overlay";

        this.picker = document.createElement("div");
        this.picker.className = "x2tg-picker x2tg-picker--destinations";
        this.picker.setAttribute("role", "dialog");
        this.picker.setAttribute("aria-modal", "true");
        this.picker.setAttribute("aria-label", t("pickerTitle"));

        if (options.platformId === SocialPlatformId.FACEBOOK) {
            this.overlay.classList.add("x2tg-picker-overlay--facebook");
            this.picker.classList.add("x2tg-picker--facebook");
        }

        const title = document.createElement("div");

        title.className = "x2tg-picker__title";
        title.textContent = t("pickerTitle");

        const header = document.createElement("div");
        const closeButton = document.createElement("button");

        header.className = "x2tg-picker__header";
        closeButton.type = "button";
        closeButton.className = "x2tg-picker__close";
        closeButton.title = t("pickerClose");
        closeButton.setAttribute("aria-label", t("pickerClose"));
        closeButton.appendChild(createLucideSvgElement(X, 16));
        closeButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            closeDestinationPicker();
        });
        header.append(title, closeButton);

        this.searchInput = document.createElement("input");
        this.searchInput.type = "search";
        this.searchInput.className = "x2tg-picker__search";
        this.searchInput.placeholder = t("pickerSearchPlaceholder");
        this.searchInput.setAttribute("aria-label", t("pickerSearchPlaceholder"));
        this.searchInput.autocomplete = "off";
        this.searchInput.addEventListener("input", () => this.handleQueryChange());

        this.list = document.createElement("div");
        this.list.className = "x2tg-picker__list";
        this.list.setAttribute("role", "listbox");
        this.list.setAttribute("aria-multiselectable", "true");
        this.list.addEventListener("scroll", () => this.handleScroll());

        this.footer = document.createElement("div");
        this.footer.className = "x2tg-picker__footer";
        this.footerCount = document.createElement("span");
        this.footerCount.className = "x2tg-picker__count";
        this.sendButton = document.createElement("button");
        this.sendButton.type = "button";
        this.sendButton.className = "x2tg-picker__send";
        this.sendButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.sendSelection();
        });
        this.footer.append(this.footerCount, this.sendButton);

        this.picker.append(header, this.searchInput, this.list, this.footer);
        this.overlay.appendChild(this.picker);
        document.body.appendChild(this.overlay);

        this.reorder = new PinnedReorder(this.list, {
            onMove: (fromKey, toKey) => this.movePin(fromKey, toKey),
            onDragEnd: () => {
                if (this.renderPending) {
                    this.render();
                }
            }
        });

        this.accounts = new AccountFeeds(getAccountConnections(options.config).map((connection) => connection.id), {
            onChange: () => this.render(),
            onAvatar: (connectionId, peerId, dataUrl) => {
                const avatarKey = getPeerAvatarKey(connectionId, peerId);

                // The account caches chats without a photo itself, so asking again on a later render is cheap
                // and lets a failed download recover.
                if (!dataUrl) {
                    requestedAvatars.delete(avatarKey);
                    return;
                }

                this.handleAvatar(avatarKey, dataUrl);
            }
        }, options.connectDialogs);

        this.render();
        this.searchInput.focus();

        for (const type of KEY_EVENTS) {
            window.addEventListener(type, this.keyHandler, true);
        }

        window.setTimeout(() => {
            if (activePicker === this) {
                document.addEventListener("click", this.outsideClickHandler, true);
            }
        }, 0);
    }

    public destroy(): void {
        this.accounts.close();
        this.reorder.destroy();
        this.overlay.remove();

        if (this.searchTimer) {
            clearTimeout(this.searchTimer);
        }

        for (const type of KEY_EVENTS) {
            window.removeEventListener(type, this.keyHandler, true);
        }

        document.removeEventListener("click", this.outsideClickHandler, true);
    }

    private render(): void {
        // Rebuilding rows mid-drag would drop the row under the pointer; catch up on drop.
        if (this.reorder.dragging) {
            this.renderPending = true;
            return;
        }

        this.renderPending = false;

        const sections = buildPickerSections({
            channels: this.options.config.channels,
            recentDestinations: this.options.config.recentDestinations,
            pinnedDestinations: this.pinned,
            connections: this.options.config.connections,
            accounts: this.accounts.feeds,
            query: this.query
        });
        const scrollTop = this.list.scrollTop;
        const fragment = document.createDocumentFragment();
        let budget = this.renderLimit;

        this.rows.clear();
        this.flatItems = [];
        this.pinnedRowKeys = [];

        for (const section of sections) {
            const visible = section.items.slice(0, Math.max(0, budget));

            budget -= visible.length;

            if (visible.length === 0) {
                continue;
            }

            fragment.appendChild(this.createSectionTitle(section));

            for (const item of visible) {
                const row = this.createRow(item);

                if (section.id === PickerSectionId.PINNED) {
                    row.classList.add(PickerPinnedRowClass);
                    this.pinnedRowKeys.push(item.key);
                }

                fragment.appendChild(row);
                this.flatItems.push(item);
            }
        }

        const status = this.describeStatus(sections);

        if (status) {
            const statusEl = document.createElement("div");

            statusEl.className = "x2tg-picker__status";
            statusEl.textContent = status;
            fragment.appendChild(statusEl);
        }

        this.list.replaceChildren(fragment);
        this.list.scrollTop = scrollTop;

        if (!this.activeKey || !this.rows.has(this.activeKey)) {
            this.activeKey = this.flatItems[0]?.key ?? null;
        }

        this.refreshRowStates();
        this.refreshFooter();
    }

    private createSectionTitle(section: PickerSection): HTMLElement {
        const titleEl = document.createElement("div");
        const titles: Record<PickerSectionId, string> = {
            [PickerSectionId.PINNED]: t("pickerSectionPinned"),
            [PickerSectionId.RECENT]: t("pickerSectionRecent"),
            [PickerSectionId.BOT_CHANNELS]: t("pickerSectionBotChannels"),
            [PickerSectionId.TELEGRAM_ACCOUNT]: t("pickerSectionTelegramAccount")
        };

        titleEl.className = "x2tg-picker__section-title";
        titleEl.textContent = titles[section.id];
        return titleEl;
    }

    private createRow(item: PickerItem): HTMLElement {
        const avatarKey = getAvatarKey(item);
        const row = createPickerRow(item, {
            selected: this.selection.has(item.key),
            active: false,
            pinnedToTop: this.isPinned(item.key),
            avatarUrl: avatarKey ? avatarCache.get(avatarKey) : undefined
        });

        if (avatarKey && !requestedAvatars.has(avatarKey)) {
            this.requestAvatar(item, avatarKey);
        }

        row.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();

            // The drop re-renders rows, so the release click can land on this detached row.
            if (this.reorder.endingDrag) {
                return;
            }

            if (event.target instanceof Element && event.target.closest(`.${PickerPinToggleClass}`)) {
                this.togglePin(item);
            } else {
                this.toggle(item);
            }
        });

        this.rows.set(item.key, row);
        return row;
    }

    private describeStatus(sections: PickerSection[]): string | null {
        const status = this.accounts.status;

        if (status === AccountFeedsStatus.CONNECTING) {
            return t("pickerConnecting");
        }

        if (status === AccountFeedsStatus.SIGNED_OUT) {
            return t("pickerSignInHint");
        }

        if (this.accounts.searchPending) {
            return t("pickerSearching");
        }

        if (typeof navigator !== "undefined" && navigator.onLine === false && status !== AccountFeedsStatus.NONE) {
            return t("pickerOffline");
        }

        if (status === AccountFeedsStatus.LOADING) {
            return t("pickerLoadingChats");
        }

        if (sections.length === 0) {
            return this.query ? t("pickerNoResults") : t("pickerEmpty");
        }

        return null;
    }

    private refreshRowStates(): void {
        for (const [key, row] of this.rows) {
            applyPickerRowState(row, { selected: this.selection.has(key), active: key === this.activeKey, pinnedToTop: this.isPinned(key) });
        }

        if (this.activeKey) {
            this.rows.get(this.activeKey)?.scrollIntoView?.({ block: "nearest" });
        }
    }

    private refreshFooter(): void {
        const count = this.selection.size;

        this.footerCount.textContent = describeFooter(count, this.notice);
        this.sendButton.disabled = count === 0;
        this.sendButton.textContent = count > 0 ? t("pickerSendToSelected", String(count)) : t("pickerSend");
        this.sendButton.title = SEND_SHORTCUT_LABEL;
    }

    private toggle(item: PickerItem): void {
        if (this.selection.has(item.key)) {
            this.selection.delete(item.key);
            this.notice = FooterNotice.NONE;
        } else
        if (this.selection.size >= MaxDestinationsPerSend) {
            this.notice = FooterNotice.SELECTION_LIMIT;
        } else {
            this.selection.set(item.key, toPicked(item));
            this.notice = FooterNotice.NONE;
        }

        this.activeKey = item.key;
        this.refreshRowStates();
        this.refreshFooter();
    }

    private isPinned(key: string): boolean {
        return this.pinned.some((ref) => getDestinationRefKey(ref) === key);
    }

    /**
     * Pins the row to the top (or unpins it) right away, then saves it for the next pickers.
     */
    private togglePin(item: PickerItem): void {
        const next = togglePinnedRef(this.pinned, item.ref);

        if (next === this.pinned) {
            this.notice = FooterNotice.PIN_LIMIT;
            this.refreshFooter();
            return;
        }

        const save = this.options.savePinToggle ?? togglePinnedDestination;

        this.pinned = next;
        this.notice = FooterNotice.NONE;
        this.activeKey = item.key;
        this.render();
        void save(item.ref).catch((err: unknown) => console.debug("[picker] pin save failed: %O", err));
    }

    /**
     * Moves a pinned row into another pinned row's slot and saves the new order.
     */
    private movePin(fromKey: string, toKey: string): void {
        const next = movePinnedRef(this.pinned, fromKey, toKey);

        if (next === this.pinned) {
            return;
        }

        const save = this.options.savePinOrder ?? savePinnedDestinations;

        this.pinned = next;
        this.activeKey = fromKey;
        this.render();
        void save(next).catch((err: unknown) => console.debug("[picker] pin order save failed: %O", err));
    }

    private sendSelection(): void {
        if (this.selection.size > 0) {
            this.send(Array.from(this.selection.values()));
        }
    }

    private send(destinations: PickedDestination[]): void {
        const onSend = this.options.onSend;
        const ghost = capturePickerSendGhost(this.overlay, this.picker);

        closeDestinationPicker();
        // onSend creates the progress toast synchronously, so the ghost can land on it right away.
        onSend(destinations);
        ghost?.land();
    }

    private moveActive(delta: number): void {
        if (this.flatItems.length === 0) {
            return;
        }

        const index = this.flatItems.findIndex((item) => item.key === this.activeKey);
        const next = (Math.max(0, index) + delta + this.flatItems.length) % this.flatItems.length;

        this.activeKey = this.flatItems[index === -1 ? 0 : next].key;
        this.refreshRowStates();
    }

    private handleKey(event: KeyboardEvent): void {
        event.stopPropagation();

        if (event.type !== "keydown") {
            return;
        }

        const activeItem = this.flatItems.find((item) => item.key === this.activeKey);

        if (event.key === "Escape") {
            event.preventDefault();
            closeDestinationPicker();
        } else
        if ((event.key === "ArrowDown" || event.key === "ArrowUp") && event.altKey) {
            event.preventDefault();

            const index = this.activeKey ? this.pinnedRowKeys.indexOf(this.activeKey) : -1;
            const neighbor = index === -1 ? undefined : this.pinnedRowKeys[index + (event.key === "ArrowDown" ? 1 : -1)];

            if (this.activeKey && neighbor) {
                this.movePin(this.activeKey, neighbor);
            }
        } else
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            this.moveActive(event.key === "ArrowDown" ? 1 : -1);
        } else
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();

            if (this.selection.size > 0) {
                this.sendSelection();
            } else
            if (activeItem) {
                this.send([toPicked(activeItem)]);
            }
        } else
        if (event.key === "Enter" && !event.isComposing) {
            event.preventDefault();

            if (activeItem) {
                this.toggle(activeItem);
            }
        } else
        if (event.key === " " && activeItem && (!this.query || event.target !== this.searchInput)) {
            event.preventDefault();
            this.toggle(activeItem);
        }
    }

    private handleOutsideClick(event: MouseEvent): void {
        const target = event.target as Node | null;

        // Releasing a drag outside the picker clicks the page; that must not close it.
        if (target && !this.picker.contains(target) && !this.reorder.endingDrag) {
            closeDestinationPicker();
        }
    }

    private handleQueryChange(): void {
        this.query = this.searchInput.value;
        this.renderLimit = RENDER_BATCH;
        this.activeKey = null;
        this.accounts.clearSearch();

        if (this.searchTimer) {
            clearTimeout(this.searchTimer);
            this.searchTimer = null;
        }

        const trimmed = this.query.trim();

        if (this.accounts.canSearch && trimmed.length >= 2) {
            this.accounts.markSearchPending();
            this.searchTimer = setTimeout(() => {
                this.searchTimer = null;
                this.accounts.search(trimmed);
            }, SEARCH_DEBOUNCE_MS);
        }

        this.render();
    }

    private requestAvatar(item: PickerItem, avatarKey: string): void {
        if (item.avatarPeerId !== undefined) {
            if (item.hasAvatar && item.avatarConnectionId !== undefined) {
                requestedAvatars.add(avatarKey);
                this.accounts.requestAvatar(item.avatarConnectionId, item.avatarPeerId);
            }

            return;
        }

        if (item.avatarChannelId !== undefined) {
            const loadPhoto = this.options.loadChannelPhoto ?? requestChannelPhoto;

            requestedAvatars.add(avatarKey);
            void loadPhoto(item.avatarChannelId).then((dataUrl) => this.handleAvatar(avatarKey, dataUrl));
        }
    }

    private handleAvatar(avatarKey: string, dataUrl: string | null): void {
        avatarCache.set(avatarKey, dataUrl);

        if (!dataUrl) {
            return;
        }

        for (const avatar of Array.from(this.list.querySelectorAll(`[data-avatar-key="${avatarKey}"]`))) {
            const row = avatar.closest(".x2tg-picker__item");

            if (row instanceof HTMLElement) {
                applyAvatar(row, dataUrl);
            }
        }
    }

    private handleScroll(): void {
        const remaining = this.list.scrollHeight - this.list.scrollTop - this.list.clientHeight;

        if (remaining < SCROLL_LOAD_THRESHOLD_PX && this.flatItems.length >= this.renderLimit) {
            this.renderLimit += RENDER_BATCH;
            this.render();
        }
    }
}

function toPicked(item: PickerItem): PickedDestination {
    return { ref: item.ref, label: item.title };
}

function describeFooter(count: number, notice: FooterNotice): string {
    if (notice === FooterNotice.SELECTION_LIMIT) {
        return t("pickerSelectionLimit", String(MaxDestinationsPerSend));
    }

    if (notice === FooterNotice.PIN_LIMIT) {
        return t("pickerPinLimit", String(MaxPinnedDestinations));
    }

    if (count === 0) {
        return t("pickerSelectHint", SEND_SHORTCUT_LABEL);
    }

    const selected = count === 1 ? t("pickerSelectedOne") : t("pickerSelectedCount", String(count));

    return `${selected} · ${t("pickerSendShortcut", SEND_SHORTCUT_LABEL)}`;
}

async function requestChannelPhoto(channelId: string): Promise<string | null> {
    try {
        const response = await sendRuntimeMessage<ChannelPhotoResponse>({ type: RuntimeMessageType.GET_CHANNEL_PHOTO, channelId });

        return response?.dataUrl ?? null;
    } catch (err) {
        console.debug("[picker] channel photo request failed: %O", err);
        return null;
    }
}

/**
 * Stable dedupe key for a set of destinations (order-insensitive).
 */
export function getDestinationsKey(destinations: PickedDestination[]): string {
    return destinations.map((destination) => getDestinationRefKey(destination.ref)).sort().join("|");
}
