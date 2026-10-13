import { isValidConnectionId } from "../core/storage/Connections";

/** Screens of the options page. */
export enum OptionsView {
    LIST = "LIST",
    ADD = "ADD",
    BOT = "BOT",
    ACCOUNT = "ACCOUNT"
}

/** A screen plus the connection it shows, encoded in the URL hash. */
export interface OptionsRoute {
    view: OptionsView;
    connectionId?: string;
}

/**
 * Reads the screen from the URL hash: "#add", "#bot/<id>", "#account/<id>", or the list.
 */
export function parseOptionsRoute(hash: string): OptionsRoute {
    const [view, connectionId] = hash.replace(/^#/, "").split("/");

    if (view === "add") {
        return { view: OptionsView.ADD };
    }

    if ((view === "bot" || view === "account") && isValidConnectionId(connectionId)) {
        return { view: view === "bot" ? OptionsView.BOT : OptionsView.ACCOUNT, connectionId };
    }

    return { view: OptionsView.LIST };
}

/**
 * Inverse of {@link parseOptionsRoute}.
 */
export function formatOptionsRoute(route: OptionsRoute): string {
    switch (route.view) {
        case OptionsView.ADD:
            return "#add";
        case OptionsView.BOT:
            return `#bot/${route.connectionId}`;
        case OptionsView.ACCOUNT:
            return `#account/${route.connectionId}`;
        default:
            return "#";
    }
}
