import * as mediaFormatters from "@jini-ai/admin/media";
import type { AdminMedia } from "@/lib/api";

/** Jini owns generic formatting; this hook only adapts the legacy card's view model. */
export interface MediaMetadataFormatters {
  formatByteSize: (required: { bytes: number }, optional?: { locale?: string }) => string;
  formatUploadDate?: (required: { createdAt: string }, optional?: { locale?: string }) => string | null;
}

// The linked package's built barrel can predate the new source export. Keep hot reload
// importable until the coordinator rebuilds Jini; never duplicate its formatter here.
const defaultFormatters: MediaMetadataFormatters = mediaFormatters;

export function useMediaCardMetadata(
  { item }: { item: Pick<AdminMedia, "byteSize" | "createdAt"> },
  { locale = "en-US", formatters = defaultFormatters }: {
    locale?: string;
    formatters?: MediaMetadataFormatters;
  } = {},
) {
  const byteSize = item.byteSize === undefined ? null : formatters.formatByteSize({ bytes: item.byteSize }, { locale });
  const uploadDate = formatters.formatUploadDate?.({ createdAt: item.createdAt }, { locale }) ?? null;
  return {
    byteSize,
    uploadDate,
    uploadDateTime: uploadDate ? item.createdAt : undefined,
    metadataSeparator: byteSize && uploadDate ? " · " : "",
    hasMetadata: byteSize !== null || uploadDate !== null,
  };
}
