import { ArrowDown, ArrowUp } from "lucide-static";
import { formatDestinationCount } from "./ConnectionsList";
import { applyChannelRowI18n } from "../core/i18n/ApplyOptionsPageI18n";
import { t } from "../core/i18n/I18n";
import { findBotConnection, formatConnectionName, getBotConnections, withConnection } from "../core/storage/Connections";
import {
    createEmptyTelegramChannel,
    isChannelValid,
    loadConfig,
    removeConnection,
    saveConfig
} from "../core/storage/Storage";
import type { DetectedTelegramChannel } from "../core/telegram/DiscoverChannels";
import { normalizeTelegramChatId } from "../core/telegram/NormalizeChatId";
import { TelegramClient } from "../core/telegram/TelegramClient";
import {
    DestinationProvider,
    SendConnectionType,
    type TelegramBotConnection,
    type TelegramDestinationChannel
} from "../core/types/Config";
import { setButtonLucideIcon } from "../core/ui/LucideIcon";

/** Visual tone of a status line. */
export enum StatusVariant {
    SUCCESS = "SUCCESS",
    ERROR = "ERROR",
    INFO = "INFO"
}

/** Callbacks of the bot editor. */
export interface BotConnectionEditorHandlers {
    /** The bot was removed; the page goes back to the list. */
    onRemoved(): void;
}

/** Handle returned by {@link initBotConnectionEditor}. */
export interface BotConnectionEditor {
    /** Loads a bot into the form; an id with no saved bot starts a new one. */
    open(connectionId: string): Promise<void>;
    /** Forgets unsaved edits and hides the save dock. */
    close(): void;
    /** True when token or destinations differ from what is saved. */
    isDirty(): boolean;
}

interface ChannelRowState {
    id: string;
    element: HTMLElement;
    labelInput: HTMLInputElement;
    chatIdInput: HTMLInputElement;
    statusEl: HTMLElement;
}

interface BotElements {
    section: HTMLElement;
    title: HTMLElement;
    summary: HTMLElement;
    tokenInput: HTMLInputElement;
    botStatus: HTMLElement;
    channelsSection: HTMLElement;
    channelsList: HTMLElement;
    discoverStatus: HTMLElement;
    discovered: HTMLElement;
    danger: HTMLElement;
    saveDock: HTMLElement;
    saveStatus: HTMLElement;
    channelTemplate: HTMLTemplateElement;
}

/**
 * Sets the text and tone of a status line.
 */
export function setStatus(element: HTMLElement, message: string, variant: StatusVariant): void {
    element.textContent = message;
    element.classList.remove("status--success", "status--error");

    if (variant === StatusVariant.SUCCESS) {
        element.classList.add("status--success");
    } else
    if (variant === StatusVariant.ERROR) {
        element.classList.add("status--error");
    }
}

/**
 * Wires the bot detail screen: token validation, destinations (add, reorder, test, find),
 * the save dock for unsaved edits, and removing the bot.
 */
