I’m reading the Round 2 packet and inventorying the supplied source tree now. I’ll keep the final response strictly to the packet’s required framing and source-line citations.
The packet’s consensus holds up, but one Round 1 suggestion needs tightening: a Git push or GitHub tree construction would imply artifact/export work the supplied CLI does not have. I’m grounding the code around `workflow_dispatch` of an already-existing immutable ref, with durable reconciliation.
ACK_PACKET_RECEIVED CTX-DEPLOY-R2-2026-08-12 -- I received the packet and will work on it.

## Position And Movement

My position is unchanged on architecture but narrower on the first implementation:

- Deployment is promotion of an immutable, workspace-scoped release to a named environment.
- Tovu should own deployment state while provider-neutral adapters own external effects.
- The first slice should orchestrate a deployment of a pre-existing artifact or commit. It must not build, export, commit, or push content: the CLI proves only `init`, `serve`, and `introspect` exist (files/tovu/cli/program.ts:35-60).
- For GitHub, use REST through the guarded HTTP boundary and GitHub App installation tokens. Neither `gh` nor MCP is required.
- Polling is the recovery mechanism; signed provider callbacks reduce latency but are not the sole source of truth.

The refinement from Round 1 is that I would not call Git push the first slice. Producing commits or trees still presupposes an exporter. GitHub’s deployment API can instead reference an already-existing immutable commit SHA and return a durable deployment identifier.

MCP remains unsuitable as the authoritative runtime: the implemented interface offers only `listTools`, `callTool`, and `close`; hosted HTTP is deferred, and the implementation launches a child process (files/tovu/mcp-federation/ports.ts:78-91,139-147; files/tovu/mcp-federation/adapter.stdio.ts:307-312). That child owns its network stack rather than using the shared guarded client whose port and policy are explicitly centralized for outbound integrations (files/tovu/integrations-ports.ts:5-11,27-40).

## Solution Slate

Ranking criteria, in descending importance:

1. Tenant isolation and guarded egress.
2. Durable, reconcilable execution semantics.
3. Credential scope and lifetime.
4. Honesty about Tovu’s current artifact capabilities.
5. Self-hosting portability and implementation cost.

| Rank | Option | Result |
|---|---|---|
| 1 | Provider-neutral deployment domain plus direct HTTP adapters | Best security, status, and auth fit |
| 2 | Guarded provider deploy-hook adapter | Cheapest useful integration, but weak observability |
| 3 | Self-hosted pull runner using provider CLIs | Strong isolation for advanced operators, substantial operational cost |
| 4 | MCP-only execution | Broad discovery, but wrong security and lifecycle boundary today |

**1. Direct HTTP adapters — recommended.** Tovu creates durable runs, then a GitHub adapter creates and observes GitHub deployments through `HttpClientPort` and an injected `EgressPolicy`. A GitHub App issues short-lived installation tokens restricted to the selected repository and permissions. It requires no `gh` installation, ambient user login, or user-bound PAT. The sacrifice is provider breadth: Tovu must maintain each first-party adapter and provider status mapping.

**2. Deploy hooks.** POSTing a sealed deploy-hook URL through the guarded HTTP client is even smaller. It works well when a host already owns build configuration. The sacrifice is truth: many hooks return only “accepted,” without a durable execution ID, granular permission scope, reliable status, or rollback correlation. Tovu may only be able to say “trigger delivered.”

**3. Pull runner/CLI.** A separately operated runner can claim signed jobs and use `gh`, `wrangler`, or infrastructure tooling outside the Tovu process. This avoids giving configurable binaries the CMS process’s authority—a risk the current MCP configuration guard explicitly identifies (files/tovu/external-mcp/guard.ts:6-14). The sacrifice is deployment complexity: runner provisioning, leases, upgrades, compatibility, and another authentication protocol.

**4. MCP-only.** It offers discovery and vendor-owned adapters, but today it means subprocess execution, 30-second default calls, and assistant-oriented untrusted results rather than durable deployment operations (files/tovu/mcp-federation/config.ts:43-48; files/tovu/mcp-federation/trust.ts:92-103). Its genuine advantage—adding providers without Tovu-maintained adapters—is sacrificed by the leading option.

