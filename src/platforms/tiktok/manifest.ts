/** TikTok content script and media host permissions. */
export const tiktokPlatformManifest = {
    matches: [
        "https://tiktok.com/*",
        "https://www.tiktok.com/*",
        "https://vm.tiktok.com/*",
        "https://vt.tiktok.com/*"
    ],
    hostPermissions: [
        "https://tiktok.com/*",
        "https://www.tiktok.com/*",
        "https://vm.tiktok.com/*",
        "https://vt.tiktok.com/*",
        "https://*.tiktokcdn.com/*",
        "https://*.tiktokcdn-us.com/*"
    ]
};
