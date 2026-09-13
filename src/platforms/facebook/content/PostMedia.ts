import type { SocialPostSnapshot } from "../../types";

/**
 * Returns true when the URL is a generic Facebook video placeholder image.
 */
export function isFacebookVideoPlaceholderPoster(url: string): boolean {
    return /fbcdn\.net\/rsrc\.php.*AAqMW82PqGg\.gif/i.test(url)
        || /\/rsrc\.php\/v4\/yN\/r\/AAqMW82PqGg\.gif/i.test(url);
}

/**
 * Extracts photo and direct video URLs from a Facebook post container.
 */
export function extractPostMedia(root: Element): SocialPostSnapshot["media"] {
    const media: SocialPostSnapshot["media"] = [];
    const urls = new Set<string>();
    const imageSelector = [
        'img[data-imgperflogname="feedImage"]',
        'img[data-imgperflogname="feedCoverPhoto"]',
        'img[data-visualcompletion="media-vc-image"]'
    ].join(", ");

    for (const img of Array.from(root.querySelectorAll(imageSelector))) {
        if (!(img instanceof HTMLImageElement) || !img.src) {
            continue;
        }

        if (img.src.startsWith("data:")) {
            continue;
        }

        if (urls.has(img.src)) {
            continue;
        }

        urls.add(img.src);
        media.push({
            kind: "photo",
            url: img.src
        });
    }

    for (const video of Array.from(root.querySelectorAll("video"))) {
        if (!(video instanceof HTMLVideoElement)) {
            continue;
        }

        const videoUrl = resolveVideoMediaUrl(video);

        if (!videoUrl || urls.has(videoUrl) || isFacebookVideoPlaceholderPoster(videoUrl)) {
            continue;
        }

        urls.add(videoUrl);
        media.push({
            kind: "video",
            url: videoUrl
        });
    }

    return media;
}

function resolveVideoMediaUrl(video: HTMLVideoElement): string | null {
    const candidates = [
        video.currentSrc,
        video.src,
        ...Array.from(video.querySelectorAll("source")).map((source) => source.src)
    ].filter(Boolean);

    for (const candidate of candidates) {
        if (candidate.startsWith("blob:") || candidate.startsWith("data:")) {
            continue;
        }

        if (!isFacebookVideoPlaceholderPoster(candidate)) {
            return candidate;
        }
    }

    return null;
}
