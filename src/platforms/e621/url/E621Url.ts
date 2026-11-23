const E621_HOSTS = new Set([
    "e621.net",
    "e926.net"
]);

/** Identity parsed from an E621 or E926 post URL. */
export interface E621PostIdentity {
    id: string;
    host: string;
}

/**
 * Returns the canonical host when the hostname belongs to E621 or its safe-for-work mirror.
 */
function canonicalE621Host(hostname: string): string | null {
    const normalized = hostname.toLowerCase().replace(/^www\./, "");

    return E621_HOSTS.has(normalized) ? normalized : null;
}

/**
 * Parses the post id and host from an E621 post URL.
 *
 * @param rawUrl - Absolute or relative post URL.
 * @returns The post identity, or null when the URL is not a shareable post.
 */
export function parseE621PostUrl(rawUrl: string): E621PostIdentity | null {
    let url: URL;

    try {
        url = new URL(rawUrl, "https://e621.net/");
    } catch {
        return null;
    }

    const host = canonicalE621Host(url.hostname);

    if (!host) {
        return null;
    }

    const canonical = url.pathname.match(/^\/posts\/(\d+)(?:\/[^/]*)?\/?$/);
    const legacy = canonical ? null : url.pathname.match(/^\/post\/show\/(\d+)\/?$/);
    const id = canonical?.[1] ?? legacy?.[1];

    if (!id) {
        return null;
    }

    return {
        id,
        host
    };
}

/**
 * Normalizes an E621 post URL to its canonical form, preserving the host.
 *
 * @param rawUrl - Absolute or relative post URL.
 * @returns The canonical post URL, or null when the URL is not a shareable post.
 */
export function normalizeE621PostUrl(rawUrl: string): string | null {
    const identity = parseE621PostUrl(rawUrl);

    if (!identity) {
        return null;
    }

    return `https://${identity.host}/posts/${identity.id}`;
}

/**
 * Builds the canonical post URL for the current E621 post view.
 *
 * @param location - Current page location.
 * @param doc - Document holding the post id metadata.
 * @returns The canonical post URL, or null when the page is not a post view.
 */
export function e621PostUrlFromPage(
    location: Pick<Location, "href" | "hostname"> = window.location,
    doc: Document = document
): string | null {
    const fromHref = normalizeE621PostUrl(location.href);

    if (fromHref) {
        return fromHref;
    }

    const host = canonicalE621Host(location.hostname);
    const postId = doc.querySelector('meta[name="post-id"]')?.getAttribute("content")?.trim();

    if (!host || !postId || !/^\d+$/.test(postId)) {
        return null;
    }

    return `https://${host}/posts/${postId}`;
}
