export type {
    DestinationChannel,
    DiscordDestinationChannel,
    ExtensionConfig,
    SendConnection,
    TelegramAccountConnection,
    TelegramBotConnection,
    TelegramDestinationChannel
} from "./Config";
export { CurrentConfigVersion, DestinationProvider, SendConnectionType, createDefaultExtensionConfig } from "./Config";
export {
    DestinationRefType,
    MaxDestinationsPerSend,
    MaxRecentDestinations,
    TelegramPeerKind,
    getDestinationRefKey,
    type ChannelDestinationRef,
    type DestinationRef,
    type RecentDestination,
    type TelegramPeerDestinationRef
} from "./DestinationRef";
export type { DestinationSendOutcome, DiscoverChannelsResponse, SendPostResult, SendResult } from "./Results";
export {
    RuntimeMessageType,
    type ChannelPhotoResponse,
    type DiscoverChannelsMessage,
    type GetBotInfoMessage,
    type GetChannelPhotoMessage,
    type RuntimeMessage,
    type SendPostMessage,
    type TestChannelMessage
} from "./Messages";
