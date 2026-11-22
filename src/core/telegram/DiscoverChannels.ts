import { normalizeTelegramTopicId } from "./NormalizeTopicId";

/**
 * A channel or forum topic discovered from Telegram bot updates.
 */
export interface DetectedTelegramChannel {
    chatId: string;
    title: string;
    username?: string;
    /** Set when the destination is a forum topic inside the chat. */
    topicId?: number;
    /** Topic name from the update, or the topic id as a fallback. */
    topicTitle?: string;
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
    is_forum?: boolean;
}

/** Telegram message object subset from Bot API updates. */
export interface TelegramMessageSnapshot {
    chat: TelegramChatSnapshot;
    message_thread_id?: number;
    forum_topic_created?: { name?: string };
}

/** Telegram update object subset from Bot API. */
export interface TelegramUpdateSnapshot {
    update_id: number;
    message?: TelegramMessageSnapshot;
    edited_message?: TelegramMessageSnapshot;
    channel_post?: TelegramMessageSnapshot;
    edited_channel_post?: TelegramMessageSnapshot;
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
 * Map key for a detected destination. Topics sharing a chat need distinct keys.
 */
export function getDetectedChannelKey(channel: Pick<DetectedTelegramChannel, "chatId" | "topicId">): string {
    return channel.topicId === undefined ? channel.chatId : `${channel.chatId}:${channel.topicId}`;
}

/**
 * Label shown in the options and picker for a detected destination.
 */
export function formatDetectedChannelTitle(channel: DetectedTelegramChannel): string {
    return channel.topicTitle ? `${channel.title} · ${channel.topicTitle}` : channel.title;
}

/**
 * Collects channels and forum topics from a Telegram update into the map.
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

    const messages = [
        update.message,
        update.edited_message
    ];

    for (const message of messages) {
        if (!message?.chat.is_forum) {
            continue;
        }

        const topicId = normalizeTelegramTopicId(message.message_thread_id);

        if (topicId === undefined) {
            continue;
        }

        const chatId = resolveTelegramChatId(message.chat);
        const title = message.chat.title?.trim() || chatId;
        const topicTitle = message.forum_topic_created?.name?.trim() || String(topicId);
        const topic: DetectedTelegramChannel = {
            chatId,
            title,
            topicId,
            topicTitle
        };

        channels.set(getDetectedChannelKey(topic), topic);
    }
}

/**
 * Sorts detected channels alphabetically by their display title.
 */
export function sortDetectedChannels(
    channels: DetectedTelegramChannel[]
): DetectedTelegramChannel[] {
    return [...channels].sort((left, right) =>
        formatDetectedChannelTitle(left).localeCompare(formatDetectedChannelTitle(right), "pt-BR"));
}
