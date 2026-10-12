import { resolvePhotoImageUrl } from "../../../content/media/VisiblePhoto";
import { preferTwitterLargeMediaUrl } from "./TwitterMediaUrl";

const X_TIMELINE_PHOTO_SELECTOR = '[data-testid="tweetPhoto"] img';

/**
 * Collects distinct tweet photo URLs from a timeline post, in DOM order.
 */
export function extractXContentTimelinePhotoUrls(tweetArticle: Element): string[] {
    const seenKeys = new Set<string>();
    const urls: string[] = [];

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
        urls.push(preferTwitterLargeMediaUrl(url));
    }

    return urls;
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
