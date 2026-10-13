import { afterEach, describe, expect, it, vi } from "vitest";
import { capturePickerSendGhost } from "../src/content/ui/picker/SendMorph";

interface AnimateCall {
    element: Element;
    keyframes: Keyframe[];
    options: KeyframeAnimationOptions;
}

function stubAnimate(): AnimateCall[] {
    const calls: AnimateCall[] = [];

    Object.defineProperty(Element.prototype, "animate", {
        configurable: true,
        writable: true,
        value(this: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
            calls.push({ element: this, keyframes, options });
            return { finished: Promise.resolve() } as unknown as Animation;
        }
    });

    return calls;
}

function mountPicker(): { overlay: HTMLElement; panel: HTMLElement } {
    const overlay = document.createElement("div");
    const panel = document.createElement("div");
    const list = document.createElement("div");

    overlay.className = "x2tg-picker-overlay";
    panel.className = "x2tg-picker";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    list.className = "x2tg-picker__list";
    panel.appendChild(list);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    vi.spyOn(panel, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 50, 320, 480));

    return { overlay, panel };
}

function mountToast(): HTMLElement {
    const container = document.createElement("div");
    const toast = document.createElement("div");

    container.className = "x2tg-toast-container";
    toast.className = "x2tg-toast x2tg-toast--progress";
    container.appendChild(toast);
    document.body.appendChild(container);

    vi.spyOn(toast, "getBoundingClientRect").mockReturnValue(new DOMRect(900, 700, 160, 48));

    return toast;
}

function findGhost(): HTMLElement | null {
    return document.querySelector<HTMLElement>(".x2tg-picker[aria-hidden='true']");
}

describe("picker send morph", () => {
    afterEach(() => {
        delete (Element.prototype as { animate?: unknown }).animate;
        vi.restoreAllMocks();
        document.body.innerHTML = "";
    });

    it("returns null when the browser cannot animate", () => {
        const { overlay, panel } = mountPicker();

        expect(capturePickerSendGhost(overlay, panel)).toBeNull();
        expect(findGhost()).toBeNull();
    });

    it("leaves an inert copy of the panel in place after the picker closes", () => {
        stubAnimate();
        const { overlay, panel } = mountPicker();

        capturePickerSendGhost(overlay, panel);
        overlay.remove();

        const ghost = findGhost();

        expect(ghost).not.toBeNull();
        expect(ghost?.hasAttribute("inert")).toBe(true);
        expect(ghost?.hasAttribute("role")).toBe(false);
        expect(ghost?.style.position).toBe("fixed");
        expect(ghost?.style.left).toBe("100px");
        expect(ghost?.style.width).toBe("320px");
    });

    it("flies the panel onto the newest toast and reveals the toast as it lands", async () => {
        const calls = stubAnimate();
        const { overlay, panel } = mountPicker();
        const ghostHandle = capturePickerSendGhost(overlay, panel);

        overlay.remove();

        const toast = mountToast();
        const ghost = findGhost()!;

        ghostHandle?.land();

        const flight = calls.find((call) => call.element === ghost);
        const reveal = calls.find((call) => call.element === toast);

        expect(flight?.keyframes[1].transform).toBe("translate(800px, 650px) scale(0.5, 0.1)");
        expect(flight?.keyframes[2].opacity).toBe(0);
        expect(reveal?.keyframes[0].opacity).toBe(0);
        expect(reveal?.options.fill).toBe("backwards");

        await Promise.resolve();
        await Promise.resolve();

        expect(findGhost()).toBeNull();
        expect(document.querySelector(".x2tg-picker-overlay")).toBeNull();
    });

    it("only fades when there is no toast to land on", async () => {
        const calls = stubAnimate();
        const { overlay, panel } = mountPicker();
        const ghostHandle = capturePickerSendGhost(overlay, panel);

        overlay.remove();
        ghostHandle?.land();

        const ghost = calls.find((call) => call.element.classList.contains("x2tg-picker"));

        expect(ghost?.keyframes.some((frame) => frame.transform)).toBe(false);

        await Promise.resolve();
        await Promise.resolve();

        expect(findGhost()).toBeNull();
    });

    it("skips movement when the user prefers reduced motion", () => {
        const calls = stubAnimate();

        vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }));

        const { overlay, panel } = mountPicker();
        const ghostHandle = capturePickerSendGhost(overlay, panel);

        overlay.remove();
        mountToast();
        ghostHandle?.land();

        expect(calls.some((call) => call.keyframes.some((frame) => frame.transform))).toBe(false);
        vi.unstubAllGlobals();
    });
});
