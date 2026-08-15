ACK_PACKET_RECEIVED CTX-DEPLOY-R2-2026-08-12 -- I received the packet and will work on it.

## Position And Movement

**Current position:** the deployment domain needs `Release`/`Environment`/`DeploymentTarget`/`DeploymentRun` as durable, workspace-scoped records **in v1**, not deferred to "once we have more than one provider." A `DeploymentProviderPort` sits under it, deliberately narrow (start/poll/cancel/validate — no build, no streaming). GitHub's adapter authenticates as a **GitHub App with installation tokens** over REST via `HttpClientPort`, not a stored PAT and not a `gh` subprocess. MCP stays rejected as the transport, for the same three codebase-specific reasons as Round 1.

**Did it change, and why:** yes, on one point. In Round 1 I said the smallest *honest* first slice was closer to Option D (git-push) or an even smaller deploy-hook-URL dispatcher, and that the full domain-first model was "the design," not necessarily "the v1 slice" — I was trying to minimize what ships first. Round 2's ask #5 (durable run tracking, poll-or-subscribe, a provider callback that must resolve to a workspace **without the request supplying or implying one**) is a requirement a bare deploy-hook URL or a plain `git push` cannot satisfy at all: neither produces a `providerRunRef` to poll, and neither gives an inbound callback anything to correlate against except a client-suppliable identifier, which is the exact confused-deputy shape `external-mcp/guard.ts:32-40`'s workspace check refuses on the admin side (`String(requestedWorkspaceId) !== deps.workspaceId`). Once "track a run to completion, safely, per-workspace" is a hard requirement rather than a nice-to-have, `DeploymentRunRecord` plus a provider-ref lookup is not a bigger v1 than a deploy hook — it's the only design that clears the requirement at all. So I've moved from "smallest slice, defer the domain" to "the domain model minus the parts covered by the honesty constraint (no `Release` construction, only reference) *is* the smallest slice that can be trusted."

What has **not** changed: my Round 1 rejection of MCP (`mcp-federation/ports.ts:139-142`'s stdio-only transport, `external-mcp/put.ts:57`/`delete.ts:30`'s `restartRequired: true` interrupting every other tenant's live daemon in a multi-workspace process, and `trust.ts:70-74`'s R3 rule which lets an unset `destructiveHint` sail a deploy tool straight through the allowlist). Nothing in Round 1's synthesis or the other transcripts undermines any of the three.

## Solution Slate

Three options for what ships as "Deployments v1," ranked against: **(1) honesty** — does it imply an unproven capability; **(2) run-status fidelity** — can it satisfy ask #5's durable-tracking requirement at all; **(3) credential scope granularity**; **(4) marginal cost of a second provider**; **(5) rollback story simplicity** (per the R1 consensus, rollback = redeploy a prior release, so the option needs a release identity to redeploy).

| # | Option | (1) Honesty | (2) Run fidelity | (3) Cred. scope | (4) 2nd-provider cost | (5) Rollback |
|---|---|---|---|---|---|---|
| 1 | **Domain model + `DeploymentProviderPort`, GitHub App adapter** | Explicit: release = existing commit reference, never a build | Full — `providerRunRef` + poll/callback | Per-installation, repo-scoped, 1h tokens | New adapter only; domain/UI unchanged | Trivial — `startRun` with a prior `releaseId` |
| 2 | **Deploy-hook URL dispatcher only** (Netlify/Vercel-style POST, no typed port) | Explicit, and even smaller a claim | None — fire-and-forget, no `providerRunRef` to poll or correlate a callback against | Whatever's baked into the hook URL — no scoping at all, a leaked URL is a standing rebuild trigger | Cheap per provider, but every provider degrades to the same "we don't know what happened" | No release identity exists to redeploy; "rollback" is fully external |
| 3 | **Git-push-as-deploy** (Tovu constructs commits, CI infers deploy) | Weaker — Tovu would be asserting a source-control write capability the CLI (`cli/program.ts:35-62`) doesn't have yet, on top of the deploy claim | Partial — a push succeeding proves nothing about the build; needs the *same* run-tracking infra as Option 1 to close the loop, so it doesn't actually save that work | Needs contents-write scope, broader than Option 1's deployments-only scope | New adapter cost is comparable to 1, plus tree-construction machinery per push style | Revert-commit semantics differ from redeploy; two rollback mechanisms to reason about |

**Recommendation: Option 1.** Option 2 is cheaper but fails ask #5 outright — the packet's own requirement, not a preference, rules it out as the *only* v1 surface; it remains valuable later as one adapter among several once the port exists (a `DeployHookAdapter implements DeploymentProviderPort` where `startRun` POSTs and immediately returns `{ reconciliation: "manual" }`, sacrificing tracking honestly rather than pretending to have it). Option 3 asks Tovu to prove a second unproven capability (git tree construction) to arrive at the same tracking problem Option 1 already solves via GitHub's own Deployments API — strictly more work for no fidelity gain, when the target is GitHub specifically.

**Genuine sacrifice of Option 1:** every additional provider is bespoke integration work (unchanged from Round 1), and GitHub App setup (register an App, generate a key, walk an install flow, capture an installation id) is real UX friction for a self-hosted, single-operator deployment compared to "paste a token." I accept that cost for the reasons in the counter-argument section below, but it is not free.

