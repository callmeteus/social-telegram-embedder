import { extractPostMedia } from "./PostMedia";

/**
 * Collects photo URLs from a Facebook feed post container.
 */
export function extractFacebookTimelinePhotoUrls(root: Element): string[] {
    return extractPostMedia(root)
        .filter((item) => item.kind === "photo")
        .map((item) => item.url);
}
