import { t } from "../../../core/i18n/I18n";
import { formatConnectionName } from "../../../core/storage/Connections";
import { sortChannelsForPicker } from "../../../core/storage/Storage";
import type { TelegramDialogEntry, TelegramFolder, TelegramFolderColor } from "../../../core/telegram-user/Dialogs";
import {
    DestinationProvider,
    SendConnectionType,
    type DestinationChannel,
    type SendConnection
} from "../../../core/types/Config";
import {
    DestinationRefType,
    getDestinationRefKey,
    type DestinationRef,
    type RecentDestination,
    type TelegramPeerKind
} from "../../../core/types/DestinationRef";

/** Picker sections, in display order. */
export enum PickerSectionId {
    PINNED = "PINNED",
    RECENT = "RECENT",
    BOT_CHANNELS = "BOT_CHANNELS",
    TELEGRAM_ACCOUNT = "TELEGRAM_ACCOUNT"
}

/** Which bot or account a destination is sent through. */
export interface PickerRoute {
    type: SendConnectionType;
    /** "Telegram account · Name" or "Telegram bot · @bot". */
    label: string;
}

/** One selectable destination row. */
export interface PickerItem {
    key: string;
    ref: DestinationRef;
    title: string;
    /** Set for Telegram destinations; shown under the title with the route icon. */
    route?: PickerRoute;
    /** Set for configured channels; Telegram channels get the Telegram badge. */
    channelProvider?: DestinationProvider;
    /** Set for Telegram account chats; used to load the avatar lazily. */
    avatarPeerId?: number;
    /** Telegram account that owns {@link avatarPeerId}. */
    avatarConnectionId?: string;
    /** Set for Telegram bot channels; their photo is loaded through the bot. */
    avatarChannelId?: string;
    hasAvatar: boolean;
    /** Telegram account chat pinned in the user's Telegram chat list (not a picker pin). */
    pinnedInTelegram?: boolean;
    /** Colored tags of the Telegram folders holding the chat, in folder order. */
    folderTags?: PickerFolderTag[];
    /** Kind of a Telegram account chat; groups, channels and bots get an icon before the title. */
    peerKind?: TelegramPeerKind;
    /** Lowercase, accent-free text used for filtering (title, username, folder names). */
    searchText: string;
}

/** A Telegram folder tag shown on a row, like the ones in Telegram's chat list. */
export interface PickerFolderTag {
    title: string;
    color: TelegramFolderColor;
}

/** A titled group of rows. */
export interface PickerSection {
    id: PickerSectionId;
    items: PickerItem[];
}

/** Chats of one Telegram account. */
export interface PickerAccountInput {
    connectionId: string;
    dialogs: TelegramDialogEntry[];
    /** Server results for the current query (ignored when the query is empty). */
    searchResults: TelegramDialogEntry[];
    /** The account's chat folders, in its folder order. */
    folders?: TelegramFolder[];
}

/** Everything the picker knows at a given moment. */
export interface PickerModelInput {
    channels: DestinationChannel[];
    recentDestinations: RecentDestination[];
    /** Destinations pinned to the top of the picker, in pin order. */
    pinnedDestinations: DestinationRef[];
    /** Every bot and account; each destination names the one it is sent through. */
    connections: SendConnection[];
    accounts: PickerAccountInput[];
    query: string;
}

/**
 * Lowercases and strips accents so "Sao" matches "São".
 */
