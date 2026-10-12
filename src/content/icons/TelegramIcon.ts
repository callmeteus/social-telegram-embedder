import telegramBrand from "./telegram-brand.json";

/** Paper-plane path for timeline send affordances (matches other action icons). */
export const SEND_TO_TELEGRAM_ICON_PATH = "M2.01 21L23 12 2.01 3 2 10l15 2-15 2z";

/** Official Telegram logo path (24x24 view box) for channel destination rows. */
const TELEGRAM_CHANNEL_LOGO_PATH = telegramBrand.logoPath;

/**
 * Builds the Telegram brand icon for channel picker rows.
 */
export function createTelegramIconElement(size = 20): SVGSVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("x2tg-telegram-icon");

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "currentColor");
    path.setAttribute("d", TELEGRAM_CHANNEL_LOGO_PATH);
    svg.appendChild(path);

    return svg;
}
