import type { DetectedTelegramChannel } from "../core/telegram/DiscoverChannels";
import { applyChannelRowI18n, applyOptionsPageI18n } from "../core/i18n/ApplyOptionsPageI18n";
import { t } from "../core/i18n/I18n";
import {
    createEmptyChannel,
    isChannelValid,
    loadConfig,
    saveConfig
} from "../core/storage/Storage";
import { TelegramClient } from "../core/telegram/TelegramClient";
import type { ExtensionConfig, TelegramChannel } from "../core/types/Config";

interface ChannelRowState {
    id: string;
    element: HTMLElement;
    labelInput: HTMLInputElement;
    chatIdInput: HTMLInputElement;
    statusEl: HTMLElement;
}

const botTokenInput = document.getElementById("bot-token") as HTMLInputElement;
const botStatusEl = document.getElementById("bot-status") as HTMLElement;
const channelsListEl = document.getElementById("channels-list") as HTMLElement;
const saveStatusEl = document.getElementById("save-status") as HTMLElement;
const discoverStatusEl = document.getElementById("discover-status") as HTMLElement;
const discoveredChannelsEl = document.getElementById("discovered-channels") as HTMLElement;
const channelTemplate = document.getElementById("channel-row-template") as HTMLTemplateElement;

const channelRows: ChannelRowState[] = [];

void init();

async function init(): Promise<void> {
    applyOptionsPageI18n();

    const config = await loadConfig();
    botTokenInput.value = config.botToken;

    if (config.channels.length === 0) {
        addChannelRow(createEmptyChannel());
    } else {
        for (const channel of config.channels) {
            addChannelRow(channel);
        }
    }

    document.getElementById("add-channel")?.addEventListener("click", () => {
        addChannelRow(createEmptyChannel());
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
}

function addChannelRow(channel: TelegramChannel): void {
    const fragment = channelTemplate.content.cloneNode(true) as DocumentFragment;
    applyChannelRowI18n(fragment);

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

function removeChannelRow(rowState: ChannelRowState): void {
    const index = channelRows.indexOf(rowState);

    if (index === -1) {
        return;
    }

    channelRows.splice(index, 1);
    rowState.element.remove();

    if (channelRows.length === 0) {
        addChannelRow(createEmptyChannel());
    }
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
}

async function handleTestBot(): Promise<void> {
    const token = botTokenInput.value.trim();

    if (!token) {
        setStatus(botStatusEl, t("optionsEnterBotToken"), "error");
        return;
    }

    await saveConfig({
        ...(await loadConfig()),
        botToken: token
    });

    setStatus(botStatusEl, t("optionsValidatingToken"), "info");

    const client = new TelegramClient(token);
    const response = await client.getMe();

    if (!response?.ok) {
        setStatus(botStatusEl, response?.error ?? t("optionsInvalidToken"), "error");
        return;
    }

    setStatus(botStatusEl, t("optionsValidToken"), "success");
}

function readConfigFromForm(): ExtensionConfig {
    return {
        botToken: botTokenInput.value.trim(),
        channels: channelRows.map((row) => ({
            id: row.id,
            label: row.labelInput.value.trim(),
            chatId: row.chatIdInput.value.trim()
        }))
    };
}

async function handleSave(): Promise<void> {
    const config = readConfigFromForm();
    const validChannels = config.channels.filter(isChannelValid);

    if (!config.botToken) {
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
        channels: config.channels.filter((channel) => channel.label || channel.chatId || isChannelValid(channel)),
        lastUsedChannelId: existing.lastUsedChannelId
    });

    setStatus(saveStatusEl, t("optionsSavedSuccess"), "success");
}

async function handleDiscoverChannels(): Promise<void> {
    const token = botTokenInput.value.trim();

    if (!token) {
        setStatus(discoverStatusEl, t("optionsEnterTokenBeforeDiscover"), "error");
        return;
    }

    await saveConfig({
        ...(await loadConfig()),
        botToken: token
    });

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
        return;
    }

    addChannelRow({
        id: crypto.randomUUID(),
        label: channel.title,
        chatId: channel.chatId
    });
}

async function handleTestChannel(rowState: ChannelRowState): Promise<void> {
    const label = rowState.labelInput.value.trim();
    const chatId = rowState.chatIdInput.value.trim();

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

    const client = new TelegramClient(config.botToken);
    const response = await client.sendTestMessage(chatId);

    if (!response?.ok) {
        setStatus(rowState.statusEl, response?.error ?? t("optionsTestFailed"), "error");
        return;
    }

    setStatus(rowState.statusEl, t("optionsTestSent", [label, chatId]), "success");
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
