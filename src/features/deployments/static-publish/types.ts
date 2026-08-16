import type { UUID } from "@jini-ai/cms/core";

import type { PublishProviderId } from "../publish-credentials/types";

/**
 * @file Domain types for one-shot static-site publishing to GitHub Pages / Vercel / Netlify /
 * Cloudflare Pages.
 *
 * Purpose:
 * Deliberately separate from this directory's sibling `../types.ts`/`../ports.ts`
 * (`DeploymentProviderPort`/`DeploymentTargetRecord`) — that machinery promotes an EXISTING git
 * commit through a GitHub App (`../providers/github.ts`), continuous-deployment-shaped. This
 * feature does the opposite: it takes Tovu's own static export (`src/export`'s `exportSite`, bytes
 * this process just rendered, never a pre-existing commit) and hands the file set to
 * `@jini-ai/devops/deploy`'s per-target `DeployTarget` — a one-shot "publish this exact file set"
 * operation with no polling-run/webhook lifecycle of its own (the Jini target itself blocks until the
 * provider's build/deploy finishes). Two genuinely different problems that happen to share the word
 * "deploy"; kept in their own subdirectory rather than folded into `DeploymentProviderPort` so
 * neither implementation has to pretend to be the other's shape.
 *
 * How it relates to the project:
 * `StaticPublishTargetId` is a type ALIAS of `../publish-credentials/types.ts`'s `PublishProviderId`
 * (2026-08-15, expanded from the original GitHub Pages + Vercel-only pass to all four Jini targets)
 * — declared ONCE there, reused here, so "what provider can this feature publish to" and "what
 * provider can a credential be saved for" can never drift into two different sets. Every existing
 * import of `StaticPublishTargetId` across this codebase (`adapter.ts`, `credentials.ts`,
 * `publish-agent-tools.ts`, `publish-site.ts`) is unaffected by the rename-to-alias — the type's own
 * name and value set are unchanged from this file's perspective.
 *
 * `StaticPublishConfig`'s four variants remain a CLOSED union (unlike `DeploymentProviderId`'s open
 * string) — a fifth target is still a deliberate, reviewed addition here, never a silently-accepted
 * string.
 *
 * Architectural role:
 * Domain types only — no I/O. `adapter.ts` is the one place `@jini-ai/devops/deploy` types cross
 * into this feature; nothing here imports from that package, so callers of this module never see a
 * Jini type leak through (the brief's "keep Jini's types at the boundary" instruction).
 */

export type StaticPublishTargetId = PublishProviderId;

/**
 * GitHub Pages publish config. `basePath` is deliberately NOT a field here — see `adapter.ts`'s
 * `publishStaticSite` for why the base path is always DERIVED from `repo`, never caller-supplied:
 * that is what makes "export base path doesn't match the publish target" structurally impossible
 * rather than merely documented.
 */
export interface GitHubPagesPublishConfig {
  readonly target: "github-pages";
  readonly owner: string;
  readonly repo: string;
  /** Defaults to `"gh-pages"` (`GitHubPagesDeployTarget`'s own default) when omitted. */
  readonly branch?: string;
}

export interface VercelPublishConfig {
  readonly target: "vercel";
  readonly teamId?: string;
}

/** Netlify publish config. No companion field: unlike GitHub Pages/Cloudflare Pages, Jini's
 *  `NetlifyDeployTarget` (`@jini-ai/devops/deploy`'s `netlify.ts`) takes only `{token}` and always
 *  find-or-creates its site from the publish call's own `projectName` label — there is no
 *  constructor-level site selector to plumb a caller-supplied field into. See `adapter.ts`'s
 *  `buildJiniTarget` for where this is noted again at the one call site it would matter. */
export interface NetlifyPublishConfig {
  readonly target: "netlify";
}

