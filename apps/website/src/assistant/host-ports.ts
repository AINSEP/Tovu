/** Type-only host wiring contracts. Keep RouteDeps off the broad runtime barrel:
 * its many consumers must not inherit unrelated assistant runtime implementations. */
export type { PeerSiteReads } from "./tool-registrations.js";
export type { SiteAssistantCredentialRepoPort } from "./site-credential-store.js";
export type { AdminExecutionCredentialRepoPort } from "./execution-credential-store.js";
export type { ToolGapsToolDeps } from "./tool-gaps-tool.js";
