/** FurAffinity content script and media host permissions. */
export const furaffinityPlatformManifest = {
    matches: [
        "https://www.furaffinity.net/*",
        "https://furaffinity.net/*"
    ],
    hostPermissions: [
        "https://www.furaffinity.net/*",
        "https://furaffinity.net/*",
        "https://*.furaffinity.net/*",
        "https://*.facdn.net/*"
    ]
};
