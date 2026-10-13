/** Plain text plus bold ranges (UTF-16 offsets, as MTProto expects). */
export interface FormattedText {
    text: string;
    bold: { offset: number; length: number }[];
}

const HTML_ENTITIES: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": "\"",
    "&#39;": "'"
};

/**
 * Converts the caption HTML produced for the Bot API (escaped text plus `<b>` tags)
 * into plain text with bold ranges. Unknown tags are stripped.
 */
export function telegramHtmlToFormattedText(html: string): FormattedText {
    const bold: FormattedText["bold"] = [];
    const tokens = html.split(/(<\/?[a-z]+[^>]*>)/i);
    let text = "";
    let boldStart: number | null = null;

    for (const token of tokens) {
        if (/^<b(\s[^>]*)?>$/i.test(token)) {
            boldStart ??= text.length;
            continue;
        }

        if (/^<\/b>$/i.test(token)) {
            if (boldStart !== null && text.length > boldStart) {
                bold.push({ offset: boldStart, length: text.length - boldStart });
            }

            boldStart = null;
            continue;
        }

        if (/^<\/?[a-z]+[^>]*>$/i.test(token)) {
            continue;
        }

        text += token.replace(/&(amp|lt|gt|quot|#39);/g, (entity) => HTML_ENTITIES[entity] ?? entity);
    }

    return { text, bold };
}
