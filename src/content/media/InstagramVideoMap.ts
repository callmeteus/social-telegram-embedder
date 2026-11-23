/** Message namespace shared with the MAIN-world injector. */
const MESSAGE_NAMESPACE = "__x2tg_video_map__";

/** Request namespace used to pull the map accumulated before this listener started. */
const REQUEST_NAMESPACE = "__x2tg_video_map_request__";

/** Response namespace carrying the full blob-to-mp4 map. */
const RESPONSE_NAMESPACE = "__x2tg_video_map_data__";

/** Blob video URL to CDN mp4 URL, populated by the MAIN-world injector. */
const videoMap = new Map<string, string>();

/** Shape of the postMessage payload sent by the injector. */
interface VideoMapMessage {
    [MESSAGE_NAMESPACE]?: boolean;
    [RESPONSE_NAMESPACE]?: boolean;
    entries?: Array<[string, string]>;
    blobUrl?: string;
    mp4Url?: string;
}

/**
 * Starts listening for blob-to-mp4 mappings from the MAIN world.
 *
 * Safe to call more than once: duplicate listeners are ignored.
 */
export function startInstagramVideoMapListener(): void {
    if (started) {
        return;
    }

    started = true;
    window.addEventListener("message", (event: MessageEvent<VideoMapMessage>) => {
        if (event.source !== window) {
            return;
        }

        if (event.data?.[MESSAGE_NAMESPACE]) {
            const { blobUrl, mp4Url } = event.data;

            if (blobUrl && mp4Url) {
                videoMap.set(blobUrl, mp4Url);
            }

            return;
        }

        if (event.data?.[RESPONSE_NAMESPACE] && Array.isArray(event.data.entries)) {
            for (const entry of event.data.entries) {
                if (Array.isArray(entry) && entry.length === 2) {
                    videoMap.set(entry[0], entry[1]);
                }
            }
        }
    });

    // The MAIN-world bridge starts at document_start, so pull anything it captured earlier.
    window.postMessage({ [REQUEST_NAMESPACE]: true }, "*");
}

/** Whether the message listener is already registered. */
let started = false;

/**
 * Returns the CDN mp4 URL paired with a blob video URL.
 *
 * @param blobUrl - Blob URL from a video element's src/currentSrc.
 * @returns The direct mp4 URL, or undefined when no mapping was captured.
 */
export function getMp4ForBlob(blobUrl: string): string | undefined {
    return videoMap.get(blobUrl);
}
