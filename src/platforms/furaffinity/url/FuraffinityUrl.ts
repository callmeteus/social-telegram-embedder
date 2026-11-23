const FURAFFINITY_HOSTS = new Set([
    "furaffinity.net",
    "www.furaffinity.net"
]);

/** Identity parsed from a FurAffinity submission URL. */
export interface FuraffinityPostIdentity {
    id: string;
    host: string;
}

/**
 * Returns the canonical host when the hostname belongs to FurAffinity.
 */
function canonicalFuraffinityHost(hostname: string): string | null {
    const normalized = hostname.toLowerCase().replace(/^www\./, "");

    return FURAFFINITY_HOSTS.has(normalized) ? normalized : null;
}

/**
 * Parses the submission id and host from a FurAffinity URL.
 *
 * @param rawUrl - Absolute or relative submission URL.
 * @returns The submission identity, or null when the URL is not a shareable submission.
 */
export function parseFuraffinityPostUrl(rawUrl: string): FuraffinityPostIdentity | null {
    let url: URL;

    try {
        url = new URL(rawUrl, "https://www.furaffinity.net/");
    } catch {
        return null;
    }

    const host = canonicalFuraffinityHost(url.hostname);

    if (!host) {
        return null;
    }

    const submission = url.pathname.match(/^\/(?:view|full)\/(\d+)\/?$/);

    if (!submission?.[1]) {
        return null;
    }

    return {
        id: submission[1],
        host
    };
}

/**
 * Normalizes a FurAffinity submission URL to its canonical view form, dropping tracking data.
 *
 * @param rawUrl - Absolute or relative submission URL.
 * @returns The canonical submission URL, or null when the URL is not a shareable submission.
 */
export function normalizeFuraffinityPostUrl(rawUrl: string): string | null {
    const identity = parseFuraffinityPostUrl(rawUrl);

    if (!identity) {
        return null;
    }

    return `https://www.furaffinity.net/view/${identity.id}`;
}

/**
 * Builds the canonical submission URL for the current FurAffinity view.
 *
 * @param location - Current page location.
 * @param doc - Document holding canonical or Open Graph URL metadata.
 * @returns The canonical submission URL, or null when the page is not a submission view.
 */
export function furaffinityPostUrlFromPage(
    location: Pick<Location, "href" | "hostname"> = window.location,
    doc: Document = document
): string | null {
    const fromHref = normalizeFuraffinityPostUrl(location.href);

    if (fromHref) {
        return fromHref;
    }

    if (!canonicalFuraffinityHost(location.hostname)) {
        return null;
    }

    const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute("href");

    return canonical ? normalizeFuraffinityPostUrl(canonical) : null;
}
