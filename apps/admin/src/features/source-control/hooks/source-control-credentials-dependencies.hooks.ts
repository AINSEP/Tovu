import { api, type AdminSourceControlConnectionInput, type AdminSourceControlCredentialsSnapshot } from "@/lib/api";
import type { SourceControlCredentialsPort } from "./source-control-credentials-port.hooks";

/**
 * @file The live {@link SourceControlCredentialsPort} binding.
 *
 * Calls the shared `api.*` methods (`listSourceControlCredentials`/`createSourceControlCredential`/
 * `updateSourceControlCredential`/`deleteSourceControlCredential`, `lib/api.ts`) instead of
 * reimplementing fetch plumbing locally — this file previously carried its own `sourceControlRequest`
 * built to match `request<T>()`'s observable behavior byte for byte, because `lib/api.ts` was
 * outside an earlier dispatch's file boundary before `POST/GET/PUT .../system/source-control/
 * credentials` existed server-side. Both now exist (this feature's backend slice, 2026-08-15), so
 * this file folds onto the same shared helper every other feature already uses — a mechanical move,
 * not a behavior change, since the four calls below are byte-identical in shape to what the local
 * reimplementation produced.
 */

/** The live implementation, as a module-level singleton — matches
 *  `publish-credentials-dependencies.hooks.ts`'s `defaultPublishCredentialsPort`. */
export const defaultSourceControlCredentialsPort: SourceControlCredentialsPort = {
  listCredentials: () => api.listSourceControlCredentials(),
  createCredential: (input: { label: string; connection: AdminSourceControlConnectionInput; isDefault?: boolean }) =>
    api.createSourceControlCredential(input).then((res) => res.credential),
  updateCredential: (id: string, input: { label?: string; connection?: AdminSourceControlConnectionInput; isDefault?: boolean }) =>
    api.updateSourceControlCredential(id, input).then((res) => res.credential),
  deleteCredential: (id: string) => api.deleteSourceControlCredential(id),
};

/** An in-memory {@link SourceControlCredentialsPort} for tests. Each of the four calls defaults to a
 *  neutral, overridable stub — matches `createFakePublishCredentialsPort`'s per-call override shape. */
export function createFakeSourceControlCredentialsPort(
  overrides: {
    listCredentials?: SourceControlCredentialsPort["listCredentials"];
    createCredential?: SourceControlCredentialsPort["createCredential"];
    updateCredential?: SourceControlCredentialsPort["updateCredential"];
    deleteCredential?: SourceControlCredentialsPort["deleteCredential"];
  } = {}
): SourceControlCredentialsPort {
  const emptySnapshot: AdminSourceControlCredentialsSnapshot = { credentials: [] };
  return {
    listCredentials: overrides.listCredentials ?? (() => Promise.resolve(emptySnapshot)),
    createCredential:
      overrides.createCredential ?? (() => Promise.reject(new Error("createCredential not stubbed for this test"))),
    updateCredential:
      overrides.updateCredential ?? (() => Promise.reject(new Error("updateCredential not stubbed for this test"))),
    deleteCredential: overrides.deleteCredential ?? (() => Promise.resolve()),
  };
}
