import path from "node:path";

/**
 * True when the artifact lives in this server's own share folder, so there is nothing remote. This server's
 * runtime delivery binds a share to its catalog's absolute path; a connected peer binds it to a URL. A record
 * sits in the catalog that made it, and that catalog moves with the site folder, so the path it saved may be
 * stale after a move or rename: only its shape is compared, never its value (design 2026-10-27).
 */
export function isOwnShareFolder(required: { storage: { provider: string; binding?: string } }): boolean {
  return required.storage.provider === "tovu-server" && required.storage.binding !== undefined && path.isAbsolute(required.storage.binding);
}
