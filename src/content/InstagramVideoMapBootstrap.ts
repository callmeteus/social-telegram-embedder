import { isExtensionContextValid, sendRuntimeMessage } from "../core/extension";
import { RuntimeMessageType } from "../core/types/Messages";

/**
 * Early bootstrap that asks the service worker to inject the MAIN-world video
 * bridge before Instagram starts loading its media requests.
 */
if (isExtensionContextValid() && /^https?:\/\/(?:www\.)?instagram\.com\//i.test(window.location.href)) {
    void sendRuntimeMessage({ type: RuntimeMessageType.INJECT_INSTAGRAM_VIDEO_MAP });
}
