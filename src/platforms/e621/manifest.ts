/** E621 content script and media host permissions. */
export const e621PlatformManifest = {
    matches: [
        "https://e621.net/*",
        "https://e926.net/*"
    ],
    hostPermissions: [
        "https://e621.net/*",
        "https://e926.net/*",
        "https://*.e621.net/*",
        "https://*.e926.net/*"
    ]
};
