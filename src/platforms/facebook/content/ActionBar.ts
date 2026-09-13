import { normalizeWhitespace } from "./PostTextUtils";

export const FB_PROFILE_NAME_SELECTOR = '[data-ad-rendering-role="profile_name"]';
export const INJECTED_POST_ATTR = "data-x2tg-fb-injected";
export const INJECTED_ACTION_BAR_ATTR = "data-x2tg-fb-action-bar-injected";

const REEL_SHARE_ARIA_LABELS = ["Compartilhar", "Share"];
const REEL_LIKE_ARIA_LABELS = ["Curtir", "Like"];
const REEL_COMMENT_ARIA_LABELS = ["Comentar", "Comment"];

const FEED_ACTION_LABELS = [
    /^compartilhar$/i,
    /^share$/i,
    /^curtir$/i,
    /^like$/i,
    /^comentar$/i,
    /^comment$/i
];

const POST_CONTENT_SELECTORS = [
    '[data-ad-rendering-role="story_message"]',
    '[data-ad-rendering-role="title"]',
    '[data-ad-rendering-role="description"]',
    'img[data-imgperflogname="feedImage"]',
    'img[data-imgperflogname="feedCoverPhoto"]',
    'img[data-visualcompletion="media-vc-image"]',
    "[data-video-id]"
];

const ACTION_BAR_MARKERS = [
    '[data-ad-rendering-role="share_button"]',
    '[data-ad-rendering-role="comment_button"]',
    '[data-ad-rendering-role="like_button"]'
];

/**
 * Detects Facebook like/comment action rows. Share is optional on some layouts.
 */
export function isFacebookActionBar(element: Element): boolean {
    return element.querySelector('[data-ad-rendering-role="like_button"]') !== null
        && element.querySelector('[data-ad-rendering-role="comment_button"]') !== null;
}

/**
 * Collects Facebook action bars inside a DOM subtree.
 */
export function collectFacebookActionBars(root: ParentNode): Element[] {
    const bars = new Set<Element>();

    if (!(root instanceof Element || root instanceof Document || root instanceof DocumentFragment)) {
        return [];
    }

    for (const selector of ACTION_BAR_MARKERS) {
        for (const marker of Array.from(root.querySelectorAll(selector))) {
            const bar = findMinimalActionBar(marker);

            if (bar) {
                bars.add(bar);
            }
        }
    }

    return filterNestedActionBars([...bars]);
}

/**
 * Keeps only action bars that are not wrappers around another detected bar.
 */
export function filterNestedActionBars(bars: Element[]): Element[] {
    return bars.filter((bar) => !bars.some((other) => other !== bar && bar.contains(other)));
}

/**
 * Finds the smallest action bar ancestor for a share marker.
 */
function findMinimalActionBar(marker: Element): Element | null {
    let node: Element | null = marker;

    while (node) {
        if (isFacebookActionBar(node)) {
            return node;
        }

        node = node.parentElement;
    }

    return null;
}

/**
 * Finds the action bar inside a post container.
 */
export function findActionBar(postElement: Element): Element | null {
    const candidates = collectFacebookActionBars(postElement);

    if (candidates.length === 0) {
        return null;
    }

    return candidates.sort((left, right) => left.children.length - right.children.length)[0];
}

/**
 * Finds the native share control for cloning layout.
 */
export function findShareControl(scope: Element): HTMLElement | null {
    const marker = scope.querySelector('[data-ad-rendering-role="share_button"]');

    if (marker) {
        const control = marker.closest('[role="button"]');

        if (control instanceof HTMLElement) {
            return control;
        }

        if (marker.parentElement instanceof HTMLElement) {
            return marker.parentElement;
        }
    }

    return findReelShareControl(scope);
}

/**
 * Finds the native comment control for cloning layout.
 */
export function findCommentControl(scope: Element): HTMLElement | null {
    const marker = scope.querySelector('[data-ad-rendering-role="comment_button"]');

    if (marker) {
        const control = marker.closest('[role="button"]');

        if (control instanceof HTMLElement) {
            return control;
        }

        if (marker.parentElement instanceof HTMLElement) {
            return marker.parentElement;
        }
    }

    return null;
}

/**
 * Finds the reel viewer share button identified by aria-label.
 */
