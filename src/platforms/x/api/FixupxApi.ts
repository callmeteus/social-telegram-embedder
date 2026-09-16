import { buildSocialPostText, SocialCaptionAuthorStyle } from "../../../core/telegram/SocialCaption";
import { buildTelegramCaption } from "../../../core/telegram/Caption";
export interface FixupxTweetIdentity {
    username: string;
    statusId: string;
}

/**
 * Tweet author payload from the FxTwitter API.
 */
export interface FxTwitterApiAuthor {
    name?: string;
    screen_name?: string;
}

/**
 * A single media attachment resolved from the FxTwitter API.
 */
export interface TweetMediaItem {
    kind: "photo" | "video" | "gif";
    url: string;
}

/**
 * Tweet payload used to build Telegram media posts.
 */
export interface FetchedTweet {
    fixupxUrl: string;
    originalUrl: string;
    text: string;
    media: TweetMediaItem[];
}

interface FxTwitterApiResponse {
    code: number;
    message: string;
    tweet?: FxTwitterApiTweet;
}

interface FxTwitterApiTweet {
    url?: string;
    text?: string;
    author?: FxTwitterApiAuthor;
    quote?: FxTwitterApiTweet;
    retweet?: FxTwitterApiTweet;
    media?: FxTwitterApiMedia;
}

interface FxTwitterApiMedia {
    all?: FxTwitterApiMediaItem[];
    photos?: FxTwitterApiPhoto[];
    videos?: FxTwitterApiVideo[];
    mosaic?: FxTwitterApiMosaic;
}

interface FxTwitterApiMediaItem {
    type?: string;
    url?: string;
    duration?: number;
    formats?: FxTwitterApiVideoFormat[] | FxTwitterApiMosaicFormats;
}

interface FxTwitterApiVideoFormat {
    url?: string;
    bitrate?: number;
    container?: string;
    codec?: string;
}

interface FxTwitterApiMosaicFormats {
    jpeg?: string;
    webp?: string;
}

interface FxTwitterApiPhoto {
    url: string;
}

interface FxTwitterApiVideo {
    url: string;
    type?: "video" | "gif";
    duration?: number;
    formats?: FxTwitterApiVideoFormat[];
}

interface FxTwitterApiMosaic {
    formats?: {
        jpeg?: string;
        webp?: string;
    };
}

const FXTWITTER_API_BASE = "https://api.fxtwitter.com";
const FXTWITTER_USER_AGENT = "social-telegram-embedder/1.1.0";
const TELEGRAM_MEDIA_GROUP_LIMIT = 10;
/** Retries after the first failed FxTwitter API attempt. */
const FXTWITTER_FETCH_RETRY_COUNT = 3;
const FXTWITTER_FETCH_RETRY_BASE_DELAY_MS = 400;
/** Telegram Bot API upload limit for sendVideo. */
export const TELEGRAM_BOT_MAX_VIDEO_BYTES = 50 * 1024 * 1024;
/** Twitter VBR streams are often smaller than peak bitrate * duration. */
const TWITTER_VIDEO_SIZE_ESTIMATE_FACTOR = 0.55;

interface FxTwitterVideoSource {
    url?: string;
    duration?: number;
    formats?: FxTwitterApiVideoFormat[];
}

/**
 * Parses username and status id from a FixupX/FxTwitter tweet URL.
 */
export function parseFixupxTweetUrl(rawUrl: string): FixupxTweetIdentity | null {
    let url: URL;

    try {
        url = new URL(rawUrl);
    } catch {
        return null;
    }

    const match = url.pathname.match(/^\/([^/]+)\/status\/(\d+)/);

    if (!match) {
        return null;
    }

    return {
        username: match[1],
        statusId: match[2]
    };
}

/**
 * Fetches tweet metadata and media URLs from the public FxTwitter API.
 */
