/** Facebook content script and media host permissions. */
export const facebookPlatformManifest = {
    matches: [
        "https://www.facebook.com/*",
        "https://web.facebook.com/*",
        "https://m.facebook.com/*"
    ],
    hostPermissions: [
        "https://www.facebook.com/*",
        "https://web.facebook.com/*",
        "https://m.facebook.com/*",
        "https://*.fbcdn.net/*"
    ]
};
