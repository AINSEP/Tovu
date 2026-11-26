/**
 * @file Public surface for the `source-control` feature (structural mirror of
 * `features/deployments/publish-credentials/index.ts`).
 */


export { createSourceControlCredential, updateSourceControlCredential, type SourceControlCredentialWriteDeps } from "./store.js";

export { InMemorySourceControlCredentialSetRepo } from "./repo.memory.js";

export { bindSourceControlWritePort } from "./write-port.js";