**Cheapest falsifying test:** stand up a real GitHub App against a scratch repo, wire `createGitHubDeploymentProviderAdapter` and the webhook route end-to-end, and drive one full run: `startRun` → GitHub fires `deployment_status` → the webhook handler looks up `(providerId, providerRunRef)` → `deployment_runs.status` flips `running → succeeded` in the correct workspace. Then send a second, forged event carrying a real signature (attacker controls their own App/secret) but a `deployment.id` that maps to nobody — assert it is dropped with `202 { ignored: true }`, not silently applied to the nearest run. If either the happy path doesn't close the loop or the forged-id path finds *something* to update, the design is falsified before a second provider is worth building.

## Leading Option — Code

### 1. Domain model

```typescript
// deployment/types.ts
import type { ISODateTime, UUID } from "@jini-ai/cms/core";

export type EnvironmentId = string;
export type DeploymentTargetId = string;
export type ReleaseId = string;
export type DeploymentRunId = string;
export type DeploymentProviderId = string; // "github" today; extensible, not a DB-level enum.

/**
 * A named promotion slot within a workspace — "staging", "production" — NOT a Tovu process
 * instance and not a theme/plugin package. Environments hold no content of their own; a
 * DeploymentTarget is what points one at a provider.
 */
export interface EnvironmentRecord {
  readonly workspaceId: UUID;
  readonly id: EnvironmentId;
  readonly name: string;
  readonly slug: string; // [a-z0-9-], stable — used in run-log URLs
  readonly isProduction: boolean;
  readonly createdAtIso: ISODateTime;
  readonly version: number; // optimistic concurrency
}

/**
 * One provider connection, scoped to a single environment — deliberately not shared across
 * environments, so a bot token scoped to a protected `prod` branch is a distinct grant from one
 * scoped to `gh-pages`, matching `KeyringPort`'s per-connection derivation discipline
 * (`integrations-ports.ts:62-69`) rather than one workspace-wide credential.
 */
export interface DeploymentTargetRecord {
  readonly workspaceId: UUID;
  readonly id: DeploymentTargetId;
  readonly environmentId: EnvironmentId;
  readonly providerId: DeploymentProviderId;
  readonly label: string;
  /** Non-secret provider config only (repo owner/name, environment name). Secret material never
   * lives here — see `IntegrationSecretRepoPort` below. */
  readonly config: Readonly<Record<string, unknown>>;
  readonly secretId: string; // FK into IntegrationSecretRepoPort
  readonly enabled: boolean;
  readonly createdAtIso: ISODateTime;
  readonly version: number;
}

/**
 * An immutable, workspace-scoped artifact IDENTITY: "this is the thing that gets promoted". v1
 * does not construct this artifact (the honesty constraint) — it records a reference to one that
 * already exists, so a run can name precisely what was deployed and a rollback can redeploy the
 * same identity.
 */
export interface ReleaseRecord {
  readonly workspaceId: UUID;
  readonly id: ReleaseId;
  readonly label: string;
  /** A union, not optional siblings, so a release can never claim two sources of truth. v1's
   * adapters only accept `git-revision` — `external-artifact` is modeled now so the type doesn't
   * have to change shape when a second source lands. */
  readonly source: ReleaseSource;
  readonly createdAtIso: ISODateTime;
  readonly createdByPrincipalId: string;
  readonly version: number;
}

export type ReleaseSource =
  | { readonly kind: "git-revision"; readonly repoUrl: string; readonly commitSha: string }
  | { readonly kind: "external-artifact"; readonly uri: string; readonly checksum?: string };

export type DeploymentRunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

/**
 * One attempt to promote a Release to an Environment through a DeploymentTarget. This is the
 * durable execution record the R1 consensus asked for — `module-status.ts:19-51` is a boot-
 * readiness snapshot (one row's worth of state, overwritten every boot), not a per-run table.
 */
export interface DeploymentRunRecord {
  readonly workspaceId: UUID;
  readonly id: DeploymentRunId;
  readonly targetId: DeploymentTargetId;
  readonly environmentId: EnvironmentId;
  readonly releaseId: ReleaseId;
  readonly status: DeploymentRunStatus;
  /** The provider's own identifier (a GitHub deployment id). Opaque to Tovu; the ONLY key an
   * inbound callback or a poll pass may use to find this row. */
  readonly providerRunRef: string | null;
  readonly reconciliation: "poll" | "callback" | "manual";
  readonly startedAtIso: ISODateTime;
  readonly finishedAtIso: ISODateTime | null;
  /** Sanitized only — see `redactGitHubError`/`sanitizeForStorage` below. Never raw provider text. */
  readonly errorSummary: string | null;
  readonly requestedByPrincipalId: string;
  readonly version: number;
}

/** Append-only status/log lines for a run, split out from `DeploymentRunRecord` for the same
 * reason `integrations-ports.ts` splits `WebhookSubscriptionRepoPort` from
 * `WebhookDeliveryRepoPort:121-155` — a chatty provider must not force a rewrite of the run's own
 * row on every line. */
export interface DeploymentRunEventRecord {
  readonly workspaceId: UUID;
  readonly id: string;
  readonly runId: DeploymentRunId;
  readonly atIso: ISODateTime;
  readonly message: string; // sanitized before insert
  readonly level: "info" | "warn" | "error";
}
```

### Table shapes

Text PKs, `workspace_id` on every row, ISO-8601 text timestamps, integer `version` — matching the convention the packet specifies and the shape `integrations-ports.ts`'s repo ports already imply (`workspaceId` required on every method).

