/**
 * Send animation: the picker panel flies into the "sending" toast in the page corner, so the
 * user sees where the send went instead of the dialog just vanishing.
 */

const MORPH_MS = 380;
const CROSSFADE_MS = 120;
const CONTENT_FADE_MS = 140;
const BACKDROP_FADE_MS = 240;
const REDUCED_FADE_MS = 160;
const EASE_OUT_EXPO = "cubic-bezier(0.16, 1, 0.3, 1)";
const LATEST_TOAST_SELECTOR = ".x2tg-toast-container > .x2tg-toast:last-child";

/** Snapshot of the picker taken right before it closes. */
export interface PickerSendGhost {
    /** Animates the snapshot into the newest toast, then removes it. */
    land(): void;
}

function prefersReducedMotion(): boolean {
    return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Cloning drops scroll offsets; restore them so the list does not jump to the top on the first frame.
 */
function copyScrollPositions(source: HTMLElement, clone: HTMLElement): void {
    clone.scrollTop = source.scrollTop;

    const sourceNodes = source.querySelectorAll("*");
    const cloneNodes = clone.querySelectorAll("*");

    sourceNodes.forEach((node, index) => {
        if (node.scrollTop > 0 && cloneNodes[index]) {
            cloneNodes[index].scrollTop = node.scrollTop;
        }
    });
}

function fadeOutAndRemove(element: HTMLElement, duration: number): void {
    element.animate([{ opacity: 1 }, { opacity: 0 }], { duration, easing: "ease-out", fill: "forwards" })
        .finished
        .then(() => element.remove(), () => element.remove());
}

/**
 * Copies the open picker (panel and backdrop) into inert page-level elements that outlive it.
 * Returns null where the browser cannot animate (tests), so the picker just closes.
 */
export function capturePickerSendGhost(overlay: HTMLElement, panel: HTMLElement): PickerSendGhost | null {
    if (typeof panel.animate !== "function" || !panel.isConnected) {
        return null;
    }

    const from = panel.getBoundingClientRect();
    const backdrop = overlay.cloneNode(false) as HTMLElement;
    const ghost = panel.cloneNode(true) as HTMLElement;

    for (const element of [backdrop, ghost]) {
        element.setAttribute("aria-hidden", "true");
        element.setAttribute("inert", "");
        element.style.pointerEvents = "none";
    }

    ghost.removeAttribute("role");
    ghost.removeAttribute("aria-modal");

    Object.assign(ghost.style, {
        position: "fixed",
        left: `${from.left}px`,
        top: `${from.top}px`,
        width: `${from.width}px`,
        height: `${from.height}px`,
        minWidth: "0",
        maxWidth: "none",
        maxHeight: "none",
        margin: "0",
        zIndex: "100002",
        transformOrigin: "top left",
        willChange: "transform, opacity"
    });

    document.body.append(backdrop, ghost);
    copyScrollPositions(panel, ghost);

    return {
        land: () => landGhost(ghost, backdrop, from)
    };
}

function landGhost(ghost: HTMLElement, backdrop: HTMLElement, from: DOMRect): void {
    const toast = document.querySelector<HTMLElement>(LATEST_TOAST_SELECTOR);

    fadeOutAndRemove(backdrop, BACKDROP_FADE_MS);

    if (prefersReducedMotion() || !toast || from.width === 0 || from.height === 0) {
        fadeOutAndRemove(ghost, REDUCED_FADE_MS);
        toast?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: REDUCED_FADE_MS, easing: "ease-out" });
        return;
    }

    const to = toast.getBoundingClientRect();
    const landed = `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width}, ${to.height / from.height})`;
    const total = MORPH_MS + CROSSFADE_MS;

    for (const child of Array.from(ghost.children)) {
        child.animate([{ opacity: 1 }, { opacity: 0 }], { duration: CONTENT_FADE_MS, easing: "ease-out", fill: "forwards" });
    }

    ghost.animate([
        { transform: "none", opacity: 1, easing: EASE_OUT_EXPO },
        { transform: landed, opacity: 1, offset: MORPH_MS / total },
        { transform: landed, opacity: 0 }
    ], { duration: total, fill: "forwards" })
        .finished
        .then(() => ghost.remove(), () => ghost.remove());

    // Hidden while the panel travels, then cross-faded in as the panel lands on it.
    toast.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: CROSSFADE_MS,
        delay: MORPH_MS - CROSSFADE_MS / 2,
        easing: "ease-out",
        fill: "backwards"
    });
}
