import type { SocialMediaItem, SocialPostSnapshot } from "../../types";
import { buildFuraffinityCaptionHtml } from "../text/FuraffinityCaption";

/** Submission view containers found on FurAffinity gallery and view pages. */
export const FURAFFINITY_SUBMISSION_SELECTOR = "section.submission-content, .submission-content, #submission";

const FURAFFINITY_BASE_URL = "https://www.furaffinity.net/";

/**
 * Collects FurAffinity submission views inside a DOM subtree.
 *
 * @param root - Subtree to scan.
 * @returns The submission view elements, without duplicates.
 */
export function findFuraffinitySubmissions(root: ParentNode): Element[] {
    if (!(root instanceof Element || root instanceof Document || root instanceof DocumentFragment)) {
        return [];
    }

    const submissions = new Set<Element>();

    if (root instanceof Element && root.matches(FURAFFINITY_SUBMISSION_SELECTOR)) {
        submissions.add(root);
    }

    for (const submission of Array.from(root.querySelectorAll(FURAFFINITY_SUBMISSION_SELECTOR))) {
        submissions.add(submission);
    }

    return [...submissions];
}

/**
 * Finds the control row where the send button belongs.
 *
 * @param submission - Submission view element.
 * @returns The control row, or the submission view itself.
 */
export function findFuraffinityInsertRow(submission: Element): Element {
    return submission.querySelector(".submission-controls, .actions-toolbar, .submission-actions") ?? submission;
}

/**
 * Reads the visible text of the first matching element.
 */
function readViewText(root: ParentNode, selector: string): string {
    return root.querySelector(selector)?.textContent?.trim() ?? "";
}

/**
 * Resolves a media source URL against the FurAffinity origin.
 */
function absoluteMediaUrl(value: string): string | null {
    try {
        const url = new URL(value, FURAFFINITY_BASE_URL);

        return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
    } catch {
        return null;
    }
}

/**
 * Maps the media shown in a FurAffinity submission view into Telegram attachments.
 *
 * @param root - Submission view subtree.
 * @returns The resolved media items, or an empty list when the view has no media.
 */
export function extractFuraffinityMedia(root: ParentNode): SocialMediaItem[] {
    const image = root.querySelector("#submission-img, img.submission-image, img[src*='facdn.net']");
    const videoSource = root.querySelector("video[src], video source[src], source[src]");
    const media: SocialMediaItem[] = [];
    const seen = new Set<string>();

    for (const element of [videoSource, image]) {
        const value = element?.getAttribute("src");

        if (!value) {
            continue;
        }

        const url = absoluteMediaUrl(value);

        if (!url || seen.has(url)) {
            continue;
        }

        seen.add(url);
        media.push({
            kind: element === videoSource
                ? "video"
                : /\.gif(?:\?|$)/i.test(url)
                    ? "gif"
                    : "photo",
            url
        });
    }

    return media;
}

/**
 * Builds a content-script snapshot from the visible submission view.
 *
 * @param root - Submission view subtree.
 * @returns The snapshot used by the worker, or null when no media is visible.
 */
export function buildFuraffinitySnapshot(root: ParentNode): SocialPostSnapshot | null {
    const media = extractFuraffinityMedia(root);

    if (media.length === 0) {
        return null;
    }

    return {
        text: buildFuraffinityCaptionHtml(
            readViewText(root, ".submission-title h2, h2.submission-title, .submission-title"),
            readViewText(root, ".submission-artist, .submission-artist-container a"),
            readViewText(root, ".submission-description")
        ),
        media
    };
}
