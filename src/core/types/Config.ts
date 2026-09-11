/** A Telegram channel configured by the user. */
export interface TelegramChannel {
    id: string;
    label: string;
    chatId: string;
}

/** Extension settings persisted in chrome.storage.sync. */
export interface ExtensionConfig {
    botToken: string;
    channels: TelegramChannel[];
    lastUsedChannelId?: string;
}

/** Default empty configuration. */
export const DefaultExtensionConfig: ExtensionConfig = {
    botToken: "",
    channels: []
};
