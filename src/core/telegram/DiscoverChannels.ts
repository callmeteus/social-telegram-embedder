/**
 * A channel discovered from Telegram bot updates.
 */
export interface DetectedTelegramChannel {
    chatId: string;
    title: string;
    username?: string;
}

/** Result of listing channels from bot updates. */
export interface DiscoverChannelsResult {
    ok: boolean;
    channels?: DetectedTelegramChannel[];
    error?: string;
    warning?: string;
}

/** Telegram chat object subset from Bot API updates. */
export interface TelegramChatSnapshot {
    id: number;
    type: string;
    title?: string;
    username?: string;
}

/** Telegram update object subset from Bot API. */
export interface TelegramUpdateSnapshot {
    update_id: number;
    message?: { chat: TelegramChatSnapshot };
    edited_message?: { chat: TelegramChatSnapshot };
    channel_post?: { chat: TelegramChatSnapshot };
    edited_channel_post?: { chat: TelegramChatSnapshot };
    my_chat_member?: { chat: TelegramChatSnapshot };
}

/**
 * Resolves the chat_id string used by sendMessage.
 */
export function resolveTelegramChatId(chat: TelegramChatSnapshot): string {
    if (chat.username) {
        return `@${chat.username}`;
    }

    return String(chat.id);
}

/**
 * Collects channel chats from a Telegram update into the map.
 */
export function collectChannelsFromUpdate(
    update: TelegramUpdateSnapshot,
    channels: Map<string, DetectedTelegramChannel>
): void {
    const chats = [
        update.message?.chat,
        update.edited_message?.chat,
        update.channel_post?.chat,
        update.edited_channel_post?.chat,
        update.my_chat_member?.chat
    ];

    for (const chat of chats) {
        if (!chat || chat.type !== "channel") {
            continue;
        }

        const chatId = resolveTelegramChatId(chat);
        const title = chat.title?.trim() || chatId;

        channels.set(chatId, {
            chatId,
            title,
            username: chat.username
        });
    }
}

/**
 * Sorts detected channels alphabetically by title.
 */
export function sortDetectedChannels(
    channels: DetectedTelegramChannel[]
): DetectedTelegramChannel[] {
    return [...channels].sort((left, right) => left.title.localeCompare(right.title, "pt-BR"));
}
