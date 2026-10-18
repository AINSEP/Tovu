import { api, type AdminMedia } from "@/lib/api";
import type { LibraryPort } from "./library-port.hooks";

/** @file The production Library port (wired to `lib/api.ts`) and an in-memory fake for tests. */

export const defaultLibraryPort: LibraryPort = {
  listDocuments: () => api.listDocuments(),
  uploadDocument: (input) => api.uploadDocument(input),
  renameDocument: (target, input) => api.updateMedia(target, { title: input.title }),
  trashDocument: (id) => api.trashMedia(id),
  readDocumentText: (target) => api.readDocumentText(target),
  documentDownloadUrl: (id) => api.mediaOriginalUrl(id),
  fetchDocumentBlob: async (id) => {
    const res = await fetch(api.mediaOriginalUrl(id), { credentials: "same-origin" });
    if (!res.ok) throw new Error(`download failed (${res.status})`);
    return res.blob();
  },
  me: () => api.me(),
  listUsers: () => api.listUsers(),
};

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
