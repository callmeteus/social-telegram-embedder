import { xPlatform } from "./x";
import type { SocialPlatform, SocialPlatformId } from "./types";

/** Registered social platforms, in display order. */
export const socialPlatforms: SocialPlatform[] = [
    xPlatform
];

/**
 * Finds a platform adapter by id.
 */
export function getPlatformById(platformId: SocialPlatformId): SocialPlatform | undefined {
    return socialPlatforms.find((platform) => platform.id === platformId);
}