export async function fetchTweetByFixupxUrl(fixupxUrl: string): Promise<FetchedTweet | null> {
    const identity = parseFixupxTweetUrl(fixupxUrl);

    if (!identity) {
        return null;
    }

    const apiUrl = `${FXTWITTER_API_BASE}/${identity.username}/status/${identity.statusId}`;

    for (let attempt = 0; attempt <= FXTWITTER_FETCH_RETRY_COUNT; attempt++) {
        if (attempt > 0) {
            await sleep(FXTWITTER_FETCH_RETRY_BASE_DELAY_MS * attempt);
        }

        const payload = await fetchFxTwitterApiPayload(apiUrl);

        if (!payload?.tweet) {
            continue;
        }

        const sourceTweet = payload.tweet.retweet ?? payload.tweet;

        return {
            fixupxUrl,
            originalUrl: payload.tweet.url ?? fixupxUrl,
            text: buildTweetPostText(payload.tweet),
            media: extractTweetMediaItems(sourceTweet.media ?? payload.tweet.media)
        };
    }

    return null;
}

/**
 * Extracts ordered media items from FxTwitter API media object.
 */
export function extractTweetMediaItems(media?: FxTwitterApiMedia): TweetMediaItem[] {
    if (!media) {
        return [];
    }

    if (Array.isArray(media.all) && media.all.length > 0) {
        const fromAll = media.all
            .map(mapApiMediaItem)
            .filter((item): item is TweetMediaItem => item !== null);

        if (fromAll.length > 0) {
            return fromAll;
        }
    }

    const items: TweetMediaItem[] = [];

    for (const photo of media.photos ?? []) {
        if (photo.url) {
            items.push({ kind: "photo", url: photo.url });
        }
    }

    for (const video of media.videos ?? []) {
        if (!video.url) {
            continue;
        }

        if (video.type === "gif") {
            items.push({ kind: "gif", url: video.url });
            continue;
        }

        const videoUrl = pickTelegramSafeVideoUrl(video) ?? video.url;
        items.push({ kind: "video", url: videoUrl });
    }

    const mosaicUrl = media.mosaic?.formats?.jpeg ?? media.mosaic?.formats?.webp;

    if (mosaicUrl && items.length === 0) {
        items.push({ kind: "photo", url: mosaicUrl });
    }

    return items;
}

/**
 * Builds the Telegram caption body for a tweet API payload.
 */
export function buildTweetPostText(tweet: FxTwitterApiTweet): string {
    const retweet = tweet.retweet;
    const authorHandle = readFxTwitterAuthorHandle(tweet.author);

    if (retweet) {
        return buildSocialPostText({
            body: stripLegacyRetweetPrefix(retweet.text ?? ""),
            pageName: readFxTwitterAuthorHandle(retweet.author) ?? undefined,
            repostedBy: authorHandle ?? undefined,
            authorStyle: SocialCaptionAuthorStyle.HANDLE
        });
    }

    const legacyRetweet = parseLegacyRetweetText(tweet.text ?? "", authorHandle);

    if (legacyRetweet) {
        return buildSocialPostText({
            body: legacyRetweet.body,
            pageName: legacyRetweet.pageName,
            repostedBy: legacyRetweet.repostedBy,
            authorStyle: SocialCaptionAuthorStyle.HANDLE
        });
    }

    return buildSocialPostText({
        body: tweet.text ?? "",
        pageName: authorHandle ?? undefined,
        authorStyle: SocialCaptionAuthorStyle.HANDLE
    });
}

/**
 * Builds a Telegram caption with tweet text and FixupX link.
 */
export function buildTweetCaption(fixupxUrl: string, text: string): string {
    return buildTelegramCaption(fixupxUrl, text);
}

/**
 * Splits media items into Telegram album batches.
 */
export function chunkTweetMedia(media: TweetMediaItem[], size = TELEGRAM_MEDIA_GROUP_LIMIT): TweetMediaItem[][] {
    const batches: TweetMediaItem[][] = [];

    for (let index = 0; index < media.length; index += size) {
        batches.push(media.slice(index, index + size));
    }

    return batches;
}

/**
 * Picks the highest-quality MP4 variant that should fit Telegram bot upload limits.
 */
