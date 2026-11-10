import { resolvePhotoImageUrl } from "../../../content/media/VisiblePhoto";
import { preferTwitterLargeMediaUrl } from "./TwitterMediaUrl";

const X_TIMELINE_PHOTO_SELECTOR = '[data-testid="tweetPhoto"] img';

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
