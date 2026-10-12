import type { DetectedTelegramChannel } from "../core/telegram/DiscoverChannels";
import { applyChannelRowI18n, applyOptionsPageI18n } from "../core/i18n/ApplyOptionsPageI18n";
import { t } from "../core/i18n/I18n";
import { setButtonLucideIcon } from "../core/ui/LucideIcon";
import { ArrowDown, ArrowUp } from "lucide-static";
import {
    createEmptyTelegramChannel,
    isChannelValid,
    loadConfig,
    saveConfig
} from "../core/storage/Storage";
import { normalizeTelegramChatId } from "../core/telegram/NormalizeChatId";
import { TelegramClient } from "../core/telegram/TelegramClient";
import {
    CurrentConfigVersion,
    DestinationProvider,
    type DestinationChannel,
    type ExtensionConfig,
    type TelegramDestinationChannel
} from "../core/types/Config";

interface ChannelRowState {
    id: string;
    element: HTMLElement;
    labelInput: HTMLInputElement;
    chatIdInput: HTMLInputElement;
    statusEl: HTMLElement;
}

const botTokenInput = document.getElementById("bot-token") as HTMLInputElement;
const botStatusEl = document.getElementById("bot-status") as HTMLElement;
const channelsSectionEl = document.getElementById("channels-section") as HTMLElement;
const channelsListEl = document.getElementById("channels-list") as HTMLElement;
const saveStatusEl = document.getElementById("save-status") as HTMLElement;
const discoverStatusEl = document.getElementById("discover-status") as HTMLElement;
const discoveredChannelsEl = document.getElementById("discovered-channels") as HTMLElement;
const channelTemplate = document.getElementById("channel-row-template") as HTMLTemplateElement;

const channelRows: ChannelRowState[] = [];
const saveDockEl = document.getElementById("save-dock") as HTMLElement;

/** Channels of providers this page cannot edit yet; kept untouched on save. */
let otherProviderChannels: DestinationChannel[] = [];

let savedConfigSnapshot = "";
let dirtyTrackingEnabled = false;
let verifiedBotToken = "";

void init();

async function init(): Promise<void> {
    applyToolbarPopupLayoutIfNeeded();
    applyOptionsPageI18n();

    const config = await loadConfig();
    const botToken = config.providers.telegram.botToken;
    botTokenInput.value = botToken;
    setChannelsSectionVisible(false);

    const telegramChannels = config.channels.filter(isTelegramChannel);
    otherProviderChannels = config.channels.filter((channel) => !isTelegramChannel(channel));

    if (telegramChannels.length === 0) {
        addChannelRow(createEmptyTelegramChannel());
    } else {
        for (const channel of telegramChannels) {
            addChannelRow(channel);
        }
    }

    document.getElementById("add-channel")?.addEventListener("click", () => {
        addChannelRow(createEmptyTelegramChannel());
    });

    document.getElementById("save-config")?.addEventListener("click", () => {
        void handleSave();
    });

    document.getElementById("test-bot")?.addEventListener("click", () => {
        void handleTestBot();
    });

    document.getElementById("discover-channels")?.addEventListener("click", () => {
        void handleDiscoverChannels();
    });

    botTokenInput.addEventListener("input", () => {
        syncBotTokenVerificationGate();
    });

    if (botToken.trim()) {
        void verifyBotToken(botToken.trim(), { persistToken: false });
    }

    savedConfigSnapshot = serializeConfigSnapshot(readConfigFromForm());
    wireDirtyStateTracking();
    dirtyTrackingEnabled = true;
    syncDirtyState();
}

function isTelegramChannel(channel: DestinationChannel): channel is TelegramDestinationChannel {
    return channel.provider === DestinationProvider.TELEGRAM;
}