export function findReelShareControl(scope: Element): HTMLElement | null {
    for (const button of Array.from(scope.querySelectorAll('[role="button"][aria-label]'))) {
        if (!(button instanceof HTMLElement)) {
            continue;
        }

        if (matchesAriaLabel(button, REEL_SHARE_ARIA_LABELS)) {
            return button;
        }
    }

    return null;
}

/**
 * Walks up from a control to the slot wrapper that is a direct child of the action bar.
 */
export function resolveActionSlot(control: HTMLElement, actionBar: Element): HTMLElement | null {
    let slot: HTMLElement | null = control.parentElement;

    while (slot && slot.parentElement && slot.parentElement !== actionBar) {
        slot = slot.parentElement;
    }

    if (slot?.parentElement === actionBar) {
        return slot;
    }

    return control.parentElement;
}

/**
 * Resolves where to insert the Telegram button relative to the share control.
 */
export function findShareInsertAnchor(actionBar: Element): Element | null {
    const shareControl = findShareControl(actionBar);

    if (shareControl) {
        return resolveActionSlot(shareControl, actionBar);
    }

    const commentControl = findCommentControl(actionBar);

    if (commentControl) {
        return resolveActionSlot(commentControl, actionBar);
    }

    return null;
}

/**
 * Finds the tightest reel container for an action bar.
 * Stops before ancestors that contain multiple reels.
 */
export function findReelSnapshotRoot(actionBar: Element): Element {
    let node: Element | null = actionBar;
    let snapshotRoot: Element | null = null;

    while (node) {
        const videoHostCount = node.querySelectorAll("[data-video-id]").length;

        if (videoHostCount === 1 && node.contains(actionBar)) {
            snapshotRoot = node;
        }

        node = node.parentElement;
    }

    if (snapshotRoot) {
        return snapshotRoot;
    }

    const videoHost = findReelVideoHost(actionBar);

    if (videoHost?.parentElement) {
        return videoHost.parentElement;
    }

    return actionBar;
}

/**
 * Finds the nearest reel video host relative to an action bar.
 */
export function findReelVideoHost(actionBar: Element): Element | null {
    let node: Element | null = actionBar.parentElement;

    while (node) {
        for (const sibling of Array.from(node.children)) {
            const videoHost = sibling.matches("[data-video-id]")
                ? sibling
                : sibling.querySelector("[data-video-id]");

            if (videoHost instanceof Element) {
                return videoHost;
            }
        }

        node = node.parentElement;
    }

    return null;
}

/**
 * Collects reel viewer action bars that use aria-label controls.
 */
export function collectReelViewerActionBars(root: ParentNode): Element[] {
    const bars = new Set<Element>();

    if (!(root instanceof Element || root instanceof Document || root instanceof DocumentFragment)) {
        return [];
    }

    for (const shareControl of Array.from(findReelShareControls(root))) {
        const bar = findMinimalReelActionBar(shareControl);

        if (bar) {
            bars.add(bar);
        }
    }

    return [...bars];
}

/**
 * Finds the post container that owns a profile name node.
 */
export function findPostRootFromProfile(profileName: Element): Element {
    let node: Element | null = profileName;
    let contentCandidate: Element | null = null;

    while (node) {
        if (!node.contains(profileName)) {
            break;
        }

        if (findActionBar(node)) {
            return node;
        }

        if (nodeContainsPostContent(node)) {
            contentCandidate = node;
        }

        node = node.parentElement;
    }

    return contentCandidate ?? profileName;
}

function findReelShareControls(root: ParentNode): HTMLElement[] {
    if (!(root instanceof Element || root instanceof Document || root instanceof DocumentFragment)) {
        return [];
    }

    const controls: HTMLElement[] = [];

    for (const button of Array.from(root.querySelectorAll('[role="button"][aria-label]'))) {
        if (!(button instanceof HTMLElement)) {
            continue;
        }

        if (matchesAriaLabel(button, REEL_SHARE_ARIA_LABELS)) {
            controls.push(button);
        }
    }

    return controls;
}

function findMinimalReelActionBar(shareControl: Element): Element | null {
    let node: Element | null = shareControl;

    while (node) {
        if (isReelViewerActionBar(node)) {
            return node;
        }

        node = node.parentElement;
    }

    return null;
}

