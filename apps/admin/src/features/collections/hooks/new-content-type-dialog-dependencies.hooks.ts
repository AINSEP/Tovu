import { api, type AdminContentType, type ContentTypeFieldDef } from "@/lib/api";
import type { NewContentTypeDialogPort } from "./new-content-type-dialog-port.hooks";

/**
 * @file The only place `use-new-content-type-dialog.hooks.ts` reaches `lib/api` — see
 * `new-content-type-dialog-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton. */
export const defaultNewContentTypeDialogPort: NewContentTypeDialogPort = {
  createContentType: (input) => api.createContentType(input),
};

/** Seed state for {@link createFakeNewContentTypeDialogPort}. */
export interface FakeNewContentTypeDialogPortOptions {
  createdContentType?: AdminContentType;
  /** When set, `createContentType()` rejects with this instead of resolving — for
   *  submit-failure tests. */
  createError?: Error;
}

const FAKE_CONTENT_TYPE: AdminContentType = {
  workspaceId: "fake-ws",
  key: "fake",
  label: "Fake",
  fields: [],
  status: "active",
  version: 1,
};

/**
 * An in-memory {@link NewContentTypeDialogPort} for tests — "every port gets a fake" (see
 * `assistant-chats-dependencies.hooks.ts`). Records the last write for assertions.
 */
export function createFakeNewContentTypeDialogPort(
  options: FakeNewContentTypeDialogPortOptions = {}
): NewContentTypeDialogPort & {
  /** The most recent `createContentType` call's input, or `null` before the first call. */
  lastCreate: { key: string; label: string; fields: ContentTypeFieldDef[] } | null;
} {
  const state = { lastCreate: null as { key: string; label: string; fields: ContentTypeFieldDef[] } | null };

  return {
    get lastCreate() {
      return state.lastCreate;
    },
    async createContentType(input) {
      state.lastCreate = input;
      if (options.createError) throw options.createError;
      return { contentType: options.createdContentType ?? FAKE_CONTENT_TYPE };
    },
  };
}
