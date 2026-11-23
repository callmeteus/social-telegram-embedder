import { e621Platform } from "./e621";
import { facebookPlatform } from "./facebook";
import { furaffinityPlatform } from "./furaffinity";
import { xPlatform } from "./x";
import type { SocialPlatform, SocialPlatformId } from "./types";

/** Registered social platforms, in display order. */
export const socialPlatforms: SocialPlatform[] = [
    xPlatform,
    facebookPlatform,
    e621Platform,
    furaffinityPlatform
];

/**
 * Finds a platform adapter by id.
 */
export function getPlatformById(platformId: SocialPlatformId): SocialPlatform | undefined {
    return socialPlatforms.find((platform) => platform.id === platformId);
}
