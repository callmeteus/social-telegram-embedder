import type { SocialPlatformId, SocialPostSnapshot } from "../../platforms/types";
import type { DestinationRef } from "./DestinationRef";

/** Message types between content script and service worker. */
export enum RuntimeMessageType {
    SEND_POST = "SEND_POST",
    TEST_CHANNEL = "TEST_CHANNEL",
    GET_BOT_INFO = "GET_BOT_INFO",
    DISCOVER_CHANNELS = "DISCOVER_CHANNELS",
    GET_CHANNEL_PHOTO = "GET_CHANNEL_PHOTO"
}

/** Payload to send a social post URL to one or more destinations. */
export interface SendPostMessage {
    type: RuntimeMessageType.SEND_POST;
    platformId: SocialPlatformId;
    requestId: string;
    /** One or more destinations (capped at MaxDestinationsPerSend), sent in order. */
    destinations: DestinationRef[];
    postUrl: string;
    /** Optional DOM snapshot from the content script (photo viewer, Facebook, etc.). */
    postSnapshot?: SocialPostSnapshot;
}

/** Payload to test a single channel. */
export interface TestChannelMessage {
    type: RuntimeMessageType.TEST_CHANNEL;
    channelId: string;
}

/** Payload to validate the token of a bot connection. */
export interface GetBotInfoMessage {
    type: RuntimeMessageType.GET_BOT_INFO;
    connectionId: string;
}

/** Payload to discover channels from the updates of a bot connection. */
export interface DiscoverChannelsMessage {
    type: RuntimeMessageType.DISCOVER_CHANNELS;
    connectionId: string;
}

/** Payload to load the photo of a configured bot channel. */
export interface GetChannelPhotoMessage {
    type: RuntimeMessageType.GET_CHANNEL_PHOTO;
    channelId: string;
}

/** Reply to {@link GetChannelPhotoMessage}. */
export interface ChannelPhotoResponse {
    /** Photo as a data URL, or null when the channel has none. */
    dataUrl: string | null;
}

export type RuntimeMessage =
    | SendPostMessage
    | TestChannelMessage
    | GetBotInfoMessage
    | DiscoverChannelsMessage
    | GetChannelPhotoMessage;
