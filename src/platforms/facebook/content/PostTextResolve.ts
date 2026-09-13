import { parseFacebookPostBodyFromHtml } from "../api/OpenGraphFetch";
import {
    isFacebookProfileNavigationText,
    isFacebookTruncatedText,
    isOnlyFacebookExpandLink,
    normalizeWhitespace,
    stripFacebookExpandSuffix
} from "./PostTextUtils";

const TEXT_EXPAND_WAIT_MS = 250;

/**
 * Resolves full Facebook post body text when the feed shows a truncated preview.
 */
export async function resolveFacebookPostBody(
    root: Element,
    postUrl: string | null | undefined,
    initialBody: string,
    reExtract: () => string
): Promise<string> {
    const cleanedInitial = stripFacebookExpandSuffix(initialBody);

    if (cleanedInitial && !isFacebookTruncatedText(initialBody)) {
        return cleanedInitial;
    }

    const expandedInDom = await expandFacebookTextInDom(root, reExtract);

    if (expandedInDom && !isFacebookTruncatedText(expandedInDom)) {
        return stripFacebookExpandSuffix(expandedInDom);
    }

    if (postUrl) {
        const fromPage = await fetchFacebookPostBodyFromPage(postUrl);

        if (fromPage && !isFacebookTruncatedText(fromPage) && !isFacebookProfileNavigationText(fromPage)) {
            return stripFacebookExpandSuffix(fromPage);
        }
    }

    return cleanedInitial;
}

async function expandFacebookTextInDom(
    root: Element,
    reExtract: () => string
): Promise<string | null> {
    const expandControl = findSeeMoreControl(root);

    if (expandControl) {
        expandControl.click();
        await wait(TEXT_EXPAND_WAIT_MS);
    }

    const body = reExtract();

    if (!body || isOnlyFacebookExpandLink(body)) {
        return null;
    }

    return body;
}

function findSeeMoreControl(root: Element): HTMLElement | null {
    const storyMessage = root.querySelector('[data-ad-rendering-role="story_message"]');
    const scopes = [storyMessage, root].filter((scope): scope is Element => scope instanceof Element);

    for (const scope of scopes) {
        for (const node of Array.from(scope.querySelectorAll('[role="button"], [role="link"], div[tabindex="0"]'))) {
            if (!(node instanceof HTMLElement)) {
                continue;
            }

            const label = normalizeWhitespace(node.textContent ?? "");

            if (!label) {
                continue;
            }

            if (/coment/i.test(label)) {
                continue;
            }

            if (/^(?:\.{3}|…)?\s*(?:ver mais|see more)\.?$/i.test(label)) {
                return node;
            }
        }
    }

    return null;
}

async function fetchFacebookPostBodyFromPage(postUrl: string): Promise<string | null> {
    try {
        const response = await fetch(postUrl, {
            credentials: "include",
            redirect: "follow"
        });

        if (!response.ok) {
            return null;
        }

        const html = await response.text();

        return parseFacebookPostBodyFromHtml(html);
    } catch {
        return null;
    }
}

function wait(durationMs: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, durationMs);
    });
}
