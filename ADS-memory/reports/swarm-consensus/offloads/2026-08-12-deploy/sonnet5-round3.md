ACK_PACKET_RECEIVED CTX-DEPLOY-R3-2026-08-12 -- I received the packet and will work on it.

## Position And Movement

Direction is unchanged from Round 2, and so is the rest of the field: Primary, Codex, and both Gemini participants also converged on a Tovu-owned deployment domain (`Release`/`Environment`/`DeploymentTarget`/`DeploymentRun`), a narrow provider-neutral port, a GitHub App with installation tokens over the guarded HTTP client (not `gh`, not a stored PAT), and rejection of MCP as the transport for the same subprocess/egress-bypass reasons everyone independently verified in Round 1. Nothing in this round changes that. What moved is entirely technical, and entirely inside the GitHub adapter:

1. **The compile defect.** My Round 2 `GitHubDeploymentAdapter` invented `EgressPolicy.allowedHosts` / `followRedirects` and called `deps.http.request(...)`. Neither exists. The real contract — `allowedSchemes`, `denyPrivateAddresses`, `devHostAllowlist`, `maxRedirects`, `connectTimeoutMs`, `maxResponseBytes`, `maxDecompressedBytes`, `rateLimit?`, and `HttpClientPort.send(request)` — has **no field that can pin a host**. `devHostAllowlist` is an *exemption* from the private-address check (for reaching `localhost`/`10.x` in dev), not an allow-list of permitted external hosts — a design that would have been wrong even if I'd gotten the name right, because putting `api.github.com` in it would do nothing (a public host was never blocked by `denyPrivateAddresses` in the first place). So origin pinning has to be asserted *by the adapter*, not delegated to the policy. That's the substantive fix below — a single chokepoint function, `sendPinned`, that every outbound call in this file is forced through, which checks `new URL(request.url)` against `https://api.github.com` before `http.send` is ever called.
2. **Two research-verified corrections to the adapter's own logic**, neither of which is about the port/policy shape:
   - Round 2's `pollRun` assumed GitHub's `GET .../deployments/{id}/statuses` returns newest-first and took `statuses[0]`. I cannot find that ordering documented anywhere (see Sources) — GitHub's own docs describe pagination but not order. `pollRun` now takes the status with the greatest `id` (GitHub assigns these monotonically), which is correct regardless of response order.
   - Round 2's state mapping only handled `success`/`failure`/`error`/`inactive` explicitly. GitHub's actual `state` enum for a deployment status has seven values: `error`, `failure`, `inactive`, `in_progress`, `queued`, `pending`, `success` (verified below). `queued`/`pending` now map explicitly instead of falling into an implicit default.

## Sources

