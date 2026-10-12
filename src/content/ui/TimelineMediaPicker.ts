import { t } from "../../core/i18n/I18n";
import { SocialPlatformId } from "../../platforms/types";

let activeOverlay: HTMLElement | null = null;
let outsideClickHandler: ((event: MouseEvent) => void) | null = null;
let keyboardHandler: ((event: KeyboardEvent) => void) | null = null;

/**
 * Asks whether to send every timeline photo or a single selected image.
 */
export function showTimelineMediaPicker(
    photoUrls: string[],
    onAll: () => void,
    onOne: (photoUrl: string) => void,
    platformId: SocialPlatformId = SocialPlatformId.X
): void {
    closeTimelineMediaPicker();

    if (photoUrls.length < 2) {
        return;
    }

    const overlay = document.createElement("div");
    overlay.className = "x2tg-picker-overlay";

    if (platformId === SocialPlatformId.FACEBOOK) {
        overlay.classList.add("x2tg-picker-overlay--facebook");
    }

    const picker = document.createElement("div");
    picker.className = "x2tg-picker x2tg-picker--media-choice";

    if (platformId === SocialPlatformId.FACEBOOK) {
        picker.classList.add("x2tg-picker--facebook");
    }

    picker.setAttribute("role", "dialog");
    picker.setAttribute("aria-modal", "true");
    picker.setAttribute("aria-label", t("xMediaChoiceTitle"));

    const title = document.createElement("div");
    title.className = "x2tg-picker__title";
    title.textContent = t("xMediaChoiceTitle");
    picker.appendChild(title);

    const allButton = document.createElement("button");
    allButton.type = "button";
    allButton.className = "x2tg-picker__item";
    allButton.textContent = photoUrls.length === 2
        ? t("xMediaChoiceBothTwo")
        : t("xMediaChoiceAll", String(photoUrls.length));
    allButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeTimelineMediaPicker();
        onAll();
    });
    picker.appendChild(allButton);

    const oneLabel = document.createElement("div");
    oneLabel.className = "x2tg-picker__subtitle";
    oneLabel.textContent = t("xMediaChoiceOne");
    picker.appendChild(oneLabel);

    const thumbRow = document.createElement("div");
    thumbRow.className = "x2tg-picker__thumb-row";

    for (const [index, photoUrl] of photoUrls.entries()) {
        const thumbButton = document.createElement("button");
        thumbButton.type = "button";
        thumbButton.className = "x2tg-picker__thumb";
        thumbButton.setAttribute("aria-label", t("xMediaChoiceImageLabel", String(index + 1)));

        const image = document.createElement("img");
        image.src = photoUrl;
        image.alt = "";
        image.loading = "lazy";
        thumbButton.appendChild(image);

        thumbButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            closeTimelineMediaPicker();
            onOne(photoUrl);
        });

        thumbRow.appendChild(thumbButton);
    }

    picker.appendChild(thumbRow);
    overlay.appendChild(picker);
    document.body.appendChild(overlay);
    activeOverlay = overlay;

    outsideClickHandler = (event: MouseEvent) => {
        const target = event.target as Node | null;

        if (!target || picker.contains(target)) {
            return;
        }

        closeTimelineMediaPicker();
    };

    keyboardHandler = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
            event.preventDefault();
            closeTimelineMediaPicker();
        }
    };

    window.setTimeout(() => {
        if (outsideClickHandler) {
            document.addEventListener("click", outsideClickHandler, true);
        }
    }, 0);

    document.addEventListener("keydown", keyboardHandler, true);
}

/**
 * Closes the active timeline media picker if present.
 */
export function closeTimelineMediaPicker(): void {
    if (activeOverlay) {
        activeOverlay.remove();
        activeOverlay = null;
    }

    if (outsideClickHandler) {
        document.removeEventListener("click", outsideClickHandler, true);
        outsideClickHandler = null;
    }

    if (keyboardHandler) {
        document.removeEventListener("keydown", keyboardHandler, true);
        keyboardHandler = null;
    }
}
