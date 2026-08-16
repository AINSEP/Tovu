import { api, type AdminPublishCredentialsSnapshot } from "../../../lib/api";
import type { PublishCredentialsPort } from "./publish-credentials-port.hooks";

/** The live implementation, as a module-level singleton — matches
 *  `static-publish-dependencies.hooks.ts`'s `defaultStaticPublishPort`. */
export const defaultPublishCredentialsPort: PublishCredentialsPort = {
  listCredentials: () => api.listPublishCredentials(),
  createCredential: (input) => api.createPublishCredential(input).then((res) => res.credential),
  updateCredential: (id, input) => api.updatePublishCredential(id, input).then((res) => res.credential),
  deleteCredential: (id) => api.deletePublishCredential(id),
};

/** An in-memory {@link PublishCredentialsPort} for tests. Each of the four calls defaults to a
 *  neutral, overridable stub — matches `createFakeStaticPublishPort`'s per-call override shape. */
export function createFakePublishCredentialsPort(
  overrides: {
    listCredentials?: PublishCredentialsPort["listCredentials"];
    createCredential?: PublishCredentialsPort["createCredential"];
    updateCredential?: PublishCredentialsPort["updateCredential"];
    deleteCredential?: PublishCredentialsPort["deleteCredential"];
  } = {}
): PublishCredentialsPort {
  const emptySnapshot: AdminPublishCredentialsSnapshot = { credentials: [], executionMode: "self-hosted-cli" };
  return {
    listCredentials: overrides.listCredentials ?? (() => Promise.resolve(emptySnapshot)),
    createCredential:
      overrides.createCredential ??
      (() => Promise.reject(new Error("createCredential not stubbed for this test"))),
    updateCredential:
      overrides.updateCredential ??
      (() => Promise.reject(new Error("updateCredential not stubbed for this test"))),
    deleteCredential: overrides.deleteCredential ?? (() => Promise.resolve()),
  };
}
