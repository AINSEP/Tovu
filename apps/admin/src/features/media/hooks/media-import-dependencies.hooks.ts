import { api, type AdminMedia } from "@/lib/api";

/** The admin URL-import port is separate so existing upload/edit consumers need no new dependency. */
export interface MediaImportPort {
  importFromUrl(required: { url: string }, optional?: { alt?: string }): Promise<{ media: AdminMedia }>;
}

export const defaultMediaImportPort: MediaImportPort = {
  importFromUrl: (required, optional = {}) => api.importMediaFromUrl(required, optional),
};
