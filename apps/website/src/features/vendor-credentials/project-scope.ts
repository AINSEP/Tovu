import type { KeyringPort, SecretSealerPort } from "../webhooks/index.js";

/**
 * @file The project-first scope rule every credential store shares (owner 2026-10-25: keys save to
 * the project store by default so every site of the project can use them; per-site is the exception).
 * Custom API keys (`custom-credentials/store.ts`), publish hosts (`deployments/publish-credentials/
 * store.ts`) and source-control hosts (`source-control/store.ts`) each attach a project half to their
 * repo port; this module owns the one precedence rule over it:
 * - reads: this site's own row first (an existing row, or one saved "only for this site", overrides),
 *   then the project's;
 * - new rows: the project store when one is attached, this site's vault when asked or when there is
 *   none (Fly/production, or a project store that failed to open — safe, since site rows win).
 */

/** This site's own vault, or the project store every site of the project shares (`project.db`). */
export type CredentialScope = "site" | "project";

/**
 * A store's project half: the same repo shape over the project's own `secrets_vault`, opened with the
 * project's keyring and sealer, under the project's workspace id. Jini derives the sealing key from
 * the store's key and the row's AAD binds its workspace, so a project row opens only with these.
 */
export interface CredentialProjectHalf<R> {
  readonly workspaceId: string;
  readonly repo: R;
  readonly sealer: SecretSealerPort;
  readonly keyring: KeyringPort;
}

/** One store a site reads credentials from, with the deps (repo, sealer, keyring) that open its rows. */
export interface ScopedCredentialDeps<D> { readonly deps: D; readonly workspaceId: string; readonly scope: CredentialScope }

type WithProject = { readonly repo: { readonly project?: CredentialProjectHalf<unknown> } };

/**
 * The stores a site reads, in precedence order: its own vault, then the project half the composition
 * root attached (`deps.ts`'s `credentialProject`), if any.
 * @complexity O(1).
 */
export function credentialScopes<D extends WithProject>(deps: D, workspaceId: string): ScopedCredentialDeps<D>[] {
  const site: ScopedCredentialDeps<D> = { deps, workspaceId, scope: "site" };
  const project = deps.repo.project;
  if (!project) return [site];
  return [site, { deps: { ...deps, repo: project.repo, sealer: project.sealer, keyring: project.keyring } as D, workspaceId: project.workspaceId, scope: "project" }];
}

/**
 * Where a new row is written: the project store by default when one is attached, this site's vault
 * when `scope` is `"site"` ("Only for this site") or when there is no project store.
 * @throws The store's own validation error (`invalid`) when `scope` is neither omitted, `"site"` nor `"project"`.
 */
export function credentialCreateTarget<D extends WithProject>(deps: D, input: { workspaceId: string; scope?: unknown }, invalid: (message: string) => Error): ScopedCredentialDeps<D> {
  if (input.scope !== undefined && input.scope !== "site" && input.scope !== "project") throw invalid('scope must be "site" or "project"');
  const [site, project] = credentialScopes(deps, input.workspaceId);
  return input.scope === "site" || !project ? site! : project;
}