export function initBotConnectionEditor(handlers: BotConnectionEditorHandlers): BotConnectionEditor | null {
    const elements = queryElements();

    if (!elements) {
        return null;
    }

    const el = elements;
    const rows: ChannelRowState[] = [];
    let connectionId = "";
    let saved: TelegramBotConnection | null = null;
    let savedToken = "";
    let savedChannels = "";
    let verifiedToken = "";
    let openRequest = 0;

    const readChannels = (): TelegramDestinationChannel[] => rows.map((row) => ({
        id: row.id,
        label: row.labelInput.value.trim(),
        provider: DestinationProvider.TELEGRAM,
        chatId: normalizeTelegramChatId(row.chatIdInput.value),
        connectionId
    }));

    const serializeChannels = (): string => JSON.stringify(readChannels()
        .map((channel) => ({ id: channel.id, label: channel.label, chatId: channel.chatId })));

    const markSaved = (): void => {
        savedToken = el.tokenInput.value.trim();
        savedChannels = serializeChannels();
    };

    const isDirty = (): boolean => !el.section.hidden
        && (el.tokenInput.value.trim() !== savedToken || serializeChannels() !== savedChannels);

    const renderHeader = (): void => {
        el.title.textContent = saved ? formatConnectionName(saved) : t("optionsNewBotTitle");
        el.summary.hidden = !saved;
        el.summary.textContent = formatDestinationCount(readChannels().filter(isChannelValid).length);
        el.danger.hidden = !saved;
    };

    const syncDirty = (): void => {
        const dirty = isDirty();

        renderHeader();
        // Bot edits use the save dock; account login has its own actions.
        el.saveDock.hidden = !dirty;
        document.body.classList.toggle("x2tg-options--dirty", dirty);
    };

    const setChannelsVisible = (visible: boolean): void => {
        el.channelsSection.hidden = !visible;

        if (!visible) {
            setStatus(el.discoverStatus, "", StatusVariant.INFO);
            el.discovered.replaceChildren();
        }
    };

    const addRow = (channel: TelegramDestinationChannel): void => {
        const fragment = el.channelTemplate.content.cloneNode(true) as DocumentFragment;

        applyChannelRowI18n(fragment);
        wireChannelRowIcons(fragment);

        const row: ChannelRowState = {
            id: channel.id,
            element: fragment.querySelector(".channel-row") as HTMLElement,
            labelInput: fragment.querySelector(".channel-label") as HTMLInputElement,
            chatIdInput: fragment.querySelector(".channel-chat-id") as HTMLInputElement,
            statusEl: fragment.querySelector(".channel-row__status") as HTMLElement
        };

        row.labelInput.value = channel.label;
        row.chatIdInput.value = channel.chatId;

        fragment.querySelector(".btn-remove-channel")?.addEventListener("click", () => removeRow(row));
        fragment.querySelector(".btn-move-up")?.addEventListener("click", () => moveRow(row, -1));
        fragment.querySelector(".btn-move-down")?.addEventListener("click", () => moveRow(row, 1));
        fragment.querySelector(".btn-test-channel")?.addEventListener("click", () => {
            void testChannel(row);
        });

        rows.push(row);
        el.channelsList.appendChild(fragment);
    };

    const removeRow = (row: ChannelRowState): void => {
        const index = rows.indexOf(row);

        if (index === -1) {
            return;
        }

        rows.splice(index, 1);
        row.element.remove();

        if (rows.length === 0) {
            addRow(createEmptyTelegramChannel(connectionId));
        }

        syncDirty();
    };

    const moveRow = (row: ChannelRowState, direction: -1 | 1): void => {
        const index = rows.indexOf(row);
        const targetIndex = index + direction;

        if (index === -1 || targetIndex < 0 || targetIndex >= rows.length) {
            return;
        }

        const [removed] = rows.splice(index, 1);

        rows.splice(targetIndex, 0, removed);
        el.channelsList.replaceChildren(...rows.map((entry) => entry.element));
        syncDirty();
    };

    /**
     * Writes the bot (token and username) without touching its destinations.
     */
    const persistConnection = async (botToken: string, username: string): Promise<void> => {
        const connection: TelegramBotConnection = { id: connectionId, type: SendConnectionType.TELEGRAM_BOT, botToken, username };

        await saveConfig(withConnection(await loadConfig(), connection));
        saved = connection;
        savedToken = botToken;
    };

    const verifyToken = async (token: string, persist: boolean): Promise<boolean> => {
        const request = openRequest;

        setStatus(el.botStatus, t("optionsValidatingToken"), StatusVariant.INFO);

        const response = await new TelegramClient(token).getMe();

        if (request !== openRequest) {
            return false;
        }

        if (!response?.ok) {
            setStatus(el.botStatus, response?.error ?? t("optionsInvalidToken"), StatusVariant.ERROR);
            setChannelsVisible(false);
            verifiedToken = "";
            return false;
        }

        const username = response.username ?? "";

        if (persist || (saved && saved.botToken === token && saved.username !== username)) {
            await persistConnection(token, username);
        }

        verifiedToken = token;
        setChannelsVisible(true);
        setStatus(el.botStatus, t("optionsValidToken"), StatusVariant.SUCCESS);
        syncDirty();
        return true;
    };

    const handleValidate = async (): Promise<void> => {
        const token = el.tokenInput.value.trim();

        if (!token) {
            setStatus(el.botStatus, t("optionsEnterBotToken"), StatusVariant.ERROR);
            setChannelsVisible(false);
            verifiedToken = "";
            return;
        }

        const config = await loadConfig();
        const duplicate = getBotConnections(config).some((bot) => bot.id !== connectionId && bot.botToken === token);

        if (duplicate) {
            setStatus(el.botStatus, t("optionsBotAlreadyAdded"), StatusVariant.ERROR);
            return;
        }

        await verifyToken(token, true);
    };

    const syncTokenGate = (): void => {
        const token = el.tokenInput.value.trim();

        setChannelsVisible(Boolean(token) && token === verifiedToken);
    };

    const handleSave = async (): Promise<void> => {
        const token = el.tokenInput.value.trim();

        if (!token) {
            setStatus(el.saveStatus, t("optionsEnterTokenBeforeSave"), StatusVariant.ERROR);
            return;
        }

        if (token !== verifiedToken || !saved) {
            setStatus(el.saveStatus, t("optionsValidateBeforeSave"), StatusVariant.ERROR);
            return;
        }

        const channels = readChannels().filter((channel) => channel.label || channel.chatId);
        const config = await loadConfig();
        const others = config.channels.filter((channel) => channel.provider !== DestinationProvider.TELEGRAM || channel.connectionId !== connectionId);

        await saveConfig({
            ...withConnection(config, { ...saved, botToken: token }),
            channels: [...others, ...channels]
        });

        saved = { ...saved, botToken: token };
        markSaved();
        setStatus(el.saveStatus, t("optionsSavedSuccess"), StatusVariant.SUCCESS);
        syncDirty();
    };

    const testChannel = async (row: ChannelRowState): Promise<void> => {
        const label = row.labelInput.value.trim();
        const chatId = normalizeTelegramChatId(row.chatIdInput.value);

        row.chatIdInput.value = chatId;

        if (!label || !chatId) {
            setStatus(row.statusEl, t("optionsFillBeforeTest"), StatusVariant.ERROR);
            return;
        }

        setStatus(row.statusEl, t("optionsSendingTest"), StatusVariant.INFO);

        const response = await new TelegramClient(el.tokenInput.value.trim()).sendTestMessage(chatId);

        if (!response?.ok) {
            setStatus(row.statusEl, response?.error ?? t("optionsTestFailed"), StatusVariant.ERROR);
            return;
        }

        setStatus(row.statusEl, t("optionsTestSent", [label, chatId]), StatusVariant.SUCCESS);
        syncDirty();
    };

    const isListed = (chatId: string): boolean => {
        const normalized = chatId.trim().toLowerCase();

        return rows.some((row) => row.chatIdInput.value.trim().toLowerCase() === normalized);
    };

    const addDetected = (channel: DetectedTelegramChannel): void => {
        if (isListed(channel.chatId)) {
            return;
        }

        const emptyRow = rows.find((row) => !row.labelInput.value.trim() && !row.chatIdInput.value.trim());

        if (emptyRow) {
            emptyRow.labelInput.value = channel.title;
            emptyRow.chatIdInput.value = channel.chatId;
        } else {
            addRow({ ...createEmptyTelegramChannel(connectionId), label: channel.title, chatId: channel.chatId });
        }

        syncDirty();
    };

    const handleDiscover = async (): Promise<void> => {
        const token = el.tokenInput.value.trim();

        if (!token) {
            setStatus(el.discoverStatus, t("optionsEnterTokenBeforeDiscover"), StatusVariant.ERROR);
            return;
        }

        el.discovered.replaceChildren();
        setStatus(el.discoverStatus, t("optionsDiscoveringChannels"), StatusVariant.INFO);

        const response = await new TelegramClient(token).discoverChannels();

        if (!response?.ok) {
            setStatus(el.discoverStatus, response?.error ?? t("optionsDiscoverFailed"), StatusVariant.ERROR);
            return;
        }

        if (response.warning) {
            setStatus(el.discoverStatus, response.warning, StatusVariant.INFO);
        } else {
            setStatus(el.discoverStatus, t("optionsChannelsFound", String(response.channels?.length ?? 0)), StatusVariant.SUCCESS);
        }

        el.discovered.replaceChildren(...(response.channels ?? []).map((channel) => createDiscoveredItem(channel, isListed(channel.chatId), () => {
            addDetected(channel);
            setStatus(el.discoverStatus, t("optionsChannelAdded", channel.title), StatusVariant.SUCCESS);
        })));
    };

    const handleRemove = async (): Promise<void> => {
        if (!saved || !window.confirm(t("optionsRemoveBotConfirm", formatConnectionName(saved)))) {
            return;
        }

        await removeConnection(connectionId);
        saved = null;
        markSaved();
        syncDirty();
        handlers.onRemoved();
    };

    document.getElementById("add-channel")?.addEventListener("click", () => {
        addRow(createEmptyTelegramChannel(connectionId));
        syncDirty();
    });
    document.getElementById("save-config")?.addEventListener("click", () => {
        void handleSave();
    });
    document.getElementById("test-bot")?.addEventListener("click", () => {
        void handleValidate();
    });
    document.getElementById("discover-channels")?.addEventListener("click", () => {
        void handleDiscover();
    });
    document.getElementById("bot-remove")?.addEventListener("click", () => {
        void handleRemove();
    });
    el.tokenInput.addEventListener("input", syncTokenGate);
    el.section.addEventListener("input", syncDirty);
    el.section.addEventListener("change", syncDirty);

    return {
        async open(id: string): Promise<void> {
            const request = ++openRequest;
            const config = await loadConfig();

            if (request !== openRequest) {
                return;
            }

            connectionId = id;
            saved = findBotConnection(config, id) ?? null;
            verifiedToken = saved?.botToken ?? "";
            el.tokenInput.value = verifiedToken;
            rows.length = 0;
            el.channelsList.replaceChildren();

            const channels = config.channels.filter((channel): channel is TelegramDestinationChannel =>
                channel.provider === DestinationProvider.TELEGRAM && channel.connectionId === id);

            for (const channel of channels.length > 0 ? channels : [createEmptyTelegramChannel(id)]) {
                addRow(channel);
            }

            setStatus(el.botStatus, "", StatusVariant.INFO);
            setStatus(el.saveStatus, "", StatusVariant.INFO);
            setChannelsVisible(Boolean(verifiedToken));
            markSaved();
            syncDirty();

            if (saved?.botToken) {
                void verifyToken(saved.botToken, false);
            } else {
                el.tokenInput.focus();
            }
        },

        close(): void {
            openRequest++;
            markSaved();
            el.saveDock.hidden = true;
            document.body.classList.remove("x2tg-options--dirty");
        },

        isDirty
    };
}

