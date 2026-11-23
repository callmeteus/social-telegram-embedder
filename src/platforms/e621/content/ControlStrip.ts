import { buildE621CaptionText } from "../text/E621Caption";

/** Control strip rendered directly below the artwork on an E621 post view. */
export const E621_CONTROL_STRIP_SELECTOR = "#ptbr-wrapper";

/**
 * Decodes the base64 JSON payload injected by E621 in the post page.
 */
function decodeE621Payload(encoded: string): unknown {
    const binary = atob(encoded.replace(/\s+/g, ""));
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index++) {
        bytes[index] = binary.charCodeAt(index);
    }

    const json = new TextDecoder().decode(bytes);

    return JSON.parse(json);
}

/**
 * Collects E621 control strips inside a DOM subtree.
 *
 * @param root - Subtree to scan.
 * @returns The control strip elements, without duplicates.
 */
export function findE621ControlStrips(root: ParentNode): Element[] {
    if (!(root instanceof Element || root instanceof Document || root instanceof DocumentFragment)) {
        return [];
    }

    const strips = new Set<Element>();

    if (root instanceof Element && root.matches(E621_CONTROL_STRIP_SELECTOR)) {
        strips.add(root);
    }

    for (const strip of Array.from(root.querySelectorAll(E621_CONTROL_STRIP_SELECTOR))) {
        strips.add(strip);
    }

    return [...strips];
}

/**
 * Finds the last toolbar row so the send button is the final control in the strip.
 *
 * @param strip - E621 control strip.
 * @returns The row where the send button should be appended.
 */
export function findE621InsertRow(strip: Element): Element {
    const rows = Array.from(strip.querySelectorAll(".ptbr-row"));

    return rows[rows.length - 1] ?? strip;
}

/**
 * Reads the caption text of the post currently shown in the page.
 *
 * @param root - Subtree containing the post data payload or rendered description.
 * @returns Plain text for the caption draft, or an empty string.
 */
export function extractE621CaptionText(root: ParentNode): string {
    const encoded = root.querySelector("#post-data")?.textContent?.trim();

    if (encoded) {
        try {
            const payload: unknown = decodeE621Payload(encoded);

            if (typeof payload === "object" && payload !== null && "description" in payload) {
                const description = Reflect.get(payload, "description");

                if (typeof description === "string") {
                    return buildE621CaptionText(description);
                }
            }
        } catch {
            // Fall back to the rendered description.
        }
    }

    const rendered = root.querySelector("#post-information .styled-dtext, [itemprop='description']");

    return buildE621CaptionText(rendered?.textContent ?? "");
}
