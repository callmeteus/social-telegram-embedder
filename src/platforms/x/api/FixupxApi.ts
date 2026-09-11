/**
 * Parsed tweet identity from a FixupX/FxTwitter URL.
 */
export interface FixupxTweetIdentity {
    username: string;
    statusId: string;
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
    formats?: {
        jpeg?: string;
        webp?: string;
    };
}

interface FxTwitterApiPhoto {
    url: string;
}

interface FxTwitterApiVideo {
    url: string;
    type?: "video" | "gif";
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

    return {
        fixupxUrl,
        originalUrl: payload.tweet.url ?? fixupxUrl,
        text: payload.tweet.text ?? "",
        media: extractTweetMediaItems(payload.tweet.media)
    };
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

        items.push({
            kind: video.type === "gif" ? "gif" : "video",
            url: video.url
        });
    }

    const mosaicUrl = media.mosaic?.formats?.jpeg ?? media.mosaic?.formats?.webp;

    if (mosaicUrl && items.length === 0) {
        items.push({ kind: "photo", url: mosaicUrl });
    }

    return items;
}

/**
 * Builds a Telegram caption with tweet text and FixupX link.
 */
export function buildTweetCaption(fixupxUrl: string, text: string): string {
    const trimmedText = text.trim();
    const linkBlock = fixupxUrl.trim();

    if (!trimmedText) {
        return linkBlock.slice(0, 1024);
    }

    const maxTextLength = 1024 - linkBlock.length - 2;

    if (maxTextLength <= 0) {
        return linkBlock.slice(0, 1024);
    }

    return `${trimmedText.slice(0, maxTextLength)}\n\n${linkBlock}`;
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

function mapApiMediaItem(item: FxTwitterApiMediaItem): TweetMediaItem | null {
    if (item.type === "photo" && item.url) {
        return { kind: "photo", url: item.url };
    }

    if (item.type === "gif" && item.url) {
        return { kind: "gif", url: item.url };
    }

    if (item.type === "video" && item.url) {
        return { kind: "video", url: item.url };
    }

    if (item.type === "mosaic_photo") {
        const mosaicUrl = item.formats?.jpeg ?? item.formats?.webp;

        if (mosaicUrl) {
            return { kind: "photo", url: mosaicUrl };
        }
    }

    return null;
}
