/**
 * MAIN-world bridge that maps Instagram's blob video URLs to their CDN mp4 URLs.
 *
 * Instagram feeds each <video> from a MediaSource opened through a blob URL, while
 * the actual media bytes come from fbcdn mp4 requests. The content script runs in
 * an isolated world and cannot see those requests directly, so this script hooks
 * URL.createObjectURL and the network primitives in the page world and forwards
 * the pairing with postMessage. The isolated content script keeps the map.
 */

/** Message namespace shared with the isolated content script. */
const MESSAGE_NAMESPACE = "__x2tg_video_map__";

/** Request namespace used by the isolated content script to pull the accumulated map. */
const REQUEST_NAMESPACE = "__x2tg_video_map_request__";

/** Response namespace carrying the full blob-to-mp4 map. */
const RESPONSE_NAMESPACE = "__x2tg_video_map_data__";

/** Blob video URL to CDN mp4 URL, accumulated since document start. */
const videoMap = new Map<string, string>();

/** Pattern matching Instagram CDN mp4 requests. */
const MP4_PATTERN = /fbcdn\.net\/.*\.mp4(?:[?&]|$)/i;

/** Most recent blob URL created by the page. */
let lastBlobUrl: string | null = null;

/** Most recent CDN mp4 URL requested by the page. */
let lastMp4Url: string | null = null;

/**
 * Forwards a blob-to-mp4 pairing to the isolated content script.
 *
 * @param blobUrl - Blob URL created by URL.createObjectURL.
 * @param mp4Url - CDN mp4 URL that feeds the blob's MediaSource.
 */
function publish(blobUrl: string, mp4Url: string): void {
    videoMap.set(blobUrl, mp4Url);
    window.postMessage({
        [MESSAGE_NAMESPACE]: true,
        blobUrl,
        mp4Url
    }, "*");
}

/**
 * Replies to the isolated content script with the full map accumulated so far.
 */
window.addEventListener("message", (event: MessageEvent<Record<string, unknown>>) => {
    if (event.source !== window || event.data?.[REQUEST_NAMESPACE] !== true) {
        return;
    }

    window.postMessage({
        [RESPONSE_NAMESPACE]: true,
        entries: Array.from(videoMap.entries())
    }, "*");
});

/**
 * Strips MediaSource byte-range parameters so the URL can be downloaded whole.
 *
 * @param url - Raw mp4 request URL.
 * @returns A clean direct video URL.
 */
function cleanMp4Url(url: string): string {
    try {
        const parsed = new URL(url);

        parsed.searchParams.delete("bytestart");
        parsed.searchParams.delete("byteend");

        return parsed.toString();
    } catch {
        return url;
    }
}

/**
 * Records an mp4 request and pairs it with the newest unmatched blob URL.
 *
 * @param url - Request URL.
 */
function noteMp4Request(url: string): void {
    if (!MP4_PATTERN.test(url)) {
        return;
    }

    lastMp4Url = cleanMp4Url(url);

    if (lastBlobUrl) {
        publish(lastBlobUrl, lastMp4Url);
        lastBlobUrl = null;
    }
}

const originalFetch = window.fetch.bind(window);

window.fetch = function patchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === "string"
        ? input
        : input instanceof URL
            ? input.href
            : input.url;

    noteMp4Request(url);

    return originalFetch(input, init);
};

const originalOpen = XMLHttpRequest.prototype.open;

XMLHttpRequest.prototype.open = function patchedOpen(
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    ...rest: unknown[]
): void {
    noteMp4Request(String(url));
    // eslint-disable-next-line prefer-spread
    (originalOpen as (...args: unknown[]) => void).apply(this, [method, url, ...rest]);
};

const originalCreateObjectURL = URL.createObjectURL.bind(URL);

URL.createObjectURL = function patchedCreateObjectURL(obj: Blob | MediaSource): string {
    const blobUrl = originalCreateObjectURL(obj);

    if (!blobUrl.startsWith("blob:")) {
        return blobUrl;
    }

    lastBlobUrl = blobUrl;

    if (lastMp4Url) {
        publish(blobUrl, lastMp4Url);
        lastBlobUrl = null;
    }

    return blobUrl;
};
