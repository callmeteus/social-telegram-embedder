import { buildTikTokCaptionText } from "../text/TikTokCaption";

/** Selectors for TikTok's vertical video action rail. */
const TIKTOK_ACTION_BAR_SELECTOR = [
    '[data-e2e="video-actions"]',
    '[data-e2e="video-action-bar"]',
    '[data-e2e="action-bar"]'
].join(", ");

/** Selectors for the share control inside the video action rail. */
const TIKTOK_SHARE_SELECTOR = [
    '[data-e2e="share"]',
    '[data-e2e="video-share"]',
    '[data-e2e="share-icon"]'
].join(", ");

/** Selectors for the rendered video description. */
const TIKTOK_DESCRIPTION_SELECTOR = [
    '[data-e2e="video-desc"]',
    '[data-e2e="video-description"]'
].join(", ");

/**
 * Collects TikTok action rails inside a DOM subtree, without duplicates.
 *
 * @param root - Subtree to scan.
 * @returns The action rail elements.
 */
export function findTikTokActionBars(root: ParentNode): Element[] {
    const bars = new Set<Element>();

    if (root instanceof Element && root.matches(TIKTOK_ACTION_BAR_SELECTOR)) {
        bars.add(root);
    }

    for (const bar of Array.from(root.querySelectorAll(TIKTOK_ACTION_BAR_SELECTOR))) {
        bars.add(bar);
    }

    for (const share of Array.from(root.querySelectorAll(TIKTOK_SHARE_SELECTOR))) {
        const bar = share.closest(TIKTOK_ACTION_BAR_SELECTOR) ?? share.parentElement;

        if (bar instanceof Element) {
            bars.add(bar);
        }
    }

    return [...bars];
}

/**
 * Finds the element the send button should sit beside inside an action rail.
 *
 * @param actionBar - TikTok video action rail.
 * @returns The share control's wrapper, or the rail itself.
 */
export function findTikTokInsertTarget(actionBar: Element): Element {
    const share = actionBar.querySelector(TIKTOK_SHARE_SELECTOR) ?? actionBar;

    return share.parentElement instanceof Element ? share.parentElement : actionBar;
}

/**
 * Reads the caption of the TikTok video currently shown in the page.
 *
 * @param root - Subtree containing the rendered description or Open Graph metadata.
 * @returns Plain text for the caption draft, or an empty string.
 */
export function extractTikTokCaptionText(root: ParentNode): string {
    const rendered = root.querySelector(TIKTOK_DESCRIPTION_SELECTOR)?.textContent?.trim();

    if (rendered) {
        return buildTikTokCaptionText(rendered);
    }

    const meta = root
        .querySelector('meta[property="og:description"], meta[name="description"]')
        ?.getAttribute("content")?.trim();

    return buildTikTokCaptionText(meta ?? "");
}
