import { Bot, ChevronRight, UserRound } from "lucide-static";
import { t } from "../core/i18n/I18n";
import { formatConnectionName } from "../core/storage/Connections";
import { isChannelValid } from "../core/storage/Storage";
import {
    DestinationProvider,
    SendConnectionType,
    type ExtensionConfig,
    type SendConnection
} from "../core/types/Config";
import { createLucideSvgElement } from "../core/ui/LucideIcon";

/**
 * Number of complete destinations a bot can post to.
 */
export function countBotDestinations(config: ExtensionConfig, connectionId: string): number {
    return config.channels.filter((channel) => channel.provider === DestinationProvider.TELEGRAM
        && channel.connectionId === connectionId
        && isChannelValid(channel)).length;
}

/**
 * "No destinations yet", "1 destination" or "N destinations".
 */
export function formatDestinationCount(count: number): string {
    if (count === 0) {
        return t("optionsBotNoDestinations");
    }

    return count === 1 ? t("optionsBotDestinationsOne") : t("optionsBotDestinationsMany", String(count));
}

/**
 * Line under the connection name, e.g. "Bot · 3 destinations" or "Telegram account".
 */
export function describeConnection(config: ExtensionConfig, connection: SendConnection): string {
    if (connection.type === SendConnectionType.TELEGRAM_BOT) {
        return `${t("optionsConnectionKindBot")} · ${formatDestinationCount(countBotDestinations(config, connection.id))}`;
    }

    return t("optionsConnectionKindAccount");
}

/**
 * Renders one row per connection (icon, name, description, chevron). Clicking a row opens it.
 */
export function renderConnectionsList(
    container: HTMLElement,
    config: ExtensionConfig,
    onOpen: (connection: SendConnection) => void
): void {
    const items = config.connections.map((connection) => {
        const item = document.createElement("li");
        const button = document.createElement("button");
        const icon = document.createElement("span");
        const text = document.createElement("span");
        const name = document.createElement("span");
        const meta = document.createElement("span");
        const chevron = document.createElement("span");
        const isBot = connection.type === SendConnectionType.TELEGRAM_BOT;

        button.type = "button";
        button.className = "connection-row";
        button.dataset.connectionId = connection.id;

        icon.className = "route-icon connection-row__icon";
        icon.setAttribute("aria-hidden", "true");
        icon.appendChild(createLucideSvgElement(isBot ? Bot : UserRound, 18));

        text.className = "connection-row__text";
        name.className = "connection-row__name";
        name.textContent = formatConnectionName(connection);
        meta.className = "connection-row__meta";
        meta.textContent = describeConnection(config, connection);
        text.append(name, meta);

        chevron.className = "connection-row__chevron";
        chevron.setAttribute("aria-hidden", "true");
        chevron.appendChild(createLucideSvgElement(ChevronRight, 18));

        button.append(icon, text, chevron);
        button.addEventListener("click", () => onOpen(connection));
        item.appendChild(button);
        return item;
    });

    container.replaceChildren(...items);
}
