/**
 * Returns true when Facebook text ends with a collapsed "see more" affordance.
 */
export function isFacebookTruncatedText(text: string): boolean {
    const normalized = normalizeWhitespace(text);

    if (!normalized) {
        return false;
    }

    if (isOnlyFacebookExpandLink(normalized)) {
        return true;
    }

    return /(?:\.{3}|…)\s*(?:ver mais|see more)\.?$/i.test(normalized);
}

/**
 * Returns true when the text is only the expand link label.
 */
export function isOnlyFacebookExpandLink(text: string): boolean {
    return /^(?:(?:\.{3}|…)\s*)?(?:ver mais|see more)\.?$/i.test(normalizeWhitespace(text));
}

/**
 * Removes Facebook "see more" suffixes from post text.
 */
export function stripFacebookExpandSuffix(text: string): string {
    return normalizeWhitespace(text)
        .replace(/(?:\.{3}|…)\s*(?:ver mais|see more)\.?$/i, "")
        .trim();
}

/**
 * Normalizes whitespace in extracted Facebook text.
 */
export function normalizeWhitespace(text: string): string {
    return text.replace(/\s+/g, " ").trim();
}

/**
 * Returns true when the text is a Facebook profile navigation affordance.
 */
export function isFacebookProfileNavigationText(text: string): boolean {
    return /^(?:ver perfil(?: do dono)?|see profile(?: owner)?|view profile(?: owner)?|view owner(?:'s)? profile)$/i.test(
        normalizeWhitespace(text)
    );
}

/**
 * Returns true when profile header text is a Facebook activity line, not a display name.
 */
export function isFacebookActivityHeaderText(text: string): boolean {
    const normalized = normalizeWhitespace(text);

    if (!normalized) {
        return false;
    }

    return /(?:atualizou a foto do perfil|atualizou a foto de capa|updated (?:their|his|her) profile picture|updated (?:their|his|her) cover photo|changed (?:their|his|her) profile picture)/i.test(
        normalized
    );
}

/**
 * Converts Facebook inline emoji images into plain text while preserving visible copy.
 */
export function extractFacebookRichText(root: Element): string {
    const parts: string[] = [];

    const walk = (node: Node): void => {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent ?? "";

            if (text) {
                parts.push(text);
            }

            return;
        }

        if (!(node instanceof Element)) {
            return;
        }

        if (node.getAttribute("aria-hidden") === "true") {
            return;
        }

        if (node.tagName === "IMG") {
            const alt = node.getAttribute("alt")?.trim();

            if (alt && isFacebookEmojiAlt(alt)) {
                parts.push(alt);
            }

            return;
        }

        for (const child of Array.from(node.childNodes)) {
            walk(child);
        }
    };

    walk(root);

    return normalizeWhitespace(parts.join(""));
}

function isFacebookEmojiAlt(value: string): boolean {
    if (!value || value.length > 8) {
        return false;
    }

    return /[\p{Extended_Pictographic}]/u.test(value);
}

/**
 * Returns true when reel overlay text is player chrome rather than caption content.
 */
export function isFacebookReelChromeText(text: string): boolean {
    const normalized = normalizeWhitespace(text);

    if (!normalized || isFacebookProfileNavigationText(normalized)) {
        return true;
    }

    if (/^(?:curtir|like|comentar|comment|compartilhar|share|menu|seg(uir|uir)|follow|silenciar|mute|pesquisar reel|search reel)$/i.test(normalized)) {
        return true;
    }

    if (/^\d[\d.,\s]*(?:mil|k|m|milh(?:ão|ões)|million)?$/i.test(normalized)) {
        return true;
    }

    return false;
}
