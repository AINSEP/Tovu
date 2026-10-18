import type { AdminMedia } from "@/lib/api";

/**
 * @file Everything the Library screen reads or writes, as one injectable port — the same
 * `MediaPort` convention (`features/media/hooks/media-port.hooks.ts`), so tests pass
 * `createFakeLibraryPort` instead of stubbing `fetch`.
 */
export interface LibraryPort {
  listDocuments(): Promise<{ media: AdminMedia[] }>;
  uploadDocument(input: { filename: string; dataBase64: string }): Promise<{ media: AdminMedia }>;
  /** Rename changes the display stem only; the extension and stored bytes never change. */
  renameDocument(target: { id: string }, input: { title: string }): Promise<{ media: AdminMedia }>;
  trashDocument(id: string): Promise<{ media: AdminMedia }>;
  readDocumentText(target: { id: string }): Promise<{ text: string; truncated: boolean }>;
  /** The authenticated download URL (served as an attachment). */
  documentDownloadUrl(id: string): string;
  /** The original bytes, for the sandboxed PDF viewer. */
  fetchDocumentBlob(id: string): Promise<Blob>;
  me(): Promise<{ effectivePermissions?: string[] }>;
  /** Names uploaders. Optional: without it (or when it fails) rows show the raw principal id. */
  listUsers?(): Promise<{ users: ReadonlyArray<{ principalId: string; username: string }> }>;
}
