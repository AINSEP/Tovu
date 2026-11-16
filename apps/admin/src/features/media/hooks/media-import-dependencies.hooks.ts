import type { AdminMedia } from "@/features/media/api/media-api.types";
import { mediaApi } from "@/features/media/api/media-api";

/** The admin URL-import port is separate so existing upload/edit consumers need no new dependency. */
export interface MediaImportPort {
  importFromUrl(required: { url: string }, optional?: { alt?: string }): Promise<{ media: AdminMedia }>;
}

export const defaultMediaImportPort: MediaImportPort = {
  importFromUrl: (required, optional = {}) => mediaApi.importMediaFromUrl(required, optional),
};
