export const X_POST_ARTICLE_SELECTOR = 'article[data-testid="tweet"], article[role="article"]';
export const INJECTED_POST_ATTR = "data-x2tg-injected";
export const INJECTED_ACTION_BAR_ATTR = "data-x2tg-action-bar-injected";

/**
 * Collects tweet action bars inside a DOM subtree.
 */
export function collectTweetActionBars(root: ParentNode): Element[] {
    if (root instanceof Element && isTweetActionBar(root)) {
        return [root];
    }

    if (!(root instanceof Element || root instanceof Document || root instanceof DocumentFragment)) {
        return [];
    }

    return Array.from(root.querySelectorAll('[role="group"]')).filter(isTweetActionBar);
}

/**
 * Detects X/Twitter action toolbars across timeline and detail layouts.
 */
export function isTweetActionBar(element: Element): boolean {
    if (element.getAttribute("role") !== "group") {
        return false;
    }

    const hasReply = element.querySelector('[data-testid="reply"]') !== null;
    const hasRetweet = element.querySelector('[data-testid="retweet"]') !== null;

    if (!hasReply || !hasRetweet) {
        return false;
    }

    const ariaLabel = element.getAttribute("aria-label")?.toLowerCase() ?? "";

    if (
        ariaLabel.includes("respost")
        || ariaLabel.includes("repost")
        || ariaLabel.includes("curtida")
        || ariaLabel.includes("like")
        || ariaLabel.includes("visualiza")
        || ariaLabel.includes("view")
    ) {
        return true;
    }

    return countActionSlots(element) >= 3;
}

/**
 * Finds the most specific action bar inside a post container.
 */
export function findActionBar(postElement: Element): Element | null {
    const candidates = Array.from(postElement.querySelectorAll('[role="group"]'))
        .filter(isTweetActionBar);

    if (candidates.length === 0) {
        return null;
    }

    return candidates.sort((left, right) => left.children.length - right.children.length)[0];
}

/**
 * Finds the native share button across X layout variants.
 */
export function findShareButton(scope: Element): HTMLButtonElement | null {
    const byTestId = scope.querySelector('[data-testid="share"]');

    if (byTestId instanceof HTMLButtonElement) {
        return byTestId;
    }

    for (const button of Array.from(scope.querySelectorAll("button[aria-label]"))) {
        if (!(button instanceof HTMLButtonElement)) {
            continue;
        }

        const label = button.getAttribute("aria-label")?.toLowerCase() ?? "";

        if (label.includes("compartilhar") || label.includes("share post") || label === "share") {
            return button;
        }
    }

    return null;
}

/**
 * Walks up from a control button to the slot wrapper that is a direct child of the action bar.
 */
export function resolveActionSlot(button: HTMLButtonElement, actionBar: Element): HTMLElement | null {
    let slot: HTMLElement | null = button.parentElement;

    while (slot && slot.parentElement && slot.parentElement !== actionBar) {
        slot = slot.parentElement;
    }

    if (slot?.parentElement === actionBar) {
        return slot;
    }

    return button.parentElement;
}

/**
 * Resolves where to insert the Telegram button relative to the share control.
 */
export function findShareInsertAnchor(actionBar: Element): Element | null {
    const shareButton = findShareButton(actionBar);

    if (!shareButton) {
        return null;
    }

    return resolveActionSlot(shareButton, actionBar);
}

function countActionSlots(group: Element): number {
    return Array.from(group.children).filter((child) => containsActionControl(child)).length;
}

function containsActionControl(element: Element): boolean {
    return element.querySelector('[data-testid="reply"]') !== null
        || element.querySelector('[data-testid="retweet"]') !== null
        || element.querySelector('[data-testid="like"]') !== null
        || element.querySelector('[data-testid="bookmark"]') !== null
        || element.querySelector('[data-testid="share"]') !== null
        || findShareButton(element) !== null;
}