/**
 * Collects feed share rows that expose a visible Compartilhar label.
 */
export function collectLabeledShareActionBars(root: ParentNode): Element[] {
    const bars = new Set<Element>();

    if (!(root instanceof Element || root instanceof Document || root instanceof DocumentFragment)) {
        return [];
    }

    for (const control of findLabeledShareControls(root)) {
        const bar = findMinimalLabeledShareBar(control);

        if (bar) {
            bars.add(bar);
        }
    }

    return filterNestedActionBars([...bars]);
}

/**
 * Returns true when the element is a compact reel side-rail action bar.
 */
export function isReelViewerActionBar(element: Element): boolean {
    if (isFacebookActionBar(element)) {
        return false;
    }

    if (element.querySelector(FB_PROFILE_NAME_SELECTOR)) {
        return false;
    }

    if (element.querySelector('[data-ad-rendering-role="story_message"]')) {
        return false;
    }

    const likeControl = findReelLikeControl(element);
    const commentControl = findReelCommentControl(element);
    const shareControl = findReelShareControl(element);

    if (!likeControl || !commentControl || !shareControl) {
        return false;
    }

    return isIconOnlyFacebookActionControl(likeControl)
        && isIconOnlyFacebookActionControl(commentControl)
        && isIconOnlyFacebookActionControl(shareControl);
}

function findReelLikeControl(scope: Element): HTMLElement | null {
    for (const button of Array.from(scope.querySelectorAll('[role="button"][aria-label]'))) {
        if (button instanceof HTMLElement && matchesAriaLabel(button, REEL_LIKE_ARIA_LABELS)) {
            return button;
        }
    }

    return null;
}

function findReelCommentControl(scope: Element): HTMLElement | null {
    for (const button of Array.from(scope.querySelectorAll('[role="button"][aria-label]'))) {
        if (button instanceof HTMLElement && matchesAriaLabel(button, REEL_COMMENT_ARIA_LABELS)) {
            return button;
        }
    }

    return null;
}

function findLabeledShareControls(root: ParentNode): HTMLElement[] {
    if (!(root instanceof Element || root instanceof Document || root instanceof DocumentFragment)) {
        return [];
    }

    const controls: HTMLElement[] = [];

    for (const button of Array.from(root.querySelectorAll('[role="button"][aria-label]'))) {
        if (!(button instanceof HTMLElement)) {
            continue;
        }

        if (!matchesAriaLabel(button, REEL_SHARE_ARIA_LABELS)) {
            continue;
        }

        if (!hasVisibleFacebookActionLabel(button)) {
            continue;
        }

        controls.push(button);
    }

    return controls;
}

function findMinimalLabeledShareBar(control: HTMLElement): Element | null {
    let node: Element | null = control;

    while (node) {
        if (isLabeledShareActionBar(node)) {
            return node;
        }

        node = node.parentElement;
    }

    return null;
}

function isLabeledShareActionBar(element: Element): boolean {
    if (element.querySelector("[data-video-id]")) {
        return false;
    }

    const shareControls = findLabeledShareControls(element);

    return shareControls.length === 1;
}

function hasVisibleFacebookActionLabel(control: HTMLElement): boolean {
    const label = normalizeWhitespace(control.textContent ?? "");

    return FEED_ACTION_LABELS.some((pattern) => pattern.test(label));
}

/**
 * Returns true when a Facebook action control renders a visible feed label.
 */
export function isVisibleFacebookActionLabelControl(control: HTMLElement): boolean {
    return hasVisibleFacebookActionLabel(control);
}

function isIconOnlyFacebookActionControl(control: HTMLElement): boolean {
    return !hasVisibleFacebookActionLabel(control);
}

function nodeContainsPostContent(node: Element): boolean {
    return POST_CONTENT_SELECTORS.some((selector) => node.querySelector(selector) !== null);
}

function matchesAriaLabel(element: Element, labels: string[]): boolean {
    const ariaLabel = element.getAttribute("aria-label")?.trim();

    if (!ariaLabel) {
        return false;
    }

    return labels.some((label) => ariaLabel === label || ariaLabel.startsWith(`${label} `));
}