export function normalizeSearchText(value: string): string {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/**
 * Returns true when every word of the query appears in the item text.
 */
export function matchesQuery(item: PickerItem, normalizedQuery: string): boolean {
    if (!normalizedQuery) {
        return true;
    }

    return normalizedQuery
        .replace(/^@/, "")
        .split(/\s+/)
        .every((word) => item.searchText.includes(word));
}

/**
 * Builds the visible sections: Pinned, Recent, Bot channels, Telegram account. Chats of every account
 * are merged into one section. Each destination appears once (pins win, then recents), the query
 * filters every section, server results are merged into the account section, and empty sections are omitted.
 */
export function buildPickerSections(input: PickerModelInput): PickerSection[] {
    const query = normalizeSearchText(input.query);
    const names = buildConnectionNames(input.connections);
    const accountIds = new Set(input.connections
        .filter((connection) => connection.type === SendConnectionType.TELEGRAM_ACCOUNT)
        .map((connection) => connection.id));
    const accounts = input.accounts.filter((account) => accountIds.has(account.connectionId));
    const foldersByAccount = new Map(accounts.map((account) => [account.connectionId, account.folders ?? []]));
    const toItem = (connectionId: string, entry: TelegramDialogEntry): PickerItem =>
        dialogToItem(connectionId, entry, names, foldersByAccount.get(connectionId) ?? []);

    const channelItems = sortChannelsForPicker(input.channels, input.recentDestinations)
        .map((channel) => channelToItem(channel, names));
    const dialogItems = mergeAccountDialogs(accounts.map((account) => ({ connectionId: account.connectionId, entries: account.dialogs })))
        .map(({ connectionId, entry }) => toItem(connectionId, entry));
    const searchItems = query
        ? accounts.flatMap((account) => account.searchResults
            .filter((entry) => entry.canPost)
            .map((entry) => toItem(account.connectionId, entry)))
        : [];
    const liveItems = [...channelItems, ...dialogItems];
    const pinnedItems = buildRefItems(input.pinnedDestinations, accountIds, names, liveItems);
    const recentItems = buildRefItems(input.recentDestinations.map((recent) => recent.ref), accountIds, names, liveItems);
    const used = new Set<string>();

    const take = (items: PickerItem[]): PickerItem[] => items.filter((item) => {
        if (used.has(item.key) || !matchesQuery(item, query)) {
            return false;
        }

        used.add(item.key);
        return true;
    });

    const sections: PickerSection[] = [
        { id: PickerSectionId.PINNED, items: take(pinnedItems) },
        { id: PickerSectionId.RECENT, items: take(recentItems) },
        { id: PickerSectionId.BOT_CHANNELS, items: take(channelItems) },
        { id: PickerSectionId.TELEGRAM_ACCOUNT, items: [...take(dialogItems), ...take(searchItems)] }
    ];

    return sections.filter((section) => section.items.length > 0);
}

/** Connection names by id; `searchable` only holds kinds with several connections. */
interface ConnectionNames {
    all: Map<string, string>;
    /** Matching "Gio" against every chat of a lone account would only add noise. */
    searchable: Map<string, string>;
}

function buildConnectionNames(connections: SendConnection[]): ConnectionNames {
    const countByType = new Map<SendConnectionType, number>();

    for (const connection of connections) {
        countByType.set(connection.type, (countByType.get(connection.type) ?? 0) + 1);
    }

    // An unnamed connection is left out so the route reads "Telegram bot", not "Telegram bot · Unnamed bot".
    const all = new Map(connections
        .filter((connection) => connection.type === SendConnectionType.TELEGRAM_BOT ? connection.username : connection.displayName)
        .map((connection) => [connection.id, formatConnectionName(connection)]));
    const searchable = new Map(connections
        .filter((connection) => (countByType.get(connection.type) ?? 0) > 1)
        .map((connection) => [connection.id, formatConnectionName(connection)]));

    return { all, searchable };
}

function buildRoute(type: SendConnectionType, connectionName: string | undefined): PickerRoute {
    const kind = type === SendConnectionType.TELEGRAM_BOT ? t("pickerRouteBot") : t("pickerRouteAccount");

    return { type, label: connectionName ? `${kind} · ${connectionName}` : kind };
}

/**
 * Merges the chat lists of several accounts: pinned chats first (account order, then pin order),
 * then every other chat by last activity.
 */
function mergeAccountDialogs(lists: { connectionId: string; entries: TelegramDialogEntry[] }[]): { connectionId: string; entry: TelegramDialogEntry }[] {
    const tagged = lists.map(({ connectionId, entries }) => entries
        .filter((entry) => entry.canPost)
        .map((entry) => ({ connectionId, entry })));

    if (tagged.length === 1) {
        return tagged[0];
    }

    const pinned = tagged.flatMap((list) => list.filter(({ entry }) => entry.isPinned));
    const rest = tagged
        .flatMap((list) => list.filter(({ entry }) => !entry.isPinned))
        .sort((left, right) => right.entry.lastMessageAt - left.entry.lastMessageAt);

    return [...pinned, ...rest];
}

/**
 * Rows for saved refs (pins or recents): the live row when loaded, otherwise a row built from
 * the saved peer; channels that no longer exist are skipped.
 */
function buildRefItems(
    refs: DestinationRef[],
    accountIds: Set<string>,
    names: ConnectionNames,
    liveItems: PickerItem[]
): PickerItem[] {
    const byKey = new Map(liveItems.map((item) => [item.key, item]));
    const items: PickerItem[] = [];

    for (const ref of refs) {
        const live = byKey.get(getDestinationRefKey(ref));

        if (live) {
            items.push(live);
            continue;
        }

        if (ref.type === DestinationRefType.TELEGRAM_PEER && accountIds.has(ref.connectionId)) {
            items.push(dialogToItem(ref.connectionId, {
                peerId: ref.peerId,
                kind: ref.kind,
                title: ref.title,
                canPost: true,
                isPinned: false,
                isArchived: false,
                lastMessageAt: 0,
                hasAvatar: true
            }, names, []));
        }
    }

    return items;
}

/**
 * Cache key for the photo of a Telegram account chat.
 */
export function getPeerAvatarKey(connectionId: string, peerId: number): string {
    return `peer:${connectionId}:${peerId}`;
}

/**
 * Cache key for a row's photo, or undefined when the row has no photo source.
 */
export function getAvatarKey(item: PickerItem): string | undefined {
    if (item.avatarPeerId !== undefined && item.avatarConnectionId !== undefined) {
        return getPeerAvatarKey(item.avatarConnectionId, item.avatarPeerId);
    }

    return item.avatarChannelId !== undefined ? `channel:${item.avatarChannelId}` : undefined;
}

/**
 * True when the row sends through Telegram (bot channel or account chat).
 */
export function isTelegramPickerItem(item: PickerItem): boolean {
    return item.channelProvider === DestinationProvider.TELEGRAM || item.avatarPeerId !== undefined;
}

function channelToItem(channel: DestinationChannel, names: ConnectionNames): PickerItem {
    const ref: DestinationRef = { type: DestinationRefType.CHANNEL, channelId: channel.id };
    const isTelegram = channel.provider === DestinationProvider.TELEGRAM;
    const searchName = isTelegram ? names.searchable.get(channel.connectionId) : undefined;

    return {
        key: getDestinationRefKey(ref),
        ref,
        title: channel.label,
        route: isTelegram ? buildRoute(SendConnectionType.TELEGRAM_BOT, names.all.get(channel.connectionId)) : undefined,
        channelProvider: channel.provider,
        avatarChannelId: isTelegram ? channel.id : undefined,
        hasAvatar: false,
        searchText: normalizeSearchText(`${channel.label} ${searchName ?? ""}`)
    };
}

function dialogToItem(connectionId: string, entry: TelegramDialogEntry, names: ConnectionNames, folders: TelegramFolder[]): PickerItem {
    const ref: DestinationRef = {
        type: DestinationRefType.TELEGRAM_PEER,
        connectionId,
        peerId: entry.peerId,
        kind: entry.kind,
        title: entry.title
    };
    const searchName = names.searchable.get(connectionId);
    const memberIds = new Set(entry.folderIds ?? []);
    const memberFolders = folders.filter((folder) => memberIds.has(folder.id));

    return {
        key: getDestinationRefKey(ref),
        ref,
        title: entry.title,
        route: buildRoute(SendConnectionType.TELEGRAM_ACCOUNT, names.all.get(connectionId)),
        avatarPeerId: entry.peerId,
        avatarConnectionId: connectionId,
        hasAvatar: entry.hasAvatar,
        pinnedInTelegram: entry.isPinned,
        folderTags: memberFolders.flatMap((folder) => folder.tagColor ? [{ title: folder.title, color: folder.tagColor }] : []),
        peerKind: entry.kind,
        searchText: normalizeSearchText([entry.title, entry.username ?? "", searchName ?? "", ...memberFolders.map((folder) => folder.title)].join(" "))
    };
}
