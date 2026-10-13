import { PickerPinToggleClass } from "./PickerRow";

/** Class marking rows of the Pinned section, the only ones that can be dragged. */
export const PickerPinnedRowClass = "x2tg-picker__item--reorderable";

/** Pointer travel before a press turns into a drag, so plain clicks still select. */
const DRAG_THRESHOLD_PX = 5;

/** Callbacks fired by {@link PinnedReorder}. */
export interface PinnedReorderHandlers {
    /** The row with `fromKey` was dropped onto the slot of the row with `toKey`. */
    onMove(fromKey: string, toKey: string): void;
    /** A drag finished (moved or not); renders held back during the drag can run now. */
    onDragEnd(): void;
}

interface DragState {
    pointerId: number;
    row: HTMLElement;
    rows: HTMLElement[];
    rects: DOMRect[];
    index: number;
    target: number;
    startY: number;
    started: boolean;
}

/**
 * Click-and-drag reordering of the Pinned rows, built on pointer events (native drag and drop
 * is unreliable inside X and Facebook). The dragged row follows the pointer, the others slide
 * out of the way, and the click that ends a drag never toggles the selection.
 */
export class PinnedReorder {
    private readonly list: HTMLElement;
    private readonly handlers: PinnedReorderHandlers;
    private drag: DragState | null = null;
    private suppressClick = false;
    private readonly downHandler = (event: PointerEvent): void => this.handleDown(event);
    private readonly moveHandler = (event: PointerEvent): void => this.handleMove(event);
    private readonly upHandler = (event: PointerEvent): void => this.handleUp(event, true);
    private readonly cancelHandler = (event: PointerEvent): void => this.handleUp(event, false);
    private readonly clickHandler = (event: MouseEvent): void => this.handleClick(event);

    public constructor(list: HTMLElement, handlers: PinnedReorderHandlers) {
        this.list = list;
        this.handlers = handlers;
        list.addEventListener("pointerdown", this.downHandler);
        list.addEventListener("click", this.clickHandler, true);
    }

    /** True while a row is being dragged; the picker must not rebuild rows meanwhile. */
    public get dragging(): boolean {
        return this.drag?.started ?? false;
    }

    /** True right after a drop, until the click that the release produces has passed. */
    public get endingDrag(): boolean {
        return this.suppressClick;
    }

    /** Stops listening; an unfinished drag is dropped without moving anything. */
    public destroy(): void {
        this.stopTracking();
        this.drag = null;
        this.list.removeEventListener("pointerdown", this.downHandler);
        this.list.removeEventListener("click", this.clickHandler, true);
    }

    private handleDown(event: PointerEvent): void {
        const target = event.target instanceof Element ? event.target : null;
        const row = target?.closest<HTMLElement>(`.${PickerPinnedRowClass}`);

        if (event.button !== 0 || !row || target?.closest(`.${PickerPinToggleClass}`)) {
            return;
        }

        const rows = Array.from(this.list.querySelectorAll<HTMLElement>(`.${PickerPinnedRowClass}`));
        const index = rows.indexOf(row);

        if (rows.length < 2 || index === -1) {
            return;
        }

        this.drag = {
            pointerId: event.pointerId,
            row,
            rows,
            rects: rows.map((element) => element.getBoundingClientRect()),
            index,
            target: index,
            startY: event.clientY,
            started: false
        };

        window.addEventListener("pointermove", this.moveHandler, true);
        window.addEventListener("pointerup", this.upHandler, true);
        window.addEventListener("pointercancel", this.cancelHandler, true);
    }

    private handleMove(event: PointerEvent): void {
        const drag = this.drag;

        if (!drag || event.pointerId !== drag.pointerId) {
            return;
        }

        const first = drag.rects[0];
        const last = drag.rects[drag.rects.length - 1];
        const own = drag.rects[drag.index];
        const rawDelta = event.clientY - drag.startY;

        if (!drag.started) {
            if (Math.abs(rawDelta) < DRAG_THRESHOLD_PX) {
                return;
            }

            drag.started = true;
            drag.row.classList.add("x2tg-picker__item--dragging");
            this.list.classList.add("x2tg-picker__list--reordering");
        }

        event.preventDefault();

        const delta = Math.min(Math.max(rawDelta, first.top - own.top), last.bottom - own.bottom);
        const center = own.top + own.height / 2 + delta;
        const step = own.height + (drag.rects.length > 1 ? Math.max(0, drag.rects[1].top - first.bottom) : 0);
        let target = drag.index;

        drag.rects.forEach((rect, i) => {
            const rectCenter = rect.top + rect.height / 2;

            // Inclusive: the clamped row can only reach the first or last center, not pass it.
            if ((i > drag.index && center >= rectCenter) || (i < drag.index && center <= rectCenter && i < target)) {
                target = i;
            }
        });

        drag.target = target;
        drag.rows.forEach((element, i) => {
            let offset = 0;

            if (i === drag.index) {
                offset = delta;
            } else
            if (i > drag.index && i <= target) {
                offset = -step;
            } else
            if (i < drag.index && i >= target) {
                offset = step;
            }

            element.style.transform = offset ? `translateY(${offset}px)` : "";
        });
    }

    private handleUp(event: PointerEvent, drop: boolean): void {
        const drag = this.drag;

        if (!drag || event.pointerId !== drag.pointerId) {
            return;
        }

        this.stopTracking();
        this.drag = null;

        if (!drag.started) {
            return;
        }

        for (const element of drag.rows) {
            element.style.transform = "";
        }

        drag.row.classList.remove("x2tg-picker__item--dragging");
        this.list.classList.remove("x2tg-picker__list--reordering");
        this.suppressClick = true;
        window.setTimeout(() => {
            this.suppressClick = false;
        }, 0);

        const fromKey = drag.row.dataset.key;
        const toKey = drag.rows[drag.target]?.dataset.key;

        if (drop && fromKey && toKey && drag.target !== drag.index) {
            console.debug("[picker] pinned row moved %d -> %d", drag.index, drag.target);
            this.handlers.onMove(fromKey, toKey);
        }

        this.handlers.onDragEnd();
    }

    private handleClick(event: MouseEvent): void {
        if (this.suppressClick) {
            this.suppressClick = false;
            event.preventDefault();
            event.stopPropagation();
        }
    }

    private stopTracking(): void {
        window.removeEventListener("pointermove", this.moveHandler, true);
        window.removeEventListener("pointerup", this.upHandler, true);
        window.removeEventListener("pointercancel", this.cancelHandler, true);
    }
}
