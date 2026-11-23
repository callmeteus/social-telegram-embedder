/** Instagram content script and media host permissions. */
export const instagramPlatformManifest = {
    matches: [
        "https://www.instagram.com/*",
        "https://instagram.com/*"
    ],
    hostPermissions: [
        "https://www.instagram.com/*",
        "https://instagram.com/*",
        "https://*.cdninstagram.com/*",
        "https://*.cdninstagram.net/*",
        "https://*.fbcdn.net/*"
    ]
};
