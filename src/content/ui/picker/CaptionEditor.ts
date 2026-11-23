import { t } from "../../../core/i18n/I18n";
import {
    decodeCaptionText,
    sanitizeCaptionHtml,
    TelegramCaptionLimit
} from "../../../core/telegram/CaptionHtml";
import { escapeTelegramHtml } from "../../../core/telegram/SocialCaption";

/** Options for {@link createCaptionEditor}. */
export interface CaptionEditorOptions {
    /** Caption HTML to prefill (escaped text plus `<b>`), usually {@link buildCaptionDraftHtml}. */
    initialHtml?: string;
    /** Visible character limit; defaults to the Telegram caption limit. */
    maxLength?: number;
    /** Whether the media spoiler toggle starts checked. */
    initialHasSpoiler?: boolean;
    /** Whether the caption-above-media toggle starts on. Defaults to false. */
    captionAbove?: boolean;
}

/** The caption editor mounted inside the destination picker. */
export interface CaptionEditor {
    /** Root element to place in the picker layout. */
    element: HTMLElement;
    /** Sanitized caption HTML, or "" when the user left it empty. */
    getHtml(): string;
    /** Whether the media spoiler toggle is checked. */
    getHasSpoiler(): boolean;
    /** Whether Telegram should show the caption above the attached media. */
    getCaptionAbove(): boolean;
    focus(): void;
    destroy(): void;
}

const BLOCK_TAGS = new Set(["DIV", "P", "LI", "BLOCKQUOTE", "H1", "H2", "H3", "H4", "H5", "H6"]);

/**
 * Elements whose content is never caption text. The browser never inserts them, but a paste or a
 * script can, so they are dropped with their content instead of being flattened into text.
 */
const DROPPED_TAGS = new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "TEMPLATE",
    "IFRAME",
    "OBJECT",
    "EMBED",
    "IMG",
    "VIDEO",
    "AUDIO",
    "SVG"
]);

/**
 * Builds the WYSIWYG caption editor: a bold toggle, a contenteditable surface whose HTML
 * only ever contains escaped text, `<b>` and line breaks, and a media spoiler toggle below it.
 * The toggle controls the media spoiler only. It never inspects or rewrites caption entities:
 * picker captions cannot contain a `<spoiler>` tag because the sanitizer drops unknown tags.
 */
