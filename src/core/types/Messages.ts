import type { SocialPlatformId } from "../../platforms/types";

/** Message types between content script and service worker. */
export enum RuntimeMessageType {
    SEND_POST = "SEND_POST",
    TEST_CHANNEL = "TEST_CHANNEL",
    GET_BOT_INFO = "GET_BOT_INFO",
    DISCOVER_CHANNELS = "DISCOVER_CHANNELS"
}

/** Payload to send a social post URL to a channel. */
export interface SendPostMessage {
    type: RuntimeMessageType.SEND_POST;
    platformId: SocialPlatformId;
    requestId: string;
    channelId: string;
    postUrl: string;
}

/** Payload to test a single channel. */
export interface TestChannelMessage {
    type: RuntimeMessageType.TEST_CHANNEL;
    channelId: string;
}

/** Payload to validate bot token. */
export interface GetBotInfoMessage {
    type: RuntimeMessageType.GET_BOT_INFO;
}

/** Payload to discover channels from bot updates. */
export interface DiscoverChannelsMessage {
    type: RuntimeMessageType.DISCOVER_CHANNELS;
}

export type RuntimeMessage =
    | SendPostMessage
    | TestChannelMessage
    | GetBotInfoMessage
    | DiscoverChannelsMessage;
