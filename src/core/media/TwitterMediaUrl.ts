const TWITTER_MEDIA_HOST_PATTERN = /pbs\.twimg\.com\/media\//i;
const TWITTER_MEDIA_PATH_PATTERN = /\/media\/([^/?#]+?)(?:\.([a-z0-9]+))?$/i;

/**
 * Returns true when the URL points at a Twitter timeline photo CDN asset.
 */
export function isTwitterTimelinePhotoUrl(url: string): boolean {
    return TWITTER_MEDIA_HOST_PATTERN.test(url);
}

/**
 * Normalizes a Twitter media URL to the highest-quality CDN variant when possible.
 */
export function preferTwitterLargeMediaUrl(url: string): string {
    if (!isTwitterTimelinePhotoUrl(url)) {
        return url;
    }

    try {
        const parsed = new URL(url);
        const pathMatch = parsed.pathname.match(TWITTER_MEDIA_PATH_PATTERN);

        if (!pathMatch?.[1]) {
            parsed.searchParams.set("name", "orig");

            if (!parsed.searchParams.has("format")) {
                parsed.searchParams.set("format", "jpg");
            }

            return parsed.toString();
        }

        const mediaId = pathMatch[1];
        const format = parsed.searchParams.get("format") ?? pathMatch[2] ?? "jpg";

        return `https://pbs.twimg.com/media/${mediaId}.${format}?name=orig`;
    } catch {
        return url;
    }
}
