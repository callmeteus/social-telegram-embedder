import { resolvePhotoImageUrl } from "../../../content/media/VisiblePhoto";
import { preferTwitterLargeMediaUrl } from "./TwitterMediaUrl";

const X_TIMELINE_PHOTO_SELECTOR = '[data-testid="tweetPhoto"] img';
const X_VIDEO_SELECTOR = 'video, [data-testid="videoComponent"]';
/** Poster frames X renders for videos and GIFs; they are stills, not tweet photos. */
const X_VIDEO_POSTER_URL_PATTERN = /pbs\.twimg\.com\/(?:tweet_video_thumb|amplify_video_thumb|ext_tw_video_thumb|ext_media_thumbnail)\//i;
/** Badge X overlays on a media grid it truncated, e.g. `+14`. */
const X_MEDIA_OVERFLOW_PATTERN = /^\+\s*(\d+)$/;

/** One timeline photo: the image the tweet already loaded, and the variant to download and send. */
export interface TimelinePhoto {
    /** URL of the image visible in the tweet; used for the picker thumbnails. */
    previewUrl: string;
    /** Highest-quality CDN variant; used for the send. */
    sendUrl: string;
}

/**
 * Collects distinct tweet photos from a timeline post, in DOM order, keeping both the preview
 * the browser already loaded and the high-resolution URL used when sending.
 */
export function extractXContentTimelinePhotos(tweetArticle: Element): TimelinePhoto[] {
    const seenKeys = new Set<string>();
    const photos: TimelinePhoto[] = [];

    for (const node of Array.from(tweetArticle.querySelectorAll(X_TIMELINE_PHOTO_SELECTOR))) {
        if (!(node instanceof HTMLImageElement)) {
            continue;
        }

        if (isXContentVideoPoster(node)) {
            continue;
        }

        const url = resolvePhotoImageUrl(node);
        const mediaKey = normalizeTwitterMediaKey(url);

        if (!url || !mediaKey || seenKeys.has(mediaKey)) {
            continue;
        }

        seenKeys.add(mediaKey);
        photos.push({ previewUrl: url, sendUrl: preferTwitterLargeMediaUrl(url) });
    }

    return photos;
}

/**
 * Collects distinct tweet photo URLs from a timeline post, in DOM order.
 */
export function extractXContentTimelinePhotoUrls(tweetArticle: Element): string[] {
    return extractXContentTimelinePhotos(tweetArticle).map((photo) => photo.sendUrl);
}

/**
 * Returns true when a timeline image is the poster frame of a video or GIF, not a tweet photo.
 * Sending the poster is what turned video tweets into static images in Telegram.
 */
export function isXContentVideoPoster(image: HTMLImageElement): boolean {
    if (image.closest(X_VIDEO_SELECTOR)) {
        return true;
    }

    return X_VIDEO_POSTER_URL_PATTERN.test(image.currentSrc || image.src || "");
}

/**
 * Returns true when the post holds a video or GIF, whose poster frame the DOM cannot send as-is.
 * Those posts must be resolved by the API so the animation is sent instead of a still image.
 */
export function hasXContentVideoMedia(tweetArticle: Element): boolean {
    if (tweetArticle.querySelector(X_VIDEO_SELECTOR)) {
        return true;
    }

    return Array.from(tweetArticle.querySelectorAll(X_TIMELINE_PHOTO_SELECTOR))
        .some((node) => node instanceof HTMLImageElement && X_VIDEO_POSTER_URL_PATTERN.test(node.currentSrc || node.src || ""));
}

/**
 * Reads the `+N` badge X shows over a media grid it did not render in full, returning how many
 * attachments are missing from the DOM. Zero means the grid holds every attachment.
 */
export function readXContentHiddenMediaCount(tweetArticle: Element): number {
    if (!tweetArticle.querySelector(X_TIMELINE_PHOTO_SELECTOR)) {
        return 0;
    }

    for (const node of Array.from(tweetArticle.querySelectorAll("span, div"))) {
        if (node.children.length > 0 || node.closest('[data-testid="tweetText"]')) {
            continue;
        }

        const match = (node.textContent ?? "").trim().match(X_MEDIA_OVERFLOW_PATTERN);

        if (match?.[1]) {
            return Number.parseInt(match[1], 10);
        }
    }

    return 0;
}

function normalizeTwitterMediaKey(url: string | null): string | null {
    if (!url) {
        return null;
    }

    const match = url.match(/pbs\.twimg\.com\/media\/([^/?]+)/i);

    if (!match?.[1]) {
        return url;
    }

    return match[1];
}
