import { api, type AdminPublishCredentialSummary, type AdminPublishCredentialVerification, type AdminPublishCredentialsSnapshot } from "@/lib/api";
import type { PublishCredentialSaveResult, PublishCredentialsPort } from "./publish-credentials-port.hooks";

/** Keeps the save-time `verification` the server returns beside `credential` — dropping it was how
 *  a rejected token saved as plain "connected" with no warning. */
function withSaveVerification(res: { credential: AdminPublishCredentialSummary; verification?: AdminPublishCredentialVerification }): PublishCredentialSaveResult {
  return res.verification ? { ...res.credential, verification: res.verification } : res.credential;
}

/** The live implementation, as a module-level singleton — matches
 *  `static-publish-dependencies.hooks.ts`'s `defaultStaticPublishPort`. */
export const defaultPublishCredentialsPort: PublishCredentialsPort = {
  listCredentials: () => api.listPublishCredentials(),
  createCredential: (input) => api.createPublishCredential(input).then(withSaveVerification),
  updateCredential: (id, input) => api.updatePublishCredential(id, input).then(withSaveVerification),
  deleteCredential: (id) => api.deletePublishCredential(id),
  verifyCredential: (id) => api.verifyPublishCredential(id).then((res) => res.verification),
};

/** An in-memory {@link PublishCredentialsPort} for tests. Each of the five calls defaults to a
 *  neutral, overridable stub — matches `createFakeStaticPublishPort`'s per-call override shape. */
export function createFakePublishCredentialsPort(
  overrides: {
    listCredentials?: PublishCredentialsPort["listCredentials"];
    createCredential?: PublishCredentialsPort["createCredential"];
    updateCredential?: PublishCredentialsPort["updateCredential"];
    deleteCredential?: PublishCredentialsPort["deleteCredential"];
    verifyCredential?: PublishCredentialsPort["verifyCredential"];
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
    verifyCredential:
      overrides.verifyCredential ??
      (() => Promise.reject(new Error("verifyCredential not stubbed for this test"))),
  };
}
