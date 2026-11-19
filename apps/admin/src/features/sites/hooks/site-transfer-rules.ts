import { API_UNREACHABLE_CODE, ApiError } from "@/lib/admin-http/request";
import { SHARE_LIMITS } from "@tovu/contracts/site-share-limits";
import type { Translate } from "@jini-ai/core/text";
import type { SiteTransferPort } from "./site-transfer-dependencies.hooks";

export const SITE_TRANSFER_KEYS = { shares: ["sites", "shares"], imports: ["sites", "imports"] } as const;

/** A share link the import route will take: HTTPS, no credentials or fragment. */
export function validShareLink({ link }: { link: string }, _optional = {}): boolean {
  try {
    const url = new URL(link.trim());
    return url.protocol === "https:" && !url.username && !url.password && !url.hash;
  } catch {
    return false;
  }
}

/** A live website address: http(s) only, so the drafted request never carries a script or file URL. */
export function validWebsiteAddress({ address }: { address: string }, _optional = {}): boolean {
  try {
    return ["http:", "https:"].includes(new URL(address.trim()).protocol);
  } catch {
    return false;
  }
}

/** The desktop app's Import page, and the web one's live source (`use-live-import-site.hooks.ts`),
 * open a NEW site's tab with the address already in the URL (`?liveImport=`); the owner then only
 * presses "Import with the assistant". Same-origin page, read once. */
export function prefilledLiveAddress(): string {
  if (typeof window === "undefined") return "";
  const address = new URLSearchParams(window.location.search).get("liveImport") ?? "";
  return validWebsiteAddress({ address: address }) ? address : "";
}

/** The drafted request the "From a live website" option hands to the assistant. */
export function liveImportPrompt({ address }: { address: string }, _optional = {}): string {
  return `Import the live website at ${address.trim()} into this site with the site-import agent plugin.`;
}

export function passwordProblemFor({ password, confirm, t }: { password: string; confirm: string; t: Translate }): string | null {
  if (confirm.length > 0 && confirm !== password) return t("The passwords don't match.");
  return null;
}

/** The upload route's own v1 cap, checked here because the server refuses an oversized body
 *  before reading it and the dropped connection hides its reason. */
export const MAX_IMPORT_ZIP_BYTES = SHARE_LIMITS.maxArchiveBytes;

/** The server's own reason when it answered that import is unavailable here (503), else null. */
export function unavailableReason({ error }: { error: unknown }, _optional = {}): string | null {
  return error instanceof ApiError && error.status === 503 && error.message ? error.message : null;
}

/**
 * Uploads the zip; when the connection drops, asks the server why. A route that refuses before
 * reading the body (busy, unavailable, signed out) closes the socket mid-upload, so the browser
 * only sees "cannot reach the Tovu API" — a fresh GET returns the real refusal instead.
 * @complexity O(1) round trips beyond the upload.
 */
export async function uploadOrExplain({ port, file }: { port: SiteTransferPort; file: File }): Promise<{ uploadId: string }> {
  try {
    return await port.uploadImportZip({ file });
  } catch (failure) {
    if (failure instanceof ApiError && failure.code === API_UNREACHABLE_CODE) await port.listImports();
    throw failure;
  }
}