export function pickTelegramSafeVideoUrl(source: FxTwitterVideoSource): string | null {
    const mp4Formats = (source.formats ?? [])
        .filter((format) => format.container === "mp4" && format.url && typeof format.bitrate === "number")
        .sort((left, right) => (right.bitrate ?? 0) - (left.bitrate ?? 0));

    if (mp4Formats.length === 0) {
        return source.url ?? null;
    }

    const durationSeconds = source.duration ?? 0;

    if (durationSeconds > 0) {
        for (const format of mp4Formats) {
            const estimatedBytes = estimateTwitterVideoBytes(format.bitrate ?? 0, durationSeconds);

            if (estimatedBytes <= TELEGRAM_BOT_MAX_VIDEO_BYTES) {
                return format.url ?? null;
            }
        }
    }

    const lowestBitrateFormat = mp4Formats[mp4Formats.length - 1];

    return lowestBitrateFormat.url ?? source.url ?? null;
}

function estimateTwitterVideoBytes(bitrate: number, durationSeconds: number): number {
    return (bitrate * durationSeconds / 8) * TWITTER_VIDEO_SIZE_ESTIMATE_FACTOR;
}

function readVideoFormats(
    formats?: FxTwitterApiVideoFormat[] | FxTwitterApiMosaicFormats
): FxTwitterApiVideoFormat[] | undefined {
    if (!formats || !Array.isArray(formats)) {
        return undefined;
    }

    return formats;
}

function readMosaicFormatUrl(
    formats?: FxTwitterApiVideoFormat[] | FxTwitterApiMosaicFormats
): string | undefined {
    if (!formats || Array.isArray(formats)) {
        return undefined;
    }

    return formats.jpeg ?? formats.webp;
}

async function fetchFxTwitterApiPayload(apiUrl: string): Promise<FxTwitterApiResponse | null> {
    let response: Response;

    try {
        response = await fetch(apiUrl, {
            headers: {
                "User-Agent": FXTWITTER_USER_AGENT,
                Accept: "application/json"
            }
        });
    } catch {
        return null;
    }

    if (!response.ok) {
        return null;
    }

    let payload: FxTwitterApiResponse;

    try {
        payload = (await response.json()) as FxTwitterApiResponse;
    } catch {
        return null;
    }

    if (payload.code !== 200 || !payload.tweet) {
        return null;
    }

    return payload;
}

function sleep(durationMs: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, durationMs);
    });
}

function mapApiMediaItem(item: FxTwitterApiMediaItem): TweetMediaItem | null {
    if (item.type === "photo" && item.url) {
        return { kind: "photo", url: item.url };
    }

    if (item.type === "gif" && item.url) {
        return { kind: "gif", url: item.url };
    }

    if (item.type === "video" && item.url) {
        const videoUrl = pickTelegramSafeVideoUrl({
            url: item.url,
            duration: item.duration,
            formats: readVideoFormats(item.formats)
        }) ?? item.url;

        return { kind: "video", url: videoUrl };
    }

    if (item.type === "mosaic_photo") {
        const mosaicUrl = readMosaicFormatUrl(item.formats);

        if (mosaicUrl) {
            return { kind: "photo", url: mosaicUrl };
        }
    }

    return null;
}

function readFxTwitterAuthorHandle(author?: FxTwitterApiAuthor): string | null {
    const screenName = author?.screen_name?.trim();

    if (screenName) {
        return `@${screenName}`;
    }

    return readFxTwitterAuthorName(author);
}

function readFxTwitterAuthorName(author?: FxTwitterApiAuthor): string | null {
    const name = author?.name?.trim();

    if (name) {
        return name;
    }

    const screenName = author?.screen_name?.trim();

    if (screenName) {
        return `@${screenName}`;
    }

    return null;
}

function stripLegacyRetweetPrefix(text: string): string {
    return text.replace(/^RT\s+@\w+:\s*/i, "").trim();
}

function parseLegacyRetweetText(
    text: string,
    reposterName: string | null
): { body: string; pageName?: string; repostedBy?: string } | null {
    const match = text.match(/^RT\s+@(\w+):\s*([\s\S]*)$/i);

    if (!match) {
        return null;
    }

    return {
        body: match[2].trim(),
        pageName: `@${match[1]}`,
        repostedBy: reposterName ?? undefined
    };
}