```sql
CREATE TABLE deployment_environments (
  workspace_id   TEXT NOT NULL,
  id             TEXT NOT NULL,
  name           TEXT NOT NULL,
  slug           TEXT NOT NULL,
  is_production  INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  version        INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, slug)
);

CREATE TABLE deployment_targets (
  workspace_id    TEXT NOT NULL,
  id              TEXT NOT NULL,
  environment_id  TEXT NOT NULL,
  provider_id     TEXT NOT NULL,
  label           TEXT NOT NULL,
  config_json     TEXT NOT NULL,   -- non-secret provider config, JSON
  secret_id       TEXT NOT NULL,   -- FK into integration_secrets (IntegrationSecretRepoPort)
  enabled         INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL,
  version         INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, environment_id) REFERENCES deployment_environments(workspace_id, id)
);

CREATE TABLE releases (
  workspace_id            TEXT NOT NULL,
  id                       TEXT NOT NULL,
  label                    TEXT NOT NULL,
  source_kind              TEXT NOT NULL,  -- 'git-revision' | 'external-artifact'
  source_repo_url          TEXT,
  source_commit_sha        TEXT,
  source_uri               TEXT,
  source_checksum          TEXT,
  created_at               TEXT NOT NULL,
  created_by_principal_id  TEXT NOT NULL,
  version                  INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE deployment_runs (
  workspace_id              TEXT NOT NULL,
  id                         TEXT NOT NULL,
  target_id                  TEXT NOT NULL,
  environment_id             TEXT NOT NULL,
  release_id                 TEXT NOT NULL,
  status                     TEXT NOT NULL,  -- 'queued'|'running'|'succeeded'|'failed'|'cancelled'
  provider_run_ref           TEXT,
  reconciliation             TEXT NOT NULL,  -- 'poll'|'callback'|'manual'
  started_at                 TEXT NOT NULL,
  finished_at                TEXT,
  error_summary              TEXT,
  requested_by_principal_id  TEXT NOT NULL,
  version                    INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, target_id) REFERENCES deployment_targets(workspace_id, id),
  FOREIGN KEY (workspace_id, release_id) REFERENCES releases(workspace_id, id)
);
-- Inbound callback and poll-worker lookups both key off this pair; never off workspace_id.
CREATE INDEX idx_deployment_runs_provider_ref ON deployment_runs (provider_id_of(target_id), provider_run_ref);
CREATE INDEX idx_deployment_runs_pollable ON deployment_runs (status, reconciliation);

CREATE TABLE deployment_run_events (
  workspace_id  TEXT NOT NULL,
  id             TEXT NOT NULL,
  run_id         TEXT NOT NULL,
  at             TEXT NOT NULL,
  message        TEXT NOT NULL,
  level          TEXT NOT NULL, -- 'info'|'warn'|'error'
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, run_id) REFERENCES deployment_runs(workspace_id, id)
);
```

(`provider_id_of(target_id)` denotes "join through `deployment_targets` for the provider id" — written inline for readability; a real migration would materialize `provider_id` onto `deployment_runs` directly rather than require a join on every callback, which is the more likely actual shape.)

### 2. The provider-neutral port

`CommercePaymentRuntimePort` itself was not among the supplied files, so I cannot cite it line-for-line — same gap I flagged in Round 1. What follows is shaped from the conventions that *are* verified: `McpSessionPort`'s "intentionally three methods and no more" (`mcp-federation/ports.ts:81-84`), `KeyringPort`/`SecretSealerPort`'s narrow, single-purpose methods (`integrations-ports.ts:59-97`), and `WebhookDeliveryRepoPort`'s `required: {...}` parameter-object convention (`integrations-ports.ts:121-155`).

```typescript
// deployment/ports.ts
import type { DeploymentProviderId, DeploymentRunStatus, DeploymentTargetRecord, ReleaseRecord } from "./types";

/**
 * Provider-neutral deployment port. Deliberately narrow — four methods, matching
 * `McpSessionPort`'s "the entire surface [the caller] needs" discipline. Excluded ON PURPOSE:
 *
 * - No `buildRelease`/`exportSite` — the honesty constraint. `cli/program.ts:35-62` proves no
 *   build/export command exists yet; a port method implying one would be Tovu claiming a
 *   capability it doesn't have, the exact failure mode ask #7 names.
 * - No streaming-logs method — `EgressPolicy`'s response caps (inferred; not in this packet's
 *   files) are safety-first for bounded JSON responses, not long-lived connections. Streaming
 *   needs an explicit policy carve-out, which is new design work, not a default a v1 port assumes.
 * - No `rollback` — per the R1 consensus, rollback IS `startRun` with a prior `releaseId`. A
 *   separate method would be a second way to do the same thing, and this codebase's ADR-009
 *   rejects mediator/duplicate layers for that reason.
 * - No remote introspection ("listEnvironments") — that's Tovu's own domain state, not the
 *   provider's, mirroring why `McpSessionPort` carries no resources/prompts (`ports.ts:82-84`).
 */
export interface DeploymentProviderPort {
  readonly providerId: DeploymentProviderId;

  /** Cheap, synchronous-feeling check that a target's config + credential are minimally usable —
   * run at target-save time, not first-run time, so a misconfigured target fails loudly before an
   * operator queues a deploy against it. */
  validateTarget(input: {
    target: DeploymentTargetRecord;
    credential: string;
  }): Promise<{ valid: true } | { valid: false; reason: string }>;

  /** Starts a deployment. MUST return promptly with a reference to poll or await a callback for —
   * never blocks until the deployment finishes. */
  startRun(input: {
    target: DeploymentTargetRecord;
    release: ReleaseRecord;
    credential: string;
    signal?: AbortSignal;
  }): Promise<{ providerRunRef: string; reconciliation: "poll" | "callback" }>;

  /** Only called when `reconciliation === "poll"`. A callback-only provider may reject this —
   * nothing calls it for one. */
  pollRun(input: {
    target: DeploymentTargetRecord;
    providerRunRef: string;
    credential: string;
  }): Promise<DeploymentRunStatusUpdate>;

  /** Best-effort. A provider that cannot cancel returns `{ cancelled: false }` rather than
   * throwing, so a UI cancel action can say "requested, but it will still finish" instead of
   * erroring on an unsupported operation. */
  cancelRun(input: {
    target: DeploymentTargetRecord;
    providerRunRef: string;
    credential: string;
  }): Promise<{ cancelled: boolean }>;
}

export interface DeploymentRunStatusUpdate {
  readonly status: DeploymentRunStatus;
  readonly message?: string;
  readonly finishedAtIso?: string;
}
```

