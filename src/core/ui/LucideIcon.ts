/**
 * Creates an inline SVG element from a Lucide static markup string.
 */
export function createLucideSvgElement(lucideMarkup: string, size = 16): SVGSVGElement {
    const doc = new DOMParser().parseFromString(lucideMarkup.trim(), "image/svg+xml");
    const parsed = doc.documentElement;

    if (!(parsed instanceof SVGSVGElement)) {
        throw new Error("Invalid Lucide SVG markup.");
    }

    parsed.setAttribute("width", String(size));
    parsed.setAttribute("height", String(size));
    parsed.setAttribute("aria-hidden", "true");

    return parsed;
}

/**
 * Replaces a button's content with a Lucide icon.
 */
export function setButtonLucideIcon(
    button: HTMLButtonElement,
    lucideMarkup: string,
    size = 16
): void {
    button.replaceChildren(createLucideSvgElement(lucideMarkup, size));
}
