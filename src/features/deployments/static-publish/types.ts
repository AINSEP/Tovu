import type { UUID } from "@jini-ai/cms/core";

/**
 * @file Domain types for one-shot static-site publishing to GitHub Pages / Vercel.
 *
 * Purpose:
 * Deliberately separate from this directory's sibling `../types.ts`/`../ports.ts`
 * (`DeploymentProviderPort`/`DeploymentTargetRecord`) — that machinery promotes an EXISTING git
 * commit through a GitHub App (`../providers/github.ts`), continuous-deployment-shaped. This
 * feature does the opposite: it takes Tovu's own static export (`src/export`'s `exportSite`, bytes
 * this process just rendered, never a pre-existing commit) and hands the file set to
 * `@jini-ai/devops/deploy`'s `GitHubPagesDeployTarget`/`VercelDeployTarget` — a one-shot "publish
 * this exact file set" operation with no polling-run/webhook lifecycle of its own (the Jini target
 * itself blocks until the provider's build/deploy finishes). Two genuinely different problems that
 * happen to share the word "deploy"; kept in their own subdirectory rather than folded into
 * `DeploymentProviderPort` so neither implementation has to pretend to be the other's shape.
 *
 * How it relates to the project:
 * `StaticPublishConfig`'s two variants are a closed union (unlike `DeploymentProviderId`'s open
 * string) because this feature wraps exactly two Jini targets this pass — `@jini-ai/devops` ships
 * `cloudflare-pages.ts`/`netlify.ts` too, but this dispatch's brief scoped GitHub Pages + Vercel
 * only, and a closed union means a third target is a deliberate, reviewed addition here rather than
 * a silently-accepted string.
 *
 * Architectural role:
 * Domain types only — no I/O. `adapter.ts` is the one place `@jini-ai/devops/deploy` types cross
 * into this feature; nothing here imports from that package, so callers of this module never see a
 * Jini type leak through (the brief's "keep Jini's types at the boundary" instruction).
 */

export type StaticPublishTargetId = "github-pages" | "vercel";

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

export type StaticPublishConfig = GitHubPagesPublishConfig | VercelPublishConfig;

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

/** Resolves the bearer token for one publish target. The only implementation this pass
 *  (`credentials.ts`'s `createEnvPublishCredentialSource`) reads a fixed env var; `workspaceId` is
 *  carried in the input shape now so a future implementation backed by Tovu's encrypted
 *  `SecretSealerPort`/`KeyringPort` store (ADR-058's pattern — see `credentials.ts`'s own header)
 *  can be substituted with no change to any caller. */
export interface PublishCredentialSource {
  resolve(input: { workspaceId: UUID; target: StaticPublishTargetId }): Promise<
    { readonly ok: true; readonly token: string } | { readonly ok: false; readonly reason: string }
  >;
}
