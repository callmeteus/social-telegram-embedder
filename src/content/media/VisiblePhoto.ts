/**
 * Picks the most prominent visible photo element inside a DOM subtree.
 */
export function pickVisiblePhotoImage(
    root: ParentNode,
    selector: string
): HTMLImageElement | null {
    const candidates = Array.from(root.querySelectorAll(selector))
        .filter((node): node is HTMLImageElement => node instanceof HTMLImageElement);

    let best: HTMLImageElement | null = null;
    let bestArea = 0;

    for (const image of candidates) {
        if (!isVisibleElement(image) || !isLikelyContentPhoto(image)) {
            continue;
        }

        const area = image.clientWidth * image.clientHeight;

        if (area > bestArea) {
            best = image;
            bestArea = area;
        }
    }

    return best;
}

/**
 * Resolves the best URL for a photo element (srcset largest, then src).
 */
export function resolvePhotoImageUrl(image: HTMLImageElement): string | null {
    const fromSrcset = pickLargestSrcsetUrl(image.srcset);

    if (fromSrcset) {
        return fromSrcset;
    }

    const src = image.currentSrc || image.src;

    if (!src || src.startsWith("data:")) {
        return null;
    }

    return src;
}

/**
 * Returns true when the element is visible and has a non-zero layout box.
 */
export function isVisibleElement(element: Element): boolean {
    if (!(element instanceof HTMLElement)) {
        return false;
    }

    if (element.closest('[aria-hidden="true"]')) {
        return false;
    }

    const style = window.getComputedStyle(element);

    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
        return false;
    }

    const rect = element.getBoundingClientRect();

    return rect.width >= 48 && rect.height >= 48;
}

function isLikelyContentPhoto(image: HTMLImageElement): boolean {
    const src = (image.currentSrc || image.src || "").toLowerCase();

    if (!src || src.startsWith("data:")) {
        return false;
    }

    if (src.includes("profile_images") || src.includes("profile_banners")) {
        return false;
    }

    if (src.includes("emoji") || src.includes("/rsrc.php")) {
        return false;
    }

    return true;
}

function pickLargestSrcsetUrl(srcset: string): string | null {
    const trimmed = srcset.trim();

    if (!trimmed) {
        return null;
    }

    let bestUrl: string | null = null;
    let bestWidth = 0;

    for (const entry of trimmed.split(",")) {
        const parts = entry.trim().split(/\s+/);
        const url = parts[0];
        const widthToken = parts[1] ?? "";
        const width = Number.parseInt(widthToken.replace(/\D/g, ""), 10) || 0;

        if (width >= bestWidth) {
            bestWidth = width;
            bestUrl = url;
        }
    }

    return bestUrl;
}