export function createCaptionEditor(options: CaptionEditorOptions = {}): CaptionEditor {
    const maxLength = options.maxLength ?? TelegramCaptionLimit;
    const element = document.createElement("div");

    element.className = "x2tg-caption";

    const header = document.createElement("div");
    const title = document.createElement("span");
    const count = document.createElement("span");

    header.className = "x2tg-caption__header";
    title.className = "x2tg-caption__title";
    title.textContent = t("captionTitle");
    count.className = "x2tg-caption__count";
    header.append(title, count);

    const frame = document.createElement("div");
    const toolbar = document.createElement("div");
    const editor = document.createElement("div");

    frame.className = "x2tg-caption__frame";
    toolbar.className = "x2tg-caption__toolbar";
    editor.className = "x2tg-caption__editor";
    editor.contentEditable = "true";
    editor.setAttribute("role", "textbox");
    editor.setAttribute("aria-multiline", "true");
    editor.setAttribute("aria-label", t("captionTitle"));
    editor.dataset.placeholder = t("captionPlaceholder");
    editor.spellcheck = false;

    const bold = document.createElement("button");

    bold.type = "button";
    bold.className = "x2tg-caption__tool x2tg-caption__tool--bold";
    bold.textContent = "B";
    bold.title = t("captionBold");
    bold.setAttribute("aria-label", t("captionBold"));
    bold.setAttribute("aria-pressed", "false");
    bold.addEventListener("mousedown", (event) => {
        // Keep the caret (and the selection to bold) in the editor.
        event.preventDefault();
    });
    bold.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleBold(editor);
        refresh();
    });
    toolbar.appendChild(bold);
    frame.append(toolbar, editor);

    const optionsRow = document.createElement("div");
    const spoiler = document.createElement("button");
    const spoilerIndicator = document.createElement("span");
    const spoilerText = document.createElement("span");
    const above = document.createElement("button");
    const aboveIndicator = document.createElement("span");
    const aboveLabel = document.createElement("span");

    optionsRow.className = "x2tg-caption__options";

    spoiler.type = "button";
    spoiler.className = "x2tg-caption__option";
    spoiler.setAttribute("aria-pressed", String(options.initialHasSpoiler === true));
    spoilerIndicator.className = "x2tg-caption__option-indicator";
    spoilerText.className = "x2tg-caption__option-label";
    spoilerText.textContent = t("captionSpoiler");
    spoiler.append(spoilerIndicator, spoilerText);
    optionsRow.appendChild(spoiler);

    above.type = "button";
    above.className = "x2tg-caption__option";
    above.setAttribute("aria-pressed", String(options.captionAbove === true));
    aboveIndicator.className = "x2tg-caption__option-indicator";
    aboveLabel.className = "x2tg-caption__option-label";
    aboveLabel.textContent = t("captionAbove");
    above.append(aboveIndicator, aboveLabel);
    optionsRow.appendChild(above);

    element.append(header, frame, optionsRow);

    const refresh = (): void => {
        const html = captionHtmlFromElement(editor, maxLength);
        const length = decodeCaptionText(html.replace(/<\/?b>/g, "")).length;

        count.textContent = t("captionCharCount", [String(length), String(maxLength)]);
        count.classList.toggle("x2tg-caption__count--limit", length >= maxLength);
        bold.setAttribute("aria-pressed", String(isBoldActive()));
    };

    const handleInput = (): void => refresh();
    const handleSpoilerClick = (event: MouseEvent): void => {
        event.preventDefault();
        event.stopPropagation();
        spoiler.setAttribute("aria-pressed", String(spoiler.getAttribute("aria-pressed") !== "true"));
    };
    const handleAboveClick = (event: MouseEvent): void => {
        event.preventDefault();
        event.stopPropagation();
        above.setAttribute("aria-pressed", String(above.getAttribute("aria-pressed") !== "true"));
    };
    const handlePaste = (event: ClipboardEvent): void => {
        event.preventDefault();
        insertPlainText(editor, event.clipboardData?.getData("text/plain") ?? "");
        refresh();
    };
    const handleSelectionChange = (): void => {
        if (document.activeElement === editor || editor.contains(document.activeElement)) {
            bold.setAttribute("aria-pressed", String(isBoldActive()));
        }
    };

    editor.addEventListener("input", handleInput);
    spoiler.addEventListener("click", handleSpoilerClick);
    above.addEventListener("click", handleAboveClick);
    editor.addEventListener("paste", handlePaste);
    document.addEventListener("selectionchange", handleSelectionChange);

    renderCaptionHtml(editor, options.initialHtml ?? "", maxLength);
    refresh();

    return {
        element,
        getHtml: () => captionHtmlFromElement(editor, maxLength),
        getHasSpoiler: () => spoiler.getAttribute("aria-pressed") === "true",
        getCaptionAbove: () => above.getAttribute("aria-pressed") === "true",
        focus: () => focusEnd(editor),
        destroy: () => {
            editor.removeEventListener("input", handleInput);
            spoiler.removeEventListener("click", handleSpoilerClick);
            above.removeEventListener("click", handleAboveClick);
            editor.removeEventListener("paste", handlePaste);
            document.removeEventListener("selectionchange", handleSelectionChange);
            element.remove();
        }
    };
}

/**
 * Serializes the editor DOM into the caption HTML the send pipeline understands.
 */
