import {
    isFacebookDirectVideoUrl,
    parseFacebookVideoUrlsFromHtml
} from "../api/OpenGraphFetch";
import { facebookReelUrlFromVideoId } from "../url/FacebookUrl";
import type { SocialMediaItem } from "../../types";
import { extractPostMedia, isFacebookVideoPlaceholderPoster } from "./PostMedia";

const VIDEO_RESOLVE_TIMEOUT_MS = 4000;
const VIDEO_POLL_INTERVAL_MS = 100;
const SILENT_PLAY_TIMEOUT_MS = 1500;

interface VideoPlaybackState {
    paused: boolean;
    currentTime: number;
    muted: boolean;
    volume: number;
}

/**
 * Builds a post snapshot media list, resolving Facebook videos from the live page.
 */
export async function resolveFacebookPostMedia(
    root: Element,
    postUrl?: string | null
): Promise<SocialMediaItem[]> {
    const baseMedia = extractPostMedia(root);

    if (baseMedia.some((item) => item.kind === "video" && !isPlaceholderMediaUrl(item.url))) {
        return baseMedia;
    }

    if (!hasFacebookVideoContainer(root) && !baseMedia.some((item) => isPlaceholderMediaUrl(item.url))) {
        return baseMedia;
    }

    const videoId = root.querySelector("[data-video-id]")?.getAttribute("data-video-id") ?? null;
    const resolvedVideo = await resolveFacebookVideoMedia(root, postUrl, videoId);

    if (resolvedVideo) {
        const photos = baseMedia.filter((item) =>
            item.kind === "photo" && !isPlaceholderMediaUrl(item.url)
        );

        return [...photos, resolvedVideo];
    }

    return baseMedia.filter((item) => !isPlaceholderMediaUrl(item.url));
}

function hasFacebookVideoContainer(root: Element): boolean {
    return root.querySelector("[data-video-id], video") !== null;
}

function isPlaceholderMediaUrl(url: string): boolean {
    return isFacebookVideoPlaceholderPoster(url);
}

async function resolveFacebookVideoMedia(
    root: Element,
    postUrl: string | null | undefined,
    videoId: string | null
): Promise<SocialMediaItem | null> {
    const directUrl = pickBestDirectVideoUrl([
        ...parseVideoUrlsFromPerformanceEntries(videoId),
        ...parseVideoUrlsFromDocumentScripts(videoId),
        ...await fetchVideoUrlsFromAuthenticatedPages(root, postUrl)
    ]);

    if (directUrl) {
        console.debug("[facebook] resolved reel video from direct URL: %s", directUrl);

        return {
            kind: "video",
            url: directUrl
        };
    }

    const blobVideo = await resolveVideoFromDomBlob(root);

    if (blobVideo) {
        console.debug("[facebook] resolved reel video from DOM blob (%s bytes base64)", blobVideo.inlineBlob?.base64.length ?? 0);

        return blobVideo;
    }

    console.debug("[facebook] failed to resolve reel video for videoId=%s", videoId ?? "unknown");

    return null;
}

function pickBestDirectVideoUrl(urls: string[]): string | null {
    const unique = [...new Set(urls.filter((url) => !url.startsWith("blob:")))];

    if (unique.length === 0) {
        return null;
    }

    unique.sort((left, right) => scoreDirectVideoUrl(right) - scoreDirectVideoUrl(left));

    return unique[0] ?? null;
}

function scoreDirectVideoUrl(url: string): number {
    let score = 0;

    if (/browser_native_hd|playable_url_quality_hd|\/hd/i.test(url)) {
        score += 4;
    }

    if (/\.mp4(?:\?|$)/i.test(url)) {
        score += 2;
    }

    if (/video\.[^/]+\.fbcdn\.net/i.test(url)) {
        score += 1;
    }

    return score;
}

function parseVideoUrlsFromPerformanceEntries(videoId: string | null): string[] {
    const urls = performance.getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((name) => isFacebookDirectVideoUrl(name));

    if (urls.length === 0) {
        return [];
    }

    if (videoId) {
        const scoped = urls.filter((url) => url.includes(videoId));

        if (scoped.length > 0) {
            return scoped;
        }
    }

    if (document.querySelectorAll("[data-video-id]").length === 1) {
        return urls;
    }

    return [];
}

function parseVideoUrlsFromDocumentScripts(videoId: string | null): string[] {
    const scopedUrls = new Set<string>();
    const globalUrls = new Set<string>();

    for (const script of Array.from(document.querySelectorAll("script"))) {
        const content = script.textContent ?? "";

        if (content.length < 64) {
            continue;
        }

        const urls = parseFacebookVideoUrlsFromHtml(content);

        if (urls.length === 0) {
            continue;
        }

        if (videoId && content.includes(videoId)) {
            for (const url of urls) {
                scopedUrls.add(url);
            }
        } else {
            for (const url of urls) {
                globalUrls.add(url);
            }
        }
    }

    if (scopedUrls.size > 0) {
        return [...scopedUrls];
    }

    if (globalUrls.size > 0 && document.querySelectorAll("[data-video-id]").length === 1) {
        return [...globalUrls];
    }

    return [];
}