The cheapest meaningful falsifying test is a one-repository GitHub spike:

1. Install a test GitHub App on exactly one repository.
2. Through the real guarded HTTP adapter, mint a repository-restricted installation token and create a deployment for an existing commit SHA.
3. Have a tiny external workflow publish queued, running, and terminal deployment statuses.
4. Kill Tovu after submission and verify recovery by `tovu_run_id` plus polling.
5. Verify the token cannot access a second, unselected repository.

If submission cannot be idempotently reconciled, statuses cannot be correlated to one run, or the required token cannot be narrowly restricted, the leading GitHub design is falsified.

## Leading Option — Code

### Domain and persistence

```ts
import type { ISODateTime, UUID } from "@jini-ai/cms/core";
import type { IntegrationId } from "../integrations/types";

export type DeploymentRunState =
  | "queued"
  | "starting"
  | "submitted"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled";

export interface Release {
  readonly id: UUID;
  readonly workspaceId: UUID;
  readonly label: string;

  // V1 accepts an existing immutable artifact; it does not construct one.
  readonly artifact: {
    readonly kind: "external";
    readonly uri: string;       // e.g. github://owner/repo/commit/<sha>
    readonly digest: string;    // immutable SHA/digest, never a branch name
    readonly mediaType: string;
  };

  readonly createdByPrincipalId: UUID;
  readonly createdAtIso: ISODateTime;
  readonly version: number;
}

export interface Environment {
  readonly id: UUID;
  readonly workspaceId: UUID;
  readonly name: string;
  readonly currentReleaseId: UUID | null;
  readonly createdAtIso: ISODateTime;
  readonly updatedAtIso: ISODateTime;
  readonly version: number;
}

export interface GitHubDeploymentTargetConfig {
  readonly kind: "github-deployment-v1";
  readonly appId: string;
  readonly installationId: string;
  readonly repositoryId: number;
  readonly owner: string;
  readonly repository: string;
  readonly task: "deploy";
  // Public routing identifier, omitted from browser DTOs. Authentication is HMAC.
  readonly callbackBindingId: UUID;
}

export interface DeploymentTarget {
  readonly id: UUID;
  readonly workspaceId: UUID;
  readonly environmentId: UUID;
  readonly name: string;
  readonly provider: "github-deployments";
  readonly config: GitHubDeploymentTargetConfig;

  // Reference only. Ciphertext remains in the integration-secret store.
  readonly credentialSecretId: IntegrationId;
  readonly enabled: boolean;
  readonly createdAtIso: ISODateTime;
  readonly updatedAtIso: ISODateTime;
  readonly version: number;
}

export interface DeploymentRun {
  readonly id: UUID;
  readonly workspaceId: UUID;
  readonly releaseId: UUID;
  readonly environmentId: UUID;
  readonly targetId: UUID;
  readonly requestedByPrincipalId: UUID;
  readonly idempotencyKey: string;
  readonly expectedEnvironmentVersion: number;

  readonly state: DeploymentRunState;
  readonly providerOperationId: string | null;
  readonly providerState: string | null;
  readonly attempt: number;
  readonly leaseUntilIso: ISODateTime | null;
  readonly nextPollAtIso: ISODateTime | null;

  // Sanitized code/summary only—never headers, tokens, or raw provider bodies.
  readonly errorCode: string | null;
  readonly errorSummary: string | null;

  readonly requestedAtIso: ISODateTime;
  readonly startedAtIso: ISODateTime | null;
  readonly finishedAtIso: ISODateTime | null;
  readonly updatedAtIso: ISODateTime;
  readonly version: number;
}
```

All ordinary repository calls must carry `workspaceId`, matching the existing repository convention (files/tovu/integrations-ports.ts:100-114,130-154,157-162).

