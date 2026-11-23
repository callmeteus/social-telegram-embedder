import { e621PlatformManifest } from "./e621/manifest";
import { facebookPlatformManifest } from "./facebook/manifest";
import { furaffinityPlatformManifest } from "./furaffinity/manifest";
import { instagramPlatformManifest } from "./instagram/manifest";
import { tiktokPlatformManifest } from "./tiktok/manifest";
import { xPlatformManifest } from "./x/manifest";
import { SocialPlatformId } from "./types";

/** Lightweight site metadata for UI surfaces that only need to know where the extension runs. */
export interface SocialPlatformSite {
    id: SocialPlatformId;
    label: string;
    matches: string[];
}

/** Sites where the content script is injected, derived from each platform manifest. */
export const socialPlatformSites: SocialPlatformSite[] = [
    {
        id: SocialPlatformId.X,
        label: "X",
        matches: xPlatformManifest.matches
    },
    {
        id: SocialPlatformId.FACEBOOK,
        label: "Facebook",
        matches: facebookPlatformManifest.matches
    },
    {
        id: SocialPlatformId.TIKTOK,
        label: "TikTok",
        matches: tiktokPlatformManifest.matches
    },
    {
        id: SocialPlatformId.E621,
        label: "e621",
        matches: e621PlatformManifest.matches
    },
    {
        id: SocialPlatformId.INSTAGRAM,
        label: "Instagram",
        matches: instagramPlatformManifest.matches
    },
    {
        id: SocialPlatformId.FURAFINITY,
        label: "FurAffinity",
        matches: furaffinityPlatformManifest.matches
    }
];

/**
 * Returns the platform whose content script matches the given URL.
 */
export function getPlatformSiteForUrl(url: string | undefined): SocialPlatformSite | undefined {
    if (!url) {
        return undefined;
    }

    let parsed: URL;

    try {
        parsed = new URL(url);
    } catch {
        return undefined;
    }

    return socialPlatformSites.find((site) => site.matches.some((pattern) => matchesPattern(pattern, parsed)));
}

/**
 * Matches a Chrome-style host pattern (scheme and host only) against a parsed URL.
 */
function matchesPattern(pattern: string, url: URL): boolean {
    const separator = pattern.indexOf("://");

    if (separator === -1) {
        return false;
    }

    const scheme = pattern.slice(0, separator);
    const host = pattern.slice(separator + 3).split("/")[0] ?? "";
    const urlScheme = url.protocol.replace(":", "");
    const urlHost = url.hostname.toLowerCase();

    if (scheme !== "*" && scheme !== urlScheme) {
        return false;
    }

    if (host === "*") {
        return true;
    }

    if (host.startsWith("*.")) {
        const suffix = host.slice(2).toLowerCase();

        return urlHost === suffix || urlHost.endsWith(`.${suffix}`);
    }

    return host.toLowerCase() === urlHost;
}
