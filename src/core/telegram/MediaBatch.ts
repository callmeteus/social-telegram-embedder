import type { SocialMediaItem } from "../../platforms/types";

const TELEGRAM_MEDIA_GROUP_LIMIT = 10;

/**
 * Splits media into the groups Telegram accepts in one send: albums hold up to ten photos and
 * videos, while an animation cannot travel inside an album, so each GIF becomes a group of its own.
 */
export function groupSocialMediaForTelegram(
    media: SocialMediaItem[],
    size = TELEGRAM_MEDIA_GROUP_LIMIT
): SocialMediaItem[][] {
    const groups: SocialMediaItem[][] = [];
    let album: SocialMediaItem[] = [];

    const flushAlbum = () => {
        if (album.length > 0) {
            groups.push(album);
            album = [];
        }
    };

    for (const item of media) {
        if (item.kind === "gif") {
            flushAlbum();
            groups.push([item]);
            continue;
        }

        album.push(item);

        if (album.length === size) {
            flushAlbum();
        }
    }

    flushAlbum();

    return groups;
}
