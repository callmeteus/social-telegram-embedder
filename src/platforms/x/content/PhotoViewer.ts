import { pickVisiblePhotoImage, resolvePhotoImageUrl } from "../../../content/media/VisiblePhoto";
import type { SocialPostSnapshot } from "../../types";
import {
    findTweetPostRootFromActionBar,
    X_POST_ARTICLE_SELECTOR
} from "./ActionBar";
import { preferTwitterLargeMediaUrl } from "./TwitterMediaUrl";
import { buildXContentArticleSnapshot } from "./XPostSnapshot";

const X_MEDIA_PHOTO_SELECTOR = 'img[src*="pbs.twimg.com/media/"]';
const X_PHOTO_PATH_PATTERN = /\/status\/(\d+)\/photo\/(\d+)/i;
const X_CAROUSEL_SLIDE_PATTERN = /slide\s+(\d+)\s+de\s+(\d+)/i;

/**
 * Returns true when the user is viewing a tweet photo in the X lightbox or photo route.
 */
export function isXContentPhotoViewerContext(location: Location = window.location): boolean {
    if (X_PHOTO_PATH_PATTERN.test(location.pathname)) {
        return true;
    }

    const modal = findXContentMediaModal();

    if (!modal) {
        return false;
    }

    return modal.querySelector('[data-testid="tweetPhoto"], [aria-roledescription="carousel"], ' + X_MEDIA_PHOTO_SELECTOR) !== null;
}

/**
 * Builds a snapshot with only the photo currently shown in the X viewer.
 */
export function buildXContentPhotoViewerSnapshot(
    location: Location = window.location,
    scope: ParentNode = document,
    actionBar?: Element
): SocialPostSnapshot | null {
    if (!isXContentPhotoViewerContext(location)) {
        return null;
    }

    const viewerRoot = findXContentPhotoViewerRoot(scope);
    const photoUrl = pickXContentViewerPhotoUrl(viewerRoot)
        ?? pickXContentViewerPhotoUrl(document);

    if (!photoUrl) {
        return null;
    }

    const normalizedPhotoUrl = preferTwitterLargeMediaUrl(photoUrl);
    const tweetArticle = findXContentTweetArticle(viewerRoot, actionBar);

    if (tweetArticle) {
        return buildXContentArticleSnapshot(tweetArticle, [normalizedPhotoUrl]);
    }

    return {
        text: "",
        media: [{
            kind: "photo",
            url: normalizedPhotoUrl
        }]
    };
}

function findXContentMediaModal(): Element | null {
    return document.querySelector('[role="dialog"][aria-modal="true"], [aria-modal="true"][role="dialog"]')
        ?? document.querySelector('[aria-modal="true"]');
}

function findXContentPhotoViewerRoot(scope: ParentNode): ParentNode {
    if (scope instanceof Element) {
        const nestedModal = scope.closest('[aria-modal="true"]');

        if (nestedModal) {
            return nestedModal;
        }
    }

    const modal = scope instanceof Document
        ? findXContentMediaModal()
        : scope.querySelector('[aria-modal="true"]');

    if (modal) {
        return modal;
    }

    return scope;
}

function findXContentTweetArticle(viewerRoot: ParentNode, actionBar?: Element): Element | null {
    const inViewer = viewerRoot.querySelector(X_POST_ARTICLE_SELECTOR);

    if (inViewer) {
        return inViewer;
    }

    if (actionBar) {
        const fromActionBar = findTweetPostRootFromActionBar(actionBar);

        if (fromActionBar) {
            return fromActionBar;
        }
    }

    return document.querySelector(X_POST_ARTICLE_SELECTOR);
}

function pickXContentViewerPhotoUrl(root: ParentNode): string | null {
    const carouselUrl = pickXContentCarouselActivePhotoUrl(root);

    if (carouselUrl) {
        return carouselUrl;
    }

    const image = pickVisiblePhotoImage(root, X_MEDIA_PHOTO_SELECTOR);

    if (!image) {
        return null;
    }

    return resolvePhotoImageUrl(image);
}

function pickXContentCarouselActivePhotoUrl(root: ParentNode): string | null {
    const carousel = root.querySelector('[aria-roledescription="carousel"]');

    if (!carousel) {
        return null;
    }

    const slides = Array.from(carousel.querySelectorAll('li[role="listitem"]'));

    if (slides.length === 0) {
        return null;
    }

    const slideIndex = readXContentCarouselSlideIndex(root);
    let targetSlide = slides[0];

    if (slideIndex !== null && slideIndex >= 1 && slideIndex <= slides.length) {
        targetSlide = slides[slideIndex - 1];
    } else {
        targetSlide = findMostVisibleCarouselSlide(slides) ?? slides[0];
    }

    const image = targetSlide.querySelector(X_MEDIA_PHOTO_SELECTOR);

    if (!(image instanceof HTMLImageElement)) {
        return null;
    }

    return resolvePhotoImageUrl(image);
}

function readXContentCarouselSlideIndex(root: ParentNode): number | null {
    for (const node of Array.from(root.querySelectorAll("span, div"))) {
        const text = node.textContent?.trim() ?? "";
        const match = text.match(X_CAROUSEL_SLIDE_PATTERN);

        if (match?.[1]) {
            return Number.parseInt(match[1], 10);
        }
    }

    return null;
}

function findMostVisibleCarouselSlide(slides: Element[]): Element | null {
    let bestSlide: Element | null = null;
    let bestVisibleArea = 0;

    for (const slide of slides) {
        const rect = slide.getBoundingClientRect();
        const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
        const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
        const visibleArea = visibleWidth * visibleHeight;

        if (visibleArea > bestVisibleArea) {
            bestSlide = slide;
            bestVisibleArea = visibleArea;
        }
    }

    return bestSlide;
}