```sql
CREATE TABLE releases (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  label TEXT NOT NULL,
  artifact_kind TEXT NOT NULL CHECK (artifact_kind = 'external'),
  artifact_uri TEXT NOT NULL,
  artifact_digest TEXT NOT NULL,
  artifact_media_type TEXT NOT NULL,
  created_by_principal_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, artifact_uri, artifact_digest)
);

CREATE TABLE environments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  current_release_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, name),
  FOREIGN KEY (workspace_id, current_release_id)
    REFERENCES releases(workspace_id, id)
);

CREATE TABLE deployment_targets (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  environment_id TEXT NOT NULL,
  name TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider = 'github-deployments'),
  provider_config_json TEXT NOT NULL CHECK (json_valid(provider_config_json)),
  credential_secret_id TEXT NOT NULL,
  callback_binding_id TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, id, environment_id),
  UNIQUE (workspace_id, environment_id, name),
  FOREIGN KEY (workspace_id, environment_id)
    REFERENCES environments(workspace_id, id)
);

CREATE TABLE deployment_runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  release_id TEXT NOT NULL,
  environment_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  requested_by_principal_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  expected_environment_version INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (
    state IN ('queued','starting','submitted','running',
              'succeeded','failed','canceled')
  ),
  provider_operation_id TEXT,
  provider_state TEXT,
  attempt INTEGER NOT NULL DEFAULT 0,
  lease_until TEXT,
  next_poll_at TEXT,
  error_code TEXT,
  error_summary TEXT,
  requested_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, target_id, idempotency_key),
  UNIQUE (workspace_id, target_id, provider_operation_id),
  FOREIGN KEY (workspace_id, release_id)
    REFERENCES releases(workspace_id, id),
  FOREIGN KEY (workspace_id, environment_id)
    REFERENCES environments(workspace_id, id),
  FOREIGN KEY (workspace_id, target_id, environment_id)
    REFERENCES deployment_targets(workspace_id, id, environment_id)
);

CREATE TABLE deployment_run_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('info','warning','error')),
  event_code TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE (workspace_id, run_id, sequence),
  FOREIGN KEY (workspace_id, run_id)
    REFERENCES deployment_runs(workspace_id, id)
);

CREATE INDEX deployment_runs_due_idx
  ON deployment_runs(state, next_poll_at, lease_until);
```

A successful run updates `environments.current_release_id` with:

```sql
UPDATE environments
SET current_release_id = :release_id,
    updated_at = :now_iso,
    version = version + 1
WHERE workspace_id = :workspace_id
  AND id = :environment_id
  AND version = :expected_environment_version;
```

A zero-row update means another promotion won the race. Rollback is a new run selecting an older `release_id`; no local write is “reversed.”

### Narrow runtime port and GitHub adapter

The port deliberately excludes builds, exports, uploads, cancellation, streaming logs, target configuration, and secret management because none is proven necessary for this slice.

```ts
export interface DeploymentRuntimePort {
  submit(input: {
    workspaceId: UUID;
    runId: UUID;
    release: Release;
    environment: Environment;
    target: DeploymentTarget;
  }): Promise<{
    providerOperationId: string;
    state: "submitted" | "running";
    providerState: string;
  }>;

  inspect(input: {
    workspaceId: UUID;
    target: DeploymentTarget;
    providerOperationId: string;
  }): Promise<{
    state: "submitted" | "running" | "succeeded" | "failed";
    providerState: string;
    summary?: string;
  }>;
}
```

The supplied extract re-exports `HttpClientPort`, `EgressPolicy`, `HttpRequest`, and `HttpResponse`, but does not include the actual `../http` method signature (files/tovu/integrations-ports.ts:27-40). This binding avoids inventing that missing signature while ensuring every adapter request carries both the real client and policy:

```ts
import type {
  EgressPolicy,
  HttpClientPort,
  HttpRequest,
  HttpResponse,
} from "../integrations-ports";

export type ExecuteGuardedRequest = (input: {
  client: HttpClientPort;
  policy: EgressPolicy;
  request: HttpRequest;
}) => Promise<HttpResponse>;
```

The production binding must invoke the shared HTTP implementation; no fallback to global `fetch` is permitted.

