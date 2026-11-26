import { mediaApi } from "@/features/media/api/media-api";
import { usersApi } from "@/features/users/api/users-api";
import { authApi } from "@/features/auth/api/auth-api";
import type { LibraryPort } from "@jini-ai/admin/screens/library/hooks/library-port.hooks";
import { createApiLibraryPort, type LibraryApiClient } from "@jini-ai/admin/screens/library/hooks/library-api-port.hooks";

/** @file The production Library port (wired to `lib/api.ts`). */

/** The Library reads three feature API clients. Each method is looked up when it is called, so a
 *  test that replaces a client method is still reached, as it was when one object held them all. */
const libraryApiClient: LibraryApiClient = {
  listDocuments: (...args) => mediaApi.listDocuments(...args),
  uploadDocument: (...args) => mediaApi.uploadDocument(...args),
  updateMedia: (...args) => mediaApi.updateMedia(...args),
  trashMedia: (...args) => mediaApi.trashMedia(...args),
  readDocumentText: (...args) => mediaApi.readDocumentText(...args),
  mediaOriginalUrl: (...args) => mediaApi.mediaOriginalUrl(...args),
  me: (...args) => authApi.me(...args),
  listUsers: (...args) => usersApi.listUsers(...args),
};

/** The production port: the real API client, and the global `fetch` read at call time (so a
 *  page-level `fetch` replacement, such as a test stub, is honoured). */
export const defaultLibraryPort: LibraryPort = createApiLibraryPort({ client: libraryApiClient, fetchFn: ({ url, init }, _optional = {}) => fetch(url, init) });

