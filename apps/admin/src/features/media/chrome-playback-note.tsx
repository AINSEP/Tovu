import { MAX_UPLOAD_BYTES } from "@tovu/contracts/upload-limits";
import type { AdminMedia } from "@jini-ai/core/contracts/site/cms-admin-media";

/** The card note for a video Chrome may refuse to play (its key is the English text). */
const CHROME_PLAYBACK_NOTE = "This video may not play in Chrome.";

/** Whether a card shows {@link CHROME_PLAYBACK_NOTE}: a probed HEVC video at or under the ordinary limit,
 *  which is stored as-is (a larger one is converted). @complexity O(1). */
export function showsChromePlaybackNote({ item }: { item: Pick<AdminMedia, "videoCodec" | "byteSize"> }, _optional: Record<string, never> = {}): boolean {
  // Compatibility depends on the codec, not the filename or container.
  return item.videoCodec === "hevc" && typeof item.byteSize === "number" && item.byteSize <= MAX_UPLOAD_BYTES;
}

/** The muted card note under a card's metadata row, or nothing when the video plays everywhere. */
export function ChromePlaybackNote(props: { item: Pick<AdminMedia, "videoCodec" | "byteSize">; t: (key: string) => string }) {
  return showsChromePlaybackNote({ item: props.item }) ? <p className="media-card-note">{props.t(CHROME_PLAYBACK_NOTE)}</p> : null;
}