```ts
const GITHUB_API = "https://api.github.com";

export class GitHubDeploymentAdapter implements DeploymentRuntimePort {
  constructor(
    private readonly http: HttpClientPort,
    private readonly policy: EgressPolicy,
    private readonly execute: ExecuteGuardedRequest,
    private readonly credentials: GitHubCredentialVault,
    private readonly tokens: GitHubInstallationTokenProvider,
  ) {}

  async submit(input: {
    workspaceId: UUID;
    runId: UUID;
    release: Release;
    environment: Environment;
    target: DeploymentTarget;
  }) {
    const config = input.target.config;
    const credential = await this.credentials.open({
      workspaceId: input.workspaceId,
      secretId: input.target.credentialSecretId,
    });

    const token = await this.tokens.get({
      http: this.http,
      policy: this.policy,
      execute: this.execute,
      config,
      appPrivateKeyPem: credential.appPrivateKeyPem,
    });

    // Reconcile before creating. This makes a retry after an ambiguous timeout
    // find the deployment accepted by GitHub instead of creating another one.
    const existing = await this.listDeployments({
      config,
      token,
      commitSha: input.release.artifact.digest,
      environment: input.environment.name,
    });

    const matched = existing.find(
      (deployment) =>
        deployment.payload?.tovu_run_id === input.runId,
    );

    if (matched) {
      return {
        providerOperationId: String(matched.id),
        state: "submitted" as const,
        providerState: "queued",
      };
    }

    const response = await this.jsonRequest({
      token,
      method: "POST",
      url: `${GITHUB_API}/repos/${encodeURIComponent(config.owner)}/` +
        `${encodeURIComponent(config.repository)}/deployments`,
      body: {
        ref: input.release.artifact.digest,
        task: config.task,
        environment: input.environment.name,
        auto_merge: false,
        required_contexts: [],
        payload: {
          // Correlation identifier, not a credential.
          tovu_run_id: input.runId,
          release_digest: input.release.artifact.digest,
        },
      },
    });

    if (response.status !== 201) {
      throw new ProviderError("GITHUB_DEPLOYMENT_CREATE_FAILED");
    }

    const deployment = parseGitHubDeployment(response.body);
    return {
      providerOperationId: String(deployment.id),
      state: "submitted" as const,
      providerState: "queued",
    };
  }

  async inspect(input: {
    workspaceId: UUID;
    target: DeploymentTarget;
    providerOperationId: string;
  }) {
    const credential = await this.credentials.open({
      workspaceId: input.workspaceId,
      secretId: input.target.credentialSecretId,
    });
    const token = await this.tokens.get({
      http: this.http,
      policy: this.policy,
      execute: this.execute,
      config: input.target.config,
      appPrivateKeyPem: credential.appPrivateKeyPem,
    });

    const config = input.target.config;
    const response = await this.jsonRequest({
      token,
      method: "GET",
      url: `${GITHUB_API}/repos/${encodeURIComponent(config.owner)}/` +
        `${encodeURIComponent(config.repository)}/deployments/` +
        `${encodeURIComponent(input.providerOperationId)}/statuses?per_page=1`,
    });

    if (response.status !== 200) {
      throw new ProviderError("GITHUB_DEPLOYMENT_STATUS_FAILED");
    }

    const latest = parseLatestGitHubDeploymentStatus(response.body);
    return mapGitHubStatus(latest?.state ?? "queued");
  }

  private async jsonRequest(input: {
    token: string;
    method: "GET" | "POST";
    url: string;
    body?: unknown;
  }): Promise<{ status: number; body: unknown }> {
    const response = await this.execute({
      client: this.http,
      policy: this.policy,
      request: makeHttpRequest({
        method: input.method,
        url: input.url,
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${input.token}`,
          "content-type": "application/json",
          "x-github-api-version": "2022-11-28",
        },
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
      }),
    });

    return decodeBoundedJsonResponse(response);
  }

  private async listDeployments(input: {
    config: GitHubDeploymentTargetConfig;
    token: string;
    commitSha: string;
    environment: string;
  }): Promise<GitHubDeployment[]> {
    const query = new URLSearchParams({
      sha: input.commitSha,
      environment: input.environment,
      per_page: "100",
    });
    const response = await this.jsonRequest({
      token: input.token,
      method: "GET",
      url: `${GITHUB_API}/repos/${encodeURIComponent(input.config.owner)}/` +
        `${encodeURIComponent(input.config.repository)}/deployments?${query}`,
    });
    if (response.status !== 200) {
      throw new ProviderError("GITHUB_DEPLOYMENT_RECONCILE_FAILED");
    }
    return parseGitHubDeployments(response.body);
  }
}
```

`GITHUB_API` is server-owned rather than an arbitrary workspace-supplied base URL. GitHub Enterprise support should add an installation-approved origin and matching `EgressPolicy`, not silently turn target configuration into an SSRF escape hatch.

A GitHub App is preferable to `gh` or a PAT because the installation grant can be limited to selected repository IDs and deployment/content permissions, while its access token is short-lived. `gh` adds binary/version management and ambient-auth risk; the current subprocess implementation’s explicit environment replacement demonstrates how carefully child credentials must be isolated (files/tovu/mcp-federation/adapter.stdio.ts:298-312,372-394).

### Secrets

Only the GitHub App private key and webhook HMAC secret are durable. Installation tokens are minted just in time and optionally cached in memory until shortly before expiry.

```ts
interface GitHubCredential {
  readonly appPrivateKeyPem: string;
  readonly webhookSecret: string;
}