/**
 * Cloudflare Pages publish config. Deliberately carries NO `accountId` field (Contract v2 Correction
 * A, 2026-08-15 — an earlier pass had one here) — `accountId` lives on the CREDENTIAL
 * (`publish-credentials/types.ts`'s `CloudflarePagesConnectionInput`), not the publish config,
 * because a Cloudflare API token is issued WITHIN one account: the two are inseparable at the secret
 * level the same way a token itself is a secret, not a per-run config choice. `owner`/`repo`
 * (GitHub Pages) and `teamId` (Vercel) stay on their own `*PublishConfig` because those genuinely are
 * per-run choices independent of which token is used; `accountId` is not. `PublishCredentialSource
 * .resolve()`'s success shape carries `accountId` for exactly this reason — see `./types.ts`'s own
 * doc on that interface.
 *
 * `basePath` is not a field here for the same reason it is not on `GitHubPagesPublishConfig` —
 * Cloudflare Pages serves from the domain root, so `computeBasePath` returns `undefined` for it.
 */
export interface CloudflarePagesPublishConfig {
  readonly target: "cloudflare-pages";
}

export type StaticPublishConfig = GitHubPagesPublishConfig | VercelPublishConfig | NetlifyPublishConfig | CloudflarePagesPublishConfig;

/** Every outcome this feature returns to a caller (admin route JSON, agent tool result) — never a
 *  `DeployFile`, never a token, never a raw upstream error body. */
export type StaticPublishOutcome =
  | {
      readonly ok: true;
      readonly targetId: StaticPublishTargetId;
      readonly url: string;
      readonly status: string;
      readonly deploymentId?: string;
      /** The base path this publish's export was rewritten for — `/${repo}` for GitHub Pages,
       *  absent for Vercel. Echoed back so a caller can show "published at /repo" without having to
       *  re-derive the same computation this module already did. */
      readonly basePath?: string;
    }
  | {
      readonly ok: false;
      readonly code: "INVALID_CONFIG" | "NO_CREDENTIALS_CONFIGURED" | "EXPORT_FAILED" | "PROVIDER_ERROR";
      readonly message: string;
    };

/**
 * Resolves the bearer token for one publish target, and separately answers whether one is even
 * configured. `credentials.ts`'s `createEnvPublishCredentialSource` is the env-var implementation;
 * `publish-credentials`'s DB-backed source (2026-08-15, ADR-058-pattern encrypted store) is the
 * second — both implement this same interface so no caller changes when the composition between them
 * changes.
 *
 * TWO separate methods, not one, on purpose (2026-08-15 split, Terra's design): {@link resolve}
 * is the ONLY one of the two that may decrypt/expose a real credential, and must never be called from
 * a preview, a status display, or anything agent-facing — only from an actual publish attempt.
 * {@link isConfigured} answers the read-only "would a publish work" question every preview/education
 * surface actually needs, without decrypting anything (the DB-backed source's `isConfigured` only
 * ever calls `describeCredential`-shaped reads — never `resolveForPublish`). Before this split, the
 * only method was `resolve()`, and the admin preview route called it just to read `.ok` off the
 * result — harmless while the only implementation was a plain `process.env` read, but it would have
 * meant a REAL decrypt on every preview once a DB-backed source existed.
 *
 * `resolve()`'s success shape carries an OPTIONAL `accountId` alongside `token` (Contract v2
 * Correction A) — populated only for `cloudflare-pages`, where the credential itself carries the
 * account scope (see `CloudflarePagesPublishConfig`'s own doc for why that field has no home on the
 * publish config). Every other target's `accountId` is simply absent; `adapter.ts`'s `buildJiniTarget`
 * is the one place that reads it.
 */
export interface PublishCredentialSource {
  resolve(input: { workspaceId: UUID; target: StaticPublishTargetId }): Promise<
    | { readonly ok: true; readonly token: string; readonly accountId?: string }
    | { readonly ok: false; readonly reason: string }
  >;
  /** Read-only, never decrypts. `reason` (when `configured` is `false`) is the same human-readable,
   *  non-secret guidance `resolve()`'s own `{ok:false}.reason` carries — safe to show in an admin UI
   *  or hand to an agent tool. */
  isConfigured(input: { workspaceId: UUID; target: StaticPublishTargetId }): Promise<
    { readonly configured: true } | { readonly configured: false; readonly reason: string }
  >;
}
