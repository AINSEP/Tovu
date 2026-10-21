import { api, type AdminMedia } from "@/lib/api";
import type { LibraryPort } from "./library-port.hooks";

/** @file The production Library port (wired to `lib/api.ts`) and an in-memory fake for tests. */

/** The slice of `lib/api.ts` the production Library port calls, typed to just the fields the port
 *  reads, so `api` satisfies it and a test passes a small hand-written fake. */
export interface LibraryApiClient {
  listDocuments(): Promise<{ media: AdminMedia[] }>;
  uploadDocument(input: { filename: string; dataBase64: string }): Promise<{ media: AdminMedia }>;
  updateMedia(target: { id: string }, patch: { title: string }): Promise<{ media: AdminMedia }>;
  trashMedia(id: string): Promise<{ media: AdminMedia }>;
  readDocumentText(target: { id: string }): Promise<{ text: string; truncated: boolean }>;
  mediaOriginalUrl(id: string): string;
  me(): Promise<{ effectivePermissions?: string[] }>;
  listUsers(): Promise<{ users: ReadonlyArray<{ principalId: string; username: string }> }>;
}

/** Only the call shape `fetchDocumentBlob` makes, so a test passes a plain function. */
export type LibraryFetch = (url: string, init: RequestInit) => Promise<Pick<Response, "ok" | "status" | "blob">>;

/**
 * Maps the Library port onto the admin API client. `client` and `fetchFn` are injected so the
 * mapping (which endpoint each port method hits, and the failed-download error) is testable with
 * plain fakes; `defaultLibraryPort` below wires the real ones.
 */
export function createApiLibraryPort({ client, fetchFn }: { client: LibraryApiClient; fetchFn: LibraryFetch }): LibraryPort {
  return {
    listDocuments: () => client.listDocuments(),
    uploadDocument: (input) => client.uploadDocument(input),
    renameDocument: (target, input) => client.updateMedia(target, { title: input.title }),
    trashDocument: (id) => client.trashMedia(id),
    readDocumentText: (target) => client.readDocumentText(target),
    documentDownloadUrl: (id) => client.mediaOriginalUrl(id),
    fetchDocumentBlob: async (id) => {
      const res = await fetchFn(client.mediaOriginalUrl(id), { credentials: "same-origin" });
      if (!res.ok) throw new Error(`download failed (${res.status})`);
      return res.blob();
    },
    me: () => client.me(),
    listUsers: () => client.listUsers(),
  };
}

/** The production port: the real API client, and the global `fetch` read at call time (so a
 *  page-level `fetch` replacement, such as a test stub, is honoured). */
export const defaultLibraryPort: LibraryPort = createApiLibraryPort({ client: api, fetchFn: (url, init) => fetch(url, init) });

export interface FakeLibraryPortOptions {
  documents?: AdminMedia[];
  permissions?: string[];
  texts?: Record<string, string>;
}

/** Builds a document row the way the server would answer for `filename`. */
export function fakeDocument(filename: string, overrides: Partial<AdminMedia> = {}): AdminMedia {
  const dot = filename.lastIndexOf(".");
  return {
    id: `doc-${filename}`,
    kind: "document",
    originalFilename: filename,
    displayFilename: filename,
    workspaceId: "workspace-local",
    title: dot > 0 ? filename.slice(0, dot) : filename,
    slug: filename,
    alt: "",
    caption: "",
    credit: "",
    sha256: `sha-${filename}`,
    byteSize: 1200,
    createdBy: null,
    status: "active",
    createdAt: "2026-10-18T10:00:00.000Z",
    updatedAt: "2026-10-18T10:00:00.000Z",
    version: 1,
    width: null,
    height: null,
    cssClass: null,
    htmlAttributes: null,
    contentType: null,
    publicUrl: null,
    ...overrides,
  };
}

export function createFakeLibraryPort(options: FakeLibraryPortOptions = {}): LibraryPort & {
  readonly items: AdminMedia[];
  readonly calls: string[];
} {
  const items = [...(options.documents ?? [])];
  const calls: string[] = [];
  const permissions = options.permissions ?? ["media.read", "media.upload", "media.update", "media.delete"];
  return {
    items,
    calls,
    listDocuments: async () => ({ media: items.filter((item) => item.status === "active") }),
    uploadDocument: async ({ filename }) => {
      calls.push(`upload:${filename}`);
      const doc = fakeDocument(filename, { id: `doc-${items.length + 1}` });
      items.push(doc);
      return { media: doc };
    },
    renameDocument: async ({ id }, { title }) => {
      calls.push(`rename:${id}:${title}`);
      const item = items.find((row) => row.id === id);
      if (!item) throw new Error("not found");
      const ext = item.originalFilename?.slice(item.originalFilename.lastIndexOf(".")) ?? "";
      Object.assign(item, { title, displayFilename: `${title}${ext}` });
      return { media: item };
    },
    trashDocument: async (id) => {
      calls.push(`trash:${id}`);
      const item = items.find((row) => row.id === id);
      if (!item) throw new Error("not found");
      item.status = "trashed";
      return { media: item };
    },
    readDocumentText: async ({ id }) => {
      calls.push(`text:${id}`);
      return { text: options.texts?.[id] ?? "", truncated: false };
    },
    documentDownloadUrl: (id) => `/api/admin/v1/workspaces/workspace-local/media/${id}/original`,
    fetchDocumentBlob: async () => new Blob(["%PDF-1.4"], { type: "application/pdf" }),
    me: async () => ({ effectivePermissions: permissions }),
    listUsers: async () => ({ users: [] }),
  };
}
