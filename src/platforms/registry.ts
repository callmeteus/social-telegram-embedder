import { e621Platform } from "./e621";
import { facebookPlatform } from "./facebook";
import { furaffinityPlatform } from "./furaffinity";
import { instagramPlatform } from "./instagram";
import { tiktokPlatform } from "./tiktok";
import { xPlatform } from "./x";
import type { SocialPlatform, SocialPlatformId } from "./types";

/** Registered social platforms, in display order. */
export const socialPlatforms: SocialPlatform[] = [
    xPlatform,
    facebookPlatform,
    e621Platform,
    instagramPlatform,
    furaffinityPlatform,
    tiktokPlatform
];

/**
 * Finds a platform adapter by id.
 */
export function getPlatformById(platformId: SocialPlatformId): SocialPlatform | undefined {
    return socialPlatforms.find((platform) => platform.id === platformId);
}