### One concrete adapter, over the guarded `HttpClientPort`

The exact `HttpRequest`/`HttpResponse` shape lives in `../http` (ADR-038), which is not among this packet's files — only the re-export line is (`integrations-ports.ts:28,40`). The request/response fields below are therefore inferred, illustrative of the contract, not verified byte-for-byte; the load-bearing point — every outbound call passes an `EgressPolicy` that pins this adapter to `api.github.com` — is what the design actually depends on.

```typescript
// deployment/adapters/github.adapter.ts
import { createSign } from "node:crypto";
import type { EgressPolicy, HttpClientPort } from "../../integrations-ports"; // re-exported from ../http
import type { DeploymentProviderPort, DeploymentRunStatusUpdate } from "../ports";
import type { DeploymentTargetRecord } from "../types";

/**
 * GitHub adapter over the REST Deployments API, authenticated as a GitHub App installation.
 * `credential` is the ALREADY-OPENED sealed secret's plaintext — a JSON string
 * `{ appId, installationId, privateKeyPem }` — opened by the caller immediately before this call
 * and never persisted or logged by this adapter. See "GitHub, decisively" below for why this
 * auth model over a stored PAT or a `gh` subprocess.
 */
const GITHUB_API_BASE = "https://api.github.com";
const INSTALLATION_TOKEN_TTL_SECONDS = 9 * 60; // GitHub caps App JWTs at 10m; 9m leaves margin.

const GITHUB_EGRESS_POLICY: EgressPolicy = {
  // Illustrative field names — ../http was not in this packet. The property that matters: this
  // policy is the ONLY thing standing between this adapter and an arbitrary outbound host, and it
  // admits exactly one.
  allowedHosts: ["api.github.com"],
  maxResponseBytes: 2 * 1024 * 1024,
  followRedirects: false,
};

interface GitHubCredential {
  appId: string;
  installationId: string;
  privateKeyPem: string;
}

export function createGitHubDeploymentProviderAdapter(deps: { http: HttpClientPort }): DeploymentProviderPort {
  return {
    providerId: "github",

    async validateTarget({ target, credential }) {
      const config = readGitHubTargetConfig(target);
      if (!config) return { valid: false, reason: "target.config is missing owner/repo/environmentName" };
      try {
        const token = await mintInstallationToken(deps.http, parseCredential(credential));
        const res = await deps.http.request({
          method: "GET",
          url: `${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}`,
          headers: githubHeaders(token),
          egressPolicy: GITHUB_EGRESS_POLICY,
        });
        if (res.status === 404) return { valid: false, reason: `'${config.owner}/${config.repo}' not found, or this App installation cannot see it` };
        if (res.status >= 400) return { valid: false, reason: `GitHub returned ${res.status} validating the target` };
        return { valid: true };
      } catch (error) {
        return { valid: false, reason: error instanceof Error ? error.message : String(error) };
      }
    },

    async startRun({ target, release, credential, signal }) {
      const config = readGitHubTargetConfig(target);
      if (!config) throw new Error("github target is missing owner/repo/environmentName");
      if (release.source.kind !== "git-revision") {
        // The honesty constraint, enforced at the one place it can be: this adapter promotes an
        // EXISTING commit. It cannot manufacture one from an "external-artifact" release, so it
        // fails loudly here rather than guessing a ref.
        throw new Error("github deployment target requires a git-revision release (commit sha), not an external artifact");
      }
      const token = await mintInstallationToken(deps.http, parseCredential(credential));
      const res = await deps.http.request({
        method: "POST",
        url: `${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}/deployments`,
        headers: githubHeaders(token),
        body: JSON.stringify({
          ref: release.source.commitSha,
          environment: config.environmentName,
          auto_merge: false,
          required_contexts: [],
          transient_environment: false,
          production_environment: config.environmentName === "production",
        }),
        egressPolicy: GITHUB_EGRESS_POLICY,
        signal,
      });
      if (res.status >= 400) throw new Error(`GitHub deployment create failed: ${res.status} ${redactGitHubError(res.body)}`);
      const body = JSON.parse(res.body) as { id: number };
      // Creating a deployment does not deploy anything — it fires a `deployment` event that
      // whatever CI is watching the repo consumes, and status arrives back via
      // `deployment_status` events. Reconciliation is callback-first; poll is the fallback for a
      // workspace whose Tovu instance has no reachable inbound webhook URL.
      return { providerRunRef: String(body.id), reconciliation: "callback" };
    },

    async pollRun({ target, providerRunRef, credential }): Promise<DeploymentRunStatusUpdate> {
      const config = readGitHubTargetConfig(target);
      if (!config) throw new Error("github target is missing owner/repo/environmentName");
      const token = await mintInstallationToken(deps.http, parseCredential(credential));
      const res = await deps.http.request({
        method: "GET",
        url: `${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}/deployments/${providerRunRef}/statuses`,
        headers: githubHeaders(token),
        egressPolicy: GITHUB_EGRESS_POLICY,
      });
      if (res.status >= 400) throw new Error(`GitHub deployment status poll failed: ${res.status}`);
      const statuses = JSON.parse(res.body) as Array<{ state: string; description?: string }>;
      return mapGitHubDeploymentStatus(statuses[0]); // GitHub returns newest-first
    },

    async cancelRun() {
      // No cancel endpoint exists on the Deployments API — a dispatched deployment runs to
      // completion on GitHub's side. Best-effort "not supported" rather than a throw.
      return { cancelled: false };
    },
  };
}

function readGitHubTargetConfig(target: DeploymentTargetRecord): { owner: string; repo: string; environmentName: string } | null {
  const { owner, repo, environmentName } = target.config as Record<string, unknown>;
  if (typeof owner !== "string" || typeof repo !== "string" || typeof environmentName !== "string") return null;
  return { owner, repo, environmentName };
}

function parseCredential(credential: string): GitHubCredential {
  const parsed = JSON.parse(credential) as Partial<GitHubCredential>;
  if (!parsed.appId || !parsed.installationId || !parsed.privateKeyPem) {
    throw new Error("github credential is missing appId/installationId/privateKeyPem");
  }
  return parsed as GitHubCredential;
}

/** Mints a short-lived App JWT locally (never transmitted), then exchanges it for an
 * installation access token scoped to exactly this installation's repos/permissions. The
 * installation token is what actually calls the Deployments API; it is held only for this one
 * adapter call and never persisted. */
async function mintInstallationToken(http: HttpClientPort, credential: GitHubCredential): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const jwt = signGitHubAppJwt({
    appId: credential.appId,
    privateKeyPem: credential.privateKeyPem,
    issuedAt: now - 60, // GitHub requires iat in the past; clock-skew margin.
    expiresAt: now + INSTALLATION_TOKEN_TTL_SECONDS,
  });
  const res = await http.request({
    method: "POST",
    url: `${GITHUB_API_BASE}/app/installations/${credential.installationId}/access_tokens`,
    headers: { Authorization: `Bearer ${jwt}`, Accept: "application/vnd.github+json" },
    egressPolicy: GITHUB_EGRESS_POLICY,
  });
  if (res.status >= 400) throw new Error(`GitHub App installation token exchange failed: ${res.status}`);
  return (JSON.parse(res.body) as { token: string }).token;
}

function signGitHubAppJwt(params: { appId: string; privateKeyPem: string; issuedAt: number; expiresAt: number }): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ iat: params.issuedAt, exp: params.expiresAt, iss: params.appId }));
  const signature = createSign("RSA-SHA256").update(`${header}.${payload}`).sign(params.privateKeyPem).toString("base64url");
  return `${header}.${payload}.${signature}`;
}

function base64url(input: string): string {
  return Buffer.from(input).toString("base64url");
}

function githubHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
}

function mapGitHubDeploymentStatus(status: { state: string; description?: string } | undefined): DeploymentRunStatusUpdate {
  if (!status) return { status: "running" };
  const now = new Date().toISOString();
  switch (status.state) {
    case "success": return { status: "succeeded", finishedAtIso: now, message: status.description };
    case "failure":
    case "error": return { status: "failed", finishedAtIso: now, message: status.description };
    case "inactive": return { status: "cancelled", finishedAtIso: now, message: status.description };
    default: return { status: "running", message: status.description };
  }
}

/** Strips anything token-shaped out of a GitHub error body before it can reach `errorSummary` or
 * a log line — GitHub's own error bodies routinely echo parts of the request. */
function redactGitHubError(body: string): string {
  return body.replace(/gh[pousr]_[A-Za-z0-9_]{20,}/g, "[redacted]").slice(0, 500);
}
```