export async function sealGitHubCredential(input: {
  workspaceId: UUID;
  credential: GitHubCredential;
  buildRecord: (sealed: SealedSecret) => IntegrationSecretRecord;
}, deps: {
  keyring: KeyringPort;
  sealer: SecretSealerPort;
  repo: IntegrationSecretRepoPort;
}): Promise<void> {
  const key = await deps.keyring.activeKey();
  const sealed = await deps.sealer.seal({
    plaintext: JSON.stringify(input.credential),
    key,
  });
  await deps.repo.insert(input.buildRecord(sealed));
}

export class GitHubCredentialVault {
  constructor(
    private readonly repo: IntegrationSecretRepoPort,
    private readonly sealer: SecretSealerPort,
    private readonly sealedOf: (
      record: IntegrationSecretRecord,
    ) => SealedSecret,
  ) {}

  async open(input: {
    workspaceId: UUID;
    secretId: IntegrationId;
  }): Promise<GitHubCredential> {
    const record = await this.repo.findById({
      workspaceId: input.workspaceId,
      id: input.secretId,
    });
    if (!record) throw new Error("deployment credential was not found");

    const plaintext = await this.sealer.open({
      sealed: this.sealedOf(record),
    });
    return parseGitHubCredential(plaintext);
  }
}
```

The record constructor/accessor is left explicit because `IntegrationSecretRecord`’s definition is not included in the supplied subtree; fabricating its fields would not be real code. The verified contract is that key acquisition, sealing/opening, and repository lookup are separate, and lookup requires `workspaceId` (files/tovu/integrations-ports.ts:46-97,157-162).

Browser DTOs omit `credentialSecretId`, `callbackBindingId`, ciphertext, and all credential values:

```ts
export function toDeploymentTargetView(target: DeploymentTarget) {
  return {
    id: target.id,
    environmentId: target.environmentId,
    name: target.name,
    provider: target.provider,
    enabled: target.enabled,
    config: {
      appId: target.config.appId,
      installationId: target.config.installationId,
      owner: target.config.owner,
      repository: target.config.repository,
    },
    credentialConfigured: true,
    version: target.version,
  };
}
```

This follows the existing read-side rule that credential names/presence may be displayed but values are never decrypted for the browser (files/tovu/external-mcp/list.ts:5-14).

### Durable worker, polling, and callback

The run worker mirrors the existing `claimPending`/mark-result outbox pattern (files/tovu/integrations-ports.ts:116-154):

```ts
export async function reconcileDeploymentRun(
  run: DeploymentRun,
  deps: {
    runs: DeploymentRunRepoPort;
    releases: ReleaseRepoPort;
    environments: EnvironmentRepoPort;
    targets: DeploymentTargetRepoPort;
    runtimes: DeploymentRuntimeRegistry;
    clock: ClockPort;
  },
): Promise<void> {
  const scope = { workspaceId: run.workspaceId };
  const [release, environment, target] = await Promise.all([
    deps.releases.findById({ ...scope, id: run.releaseId }),
    deps.environments.findById({ ...scope, id: run.environmentId }),
    deps.targets.findById({ ...scope, id: run.targetId }),
  ]);
  if (!release || !environment || !target) {
    await deps.runs.fail({
      workspaceId: run.workspaceId,
      id: run.id,
      expectedVersion: run.version,
      errorCode: "DEPLOYMENT_INPUT_DISAPPEARED",
      errorSummary: "A referenced release, environment, or target no longer exists.",
    });
    return;
  }

  const runtime = deps.runtimes.forProvider(target.provider);

  if (run.providerOperationId === null) {
    const submitted = await runtime.submit({
      workspaceId: run.workspaceId,
      runId: run.id,
      release,
      environment,
      target,
    });
    await deps.runs.markSubmitted({
      workspaceId: run.workspaceId,
      id: run.id,
      expectedVersion: run.version,
      providerOperationId: submitted.providerOperationId,
      providerState: submitted.providerState,
      nextPollAtIso: deps.clock.addSeconds(15),
    });
    return;
  }

  const observed = await runtime.inspect({
    workspaceId: run.workspaceId,
    target,
    providerOperationId: run.providerOperationId,
  });

  await deps.runs.applyObservation({
    workspaceId: run.workspaceId,
    id: run.id,
    expectedVersion: run.version,
    observed,
    nextPollAtIso:
      observed.state === "submitted" || observed.state === "running"
        ? deps.clock.addSeconds(30)
        : null,
  });
}
```

Expired `starting` leases are claimable again. `submit()` reconciles by `tovu_run_id`, so a process death after GitHub accepted the request does not automatically duplicate it.

The callback endpoint deliberately has no `workspaceId` in its path, query, body, or update command:

```ts
app.post(
  "/api/integrations/github/deployment-callbacks/:bindingId",
  express.raw({ type: "application/json", limit: "256kb" }),
  async (req, res) => {
    const binding = await deps.callbackBindings.findByOpaqueId({
      bindingId: String(req.params.bindingId ?? ""),
    });
    if (!binding) {
      res.status(404).end();
      return;
    }

    // workspaceId comes only from Tovu's stored binding, never from GitHub.
    const credential = await deps.githubCredentials.open({
      workspaceId: binding.workspaceId,
      secretId: binding.credentialSecretId,
    });

    if (!verifyGitHubHmac({
      rawBody: req.body,
      suppliedSignature: String(req.header("x-hub-signature-256") ?? ""),
      webhookSecret: credential.webhookSecret,
    })) {
      res.status(401).end();
      return;
    }

    const event = parseGitHubDeploymentStatusEvent(req.body);

    // This command intentionally has no workspaceId parameter. Its transaction
    // joins binding -> target -> run using Tovu-owned rows.
    await deps.deploymentCallbacks.applyVerifiedStatus({
      callbackBindingId: binding.id,
      deliveryId: String(req.header("x-github-delivery") ?? ""),
      providerOperationId: String(event.deploymentId),
      providerState: event.state,
      occurredAtIso: event.occurredAtIso,
    });

    res.status(204).end();
  },
);
```

`applyVerifiedStatus` deduplicates `deliveryId`, locates the run through the stored callback binding and provider operation ID, validates the state transition, performs a versioned update, and appends only a sanitized event. It neither trusts a provider-supplied workspace nor derives one from repository names. Polling repairs dropped callbacks.

### Admin and frontend surface

The admin needs a durable Deployments section, not a chat-only flow:

```text
/admin/settings/deployments