- [Authenticating as a GitHub App installation](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation) — confirmed: exchange is `POST /app/installations/{id}/access_tokens` with the App JWT as `Authorization: Bearer`; **installation access tokens expire after exactly 1 hour**, fixed, not caller-configurable; a token's permissions default to everything the App was granted and can be narrowed (never widened) via an optional `permissions` body field, and its repo access defaults to every repo the installation covers, narrowable via `repositories`/`repository_ids` (max 500). This confirms my Round 2 prose claim ("expires in ≤1 hour... scoped per repository and per permission") — I had asserted it without a citation then; it's now checked.
- [Generating a JSON Web Token (JWT) for a GitHub App](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app) — confirmed: the App JWT **must** use `RS256`; claims are `iat`/`exp`/`iss`; `exp` **must be no more than 10 minutes** past `iat`; GitHub's own guidance is to back-date `iat` by 60 seconds for clock-skew tolerance. My Round 2 code's `9 * 60` constant and `issuedAt: now - 60` were already correct by coincidence — I hadn't verified either number at the time; the code below keeps them and renames the constant, since Round 2's `INSTALLATION_TOKEN_TTL_SECONDS` name was actually describing the **JWT's** TTL, not the installation token's (a naming bug worth fixing even though it wasn't a compile error).
- [REST API: Deployments](https://docs.github.com/en/rest/deployments/deployments?apiVersion=2022-11-28) — confirmed: `POST /repos/{owner}/{repo}/deployments` requires only `ref`; returns 201 (or 202 on an auto-merge) with a deployment object carrying an integer `id`. Could not get the fine-grained-permission table to render through the fetch (the page uses a collapsible section the markdown conversion dropped) — flagging that as a gap rather than guessing; the `deployment_status` event page (next) states the permission name directly, which is what the adapter's doc comment now cites instead.
- [REST API: Deployment statuses](https://docs.github.com/en/rest/deployments/statuses) — confirmed: `POST /repos/{owner}/{repo}/deployments/{deployment_id}/statuses` with required `state` from the enum `error | failure | inactive | in_progress | queued | pending | success`; `GET .../statuses` supports `page`/`per_page` (default 30) but **the doc does not state a response order**. This directly contradicts Round 2's inline comment "`GitHub returns newest-first`" — that was an unverified assumption I shipped as if it were a fact. Fixed below by sorting on `id` instead of trusting position.
- [Webhook events and payloads — `deployment_status`](https://docs.github.com/en/webhooks/webhook-events-and-payloads#deployment_status) — confirmed: fires "when a new deployment status was created"; explicitly **"a webhook event is not fired for deployment statuses with an inactive state"**; payload carries `deployment` and `deployment_status` objects; receiving it requires a GitHub App to have **at least read-level access to the "Deployments" repository permission**. The "webhook never carries `inactive`" fact is new information Round 2 didn't have — it means `inactive` can only ever arrive via `pollRun`, never via the callback path, which the mapping/comments below now say explicitly.
- [Validating webhook deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries) — confirmed: signature travels in `X-Hub-Signature-256`, format `sha256=<hex HMAC-SHA256 of the raw body, keyed by the webhook secret>`; GitHub's guidance explicitly warns against a plain `==`/`===` comparison and names `crypto.timingSafeEqual` as the fix. Matches what Round 2 asserted existed (`verifyGitHubSignature`, never implemented) — now implemented against this source.

No contradiction found between the packet's preamble corrections and what GitHub's own docs say — the packet's `EgressPolicy` field list is Tovu-internal and isn't something GitHub's docs could confirm or refute either way.

## Solution Slate

Unchanged ranking criteria from Round 2, since nothing this round supplies a reason to reweight them: **(1) honesty** (does the option imply a capability Tovu doesn't have); **(2) run-status fidelity** (can it satisfy "track a run to a terminal state, per-workspace, without trusting a caller-supplied workspace id" at all); **(3) credential scope granularity**; **(4) marginal cost of a second provider**; **(5) rollback story simplicity**.

| # | Option | (1) Honesty | (2) Run fidelity | (3) Cred. scope | (4) 2nd-provider cost | (5) Rollback |
|---|---|---|---|---|---|---|
| 1 | **Domain model + `DeploymentProviderPort`, GitHub App adapter** (this answer) | Explicit: a release is a reference to an existing commit, never a build | Full — `providerRunRef` + poll/callback, workspace resolved only from Tovu's own row | Per-installation, per-repo, 1-hour tokens (verified TTL above) | New adapter only | Trivial — `startRun` with a prior `releaseId` |
| 2 | **Deploy-hook URL dispatcher** (Netlify/Vercel-style POST, no typed port) | Explicit, and an even smaller claim | None — no `providerRunRef` exists to poll, nothing for an inbound callback to correlate against | Whatever's baked into the URL; a leaked hook URL is a standing rebuild trigger with no scoping at all | Cheapest per provider, but every provider degrades to "we don't know what happened" | No release identity to redeploy; fully external |
| 3 | **Git-push-as-deploy** (Tovu constructs commits/trees, CI infers deploy) | Weaker — asserts a source-control write capability the CLI (`cli/program.ts:35–62` proves only `init`/`serve`/`introspect` exist) doesn't have, stacked on the deploy claim | Partial — a push succeeding proves nothing about what happens after; still needs Option 1's tracking machinery to close the loop | Needs contents-write scope, broader than Option 1's deployments-only scope | Comparable adapter cost to 1, plus tree-construction machinery per push style | Revert-commit semantics differ from redeploy — two mechanisms to reason about |

**Recommendation: Option 1, unchanged.** Option 2 fails criterion (2) outright — it isn't a cheaper version of the same thing, it's structurally incapable of a durable run record, which the packet's own ask #5 makes non-negotiable for v1. It remains valuable *later*, as one more `DeploymentProviderPort` implementation once the port exists (`startRun` POSTs and returns `{ reconciliation: "manual" }`, an honest degrade rather than a fake tracked run). Option 3 buys nothing over Option 1 for GitHub specifically — it asks Tovu to prove a second unproven capability to arrive at the exact tracking problem GitHub's own Deployments API already solves.

**Genuine sacrifice of Option 1, unchanged:** every additional provider is bespoke adapter work, and the GitHub App install flow (register an App, generate a key, walk an install redirect, capture an installation id) is real friction for a single self-hosting operator compared to pasting a token. I accept that cost for the reasons in "Strongest Counter-Argument" below; it is not free.

**Cheapest falsifying test, unchanged in shape, sharpened by this round's fix:** stand up a real GitHub App against a scratch repo, wire the adapter and webhook route below end-to-end, and drive one full run: `startRun` → GitHub fires `deployment_status` → `findByProviderRef` resolves the workspace → `deployment_runs.status` flips `running → succeeded`. Then two adversarial sub-tests this round's research motivates specifically: (a) a poll pass against a deployment whose `statuses` response is fetched twice with the two calls returning the array in different orders (simulate by reversing it client-side in the test) — assert the resolved status is identical either way, which is what falsifies the old "newest-first" assumption if it fails; (b) a forged webhook body with a *correct* signature (attacker controls their own App/secret) but a `deployment.id` mapping to no run — assert `202 { ignored: true }`, not a mutated row. If either the ordering assumption still leaks through or the forged-id path finds something to update, the design is falsified.

## Leading Option — Code

### 1. Domain model and tables

Unchanged from Round 2 — this was never part of the compile defect, and no participant challenged its shape. Included here in full per the packet's "final code for: the domain model and tables" requirement. One thing worth confirming against this round's separate JSONB correction (from the sibling storage debate, not this one): every JSON-shaped column below is declared `TEXT`, never `JSONB` — so the "declaring a column `JSONB` silently resolves to NUMERIC affinity" trap doesn't apply here; it was never at risk.

```typescript
// deployment/types.ts
import type { ISODateTime, UUID } from "@jini-ai/cms/core";

export type EnvironmentId = string;
export type DeploymentTargetId = string;
export type ReleaseId = string;
export type DeploymentRunId = string;
export type DeploymentProviderId = string; // "github" today; extensible, not a DB-level enum.

/** A named promotion slot within a workspace — "staging", "production". Holds no content of its
 * own; a DeploymentTarget is what points one at a provider. */
export interface EnvironmentRecord {
  readonly workspaceId: UUID;
  readonly id: EnvironmentId;
  readonly name: string;
  readonly slug: string; // [a-z0-9-], stable — used in run-log URLs
  readonly isProduction: boolean;
  readonly createdAtIso: ISODateTime;
  readonly version: number; // optimistic concurrency
}

/** One provider connection, scoped to a single environment (matching KeyringPort's per-connection
 * derivation discipline, integrations-ports.ts:62-69, rather than one workspace-wide credential). */
export interface DeploymentTargetRecord {
  readonly workspaceId: UUID;
  readonly id: DeploymentTargetId;
  readonly environmentId: EnvironmentId;
  readonly providerId: DeploymentProviderId;
  readonly label: string;
  /** Non-secret provider config only (repo owner/name, environment name). Never secret material —
   * see IntegrationSecretRepoPort below. */
  readonly config: Readonly<Record<string, unknown>>;
  readonly secretId: string; // FK into IntegrationSecretRepoPort
  readonly enabled: boolean;
  readonly createdAtIso: ISODateTime;
  readonly version: number;
}

/** An immutable, workspace-scoped artifact IDENTITY: "this is the thing that gets promoted". v1
 * records a reference to an artifact that already exists (the honesty constraint) — it does not
 * construct one. */
export interface ReleaseRecord {
  readonly workspaceId: UUID;
  readonly id: ReleaseId;
  readonly label: string;
  readonly source: ReleaseSource;
  readonly createdAtIso: ISODateTime;
  readonly createdByPrincipalId: string;
  readonly version: number;
}

export type ReleaseSource =
  | { readonly kind: "git-revision"; readonly repoUrl: string; readonly commitSha: string }
  | { readonly kind: "external-artifact"; readonly uri: string; readonly checksum?: string };

export type DeploymentRunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

/** One attempt to promote a Release to an Environment through a DeploymentTarget — the durable
 * execution record; module-status.ts:19-51 is a boot-readiness snapshot (one row, overwritten every
 * boot), not a per-run table. */
export interface DeploymentRunRecord {
  readonly workspaceId: UUID;
  readonly id: DeploymentRunId;
  readonly targetId: DeploymentTargetId;
  readonly environmentId: EnvironmentId;
  readonly releaseId: ReleaseId;
  readonly status: DeploymentRunStatus;
  /** The provider's own identifier. Opaque to Tovu; the ONLY key an inbound callback or a poll pass
   * may use to find this row. */
  readonly providerRunRef: string | null;
  readonly reconciliation: "poll" | "callback" | "manual";
  readonly startedAtIso: ISODateTime;
  readonly finishedAtIso: ISODateTime | null;
  /** Sanitized only — see redactGitHubError/sanitizeForStorage. Never raw provider text. */
  readonly errorSummary: string | null;
  readonly requestedByPrincipalId: string;
  readonly version: number;
}

export interface DeploymentRunEventRecord {
  readonly workspaceId: UUID;
  readonly id: string;
  readonly runId: DeploymentRunId;
  readonly atIso: ISODateTime;
  readonly message: string; // sanitized before insert
  readonly level: "info" | "warn" | "error";
}
```

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
  config_json     TEXT NOT NULL,   -- non-secret provider config, JSON — TEXT, never JSONB
  secret_id       TEXT NOT NULL,   -- FK into integration_secrets (IntegrationSecretRepoPort)
  enabled         INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL,
  version         INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, environment_id) REFERENCES deployment_environments(workspace_id, id)
);

CREATE TABLE releases (
  workspace_id             TEXT NOT NULL,
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
  id                        TEXT NOT NULL,
  target_id                 TEXT NOT NULL,
  environment_id            TEXT NOT NULL,
  release_id                TEXT NOT NULL,
  status                    TEXT NOT NULL,  -- 'queued'|'running'|'succeeded'|'failed'|'cancelled'
  provider_run_ref          TEXT,
  provider_id               TEXT NOT NULL,  -- materialized here, not joined, for callback/poll lookups
  reconciliation            TEXT NOT NULL,  -- 'poll'|'callback'|'manual'
  started_at                TEXT NOT NULL,
  finished_at               TEXT,
  error_summary             TEXT,
  requested_by_principal_id TEXT NOT NULL,
  version                   INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, target_id) REFERENCES deployment_targets(workspace_id, id),
  FOREIGN KEY (workspace_id, release_id) REFERENCES releases(workspace_id, id)
);
-- Inbound callback and poll-worker lookups both key off this pair; never off workspace_id.
CREATE UNIQUE INDEX idx_deployment_runs_provider_ref ON deployment_runs (provider_id, provider_run_ref);
CREATE INDEX idx_deployment_runs_pollable ON deployment_runs (status, reconciliation);

CREATE TABLE deployment_run_events (
  workspace_id  TEXT NOT NULL,
  id            TEXT NOT NULL,
  run_id        TEXT NOT NULL,
  at            TEXT NOT NULL,
  message       TEXT NOT NULL,
  level         TEXT NOT NULL, -- 'info'|'warn'|'error'
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, run_id) REFERENCES deployment_runs(workspace_id, id)
);
```

(Round 2 had `provider_run_ref` looked up via a `provider_id_of(target_id)` join placeholder; materializing `provider_id` directly on `deployment_runs`, as done here, is the actual fix that placeholder was gesturing at — a callback lookup must not join through a target that might itself have been deleted mid-run.)

### 2. The provider-neutral port — unchanged

Not part of the defect: this interface never names `EgressPolicy` or `HttpClientPort`; those are adapter-internal.

```typescript
// deployment/ports.ts
import type { DeploymentProviderId, DeploymentRunStatus, DeploymentTargetRecord, ReleaseRecord } from "./types";

/**
 * Provider-neutral deployment port. Four methods, matching McpSessionPort's "the entire surface
 * [the caller] needs" discipline (mcp-federation/ports.ts:81-84). Excluded on purpose:
 * - No buildRelease/exportSite — the honesty constraint (cli/program.ts:35-62 proves no
 *   build/export command exists yet).
 * - No streaming-logs method — EgressPolicy's response caps are for bounded JSON, not long-lived
 *   connections; that's new design work, not a v1 default.
 * - No rollback — per the R1 consensus, rollback IS startRun with a prior releaseId.
 */
export interface DeploymentProviderPort {
  readonly providerId: DeploymentProviderId;

  validateTarget(input: {
    target: DeploymentTargetRecord;
    credential: string;
  }): Promise<{ valid: true } | { valid: false; reason: string }>;

  /** MUST return promptly with a reference to poll or await a callback for — never blocks until
   * the deployment finishes. */
  startRun(input: {
    target: DeploymentTargetRecord;
    release: ReleaseRecord;
    credential: string;
    signal?: AbortSignal;
  }): Promise<{ providerRunRef: string; reconciliation: "poll" | "callback" }>;

  /** Only called when reconciliation === "poll". */
  pollRun(input: {
    target: DeploymentTargetRecord;
    providerRunRef: string;
    credential: string;
  }): Promise<DeploymentRunStatusUpdate>;

  /** Best-effort. A provider that cannot cancel returns { cancelled: false } rather than throwing. */
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

### 3. The GitHub App adapter — REWRITTEN over `HttpClientPort.send`

This is the actual fix. `sendPinned` is the one new mechanism: it is the *only* function in the file allowed to call `deps.http.send`, and it refuses anything whose resolved URL isn't `https://api.github.com`.

```typescript
// deployment/adapters/github.adapter.ts
import { createSign } from "node:crypto";
import type { EgressPolicy, HttpClientPort, HttpRequest, HttpResponse } from "../../integrations-ports";
import type { DeploymentProviderPort, DeploymentRunStatusUpdate } from "../ports";
import type { DeploymentTargetRecord } from "../types";

/**
 * GitHub adapter over the REST Deployments API, authenticated as a GitHub App installation.
 *
 * R3 REWRITE. Round 2 invented `EgressPolicy.allowedHosts`/`followRedirects` and called
 * `http.request(...)` — neither exists. The real contract (`allowedSchemes`, `denyPrivateAddresses`,
 * `devHostAllowlist`, `maxRedirects`, `connectTimeoutMs`, `maxResponseBytes`, `maxDecompressedBytes`,
 * `rateLimit?`, and `HttpClientPort.send(request)`) has NO field that can pin a host —
 * `devHostAllowlist` EXEMPTS hosts from the private-address check, it does not restrict which hosts
 * may be reached, so it cannot do this job even under the right name. Origin pinning is therefore
 * asserted BY THIS ADAPTER: `sendPinned` is the only path to `deps.http.send`, and it throws before
 * sending anything whose URL is not exactly `https://api.github.com/...`.
 *
 * `egressPolicy` is placed on the `HttpRequest` object below (one field among several this adapter
 * sets on every call). That PLACEMENT is inferred — `../http`'s real `HttpRequest` shape is not
 * among this packet's files, only its re-export line is (integrations-ports.ts:28,40) — but the
 * FIELD NAMES inside the policy value itself are the packet's own verified corrections, not a guess.
 */
const GITHUB_API_ORIGIN = "https://api.github.com";
const GITHUB_API_HOST = "api.github.com";

/** GitHub App JWTs: `exp` must be ≤10 minutes past `iat` (verified — Sources). 9 minutes leaves
 * margin. This constant is the JWT's TTL, not the installation token's — Round 2 named it
 * `INSTALLATION_TOKEN_TTL_SECONDS`, which was misleading: the installation token itself is fixed by
 * GitHub at exactly 1 hour and is not something this adapter controls (verified — Sources). */
const APP_JWT_TTL_SECONDS = 9 * 60;
/** GitHub's own guidance: back-date `iat` by 60s for clock-skew tolerance (verified — Sources). */
const APP_JWT_CLOCK_SKEW_SECONDS = 60;

const GITHUB_EGRESS_POLICY: EgressPolicy = {
  allowedSchemes: ["https"],
  // api.github.com is a public host; no devHostAllowlist exemption is needed or applicable — that
  // field only ever loosens the PRIVATE-address check, which this adapter never needs loosened.
  denyPrivateAddresses: true,
  // GitHub's Deployments/App-token endpoints do not redirect in normal operation. Refusing redirects
  // outright closes the one gap `sendPinned`'s URL check cannot see on its own: a redirect Location
  // the underlying client might otherwise silently follow to a different host AFTER the pinned
  // request has already left this function.
  maxRedirects: 0,
  connectTimeoutMs: 10_000,
  maxResponseBytes: 2 * 1024 * 1024,
  maxDecompressedBytes: 4 * 1024 * 1024,
};

interface GitHubCredential {
  appId: string;
  installationId: string;
  privateKeyPem: string;
}

/**
 * The origin pin — the ONLY call site for `deps.http.send` in this file.
 *
 * Because `EgressPolicy` cannot express a host allowlist, this assertion is the sole thing standing
 * between this adapter and an arbitrary outbound host: a typo in a URL template, a future
 * GitHub-Enterprise `baseUrl` added to `target.config` without review (a real future need — GitHub
 * Enterprise Server uses a different API host — but adding it must be a reviewed second constant,
 * never a workspace-supplied string, or a target config becomes an SSRF escape hatch), or a client
 * that decides to chase a redirect despite `maxRedirects: 0` — all fail closed here instead of
 * silently reaching out.
 */
async function sendPinned(http: HttpClientPort, request: HttpRequest): Promise<HttpResponse> {
  const url = new URL(request.url);
  if (url.protocol !== "https:" || url.host !== GITHUB_API_HOST) {
    throw new Error(
      `github deployment adapter refused to send to '${url.origin}' — pinned to ${GITHUB_API_ORIGIN} only`,
    );
  }
  return http.send({ ...request, egressPolicy: GITHUB_EGRESS_POLICY });
}

export function createGitHubDeploymentProviderAdapter(deps: { http: HttpClientPort }): DeploymentProviderPort {
  return {
    providerId: "github",

    async validateTarget({ target, credential }) {
      const config = readGitHubTargetConfig(target);
      if (!config) return { valid: false, reason: "target.config is missing owner/repo/environmentName" };
      try {
        const token = await mintInstallationToken(deps.http, parseCredential(credential));
        const res = await sendPinned(deps.http, {
          method: "GET",
          url: `${GITHUB_API_ORIGIN}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`,
          headers: githubHeaders(token),
        });
        if (res.status === 404) {
          return { valid: false, reason: `'${config.owner}/${config.repo}' not found, or this App installation cannot see it` };
        }
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
        // EXISTING commit. It cannot manufacture one from an "external-artifact" release.
        throw new Error("github deployment target requires a git-revision release (commit sha), not an external artifact");
      }
      const token = await mintInstallationToken(deps.http, parseCredential(credential));
      const res = await sendPinned(deps.http, {
        method: "POST",
        url: `${GITHUB_API_ORIGIN}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/deployments`,
        headers: githubHeaders(token),
        body: JSON.stringify({
          ref: release.source.commitSha,
          environment: config.environmentName,
          auto_merge: false,
          required_contexts: [],
          transient_environment: false,
          production_environment: config.environmentName === "production",
        }),
        signal,
      });
      if (res.status >= 400) throw new Error(`GitHub deployment create failed: ${res.status} ${redactGitHubError(res.body)}`);
      const body = JSON.parse(res.body) as { id: number };
      // Creating a deployment fires a `deployment` event; status arrives back via `deployment_status`
      // events, which is why reconciliation is callback-first here — poll is the fallback for a
      // workspace whose Tovu instance has no reachable inbound webhook URL.
      return { providerRunRef: String(body.id), reconciliation: "callback" };
    },

    async pollRun({ target, providerRunRef, credential }): Promise<DeploymentRunStatusUpdate> {
      const config = readGitHubTargetConfig(target);
      if (!config) throw new Error("github target is missing owner/repo/environmentName");
      const token = await mintInstallationToken(deps.http, parseCredential(credential));
      const res = await sendPinned(deps.http, {
        method: "GET",
        url: `${GITHUB_API_ORIGIN}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/deployments/${encodeURIComponent(providerRunRef)}/statuses?per_page=30`,
        headers: githubHeaders(token),
      });
      if (res.status >= 400) throw new Error(`GitHub deployment status poll failed: ${res.status}`);
      const statuses = JSON.parse(res.body) as Array<{ id: number; state: string; description?: string }>;
      if (statuses.length === 0) return { status: "queued" };
      // R3 fix: GitHub's docs do not document response order for this endpoint (verified — Sources).
      // Round 2 assumed newest-first and took statuses[0]. Status ids are assigned monotonically by
      // GitHub, so the correct status is the greatest id, independent of array order.
      const latest = statuses.reduce((a, b) => (b.id > a.id ? b : a));
      return mapGitHubDeploymentStatus(latest);
    },

    async cancelRun() {
      // No cancel endpoint exists on the Deployments API — a dispatched deployment runs to
      // completion on GitHub's side.
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

/** Mints a short-lived App JWT locally (never transmitted), exchanges it for an installation access
 * token scoped to exactly this installation's repos/permissions (verified — Sources). Minted fresh
 * on every adapter call rather than cached: simpler and correct, at the cost of one extra round trip
 * per deploy action — acceptable given deploy actions are infrequent, not a hot path. */
async function mintInstallationToken(http: HttpClientPort, credential: GitHubCredential): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const jwt = signGitHubAppJwt({
    appId: credential.appId,
    privateKeyPem: credential.privateKeyPem,
    issuedAt: now - APP_JWT_CLOCK_SKEW_SECONDS,
    expiresAt: now + APP_JWT_TTL_SECONDS,
  });
  const res = await sendPinned(http, {
    method: "POST",
    url: `${GITHUB_API_ORIGIN}/app/installations/${encodeURIComponent(credential.installationId)}/access_tokens`,
    headers: { Authorization: `Bearer ${jwt}`, Accept: "application/vnd.github+json" },
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

/** GitHub's real `state` enum, all seven values (verified — Sources): `error`, `failure`,
 * `inactive`, `in_progress`, `queued`, `pending`, `success`. Round 2 only handled four explicitly.
 * Exported so the webhook route below maps single events with the same logic pollRun uses for
 * array entries. */
export function mapGitHubDeploymentStatus(status: { state: string; description?: string } | undefined): DeploymentRunStatusUpdate {
  if (!status) return { status: "queued" };
  const now = new Date().toISOString();
  switch (status.state) {
    case "success": return { status: "succeeded", finishedAtIso: now, message: status.description };
    case "failure":
    case "error": return { status: "failed", finishedAtIso: now, message: status.description };
    // GitHub never fires a deployment_status WEBHOOK for `inactive` (verified — Sources); a poll
    // pass can still observe it (a later deployment superseded this one). Map to `cancelled` rather
    // than leaving the run stuck "running" indefinitely.
    case "inactive": return { status: "cancelled", finishedAtIso: now, message: status.description };
    case "queued":
    case "pending": return { status: "queued", message: status.description };
    case "in_progress":
    default: return { status: "running", message: status.description };
  }
}

/** Strips anything token-shaped out of a GitHub error body before it can reach `errorSummary` or a
 * log line — GitHub's own error bodies routinely echo request fragments. */
function redactGitHubError(body: string): string {
  return body.replace(/gh[pousr]_[A-Za-z0-9_]{20,}/g, "[redacted]").slice(0, 500);
}
```

**Tests for the fix specifically** (not exhaustive coverage — targeted at the defect and the two research-driven corrections):

```typescript
// deployment/adapters/github.adapter.test.ts
import { describe, expect, it, vi } from "vitest";
import { createGitHubDeploymentProviderAdapter, mapGitHubDeploymentStatus } from "./github.adapter";

function fakeHttp(handler: (req: { url: string }) => { status: number; body: string }) {
  return { send: vi.fn(async (req: { url: string }) => handler(req)) };
}

describe("origin pinning", () => {
  it("refuses to send anywhere but api.github.com even if a target config tried to redirect it", async () => {
    // No code path today lets target.config influence the host — this asserts sendPinned's OWN
    // check would catch it if one ever did, independent of any policy field.
    const http = fakeHttp(() => ({ status: 200, body: "{}" }));
    const adapter = createGitHubDeploymentProviderAdapter({ http });
    const target = { config: { owner: "acme", repo: "site", environmentName: "production" } } as any;
    await adapter.validateTarget({ target, credential: JSON.stringify({ appId: "1", installationId: "2", privateKeyPem: PEM }) });
    for (const call of http.send.mock.calls) {
      expect(new URL(call[0].url).host).toBe("api.github.com");
    }
  });

  it("every call passes the real EgressPolicy field names, not the invented ones", async () => {
    const http = fakeHttp(() => ({ status: 200, body: JSON.stringify({ token: "t" }) }));
    const adapter = createGitHubDeploymentProviderAdapter({ http });
    await adapter.validateTarget({
      target: { config: { owner: "a", repo: "b", environmentName: "production" } } as any,
      credential: JSON.stringify({ appId: "1", installationId: "2", privateKeyPem: PEM }),
    });
    const policy = http.send.mock.calls[0][0].egressPolicy;
    expect(policy).toMatchObject({ allowedSchemes: ["https"], denyPrivateAddresses: true, maxRedirects: 0 });
    expect(policy).not.toHaveProperty("allowedHosts");
    expect(policy).not.toHaveProperty("followRedirects");
  });
});

describe("pollRun does not assume response order", () => {
  it("picks the status with the greatest id, not statuses[0]", async () => {
    const http = fakeHttp((req) =>
      req.url.includes("access_tokens")
        ? { status: 200, body: JSON.stringify({ token: "t" }) }
        : { status: 200, body: JSON.stringify([
            { id: 1, state: "queued" },
            { id: 3, state: "success" }, // deliberately NOT first, to falsify a newest-first assumption
            { id: 2, state: "in_progress" },
          ]) },
    );
    const adapter = createGitHubDeploymentProviderAdapter({ http });
    const result = await adapter.pollRun({
      target: { config: { owner: "a", repo: "b", environmentName: "production" } } as any,
      providerRunRef: "42",
      credential: JSON.stringify({ appId: "1", installationId: "2", privateKeyPem: PEM }),
    });
    expect(result.status).toBe("succeeded");
  });
});

describe("mapGitHubDeploymentStatus covers the real 7-value enum", () => {
  it.each([
    ["error", "failed"], ["failure", "failed"], ["success", "succeeded"],
    ["inactive", "cancelled"], ["queued", "queued"], ["pending", "queued"], ["in_progress", "running"],
  ])("%s -> %s", (state, expected) => {
    expect(mapGitHubDeploymentStatus({ state }).status).toBe(expected);
  });
});

const PEM = "-----BEGIN PRIVATE KEY-----\n(test fixture)\n-----END PRIVATE KEY-----";
```

### 4. The webhook route — signature verification and `(providerId, providerRunRef)` → workspace resolution

```typescript
// deployment/inbound-webhook.ts
import { createHmac, timingSafeEqual } from "node:crypto";
import { mapGitHubDeploymentStatus } from "./adapters/github.adapter";
import type { DeploymentRunRepoPort } from "./reconcile";

/**
 * The workspace is NEVER read from the request. GitHub's payload has no notion of Tovu workspaces,
 * and trusting a caller-supplied one on an unauthenticated inbound endpoint is the same
 * confused-deputy shape external-mcp/guard.ts:37-40 refuses on the admin side by checking
 * `String(requestedWorkspaceId) !== deps.workspaceId` before anything else runs. Here: (1) verify
 * the HMAC-SHA256 signature against the App's webhook secret, constant-time, before parsing
 * anything; (2) once verified, resolve (providerId, providerRunRef) through findByProviderRef — the
 * ONLY place a provider identifier maps to a (workspaceId, runId) pair.
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

    const event = JSON.parse((req.body as Buffer).toString("utf8")) as {
      deployment?: { id?: number };
      deployment_status?: { state: string; description?: string };
    };
    const run = await deps.runs.findByProviderRef({
      providerId: "github",
      providerRunRef: String(event.deployment?.id ?? ""),
    });
    if (!run) {
      res.status(202).json({ ignored: true }); // no matching run — not an error, just not ours
      return;
    }

    // GitHub never fires this webhook for state `inactive` (verified — Sources), so this path only
    // ever sees success/failure/error/in_progress/queued/pending; `inactive` is poll-only.
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

/**
 * HMAC-SHA256 over the RAW body, per GitHub's current guidance (verified — Sources): the header is
 * `sha256=<hex>`, and comparison must be constant-time — GitHub singles out a plain `==`/`===` as
 * the mistake, naming `crypto.timingSafeEqual` as the fix.
 */
function verifyGitHubSignature(rawBody: Buffer, headerValue: string, secret: string): boolean {
  if (!headerValue.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const expectedBuf = Buffer.from(expected, "utf8");
  const suppliedBuf = Buffer.from(headerValue, "utf8");
  // timingSafeEqual throws on length mismatch rather than returning false — a length check on
  // attacker-controlled input first is not itself a meaningful timing oracle (length alone leaks
  // nothing about the secret), and it keeps this function total.
  if (expectedBuf.length !== suppliedBuf.length) return false;
  return timingSafeEqual(expectedBuf, suppliedBuf);
}

function sanitizeForStorage(message: string | null): string | null {
  if (message === null) return null;
  return message.replace(/gh[pousr]_[A-Za-z0-9_]{20,}/g, "[redacted]").slice(0, 500);
}

function rawJsonBody() {
  return (require("express") as typeof import("express")).raw({ type: "application/json", limit: "256kb" });
}
```

Optimistic concurrency (`expectedVersion`) matters because poll and callback can race on the same run — the SQL adapter's `UPDATE ... WHERE workspace_id=? AND id=? AND version=?` affecting zero rows means "someone already applied a newer status," and the caller drops the update rather than overwriting a later state with a stale one. (`DeploymentRunRepoPort`, including `findByProviderRef` and the poll worker `reconcileDeploymentRuns` that shares this exact update path, is unchanged from Round 2 in shape; omitted here for space since it was never part of the defect and isn't in the packet's five required pieces.)

### 5. Admin surface, including the honesty banner

```typescript
// routes/admin/deployments/start-run.ts
import type { Express } from "express";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import { startDeploymentRun, DeploymentValidationError, TargetNotFoundError } from "#src/deployment/start-run";
import type { DeploymentRouteDeps } from "./deps";

// Reuses the existing "operator administers a third-party integration" permission — a deployment
// target IS that shape, the same reasoning mcp-federation/trust.ts:120-124 gives for reusing
// admin.integrations.manage rather than minting a new string.
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
        newReleaseFromCommitSha: typeof body.commitSha === "string" ? body.commitSha : undefined,
        requestedByPrincipalId: principal.id,
      });
      res.status(202).json({ run }); // 202: started, not finished
    } catch (err) {
      if (err instanceof DeploymentValidationError) { res.status(400).json({ error: err.message, code: "INVALID_DEPLOYMENT_REQUEST" }); return; }
      if (err instanceof TargetNotFoundError) { res.status(404).json({ error: err.message, code: "NOT_FOUND" }); return; }
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
```

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

/** The honesty constraint, stated to the operator rather than left implicit in what buttons exist. */
function HonestyBanner() {
  return (
    <div className="callout callout--info" role="note">
      Tovu triggers and tracks deployment of a release you already have — a commit in a repository
      you control. It does not build or export your site yet; point a target at a repo whose CI (or
      the provider itself) turns that commit into a live site.
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
  const { runs } = useDeploymentRuns(workspaceId, { pollMs: 4000 });
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

Route surface and the assistant-tool/degradation notes are otherwise unchanged from Round 2 (not part of the defect, omitted here for space): list/put routes for environments and targets follow `external-mcp/put.ts`'s idempotent-by-id shape and `external-mcp/list.ts:5-14`'s never-decrypt discipline; the webhook route above is the one inbound, unauthenticated-by-workspace, signature-gated exception; an assistant-facing `deployment_start_run` tool calls the same `startDeploymentRun` service the route calls and is never handed the provider credential.

## Critique Of Another Participant's Round 2 Code

**gemini-3.1-pro-high-round2's `GitHubRestDeploymentAdapter.triggerDeployment`** has two independent compile errors, not one — and one of them is verifiable directly against a file in `files/`, not against the packet's corrections:

1. `const response = await this.httpClient.fetch(request, this.egressPolicy);` — `HttpClientPort` has no `fetch` method under any version of the contract this packet has described (Round 2's guess was `.request(...)`, the verified real name is `.send(...)`; `.fetch` matches neither), and it's called with two positional arguments where the real method takes exactly one (`send(request)`, per this packet's own correction). The following line, `if (!response.ok) throw ...`, additionally assumes a Fetch-API-shaped response with a boolean `.ok` — nothing in this packet's files, including this same participant's own domain code elsewhere, suggests `HttpResponse` carries that field rather than a `status` number the caller compares itself (which is how every other participant, including this one in its own type re-exports, treats it).

2. `const token = await this.sealer.open({ sealed: secretRecord.secret, key: rootKey });` — this one doesn't need any inference about an unseen file; `integrations-ports.ts:94-97` is in `files/` and is unambiguous:
   ```typescript
   export interface SecretSealerPort {
     seal(input: { plaintext: string; key: RootKeyHandle }): Promise<SealedSecret>;
     open(input: { sealed: SealedSecret }): Promise<string>;
   }
   ```
   `open` takes `{ sealed }` only — there is no `key` parameter. `seal` takes `{ plaintext, key }`; `open` does not, because opening a sealed secret only needs the ciphertext plus whatever root-key material the sealer implementation already holds, not a key the *caller* supplies (`RootKeyHandle` is described at `integrations-ports.ts:46-50` as "opaque... the raw bytes never cross the SDK/ABI surface" — a caller passing it into `open` couldn't do anything with it even if the parameter existed). Passing an object literal with an extra `key` property to a parameter typed `{ sealed: SealedSecret }` is a TypeScript excess-property-check error on a literal argument, so this fails to compile independent of anything in the preamble's corrections. It also means `const rootKey = await this.keyring.activeKey();` two lines above is dead code once the call is fixed — `open` never needed it, which suggests the construct came from mirroring `seal`'s shape rather than reading `open`'s actual signature.

Both errors are in the same ~15-line method, both are load-bearing (the first is the actual network call the whole adapter exists to make; the second is how it gets the bearer token to put on that call), and both would have been caught by opening `integrations-ports.ts`, which was already in `files/` before Round 2 was dispatched, not something Round 3 newly revealed.

## What Would Change My Mind

Unchanged from Round 2, plus one addition:

- The owner naming a single deploy target with no intention of a second — Option D/2 exclusively, and the domain model is over-engineering.
- A build/export capability landing in the CLI — reopens the whole "what is being deployed" question.
- Evidence that self-hosters won't tolerate GitHub App setup — would push a PAT-based adapter to be the *default* on-ramp with the blast radius disclosed, keeping the App adapter as the tighter-scoped upgrade; `DeploymentProviderPort`'s shape doesn't change either way, since `credential` is already an opaque string a specific adapter interprets.
- **New this round:** if `../http`'s real `HttpRequest` type turns out not to carry a per-request `egressPolicy` field at all — i.e., if the policy is actually bound once at `HttpClientPort` construction rather than threaded per-call — `sendPinned`'s signature changes (it would take a pre-configured client and drop the `egressPolicy` line entirely), but the origin-pin *mechanism* itself is unaffected, since the pin never depended on where the policy lives; it's a URL check that happens regardless of how the policy is threaded. I could not verify this placement because `../http` itself was never in this packet's `files/`, only re-exported names from it.

<<SWARM_END>>
