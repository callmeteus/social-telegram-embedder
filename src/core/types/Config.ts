import type { DestinationRef, RecentDestination } from "./DestinationRef";

/** Messaging services that can receive posts. */
export enum DestinationProvider {
    TELEGRAM = "TELEGRAM",
    DISCORD = "DISCORD"
}

/** Kinds of send connection the user can add on the options page. */
export enum SendConnectionType {
    /** A Telegram bot (token from @BotFather) with its own list of destinations. */
    TELEGRAM_BOT = "TELEGRAM_BOT",
    /** A Telegram user account (MTProto) that sends to any chat it can write to. */
    TELEGRAM_ACCOUNT = "TELEGRAM_ACCOUNT"
}

/** A Telegram bot the user added. */
export interface TelegramBotConnection {
    id: string;
    type: SendConnectionType.TELEGRAM_BOT;
    botToken: string;
    /** Bot username cached after the token is validated (without "@"). */
    username: string;
}

/**
 * A Telegram account logged in on this device. Only non-secret state lives here; the session
 * and the api credentials stay in chrome.storage.local and IndexedDB on this device only.
 */
export interface TelegramAccountConnection {
    id: string;
    type: SendConnectionType.TELEGRAM_ACCOUNT;
    /** Cached account name shown before the client connects. */
    displayName: string;
    /** Telegram user id, used to refuse adding the same account twice. */
    accountId?: number;
}

/** Any send connection, discriminated by `type`. */
export type SendConnection = TelegramBotConnection | TelegramAccountConnection;

/** Fields shared by every destination channel, regardless of provider. */
interface BaseDestinationChannel {
    id: string;
    label: string;
}

/** A Telegram channel or chat a bot posts to. */
export interface TelegramDestinationChannel extends BaseDestinationChannel {
    provider: DestinationProvider.TELEGRAM;
    chatId: string;
    /** The bot connection that sends here. */
    connectionId: string;
}

/** A Discord channel reached through an incoming webhook. */
export interface DiscordDestinationChannel extends BaseDestinationChannel {
    provider: DestinationProvider.DISCORD;
    webhookUrl: string;
}

/** Any destination channel, discriminated by `provider`. */
export type DestinationChannel = TelegramDestinationChannel | DiscordDestinationChannel;

/** Current schema version of the persisted configuration. */
export const CurrentConfigVersion = 4;

/** Extension settings persisted in chrome.storage.sync. */
export interface ExtensionConfig {
    version: number;
    /** Bots and accounts, in the order shown on the options page. */
    connections: SendConnection[];
    channels: DestinationChannel[];
    /** Newest first, capped at MaxRecentDestinations. */
    recentDestinations: RecentDestination[];
    /** Destinations the user pinned to the top of the picker, in pin order. */
    pinnedDestinations: DestinationRef[];
}

/**
 * Builds a fresh default configuration (new object every call, safe to mutate).
 */
export function createDefaultExtensionConfig(): ExtensionConfig {
    return {
        version: CurrentConfigVersion,
        connections: [],
        channels: [],
        recentDestinations: [],
        pinnedDestinations: []
    };
}
