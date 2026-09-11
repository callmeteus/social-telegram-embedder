/**
 * Converts X/Twitter tweet URLs to FixupX/FxTwitter URLs for rich Telegram embeds.
 */

const TWEET_PATH_PATTERN = /^\/([^/?#]+)\/status\/(\d+)/;

/**
 * Converts a raw X/Twitter URL to its FixupX equivalent.
 */
export function toFixupxTweetUrl(rawUrl: string): string | null {
    let url: URL;

    try {
        url = new URL(rawUrl);
    } catch {
        return null;
    }

    const host = url.hostname.replace(/^www\./, "");
    const pathMatch = url.pathname.match(TWEET_PATH_PATTERN);

    if (!pathMatch) {
        return null;
    }

    const [, username, statusId] = pathMatch;

    if (host === "x.com") {
        return `https://fixupx.com/${username}/status/${statusId}`;
    }

    if (host === "twitter.com" || host === "mobile.twitter.com") {
        return `https://fxtwitter.com/${username}/status/${statusId}`;
    }

    if (host === "fixupx.com" || host === "fxtwitter.com") {
        url.search = "";
        url.hash = "";
        return url.toString();
    }

    return null;
}

/**
 * Builds a FixupX URL from the current page location when viewing a tweet.
 */
export function tweetUrlFromPage(location: Location): string | null {
    const match = location.pathname.match(TWEET_PATH_PATTERN);

    if (!match) {
        return null;
    }

    const [, username, statusId] = match;
    return `https://fixupx.com/${username}/status/${statusId}`;
}

/**
 * Extracts a tweet URL from a tweet DOM element.
 */
export function extractTweetUrlFromElement(tweetElement: Element): string | null {
    const fromStatusLink = extractTweetUrlFromStatusHref(
        tweetElement.querySelector('a[href*="/status/"]')?.getAttribute("href")
    );

    if (fromStatusLink) {
        return fromStatusLink;
    }

    return null;
}

/**
 * Extracts a tweet URL from an action bar (analytics link, status anchors, page URL).
 */
export function extractTweetUrlFromActionBar(actionBar: Element): string | null {
    for (const link of Array.from(actionBar.querySelectorAll('a[href*="/status/"]'))) {
        const fromStatusLink = extractTweetUrlFromStatusHref(link.getAttribute("href"));

        if (fromStatusLink) {
            return fromStatusLink;
        }
    }

    return tweetUrlFromPage(window.location);
}

function extractTweetUrlFromStatusHref(href: string | null | undefined): string | null {
    if (!href) {
        return null;
    }

    try {
        const absolute = new URL(href, window.location.origin).toString();
        const fromAbsolute = toFixupxTweetUrl(absolute);

        if (fromAbsolute) {
            return fromAbsolute;
        }
    } catch {
        // Fall through to relative path parsing.
    }

    const pathMatch = href.match(TWEET_PATH_PATTERN);

    if (!pathMatch) {
        return null;
    }

    const [, username, statusId] = pathMatch;
    return `https://fixupx.com/${username}/status/${statusId}`;
}

/**
 * Normalizes any supported tweet URL to FixupX format.
 */
export function normalizeTweetUrl(rawUrl: string, fallbackLocation?: Location): string | null {
    const fromRaw = toFixupxTweetUrl(rawUrl);

    if (fromRaw) {
        return fromRaw;
    }

    if (fallbackLocation) {
        return tweetUrlFromPage(fallbackLocation);
    }

    return null;
}
