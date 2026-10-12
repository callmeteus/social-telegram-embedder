import { pickVisiblePhotoImage, resolvePhotoImageUrl } from "../../../content/media/VisiblePhoto";
import type { SocialMediaItem } from "../../types";

const FACEBOOK_MEDIA_IMAGE_SELECTOR = [
    'img[data-imgperflogname="feedImage"]',
    'img[data-imgperflogname="feedCoverPhoto"]',
    'img[data-visualcompletion="media-vc-image"]'
].join(", ");

/**
 * Returns true when Facebook is showing a photo in a modal or dedicated photo view.
 */
export function isFacebookPhotoViewerContext(
    location: Location = window.location,
    root: Element
): boolean {
    if (location.pathname.includes("/photo/") || location.pathname.includes("/photos/")) {
        return true;
    }

    if (location.search.includes("fbid=")) {
        return true;
    }

    const dialog = root.closest('[role="dialog"]') ?? document.querySelector('[role="dialog"]');

    if (!dialog) {
        return false;
    }

    return dialog.querySelector(FACEBOOK_MEDIA_IMAGE_SELECTOR) !== null;
}

/**
 * When a photo viewer is open, keeps only the image currently on screen.
 */
export function narrowMediaForPhotoViewer(
    root: Element,
    location: Location,
    media: SocialMediaItem[]
): SocialMediaItem[] {
    if (!isFacebookPhotoViewerContext(location, root)) {
        return media;
    }

    const photos = media.filter((item) => item.kind === "photo");

    if (photos.length <= 1) {
        return media;
    }

    const viewerRoot = root.closest('[role="dialog"]') ?? root;
    const focusedPhoto = pickFacebookViewerPhotoUrl(viewerRoot);

    if (!focusedPhoto) {
        return media;
    }

    const videos = media.filter((item) => item.kind !== "photo");

    return [
        {
            kind: "photo",
            url: focusedPhoto
        },
        ...videos
    ];
}

/**
 * Keeps only photos whose URLs were selected on the timeline picker.
 */
export function filterMediaToSelectedPhotos(
    media: SocialMediaItem[],
    selectedPhotoUrls: string[]
): SocialMediaItem[] {
    const selected = new Set(selectedPhotoUrls);
    const photos = media.filter((item) => item.kind === "photo" && selected.has(item.url));
    const nonPhotos = media.filter((item) => item.kind !== "photo");

    return [...photos, ...nonPhotos];
}

function pickFacebookViewerPhotoUrl(root: ParentNode): string | null {
    const image = pickVisiblePhotoImage(root, FACEBOOK_MEDIA_IMAGE_SELECTOR);

    if (!image) {
        return null;
    }

    return resolvePhotoImageUrl(image);
}
