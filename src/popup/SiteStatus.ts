import { getPlatformSiteForUrl, type SocialPlatformSite } from "../platforms/site";

/** Visual and copy state of the popup status card. */
export type PopupStatusState = "active" | "setup" | "unsupported";

/** Everything the popup needs to render its site status. */
export interface PopupStatus {
    state: PopupStatusState;
    site?: SocialPlatformSite;
    host?: string;
}

/**
 * Resolves the popup state from the active tab URL and whether a send channel is configured.
 */
export function resolvePopupStatus(url: string | undefined, configReady: boolean): PopupStatus {
    const site = getPlatformSiteForUrl(url);
    const host = getHostname(url);

    if (!site) {
        return { state: "unsupported", host };
    }

    return configReady ? { state: "active", site, host } : { state: "setup", site, host };
}

/**
 * Extracts a readable hostname, dropping the leading "www." when present.
 */
function getHostname(url: string | undefined): string | undefined {
    if (!url) {
        return undefined;
    }

    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return undefined;
    }
}