async function resolveVideoFromDomBlob(root: Element): Promise<SocialMediaItem | null> {
    for (const video of findReelVideos(root)) {
        const existingBlob = readVideoBlobUrl(video);

        if (existingBlob) {
            const item = await buildBlobVideoMediaItem(existingBlob);

            if (item) {
                return item;
            }
        }
    }

    for (const video of findReelVideos(root)) {
        const blobUrl = await waitForExistingVideoBlob(video, VIDEO_RESOLVE_TIMEOUT_MS);

        if (blobUrl) {
            const item = await buildBlobVideoMediaItem(blobUrl);

            if (item) {
                return item;
            }
        }
    }

    for (const video of findReelVideos(root)) {
        const blobUrl = await trySilentVideoBlobActivation(video);

        if (blobUrl) {
            const item = await buildBlobVideoMediaItem(blobUrl);

            if (item) {
                return item;
            }
        }
    }

    return null;
}

function findReelVideos(root: Element): HTMLVideoElement[] {
    const scopedVideo = root.querySelector("[data-video-id] video");

    if (scopedVideo instanceof HTMLVideoElement) {
        return [scopedVideo];
    }

    return Array.from(root.querySelectorAll("video"))
        .filter((video): video is HTMLVideoElement => video instanceof HTMLVideoElement);
}

async function buildBlobVideoMediaItem(blobUrl: string): Promise<SocialMediaItem | null> {
    const inlineBlob = await readInlineBlobFromUrl(blobUrl);

    if (!inlineBlob) {
        return null;
    }

    return {
        kind: "video",
        url: blobUrl,
        inlineBlob
    };
}

function readVideoBlobUrl(video: HTMLVideoElement): string | null {
    const url = readVideoElementUrl(video);

    return url?.startsWith("blob:") ? url : null;
}

async function waitForExistingVideoBlob(
    video: HTMLVideoElement,
    timeoutMs: number
): Promise<string | null> {
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
        const blobUrl = readVideoBlobUrl(video);

        if (blobUrl) {
            return blobUrl;
        }

        await wait(VIDEO_POLL_INTERVAL_MS);
    }

    return readVideoBlobUrl(video);
}

async function trySilentVideoBlobActivation(video: HTMLVideoElement): Promise<string | null> {
    const existing = readVideoBlobUrl(video);

    if (existing) {
        return existing;
    }

    const state = captureVideoPlaybackState(video);

    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;
    video.setAttribute("muted", "");

    if (video.paused) {
        try {
            await video.play();
        } catch {
            restoreVideoPlaybackState(video, state);
            return null;
        }
    }

    const blobUrl = await waitForExistingVideoBlob(video, SILENT_PLAY_TIMEOUT_MS);

    restoreVideoPlaybackState(video, state);

    return blobUrl;
}

function captureVideoPlaybackState(video: HTMLVideoElement): VideoPlaybackState {
    return {
        paused: video.paused,
        currentTime: video.currentTime,
        muted: video.muted,
        volume: video.volume
    };
}

function restoreVideoPlaybackState(video: HTMLVideoElement, state: VideoPlaybackState): void {
    if (state.paused) {
        video.pause();
    }

    try {
        video.currentTime = state.currentTime;
    } catch {
        // Seek can fail while the player is still loading.
    }

    video.muted = state.muted;
    video.volume = state.volume;

    if (state.muted) {
        video.setAttribute("muted", "");
    } else {
        video.removeAttribute("muted");
    }
}

async function fetchVideoUrlsFromAuthenticatedPages(
    root: Element,
    postUrl?: string | null
): Promise<string[]> {
    const urls = new Set<string>();
    const candidates = new Set<string>();

    if (postUrl) {
        candidates.add(postUrl);
    }

    const videoId = root.querySelector("[data-video-id]")?.getAttribute("data-video-id");
    const reelUrl = videoId ? facebookReelUrlFromVideoId(videoId) : null;

    if (reelUrl) {
        candidates.add(reelUrl);
    }

    for (const candidate of candidates) {
        const html = await fetchAuthenticatedFacebookHtml(candidate);

        if (!html) {
            continue;
        }

        for (const videoUrl of parseFacebookVideoUrlsFromHtml(html)) {
            urls.add(videoUrl);
        }
    }

    return [...urls];
}

async function fetchAuthenticatedFacebookHtml(url: string): Promise<string | null> {
    try {
        const response = await fetch(url, {
            credentials: "include",
            redirect: "follow"
        });

        if (!response.ok) {
            return null;
        }

        return await response.text();
    } catch {
        return null;
    }
}

function readVideoElementUrl(video: HTMLVideoElement): string | null {
    const candidates = [
        video.currentSrc,
        video.src,
        ...Array.from(video.querySelectorAll("source")).map((source) => source.src)
    ].filter(Boolean);

    for (const candidate of candidates) {
        if (candidate.startsWith("data:")) {
            continue;
        }

        if (candidate.startsWith("blob:")) {
            return candidate;
        }

        if (!isPlaceholderMediaUrl(candidate)) {
            return candidate;
        }
    }

    return null;
}

async function readInlineBlobFromUrl(
    url: string
): Promise<SocialMediaItem["inlineBlob"] | undefined> {
    try {
        const response = await fetch(url);

        if (!response.ok) {
            return undefined;
        }

        const blob = await response.blob();

        if (blob.size < 4096) {
            return undefined;
        }

        const buffer = await blob.arrayBuffer();

        return {
            base64: arrayBufferToBase64(buffer),
            mimeType: blob.type.startsWith("video/") ? blob.type : "video/mp4"
        };
    } catch (err) {
        console.debug("[facebook] failed to read inline blob from %s: %O", url, err);

        return undefined;
    }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;

    for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }

    return btoa(binary);
}

function wait(durationMs: number): Promise<void> {
    return new Promise((resolve) => {
        window.setTimeout(resolve, durationMs);
    });
}