function addChannelRow(channel: TelegramDestinationChannel): void {
    const fragment = channelTemplate.content.cloneNode(true) as DocumentFragment;
    applyChannelRowI18n(fragment);
    wireChannelRowIcons(fragment);

    const element = fragment.querySelector(".channel-row") as HTMLElement;
    const labelInput = fragment.querySelector(".channel-label") as HTMLInputElement;
    const chatIdInput = fragment.querySelector(".channel-chat-id") as HTMLInputElement;
    const statusEl = fragment.querySelector(".channel-row__status") as HTMLElement;

    labelInput.value = channel.label;
    chatIdInput.value = channel.chatId;

    const rowState: ChannelRowState = {
        id: channel.id,
        element,
        labelInput,
        chatIdInput,
        statusEl
    };

    fragment.querySelector(".btn-remove-channel")?.addEventListener("click", () => {
        removeChannelRow(rowState);
    });

    fragment.querySelector(".btn-move-up")?.addEventListener("click", () => {
        moveChannelRow(rowState, -1);
    });

    fragment.querySelector(".btn-move-down")?.addEventListener("click", () => {
        moveChannelRow(rowState, 1);
    });

    fragment.querySelector(".btn-test-channel")?.addEventListener("click", () => {
        void handleTestChannel(rowState);
    });

    channelRows.push(rowState);
    channelsListEl.appendChild(fragment);
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

function removeChannelRow(rowState: ChannelRowState): void {
    const index = channelRows.indexOf(rowState);

    if (index === -1) {
        return;
    }

    channelRows.splice(index, 1);
    rowState.element.remove();

    if (channelRows.length === 0) {
        addChannelRow(createEmptyTelegramChannel());
    }

    syncDirtyState();
}

function moveChannelRow(rowState: ChannelRowState, direction: -1 | 1): void {
    const index = channelRows.indexOf(rowState);
    const targetIndex = index + direction;

    if (index === -1 || targetIndex < 0 || targetIndex >= channelRows.length) {
        return;
    }

    const [removed] = channelRows.splice(index, 1);
    channelRows.splice(targetIndex, 0, removed);

    channelsListEl.innerHTML = "";

    for (const row of channelRows) {
        channelsListEl.appendChild(row.element);
    }

    syncDirtyState();
}

async function handleTestBot(): Promise<void> {
    const token = botTokenInput.value.trim();

    if (!token) {
        setStatus(botStatusEl, t("optionsEnterBotToken"), "error");
        setChannelsSectionVisible(false);
        verifiedBotToken = "";
        return;
    }

    await saveTelegramBotToken(token);

    await verifyBotToken(token, { persistToken: true });
}

async function verifyBotToken(
    token: string,
    options: { persistToken: boolean }
): Promise<boolean> {
    setStatus(botStatusEl, t("optionsValidatingToken"), "info");

    const client = new TelegramClient(token);
    const response = await client.getMe();

    if (!response?.ok) {
        setStatus(botStatusEl, response?.error ?? t("optionsInvalidToken"), "error");
        setChannelsSectionVisible(false);
        verifiedBotToken = "";
        return false;
    }

    if (options.persistToken) {
        await saveTelegramBotToken(token);
    }

    verifiedBotToken = token;
    setChannelsSectionVisible(true);
    setStatus(botStatusEl, t("optionsValidToken"), "success");
    return true;
}

function syncBotTokenVerificationGate(): void {
    const token = botTokenInput.value.trim();

    if (!token) {
        verifiedBotToken = "";
        setChannelsSectionVisible(false);
        return;
    }

    if (token === verifiedBotToken) {
        setChannelsSectionVisible(true);
        return;
    }

    setChannelsSectionVisible(false);
}

function setChannelsSectionVisible(visible: boolean): void {
    channelsSectionEl.hidden = !visible;

    if (!visible) {
        setStatus(discoverStatusEl, "", "info");
        discoveredChannelsEl.innerHTML = "";
    }
}

async function saveTelegramBotToken(botToken: string): Promise<void> {
    const config = await loadConfig();

    await saveConfig({
        ...config,

        providers: {
            ...config.providers,
            telegram: { botToken }
        }
    });
}

function readTelegramChannelsFromForm(): TelegramDestinationChannel[] {
    return channelRows.map((row) => ({
        id: row.id,
        label: row.labelInput.value.trim(),
        provider: DestinationProvider.TELEGRAM,
        chatId: normalizeTelegramChatId(row.chatIdInput.value)
    }));
}

function readConfigFromForm(): ExtensionConfig {
    return {
        version: CurrentConfigVersion,

        providers: {
            telegram: {
                botToken: botTokenInput.value.trim()
            }
        },

        channels: [...readTelegramChannelsFromForm(), ...otherProviderChannels]
    };
}

async function handleSave(): Promise<void> {
    const config = readConfigFromForm();
    const telegramChannels = readTelegramChannelsFromForm();
    const validChannels = telegramChannels.filter(isChannelValid);

    if (!config.providers.telegram.botToken) {
        setStatus(saveStatusEl, t("optionsEnterTokenBeforeSave"), "error");
        return;
    }

    if (validChannels.length === 0) {
        setStatus(saveStatusEl, t("optionsNeedChannelBeforeSave"), "error");
        return;
    }

    const existing = await loadConfig();

    await saveConfig({
        ...config,
        channels: [
            ...telegramChannels.filter((channel) => channel.label || channel.chatId || isChannelValid(channel)),
            ...otherProviderChannels
        ],
        lastUsedChannelId: existing.lastUsedChannelId
    });

    setStatus(saveStatusEl, t("optionsSavedSuccess"), "success");
    savedConfigSnapshot = serializeConfigSnapshot(readConfigFromForm());
    syncDirtyState();
}

async function handleDiscoverChannels(): Promise<void> {
    const token = botTokenInput.value.trim();

    if (!token) {
        setStatus(discoverStatusEl, t("optionsEnterTokenBeforeDiscover"), "error");
        return;
    }

    await saveTelegramBotToken(token);

    discoveredChannelsEl.innerHTML = "";
    setStatus(discoverStatusEl, t("optionsDiscoveringChannels"), "info");

    const client = new TelegramClient(token);
    const response = await client.discoverChannels();

    if (!response?.ok) {
        setStatus(discoverStatusEl, response?.error ?? t("optionsDiscoverFailed"), "error");
        return;
    }

    if (response.warning) {
        setStatus(discoverStatusEl, response.warning, "info");
    } else {
        setStatus(
            discoverStatusEl,
            t("optionsChannelsFound", String(response.channels?.length ?? 0)),
            "success"
        );
    }

    renderDiscoveredChannels(response.channels ?? []);
}

function renderDiscoveredChannels(channels: DetectedTelegramChannel[]): void {
    discoveredChannelsEl.innerHTML = "";

    for (const channel of channels) {
        const item = document.createElement("div");
        item.className = "discovered-item";

        const info = document.createElement("div");
        info.className = "discovered-item__info";

        const title = document.createElement("span");
        title.className = "discovered-item__title";
        title.textContent = channel.title;

        const chatId = document.createElement("span");
        chatId.className = "discovered-item__chat-id";
        chatId.textContent = channel.chatId;

        info.appendChild(title);
        info.appendChild(chatId);

        const addButton = document.createElement("button");
        addButton.type = "button";
        addButton.className = "btn btn--secondary";
        addButton.textContent = isChannelAlreadyListed(channel.chatId)
            ? t("optionsAlreadyAdded")
            : t("optionsAddDetectedChannel");
        addButton.disabled = isChannelAlreadyListed(channel.chatId);

        addButton.addEventListener("click", () => {
            addDetectedChannel(channel);
            addButton.disabled = true;
            addButton.textContent = t("optionsAlreadyAdded");
            setStatus(discoverStatusEl, t("optionsChannelAdded", channel.title), "success");
        });

        item.appendChild(info);
        item.appendChild(addButton);
        discoveredChannelsEl.appendChild(item);
    }
}

function isChannelAlreadyListed(chatId: string): boolean {
    const normalized = chatId.trim().toLowerCase();

    return channelRows.some((row) => row.chatIdInput.value.trim().toLowerCase() === normalized);
}

function addDetectedChannel(channel: DetectedTelegramChannel): void {
    if (isChannelAlreadyListed(channel.chatId)) {
        return;
    }

    const emptyRow = channelRows.find((row) => !row.labelInput.value.trim() && !row.chatIdInput.value.trim());

    if (emptyRow) {
        emptyRow.labelInput.value = channel.title;
        emptyRow.chatIdInput.value = channel.chatId;
        syncDirtyState();
        return;
    }

    addChannelRow({
        id: crypto.randomUUID(),
        label: channel.title,
        provider: DestinationProvider.TELEGRAM,
        chatId: channel.chatId
    });

    syncDirtyState();
}

async function handleTestChannel(rowState: ChannelRowState): Promise<void> {
    const label = rowState.labelInput.value.trim();
    const chatId = normalizeTelegramChatId(rowState.chatIdInput.value);

    rowState.chatIdInput.value = chatId;

    if (!label || !chatId) {
        setStatus(rowState.statusEl, t("optionsFillBeforeTest"), "error");
        return;
    }

    const config = readConfigFromForm();
    await saveConfig({
        ...config,
        lastUsedChannelId: (await loadConfig()).lastUsedChannelId
    });

    setStatus(rowState.statusEl, t("optionsSendingTest"), "info");

    const client = new TelegramClient(config.providers.telegram.botToken);
    const response = await client.sendTestMessage(chatId);

    if (!response?.ok) {
        setStatus(rowState.statusEl, response?.error ?? t("optionsTestFailed"), "error");
        return;
    }

    setStatus(rowState.statusEl, t("optionsTestSent", [label, chatId]), "success");
}

/**
 * Applies compact layout when the options UI is shown in the toolbar popup.
 */
function wireDirtyStateTracking(): void {
    const page = document.querySelector(".page");

    page?.addEventListener("input", () => {
        syncDirtyState();
    });

    page?.addEventListener("change", () => {
        syncDirtyState();
    });
}

function serializeConfigSnapshot(config: ExtensionConfig): string {
    return JSON.stringify({
        botToken: config.providers.telegram.botToken.trim(),
        channels: config.channels.filter(isTelegramChannel).map((channel) => ({
            id: channel.id,
            label: channel.label.trim(),
            chatId: normalizeTelegramChatId(channel.chatId)
        }))
    });
}

function syncDirtyState(): void {
    if (!dirtyTrackingEnabled) {
        return;
    }

    const isDirty = serializeConfigSnapshot(readConfigFromForm()) !== savedConfigSnapshot;

    saveDockEl.hidden = !isDirty;
    document.body.classList.toggle("x2tg-options--dirty", isDirty);
}

function applyToolbarPopupLayoutIfNeeded(): void {
    if (!isExtensionToolbarPopup()) {
        return;
    }

    document.documentElement.classList.add("x2tg-options--popup");
}

function isExtensionToolbarPopup(): boolean {
    const params = new URLSearchParams(window.location.search);

    if (params.get("popup") === "1") {
        return true;
    }

    if (params.get("popup") === "0") {
        return false;
    }

    return window.innerWidth > 0 && window.innerWidth < 560;
}

function setStatus(
    element: HTMLElement,
    message: string,
    variant: "success" | "error" | "info"
): void {
    element.textContent = message;
    element.classList.remove("status--success", "status--error");

    if (variant === "success") {
        element.classList.add("status--success");
    } else
    if (variant === "error") {
        element.classList.add("status--error");
    }
}
