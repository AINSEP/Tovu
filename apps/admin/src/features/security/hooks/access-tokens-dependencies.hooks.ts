import {
  api,
  type AdminCustomCredentialsSnapshot,
  type AdminPublishCredentialsSnapshot,
  type AdminSourceControlCredentialsSnapshot,
} from "@/lib/api";
import type { AccessTokensPort } from "./access-tokens-port.hooks";

/** The live implementation, as a module-level singleton — matches
 *  `publish-credentials-dependencies.hooks.ts`'s `defaultPublishCredentialsPort`. Every method is a
 *  thin bind onto an existing `api.*` call already used by `Static Site`/`Source Control` — this page
 *  adds no new HTTP surface, only a second reader/writer of the same two endpoints. */
export const defaultAccessTokensPort: AccessTokensPort = {
  publish: {
    list: () => api.listPublishCredentials(),
    create: (input) => api.createPublishCredential(input).then((res) => res.credential),
    update: (id, input) => api.updatePublishCredential(id, input).then((res) => res.credential),
    remove: (id) => api.deletePublishCredential(id),
  },
  sourceControl: {
    list: () => api.listSourceControlCredentials(),
    create: (input) => api.createSourceControlCredential(input).then((res) => res.credential),
    update: (id, input) => api.updateSourceControlCredential(id, input).then((res) => res.credential),
    remove: (id) => api.deleteSourceControlCredential(id),
  },
  custom: {
    list: () => api.listCustomCredentials(),
    create: (input) => api.createCustomCredential(input).then((res) => res.credential),
    update: (id, input) => api.updateCustomCredential(id, input).then((res) => res.credential),
    remove: (id) => api.deleteCustomCredential(id),
  },
};

/** {@link createFakeAccessTokensPort}'s `publish` half — split out purely so that function's own
 *  branch count (four `??` fallbacks per store, times two stores) stays under this repo's
 *  complexity gate; each half here is four fallbacks alone.
 *  @complexity O(1). */
function fakePublishPort(overrides: Partial<AccessTokensPort["publish"]> | undefined): AccessTokensPort["publish"] {
  const emptySnapshot: AdminPublishCredentialsSnapshot = { credentials: [], executionMode: "self-hosted-cli" };
  return {
    list: overrides?.list ?? (() => Promise.resolve(emptySnapshot)),
    create: overrides?.create ?? (() => Promise.reject(new Error("publish.create not stubbed for this test"))),
    update: overrides?.update ?? (() => Promise.reject(new Error("publish.update not stubbed for this test"))),
    remove: overrides?.remove ?? (() => Promise.resolve()),
  };
}

/** {@link createFakeAccessTokensPort}'s `sourceControl` half — see {@link fakePublishPort}'s own doc.
 *  @complexity O(1). */
function fakeSourceControlPort(overrides: Partial<AccessTokensPort["sourceControl"]> | undefined): AccessTokensPort["sourceControl"] {
  const emptySnapshot: AdminSourceControlCredentialsSnapshot = { credentials: [] };
  return {
    list: overrides?.list ?? (() => Promise.resolve(emptySnapshot)),
    create: overrides?.create ?? (() => Promise.reject(new Error("sourceControl.create not stubbed for this test"))),
    update: overrides?.update ?? (() => Promise.reject(new Error("sourceControl.update not stubbed for this test"))),
    remove: overrides?.remove ?? (() => Promise.resolve()),
  };
}

/** {@link createFakeAccessTokensPort}'s `custom` half — see {@link fakePublishPort}'s own doc.
 *  @complexity O(1). */
function fakeCustomPort(overrides: Partial<AccessTokensPort["custom"]> | undefined): AccessTokensPort["custom"] {
  const emptySnapshot: AdminCustomCredentialsSnapshot = { credentials: [] };
  return {
    list: overrides?.list ?? (() => Promise.resolve(emptySnapshot)),
    create: overrides?.create ?? (() => Promise.reject(new Error("custom.create not stubbed for this test"))),
    update: overrides?.update ?? (() => Promise.reject(new Error("custom.update not stubbed for this test"))),
    remove: overrides?.remove ?? (() => Promise.resolve()),
  };
}

/** An in-memory {@link AccessTokensPort} for tests. Each call defaults to a neutral, overridable
 *  stub — matches `createFakePublishCredentialsPort`'s per-call override shape.
 *  @complexity O(1). */
export function createFakeAccessTokensPort(
  overrides: Partial<{ publish: Partial<AccessTokensPort["publish"]>; sourceControl: Partial<AccessTokensPort["sourceControl"]>; custom: Partial<AccessTokensPort["custom"]> }> = {}
): AccessTokensPort {
  return {
    publish: fakePublishPort(overrides.publish),
    sourceControl: fakeSourceControlPort(overrides.sourceControl),
    custom: fakeCustomPort(overrides.custom),
  };
}
