import type { SiteStore } from "../open-site-store.js";
import type { composeStoreBasics } from "./store-basics.js";
import type { composeSiteKeysMembers } from "./site-keys-members.js";
import type { KyselyKernel } from "@jini-ai/db/kernel";
import type { SecretsVaultDatabase } from "@jini-ai/db/secrets-vault";
import { SqlSecretsVaultRepo } from "@jini-ai/db/secrets-vault";
import { SqliteExternalMcpServerRepo } from "../../../../features/external-mcp/external-mcp-repo.sqlite.js";
import { SqliteSiteAssistantCredentialRepo } from "#src/assistant/site-credential-repo.sqlite";
import { createApiConnectionVault } from "#src/features/api-connections/vault-stores";
import { createSiteKeyReferences } from "#src/features/project-keys/site-references";
import { createSqliteDeviceAuthorizationStore } from "#src/platform/db/sqlite/oauth-pending-store.sqlite";

interface ComposeAssistantCredentialsRequired {
  kernel: SiteStore["content"];
  workspaceId: string;
  clock: ReturnType<typeof composeStoreBasics>["clock"];
  siteAssistantSecretSealer: ReturnType<typeof composeSiteKeysMembers>["siteAssistantSecretSealer"];
  siteAssistantSecretKeyring: ReturnType<typeof composeSiteKeysMembers>["siteAssistantSecretKeyring"];
}

export function composeAssistantCredentials(required: ComposeAssistantCredentialsRequired, _optional = {}) {
  const { kernel, workspaceId, clock, siteAssistantSecretSealer, siteAssistantSecretKeyring } = required;
  const siteAssistantCredentialRepo = new SqliteSiteAssistantCredentialRepo({ store: kernel });
  // Held as a local rather than constructed inline, because the OAuth service below must be given
  // the SAME repo instance the routes read through — two instances would refresh a token into one
  // and read it back from the other.
  const externalMcpServerRepo = new SqliteExternalMcpServerRepo({ store: kernel });
  // Device begin/poll share this root's durable store without opening another database handle.
  // Redirect callbacks carry their own sealed state and only need the same site key.
  const externalMcpOAuthDevices = createSqliteDeviceAuthorizationStore({ db: kernel, workspaceId, clock, sealer: siteAssistantSecretSealer, keyring: siteAssistantSecretKeyring });

  // Provider plugins (observability, product analytics, AI tracing): installed + enabled +
  // configured (their key card) → loaded and initialized here, awaited and bounded, before any
  // consumer of their ports; otherwise each contract keeps its noop. This is the composition root
  // BOTH real-process boot paths build `RouteDeps` from (`index.ts`'s non-memory branch AND
  // `cli/commands/serve.ts`'s `tovu serve`), so this is the one call site where the real
  // (non-hermetic) choice belongs; `app.ts`'s hermetic root keeps the noop — see `routes/types.ts`'s
  // `ObservabilityDeps` doc for the rule-of-two this mirrors. The storage kernels and guarded HTTP
  // clients below are decorated with the port (identity for the no-op port, so a default boot keeps
  // its exact objects). See `provider-plugins.ts`.
  // Saved provider settings: the project store when one is open, else sealed plugin-state rows in this
  // site's vault (see provider-config-source.ts and project-store.ts).
  const siteReferenceRepo = new SqlSecretsVaultRepo({ kernel: kernel as unknown as KyselyKernel<SecretsVaultDatabase> });
  const projectKeyReferences = createSiteKeyReferences({ workspaceId, repo: siteReferenceRepo,
    vault: createApiConnectionVault({ repo: siteReferenceRepo, keyring: siteAssistantSecretKeyring, sealer: siteAssistantSecretSealer, clock, workspaceId }) });
  return { siteAssistantCredentialRepo, externalMcpServerRepo, externalMcpOAuthDevices, siteReferenceRepo, projectKeyReferences };
}
