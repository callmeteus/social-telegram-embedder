/** Kinds of Telegram chats reachable from the user account. */
export enum TelegramPeerKind {
    USER = "USER",
    BOT = "BOT",
    GROUP = "GROUP",
    CHANNEL = "CHANNEL"
}

/** How a destination is addressed in a send request. */
export enum DestinationRefType {
    /** A channel configured on the options page (bot or webhook based). */
    CHANNEL = "CHANNEL",
    /** A live chat of a connected Telegram user account. */
    TELEGRAM_PEER = "TELEGRAM_PEER"
}

/** Points to a channel configured on the options page. */
export interface ChannelDestinationRef {
    type: DestinationRefType.CHANNEL;
    channelId: string;
}

/** Points to a chat of one of the connected Telegram user accounts. */
export interface TelegramPeerDestinationRef {
    type: DestinationRefType.TELEGRAM_PEER;
    /** The account connection that sends here. */
    connectionId: string;
    /** Marked peer id (users positive, chats and channels negative). */
    peerId: number;
    kind: TelegramPeerKind;
    /** Title snapshot so recents render before the live list loads. */
    title: string;
}

/** Any destination a post can be sent to. */
export type DestinationRef = ChannelDestinationRef | TelegramPeerDestinationRef;

/** A destination used recently, newest first in the config. */
export interface RecentDestination {
    ref: DestinationRef;
    usedAt: number;
}

/** Maximum number of recent destinations kept in synced storage. */
export const MaxRecentDestinations = 8;

/** Maximum number of destinations pinned to the top of the picker (synced storage is small). */
export const MaxPinnedDestinations = 10;

/** Maximum number of destinations a single send can target. */
export const MaxDestinationsPerSend = 10;

/**
 * Returns a stable key identifying a destination, used for dedupe and selection.
 */
export function getDestinationRefKey(ref: DestinationRef): string {
    if (ref.type === DestinationRefType.CHANNEL) {
        return `channel:${ref.channelId}`;
    }

    return `peer:${ref.connectionId}:${ref.peerId}`;
}
