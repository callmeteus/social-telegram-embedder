import { snapshotToFetchedPost, type FetchedSocialPost } from "../../types";

/**
 * Builds the worker-side fallback for Instagram sends without a page snapshot.
 * Instagram media is behind a login wall and anti-bot checks, so the worker only carries the
 * source link. The content script normally supplies a richer snapshot at click time.
 *
 * @param normalizedUrl - Canonical post URL used as the source link.
 * @returns A link-only post payload.
 */
export function buildInstagramLinkOnlyPost(normalizedUrl: string): FetchedSocialPost {
    return snapshotToFetchedPost(normalizedUrl, {
        text: "",
        media: []
    });
}