GET  /api/admin/v1/workspaces/:workspaceId/deployment-environments
GET  /api/admin/v1/workspaces/:workspaceId/deployment-targets
PUT  /api/admin/v1/workspaces/:workspaceId/deployment-targets/:targetId
PUT  /api/admin/v1/workspaces/:workspaceId/deployment-targets/:targetId/credential
GET  /api/admin/v1/workspaces/:workspaceId/deployment-runs
POST /api/admin/v1/workspaces/:workspaceId/deployment-runs
GET  /api/admin/v1/workspaces/:workspaceId/deployment-runs/:runId
```

Each workspace route first rejects a mismatched path workspace, then authorizes, matching the established route shape (files/tovu/external-mcp/guard.ts:32-48). Creating a run returns `202` immediately; the browser polls its durable record.

```tsx
const HONESTY_COPY =
  "Tovu does not build or export your site yet. Deployments orchestrate " +
  "an external deployment of an artifact or commit that already exists.";

export function DeploymentsPage({ workspaceId }: { workspaceId: string }) {
  const { targets, environments, runs, refresh } =
    useDeployments(workspaceId, { pollEveryMs: 5_000 });

  return (
    <AdminSection title="Deployments" description={HONESTY_COPY}>
      {targets.length === 0 ? (
        <EmptyState
          title="No deployment target configured"
          description={
            "Connect an external deployment provider. Nothing will be built, " +
            "uploaded, or published until a target is configured."
          }
          action={<ConfigureTargetButton />}
        />
      ) : (
        <>
          <EnvironmentCards environments={environments} />
          <TargetConfigurationPanels
            targets={targets}
            showCredentialValues={false}
          />
          <PreExistingReleasePicker />
          <DeploymentRunLog
            runs={runs}
            onTerminalState={refresh}
            showSanitizedEventsOnly
          />
        </>
      )}
    </AdminSection>
  );
}
```

The run log shows release digest, environment, target, requester, timestamps, current status, sanitized events, and “Redeploy this release” for prior successful releases. It never labels that action “undo.”

An assistant may call a native `deployment_run_create` operation, but that handler must invoke the same authorization and `createDeploymentRun()` service as the button. It receives release/environment/target IDs and returns only the durable run ID and status URL; it never receives credentials or calls the provider adapter directly.

`module-status.ts` remains unrelated: it reads the process boot snapshot and maps critical readiness failure to HTTP 503 rather than storing executions (files/tovu/module-status.ts:7-20,42-49).

## Strongest Counter-Argument

The strongest counter-argument is that GitHub Deployments is coordination metadata, not a build system. A repository still needs an external workflow or deployment platform that reacts to the deployment and publishes statuses. For many users, a provider deploy-hook URL could achieve the visible outcome with a fraction of the GitHub App, webhook, worker, and reconciliation machinery.

That objection is real. The leading option pays substantial complexity before Tovu can build anything itself, and every maintained provider adapter consumes ongoing engineering capacity. If target users mostly want “tell my existing CI to rebuild,” a generic guarded deploy-hook adapter may produce more value sooner, provided the UI honestly reports only trigger delivery when no status contract exists.

## What Would Change My Mind

I would change the ordering if the falsifying GitHub spike cannot prove narrow repository permissions, deterministic run correlation, and restart-safe reconciliation.

I would move deploy hooks to rank one if customer evidence shows that audited provider status, Tovu-visible rollback, and environment promotion are secondary to one-click CI triggering.

I would adopt a pull runner when providers require local tools or customer networks prohibit direct outbound control-plane access.

I would reconsider MCP as a primary adapter only after it gains a hosted transport forced through Tovu’s guarded egress path, audited write authorization, idempotency keys, durable operation IDs, status retrieval, and cancellation. Merely adding HTTP MCP would not supply those semantics; the present trust layer explicitly says admitted external tools still execute vendor code and are not thereby made safe (files/tovu/mcp-federation/trust.ts:98-103).

Finally, once Tovu gains a verified deterministic build/export command, the release producer can expand. Until then, both code and UI must continue to say: **external orchestration of a pre-existing artifact only**.

<<SWARM_END>>