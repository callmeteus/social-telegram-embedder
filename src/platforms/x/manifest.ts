/** X/Twitter content script and API host permissions. */
export const xPlatformManifest = {
    matches: [
        "https://x.com/*",
        "https://twitter.com/*"
    ],
    hostPermissions: [
        "https://x.com/*",
        "https://twitter.com/*",
        "https://api.fxtwitter.com/*",
        "https://pbs.twimg.com/*",
        "https://video.twimg.com/*"
    ]
};