export function captionHtmlFromElement(element: Element, maxLength: number = TelegramCaptionLimit): string {
    return sanitizeCaptionHtml(serializeChildren(element), maxLength);
}

/**
 * Fills the editor with caption HTML, converting line breaks and inline tags into DOM nodes.
 */
export function renderCaptionHtml(element: Element, html: string, maxLength: number = TelegramCaptionLimit): void {
    const clean = sanitizeCaptionHtml(html, maxLength);
    const fragment = document.createDocumentFragment();

    clean.split("\n").forEach((line, index) => {
        if (index > 0) {
            fragment.appendChild(document.createElement("br"));
        }

        appendInline(fragment, line);
    });

    element.replaceChildren(fragment);
}

function appendInline(parent: Node, line: string): void {
    const stack: Node[] = [parent];

    for (const token of line.split(/(<b>|<\/b>|<a href="[^"]*">|<\/a>)/)) {
        if (!token) {
            continue;
        }

        if (token === "</b>" || token === "</a>") {
            if (stack.length > 1) {
                stack.pop();
            }

            continue;
        }

        let container = stack[stack.length - 1] ?? parent;

        if (token === "<b>") {
            container = document.createElement("b");
        } else if (token.startsWith("<a ")) {
            const href = token.match(/href="([^"]*)"/)?.[1];
            const anchor = document.createElement("a");

            if (href) {
                anchor.setAttribute("href", href);
            }

            container = anchor;
        } else {
            container.appendChild(document.createTextNode(decodeCaptionText(token)));
            continue;
        }

        stack[stack.length - 1]?.appendChild(container);
        stack.push(container);
    }
}

function serializeChildren(node: Node): string {
    let html = "";

    for (const child of Array.from(node.childNodes)) {
        if (child instanceof HTMLElement && BLOCK_TAGS.has(child.tagName)) {
            // Enter in a contenteditable inserts blocks; they always start on a new line.
            if (html && !html.endsWith("\n")) {
                html += "\n";
            }

            html += serializeChildren(child);

            if (!html.endsWith("\n")) {
                html += "\n";
            }

            continue;
        }

        html += serializeNode(child);
    }

    return html;
}

function serializeNode(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
        return escapeTelegramHtml((node.nodeValue ?? "").replace(/\u00a0/g, " "));
    }

    if (!(node instanceof HTMLElement)) {
        return "";
    }

    if (DROPPED_TAGS.has(node.tagName)) {
        return "";
    }

    if (node.tagName === "BR") {
        return "\n";
    }

    const inner = serializeChildren(node);

    if (node.tagName === "B" || node.tagName === "STRONG") {
        return inner.trim() ? `<b>${inner}</b>` : inner;
    }

    if (node.tagName === "A") {
        const href = node.getAttribute("href") ?? "";

        if (/^https?:\/\//i.test(href) && inner.trim()) {
            const safeHref = href.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

            return `<a href="${safeHref}">${inner}</a>`;
        }
    }

    return inner;
}

function toggleBold(editor: HTMLElement): void {
    editor.focus();

    if (typeof document.execCommand !== "function") {
        return;
    }

    try {
        document.execCommand("bold");
    } catch (err) {
        console.debug("[caption] bold command failed: %O", err);
    }
}

function isBoldActive(): boolean {
    if (typeof document.execCommand !== "function") {
        return false;
    }

    try {
        return document.queryCommandState("bold");
    } catch {
        return false;
    }
}

function insertPlainText(editor: HTMLElement, text: string): void {
    if (typeof document.execCommand === "function") {
        try {
            document.execCommand("insertText", false, text);
            return;
        } catch (err) {
            console.debug("[caption] paste fallback: %O", err);
        }
    }

    editor.appendChild(document.createTextNode(text));
    focusEnd(editor);
}

function focusEnd(editor: HTMLElement): void {
    editor.focus();

    const selection = window.getSelection();
    const range = document.createRange();

    range.selectNodeContents(editor);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
}
