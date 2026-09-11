import type { SocialMediaItem } from "../../platforms/types";

const TELEGRAM_MEDIA_GROUP_LIMIT = 10;

/**
 * Splits media items into Telegram album batches.
 */
export function chunkSocialMedia(
    media: SocialMediaItem[],
    size = TELEGRAM_MEDIA_GROUP_LIMIT
): SocialMediaItem[][] {
    const batches: SocialMediaItem[][] = [];

    for (let index = 0; index < media.length; index += size) {
        batches.push(media.slice(index, index + size));
    }

    return batches;
}