function createDiscoveredItem(channel: DetectedTelegramChannel, listed: boolean, onAdd: () => void): HTMLElement {
    const item = document.createElement("div");
    const info = document.createElement("div");
    const title = document.createElement("span");
    const chatId = document.createElement("span");
    const addButton = document.createElement("button");

    item.className = "discovered-item";
    info.className = "discovered-item__info";
    title.className = "discovered-item__title";
    title.textContent = channel.title;
    chatId.className = "discovered-item__chat-id";
    chatId.textContent = channel.chatId;
    info.append(title, chatId);

    addButton.type = "button";
    addButton.className = "btn btn--secondary";
    addButton.textContent = listed ? t("optionsAlreadyAdded") : t("optionsAddDetectedChannel");
    addButton.disabled = listed;
    addButton.addEventListener("click", () => {
        onAdd();
        addButton.disabled = true;
        addButton.textContent = t("optionsAlreadyAdded");
    });

    item.append(info, addButton);
    return item;
}

function wireChannelRowIcons(root: ParentNode): void {
    const moveUpButton = root.querySelector(".btn-move-up");

    if (moveUpButton instanceof HTMLButtonElement) {
        setButtonLucideIcon(moveUpButton, ArrowUp);
    }

    const moveDownButton = root.querySelector(".btn-move-down");

    if (moveDownButton instanceof HTMLButtonElement) {
        setButtonLucideIcon(moveDownButton, ArrowDown);
    }
}

function queryElements(): BotElements | null {
    const byId = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;
    const section = byId("bot-section");

    if (!section) {
        return null;
    }

    return {
        section,
        title: byId("bot-section-title")!,
        summary: byId("bot-summary")!,
        tokenInput: byId<HTMLInputElement>("bot-token")!,
        botStatus: byId("bot-status")!,
        channelsSection: byId("channels-section")!,
        channelsList: byId("channels-list")!,
        discoverStatus: byId("discover-status")!,
        discovered: byId("discovered-channels")!,
        danger: byId("bot-danger")!,
        saveDock: byId("save-dock")!,
        saveStatus: byId("save-status")!,
        channelTemplate: byId<HTMLTemplateElement>("channel-row-template")!
    };
}