### 3. GitHub, decisively

**GitHub App with installation tokens, over REST via `HttpClientPort`.** Not a stored PAT, not a `gh` subprocess.

- **Auth model.** An App installation token is minted per call from the App's private key (`signGitHubAppJwt`, never transmitted) and expires in ≤1 hour. Nothing long-lived is sealed — `IntegrationSecretRepoPort` stores `{ appId, installationId, privateKeyPem }`, and the private key signs locally; revoking access is "uninstall the App from the repo" on GitHub's side, with zero coordination needed on Tovu's. A REST-with-PAT design (even a fine-grained PAT) stores the actual bearer credential and inherits a human's account lifecycle — the token dies when that person's access changes, which is a workspace-owned integration accidentally riding on an individual's session. `gh` fails a harder test: `mcp-federation/adapter.stdio.ts:298-302`'s own comment on why `TOVU_AGENT_DAEMON_TOKEN` is never inherited applies just as much to `gh`'s auth, which lives in `~/.config/gh/hosts.yml` — a filesystem-global credential store that cannot be workspace-scoped in a single multi-tenant process (the same C2 constraint the Round 1 transcripts converge on), and `gh` talks its own HTTP client, so it bypasses `EgressPolicy` exactly as MCP does (per the packet's fact #2).
- **Scope granularity.** An App installation is scoped to the specific repositories the operator installed it on, with per-resource permissions (`deployments: write`, `contents: read`, no `admin` unless explicitly granted) chosen at install time and visible in GitHub's own UI. A PAT's scope is whatever the issuing human had, all-or-nothing per scope category (`repo` grants every repo that account can touch), and a fine-grained PAT, while closer, is still a personal credential an operator has to remember to rotate. `gh` inherits whatever scope the logged-in `gh auth login` session has — no separate scoping mechanism at all.
- **REST vs GraphQL.** REST for the Deployments API specifically: `POST .../deployments`, `POST .../deployments/{id}/statuses`, `GET .../deployments/{id}/statuses` is three well-documented, individually-typed endpoints that map 1:1 onto `startRun`/`pollRun`. GraphQL buys batching, which matters for listing many deployments at once — not a v1 requirement — so REST is the decisive pick for the adapter above; a later "show me every environment's last 5 runs in one call" feature is where GraphQL would earn its keep.

### 4. Secrets

- `DeploymentTargetRecord.secretId` points into `IntegrationSecretRepoPort` (`integrations-ports.ts:158-163`); the row holds a `SealedSecret`, opened via `SecretSealerPort.open` (`integrations-ports.ts:94-97`) only inside `startDeploymentRun`/`reconcileDeploymentRuns`/the webhook handler, held in a local variable for the duration of one provider call, and never assigned anywhere durable.
- The admin **list** route for targets must follow `external-mcp/list.ts:5-14`'s discipline exactly: it returns `label`, `providerId`, `config` (non-secret), and a `credentialConfigured: boolean` — never `secretId`'s referenced plaintext, never even whether the seal is decryptable. There is deliberately no route that opens a target's secret for display, the same "no route anywhere returns a stored env value" property `external-mcp/list.ts:8-11` states and tests for its own credentials.
- Provider error text is redacted (`redactGitHubError`) before it can reach `DeploymentRunRecord.errorSummary` or a `DeploymentRunEventRecord.message` — GitHub's own error bodies routinely echo request fragments, and a token embedded in a URL or header could otherwise round-trip into a log line an operator later pastes into a support channel.
- Webhook verification uses a **separate** shared secret (the App's webhook secret, not the private key), also sealed, opened once at boot rather than per-request, matching the "derive/open once, hold for the process's life" posture `bootstrap.ts:78-97`'s connection-level timeouts imply for connection setup generally.

### 5. Long-running runs: status recording, surfacing, and the callback invariant

Two reconciliation paths, both writing into the same `DeploymentRunRecord`/`DeploymentRunEventRecord` tables:

**Poll**, for providers or deployments without a reachable inbound webhook — mirrors `WebhookDeliveryRepoPort`'s `claimPending`/`markFailed` claim shape (`integrations-ports.ts:132,140-148`):

```typescript
export interface DeploymentRunRepoPort {
  insert(record: DeploymentRunRecord): Promise<void>;
  findById(required: { workspaceId: string; id: string }): Promise<DeploymentRunRecord | null>;
  /** The ONLY lookup an inbound callback or a poll pass may use — keyed off the PROVIDER's
   * identifiers, never off anything a caller could assert about the workspace. */
  findByProviderRef(required: { providerId: string; providerRunRef: string }): Promise<DeploymentRunRecord | null>;
  listByTarget(required: { workspaceId: string; targetId: string; limit: number }): Promise<DeploymentRunRecord[]>;
  claimPollable(required: { batchSize: number; nowIso: string }): Promise<DeploymentRunRecord[]>;
  applyStatusUpdate(required: {
    workspaceId: string;
    id: string;
    expectedVersion: number; // optimistic concurrency against the `version` column
    status: DeploymentRunStatus;
    message: string | null;
    finishedAtIso: string | null;
    nowIso: string;
  }): Promise<void>;
  appendEvent(record: DeploymentRunEventRecord): Promise<void>;
}

export async function reconcileDeploymentRuns(deps: {
  runs: DeploymentRunRepoPort;
  targets: { findById(required: { workspaceId: string; id: string }): Promise<DeploymentTargetRecord | null> };
  secrets: { findById(required: { workspaceId: string; id: string }): Promise<{ sealed: unknown } | null> };
  sealer: { open(input: { sealed: unknown }): Promise<string> };
  providers: ReadonlyMap<string, DeploymentProviderPort>;
  clock: { nowIso(): string };
  batchSize: number;
}): Promise<void> {
  const due = await deps.runs.claimPollable({ batchSize: deps.batchSize, nowIso: deps.clock.nowIso() });
  for (const run of due) {
    try {
      const target = await deps.targets.findById({ workspaceId: run.workspaceId, id: run.targetId });
      const provider = target && deps.providers.get(target.providerId);
      if (!target || !provider || !run.providerRunRef) continue; // target deleted/misconfigured mid-run — leave the row for an operator to see, never fabricate a status
      const secretRecord = await deps.secrets.findById({ workspaceId: run.workspaceId, id: target.secretId });
      if (!secretRecord) continue;
      const credential = await deps.sealer.open({ sealed: secretRecord.sealed });
      const update = await provider.pollRun({ target, providerRunRef: run.providerRunRef, credential });
      await deps.runs.applyStatusUpdate({
        workspaceId: run.workspaceId,
        id: run.id,
        expectedVersion: run.version,
        status: update.status,
        message: sanitizeForStorage(update.message ?? null),
        finishedAtIso: update.finishedAtIso ?? null,
        nowIso: deps.clock.nowIso(),
      });
    } catch {
      // A poll failure is Tovu's own network hiccup, not a deployment failure — leave the run
      // "running" and let the next pass retry, the same posture `markFailed`'s backoff takes for
      // its own transient failures (`integrations-ports.ts:140-148`).
    }
  }
}
```

**Callback**, for GitHub — and the invariant ask #5 names explicitly, "without ever supplying or inferring the workspace":

```typescript
// deployment/inbound-webhook.ts
/**
 * The workspace is NEVER read from the request. GitHub's payload has no notion of Tovu
 * workspaces, and trusting a caller-supplied one on an unauthenticated inbound endpoint is the
 * same confused-deputy shape `external-mcp/guard.ts:37-40` refuses on the admin side by checking
 * `String(requestedWorkspaceId) !== deps.workspaceId` before anything else runs. Here the
 * equivalent is: (1) verify the HMAC-SHA256 signature against the App's webhook secret,
 * constant-time, before parsing anything; (2) once verified, resolve `(providerId,
 * providerRunRef)` through `findByProviderRef` — the ONLY place a provider identifier maps to a
 * `(workspaceId, runId)` pair. An event with no matching run is dropped, not because it lies, but
 * because there is nothing FOR it to update.
 */
export function registerGitHubDeploymentWebhookRoute(
  app: import("express").Express,
  deps: { webhookSecret: () => Promise<string>; runs: DeploymentRunRepoPort; clock: { nowIso(): string } },
): void {
  app.post("/api/webhooks/github/deployments", rawJsonBody(), async (req, res) => {
    const signature = req.header("X-Hub-Signature-256") ?? "";
    if (!verifyGitHubSignature(req.body as Buffer, signature, await deps.webhookSecret())) {
      res.status(401).json({ error: "invalid signature" });
      return;
    }
    if (req.header("X-GitHub-Event") !== "deployment_status") {
      res.status(202).json({ ignored: true });
      return;
    }

    const event = JSON.parse((req.body as Buffer).toString("utf8"));
    const run = await deps.runs.findByProviderRef({
      providerId: "github",
      providerRunRef: String(event.deployment?.id ?? ""),
    });
    if (!run) {
      res.status(202).json({ ignored: true }); // no matching run — not an error, just not ours
      return;
    }

    const update = mapGitHubDeploymentStatus(event.deployment_status);
    await deps.runs.applyStatusUpdate({
      workspaceId: run.workspaceId, // from OUR lookup — never from the request
      id: run.id,
      expectedVersion: run.version,
      status: update.status,
      message: sanitizeForStorage(update.message ?? null),
      finishedAtIso: update.finishedAtIso ?? null,
      nowIso: deps.clock.nowIso(),
    });
    res.status(200).json({ received: true });
  });
}
```

Optimistic concurrency (`expectedVersion`) matters here specifically because poll and callback can race on the same run — a poll pass in flight when GitHub's callback lands. The SQL adapter's `UPDATE ... WHERE workspace_id=? AND id=? AND version=?` failing to affect a row means "someone else already applied a newer status," and the caller drops the update rather than overwriting a later state with a stale one.

**Surfacing:** the admin run-log polls `GET .../runs?since=` on an interval (see the frontend below) rather than a websocket/SSE push — no server-to-browser push transport was among this packet's files, and building one is new infrastructure a v1 doesn't need to justify. If run cadence gets noisy enough to matter, upgrading is a change to one hook, not to the domain or the port.

### 6. The frontend

Route surface (admin, workspace-scoped, mirroring `external-mcp`'s and `module-status`'s path shape):

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/v1/workspaces/:workspaceId/deployments/environments` | list environments |
| PUT | `/api/admin/v1/workspaces/:workspaceId/deployments/environments/:id` | create/update (idempotent-by-id, matching `external-mcp/put.ts`'s reasoning) |
| GET | `/api/admin/v1/workspaces/:workspaceId/deployments/targets` | list targets — `credentialConfigured: boolean` only, never secret material |
| PUT | `/api/admin/v1/workspaces/:workspaceId/deployments/targets/:id` | create/update a target |
| GET | `/api/admin/v1/workspaces/:workspaceId/deployments/runs` | run log, filterable by target/environment |
| **POST** | `/api/admin/v1/workspaces/:workspaceId/deployments/targets/:targetId/runs` | start a run (below) |
| POST | `/api/webhooks/github/deployments` | inbound, unauthenticated-by-workspace, signature-gated (above) |

One fully worked exemplar, matching `external-mcp/put.ts`'s and `module-status.ts`'s exact shape (workspace-id 404 check → `authorize()` → typed error mapping):

```typescript
// routes/admin/deployments/start-run.ts
import type { Express } from "express";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import { startDeploymentRun, DeploymentValidationError, TargetNotFoundError } from "#src/deployment/start-run";
import type { DeploymentRouteDeps } from "./deps";

// Reuses the existing "operator administers a third-party integration" permission — a deployment
// target IS that shape, the same reasoning `mcp-federation/trust.ts:120-124` gives for reusing
// `admin.integrations.manage` rather than minting a new string.
const PERMISSION = "admin.integrations.manage";

export const registerAdminDeploymentStartRunRoute = (app: Express, deps: DeploymentRouteDeps): void => {
  app.post("/api/admin/v1/workspaces/:workspaceId/deployments/targets/:targetId/runs", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }
    const principal = getAuthedPrincipal(res);
    const authResult = await deps.authorize({
      principalId: principal.id,
      permission: PERMISSION,
      workspaceId: deps.workspaceId,
      entityType: "deployment-target",
      entityId: String(req.params.targetId ?? ""),
    });
    if (!authResult.allowed) {
      res.status(403).json({
        error: `principal '${principal.id}' is not authorized for '${PERMISSION}' (${authResult.reason})`,
        code: "FORBIDDEN",
        details: { permission: PERMISSION, reason: authResult.reason },
      });
      return;
    }

    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const run = await startDeploymentRun(deps, {
        workspaceId: deps.workspaceId,
        targetId: String(req.params.targetId ?? ""),
        releaseId: typeof body.releaseId === "string" ? body.releaseId : undefined,
        // The honesty constraint again: a run either points at an EXISTING release or wraps a
        // given commit sha into a new one inline — never a build request.
        newReleaseFromCommitSha: typeof body.commitSha === "string" ? body.commitSha : undefined,
        requestedByPrincipalId: principal.id,
      });
      res.status(202).json({ run }); // 202: started, not finished — matches `startRun`'s own contract
    } catch (err) {
      if (err instanceof DeploymentValidationError) { res.status(400).json({ error: err.message, code: "INVALID_DEPLOYMENT_REQUEST" }); return; }
      if (err instanceof TargetNotFoundError) { res.status(404).json({ error: err.message, code: "NOT_FOUND" }); return; }
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
```

Component surface (React conventions here are inferred, not verified — no admin frontend file was in this packet):

```tsx
// features/deployments/DeploymentsPage.tsx
export function DeploymentsPage({ workspaceId }: { workspaceId: string }) {
  const { environments, targets } = useDeploymentTargets(workspaceId);
  const hasAnyTarget = targets.length > 0;

  return (
    <div className="deployments-page">
      <HonestyBanner />
      <Tabs defaultTab={hasAnyTarget ? "runs" : "targets"}>
        <Tab id="environments" label="Environments"><EnvironmentList workspaceId={workspaceId} environments={environments} /></Tab>
        <Tab id="targets" label="Targets"><TargetConfigPanel workspaceId={workspaceId} environments={environments} targets={targets} /></Tab>
        <Tab id="runs" label="Runs">
          {hasAnyTarget
            ? <RunLogTable workspaceId={workspaceId} />
            : <EmptyRunsState onConfigureTarget={() => {/* switch to Targets tab */}} />}
        </Tab>
      </Tabs>
    </div>
  );
}

/** Ask #7, stated to the operator rather than left implicit in the UI's shape. */
function HonestyBanner() {
  return (
    <div className="callout callout--info" role="note">
      Tovu triggers and tracks deployment of a release you already have — a commit in a
      repository you control. It does not build or export your site yet; point a target at a repo
      whose CI (or the provider itself) turns that commit into a live site.
    </div>
  );
}

function EmptyRunsState({ onConfigureTarget }: { onConfigureTarget: () => void }) {
  return (
    <div className="empty-state">
      <p>No deployment target is configured for this workspace yet.</p>
      <button type="button" onClick={onConfigureTarget}>Configure a target</button>
    </div>
  );
}

function RunLogTable({ workspaceId }: { workspaceId: string }) {
  const { runs } = useDeploymentRuns(workspaceId, { pollMs: 4000 }); // see "surfacing" above
  return (
    <table className="run-log">
      <thead><tr><th>Environment</th><th>Release</th><th>Status</th><th>Started</th><th /></tr></thead>
      <tbody>
        {runs.map((run) => (
          <tr key={run.id}>
            <td>{run.environmentName}</td>
            <td>{run.releaseLabel}</td>
            <td><StatusBadge status={run.status} /></td>
            <td>{formatRelativeTime(run.startedAtIso)}</td>
            <td><a href={`/admin/workspaces/${workspaceId}/deployments/runs/${run.id}`}>Details</a></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

**Assistant-driven flow:** a native tool (`deployment_start_run` / `deployment_get_run_status`), NOT a federated MCP tool — gated by the same `authorize()` call the admin route above makes, not the coarser federated `admin.integrations.manage` posture `trust.ts` applies to third-party servers. It never blocks on completion (mirrors ask #5's async contract) and is never handed the provider credential — it calls the same `startDeploymentRun` service the route calls, gets back a run id and a link, and is told to poll `deployment_get_run_status` for progress rather than being given any transport of its own.

**Degradation:** with zero targets configured, `RunLogTable` never mounts — `EmptyRunsState` shows instead, and the "Deploy" affordance in `TargetConfigPanel` is disabled until at least one target passes `validateTarget`.

### 7. The honesty constraint, enforced twice

Once in code — `startRun`'s `release.source.kind !== "git-revision"` check throws rather than attempting anything with an `external-artifact` release, since v1 has no way to turn one into a deployable ref. Once in UI — the banner above, stated in the operator's own words rather than left to be inferred from what buttons exist.

## Strongest Counter-Argument

The GitHub App setup flow — register an App, generate and store a private key, walk a GitHub-side install redirect, capture an installation id — is real friction for what Tovu actually is: a self-hosted product a single technical operator runs, not an enterprise onboarding a vendor integration through a procurement process. "Paste a Personal Access Token" (or, more starkly, "paste a Netlify/Vercel deploy-hook URL" — Option 2 of the slate) is a five-second action; the App flow is a five-minute one, done once per repo, on GitHub's site, before the operator ever sees Tovu's UI again. For a v1 aimed at getting *a* deployment working at all, that friction cost is not hypothetical — it is the difference between an operator finishing setup in one sitting and one who gives up on the App-installation step and never gets to see the run log this design otherwise earns them.

## What Would Change My Mind

If self-hoster feedback showed the App-installation flow is where operators actually abandon setup (as opposed to a cost I'm asserting from the flow's shape alone), I would ship a PAT-based REST adapter as the *default* on-ramp and keep the App adapter as an upgrade path for anyone who wants tighter scoping — the `DeploymentProviderPort` interface is unchanged either way, since `credential` is already an opaque string a specific adapter interprets; swapping which adapter is offered first in the UI is a phased rollout decision, not a redesign. Separately: if `../http`'s real `EgressPolicy` turns out not to support a `followRedirects: false` / single-host allowlist shape the way I've assumed, the adapter's safety property (never touching a host besides `api.github.com`) would need re-verification against whatever the actual policy shape supports, since I could not read that file in this packet.

<<SWARM_END>>
