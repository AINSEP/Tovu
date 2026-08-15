I’ll read the packet and inspect the in-scope implementation files first, then verify the decisive deployment claims against primary online sources before producing the exact requested format.
The packet confirms the central Round 2 failure: multiple adapters invented `allowedHosts`/`followRedirects` and called nonexistent `.request()`/`.fetch()` methods. I’m now matching the replacement to the real port types, then I’ll verify the GitHub flow and webhook semantics in GitHub’s current official documentation.
ACK_PACKET_RECEIVED CTX-DEPLOY-R3-2026-08-12 -- I received the packet and will work on it.

## Position And Movement

The Round 2 direction survives, but its implementation does not. The final design is:

- A workspace-scoped deployment domain with durable releases, environments, targets, runs, and events.
- GitHub App installation authentication over the shared guarded HTTP client.
- Explicit origin pinning inside the GitHub adapter, because `EgressPolicy` cannot restrict hosts.
- Webhooks authenticated over the unparsed body, with `(providerId, providerRunRef)` resolving the run and workspace transactionally.
- Polling retained as recovery, because GitHub does not emit `deployment_status` webhooks for `inactive`.
- An honest first slice that promotes an existing immutable commit; it does not build or export one.

This is grounded in the real code:

- The shared HTTP types are imported and re-exported at `files/tovu/integrations-ports.ts:27-40`.
- Secret opening takes only `{ sealed }`, while repository lookup is workspace-scoped (`files/tovu/integrations-ports.ts:89-97,157-162`).
- MCP remains stdio-only (`files/tovu/mcp-federation/ports.ts:139-148`) and spawns a process (`files/tovu/mcp-federation/adapter.stdio.ts:307-312`).
- The CLI exposes only `init`, `serve`, and `introspect`, with no build/export command (`files/tovu/cli/program.ts:35-60`).
- Admin routes already establish the workspace-check-then-authorize convention (`files/tovu/external-mcp/guard.ts:32-58`).
- `module-status` is a readiness snapshot, not an execution store (`files/tovu/module-status.ts:42-49`).

## Sources

- [GitHub App JWT documentation](https://docs.github.com/en/enterprise-cloud@latest/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app) confirms RS256, an `iat` clock-skew allowance, and a maximum ten-minute JWT lifetime.
- [Create an installation access token](https://docs.github.com/en/rest/apps/apps?apiVersion=2022-11-28#create-an-installation-access-token-for-an-app) confirms that installation tokens expire after one hour and can be narrowed with `repository_ids` and a `permissions` object. The code below requests one repository and only `deployments: write`.
- [GitHub Deployments REST API](https://docs.github.com/en/rest/deployments/deployments?apiVersion=2022-11-28) confirms that creating a deployment accepts a branch, tag, or SHA and requires `Deployments: write`. It also explicitly says GitHub does not access or deploy to the target servers. This contradicts Round 2 code that treated successful creation as evidence that deployment work was already running.
- [Deployment-status API](https://docs.github.com/en/rest/deployments/statuses) confirms the states `error`, `failure`, `inactive`, `in_progress`, `queued`, `pending`, and `success`, and that status history older than 90 days can be deleted.
- [The `deployment_status` webhook contract](https://docs.github.com/en/webhooks/webhook-events-and-payloads#deployment_status) confirms that the payload contains both `deployment` and `deployment_status`, requires at least read-level Deployments permission, and—critically—does not emit an event for `inactive`. This contradicts Sonnet5 Round 2’s callback-only provider mode.
- [GitHub webhook verification guidance](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries) confirms HMAC-SHA256 over the original payload, the `sha256=` header format, and constant-time comparison.
- [SQLite JSON documentation](https://www.sqlite.org/json1.html#jsonb) confirms that ordinary JSON is stored as text and SQLite JSONB is an internal binary representation applications should treat as opaque. The schema below therefore persists canonical JSON in `TEXT`, never JSONB.

## Solution Slate

Ranking criteria, in order:

1. Workspace isolation and credential blast radius.
2. Restart-safe, callback-and-poll reconciliation.
3. Correct guarded-egress behavior, including origin pinning.
4. Honesty about the missing build/export capability.
5. Cost of supporting additional providers.

1. **Provider-neutral deployment domain with direct guarded HTTP adapters — recommended.**

   This gives durable execution state, narrowly scoped GitHub installation tokens, authenticated callbacks, polling recovery, and a stable second-provider seam. Its genuine sacrifice is maintenance: every first-party provider needs an adapter, conformance tests, and status mapping. GitHub App registration also costs more operator effort than pasting a hook URL.

2. **Guarded deploy-hook adapter within the same domain.**

   This is substantially cheaper and useful for providers whose hook returns a durable operation reference. It still uses `HttpClientPort.send` and the same run tables. Its sacrifice is fidelity: many hooks prove only that a request was accepted, offer no narrowly scoped credential, and cannot support provider-correlated callbacks or reliable rollback status.

3. **Sandboxed pull runner.**

   A separate runner can execute vendor CLIs without giving them the Tovu server’s filesystem and process authority. This covers providers without suitable HTTP APIs. Its sacrifice is Tovu’s single-process deployment story: operators must provision, authenticate, upgrade, and monitor another service.

MCP-only execution remains rejected by the settled inputs; absorbing Agent Plugins into `.tovu-plugin` is also closed and is not an option.

The cheapest falsifying test for option 1 is one scratch repository:

- Install a GitHub App on only that repository with Deployments permission.
- Mint a token restricted again to that repository ID and `deployments: write`.
- Create a deployment for an existing commit SHA.
- Emit signed queued, in-progress, and success statuses from an external listener.
- Drop one webhook and restart Tovu; polling must still finish the same durable run.
- Verify a redirect and a workspace-configured hostile hostname cannot escape `https://api.github.com`.
- Verify the installation token cannot read or deploy a second repository.

Failure of repository restriction, restart-safe correlation, signature verification, or origin pinning falsifies the recommendation.

## Leading Option — Code

**Domain model and portable SQLite schema**

```ts
// deployments/domain.ts
import type { ISODateTime, UUID } from "@jini-ai/cms/core";
import type { IntegrationId } from "../integrations/types";

export type DeploymentProviderId = UUID;
export type DeploymentRunState =
  | "queued"
  | "submitting"
  | "submitted"
  | "running"
  | "succeeded"
  | "failed"
  | "inactive"
  | "canceled";

export interface ReleaseRecord {
  readonly workspaceId: UUID;
  readonly id: UUID;
  readonly label: string;
  readonly artifact: {
    readonly kind: "github-commit";
    readonly repositoryId: number;
    readonly commitSha: string;
  };
  readonly createdByPrincipalId: UUID;
  readonly createdAtIso: ISODateTime;
  readonly version: number;
}

export interface DeploymentEnvironmentRecord {
  readonly workspaceId: UUID;
  readonly id: UUID;
  readonly name: string;
  readonly currentReleaseId: UUID | null;
  readonly createdAtIso: ISODateTime;
  readonly updatedAtIso: ISODateTime;
  readonly version: number;
}

export interface GitHubProviderRecord {
  readonly workspaceId: UUID;
  readonly id: DeploymentProviderId;
  readonly kind: "github-app";
  readonly clientId: string;
  readonly installationId: string;
  readonly credentialSecretId: IntegrationId;
  readonly webhookSecretId: IntegrationId;
  readonly enabled: boolean;
  readonly createdAtIso: ISODateTime;
  readonly updatedAtIso: ISODateTime;
  readonly version: number;
}

export interface GitHubDeploymentTargetRecord {
  readonly workspaceId: UUID;
  readonly id: UUID;
  readonly providerId: DeploymentProviderId;
  readonly environmentId: UUID;
  readonly kind: "github-deployment";
  readonly name: string;
  readonly config: {
    readonly repositoryId: number;
    readonly owner: string;
    readonly repository: string;
    readonly githubEnvironment: string;
  };
  readonly enabled: boolean;
  readonly createdAtIso: ISODateTime;
  readonly updatedAtIso: ISODateTime;
  readonly version: number;
}

export interface DeploymentRunRecord {
  readonly workspaceId: UUID;
  readonly id: UUID;
  readonly providerId: DeploymentProviderId;
  readonly targetId: UUID;
  readonly environmentId: UUID;
  readonly releaseId: UUID;
  readonly requestedByPrincipalId: UUID;
  readonly idempotencyKey: string;
  readonly expectedEnvironmentVersion: number;
  readonly state: DeploymentRunState;
  // GitHub value is `${repositoryId}:${deploymentId}`.
  readonly providerRunRef: string | null;
  readonly providerState: string | null;
  readonly providerStatusId: string | null;
  readonly providerStatusAtIso: ISODateTime | null;
  readonly errorCode: string | null;
  readonly errorSummary: string | null;
  readonly nextPollAtIso: ISODateTime | null;
  readonly requestedAtIso: ISODateTime;
  readonly startedAtIso: ISODateTime | null;
  readonly finishedAtIso: ISODateTime | null;
  readonly updatedAtIso: ISODateTime;
  readonly version: number;
}

export const DEPLOYMENT_SCHEMA_SQL = `
CREATE TABLE deployment_releases (
  workspace_id TEXT NOT NULL,
  id TEXT NOT NULL,
  label TEXT NOT NULL,
  artifact_kind TEXT NOT NULL CHECK (artifact_kind = 'github-commit'),
  artifact_repository_id INTEGER NOT NULL,
  artifact_commit_sha TEXT NOT NULL
    CHECK (length(artifact_commit_sha) = 40),
  created_by_principal_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, artifact_repository_id, artifact_commit_sha)
) STRICT;

CREATE TABLE deployment_environments (
  workspace_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  current_release_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, name),
  FOREIGN KEY (workspace_id, current_release_id)
    REFERENCES deployment_releases(workspace_id, id)
) STRICT;

CREATE TABLE deployment_providers (
  workspace_id TEXT NOT NULL,
  id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind = 'github-app'),
  config_json TEXT NOT NULL CHECK (json_valid(config_json)),
  credential_secret_id TEXT NOT NULL,
  webhook_secret_id TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  PRIMARY KEY (workspace_id, id),
  UNIQUE (id)
) STRICT;

CREATE TABLE deployment_targets (
  workspace_id TEXT NOT NULL,
  id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  environment_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind = 'github-deployment'),
  name TEXT NOT NULL,
  config_json TEXT NOT NULL CHECK (json_valid(config_json)),
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, id, provider_id, environment_id),
  UNIQUE (workspace_id, environment_id, name),
  FOREIGN KEY (workspace_id, provider_id)
    REFERENCES deployment_providers(workspace_id, id),
  FOREIGN KEY (workspace_id, environment_id)
    REFERENCES deployment_environments(workspace_id, id)
) STRICT;

CREATE TABLE deployment_runs (
  workspace_id TEXT NOT NULL,
  id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  environment_id TEXT NOT NULL,
  release_id TEXT NOT NULL,
  requested_by_principal_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  expected_environment_version INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (
    state IN (
      'queued','submitting','submitted','running',
      'succeeded','failed','inactive','canceled'
    )
  ),
  provider_run_ref TEXT,
  provider_state TEXT,
  provider_status_id TEXT,
  provider_status_at TEXT,
  error_code TEXT,
  error_summary TEXT,
  next_poll_at TEXT,
  requested_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, target_id, idempotency_key),
  UNIQUE (provider_id, provider_run_ref),
  FOREIGN KEY (workspace_id, release_id)
    REFERENCES deployment_releases(workspace_id, id),
  FOREIGN KEY (workspace_id, target_id, provider_id, environment_id)
    REFERENCES deployment_targets(
      workspace_id, id, provider_id, environment_id
    )
) STRICT;

CREATE TABLE deployment_run_events (
  workspace_id TEXT NOT NULL,
  id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('info','warning','error')),
  event_code TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, run_id, sequence),
  FOREIGN KEY (workspace_id, run_id)
    REFERENCES deployment_runs(workspace_id, id)
) STRICT;

CREATE TABLE deployment_provider_deliveries (
  provider_id TEXT NOT NULL,
  delivery_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  received_at TEXT NOT NULL,
  PRIMARY KEY (provider_id, delivery_id),
  FOREIGN KEY (workspace_id, run_id)
    REFERENCES deployment_runs(workspace_id, id)
) STRICT;

CREATE INDEX deployment_runs_due_idx
  ON deployment_runs(state, next_poll_at);

CREATE INDEX deployment_runs_provider_ref_idx
  ON deployment_runs(provider_id, provider_run_ref);
`;
```

All JSON remains canonical text. `credential_secret_id` and `webhook_secret_id` are references only; plaintext remains behind `IntegrationSecretRepoPort` and `SecretSealerPort`.

**Provider-neutral port and corrected GitHub adapter**

```ts
// deployments/runtime.ts
import { createSign } from "node:crypto";
import type {
  EgressPolicy,
  HttpClientPort,
  HttpRequest,
  HttpResponse,
} from "../integrations-ports";
import type {
  DeploymentEnvironmentRecord,
  DeploymentProviderId,
  DeploymentRunState,
  GitHubDeploymentTargetRecord,
  GitHubProviderRecord,
  ReleaseRecord,
} from "./domain";
import type { UUID } from "@jini-ai/cms/core";

export interface DeploymentRuntimePort {
  readonly kind: string;

  submit(input: {
    workspaceId: UUID;
    runId: UUID;
    provider: GitHubProviderRecord;
    target: GitHubDeploymentTargetRecord;
    environment: DeploymentEnvironmentRecord;
    release: ReleaseRecord;
  }): Promise<{
    providerRunRef: string;
    providerState: string;
    state: Extract<DeploymentRunState, "submitted" | "running">;
  }>;

  inspect(input: {
    workspaceId: UUID;
    provider: GitHubProviderRecord;
    target: GitHubDeploymentTargetRecord;
    providerRunRef: string;
  }): Promise<{
    providerState: string;
    providerStatusId: string | null;
    providerStatusAtIso: string | null;
    state: Exclude<DeploymentRunState, "queued" | "submitting" | "canceled">;
    summary?: string;
  }>;
}

export interface GitHubPrivateCredential {
  readonly privateKeyPem: string;
}

export interface GitHubCredentialPort {
  open(input: {
    workspaceId: UUID;
    secretId: string;
  }): Promise<GitHubPrivateCredential>;
}

const GITHUB_ORIGIN = "https://api.github.com";
const API_VERSION = "2026-03-10";

export const GITHUB_EGRESS_POLICY: EgressPolicy = {
  allowedSchemes: ["https"],
  denyPrivateAddresses: true,
  // This is only an exemption list for private-address checks. It does not pin hosts.
  devHostAllowlist: [],
  // A redirect cannot move the bearer token to another origin.
  maxRedirects: 0,
  connectTimeoutMs: 5_000,
  maxResponseBytes: 2 * 1024 * 1024,
  maxDecompressedBytes: 4 * 1024 * 1024,
};

export class GitHubProviderError extends Error {
  constructor(readonly code: string, message = code) {
    super(message);
  }
}

export class GitHubDeploymentAdapter implements DeploymentRuntimePort {
  readonly kind = "github-app";

  constructor(
    private readonly http: HttpClientPort,
    private readonly credentials: GitHubCredentialPort,
    private readonly nowMs: () => number = Date.now,
  ) {}

  async submit(input: {
    workspaceId: UUID;
    runId: UUID;
    provider: GitHubProviderRecord;
    target: GitHubDeploymentTargetRecord;
    environment: DeploymentEnvironmentRecord;
    release: ReleaseRecord;
  }) {
    assertCompatibleInput(input);

    const token = await this.installationToken(input);
    const existing = await this.findExistingDeployment({
      token,
      providerId: input.provider.id,
      runId: input.runId,
      target: input.target,
      commitSha: input.release.artifact.commitSha,
    });

    if (existing !== null) {
      return {
        providerRunRef: providerRunRef(
          input.target.config.repositoryId,
          existing,
        ),
        providerState: "queued",
        state: "submitted" as const,
      };
    }

    const deployment = await this.sendJson<{ id: number }>({
      method: "POST",
      path:
        `/repos/${segment(input.target.config.owner)}/` +
        `${segment(input.target.config.repository)}/deployments`,
      bearer: token,
      expectedStatus: 201,
      body: {
        ref: input.release.artifact.commitSha,
        task: "deploy",
        environment: input.target.config.githubEnvironment,
        description: `Tovu deployment run ${input.runId}`,
        auto_merge: false,
        required_contexts: [],
        transient_environment: false,
        production_environment:
          input.target.config.githubEnvironment === "production",
        payload: {
          tovu_provider_id: input.provider.id,
          tovu_run_id: input.runId,
        },
      },
    });

    if (!Number.isSafeInteger(deployment.id) || deployment.id <= 0) {
      throw new GitHubProviderError(
        "GITHUB_DEPLOYMENT_RESPONSE_INVALID",
        "GitHub returned an invalid deployment id",
      );
    }

    // Creating this object signals an external listener. It does not prove a
    // build or deployment has started, so Tovu does not create an in_progress
    // status on the external system's behalf.
    return {
      providerRunRef: providerRunRef(
        input.target.config.repositoryId,
        deployment.id,
      ),
      providerState: "queued",
      state: "submitted" as const,
    };
  }

  async inspect(input: {
    workspaceId: UUID;
    provider: GitHubProviderRecord;
    target: GitHubDeploymentTargetRecord;
    providerRunRef: string;
  }) {
    const deploymentId = deploymentIdFromRef(
      input.providerRunRef,
      input.target.config.repositoryId,
    );
    const token = await this.installationToken(input);
    const statuses: GitHubDeploymentStatus[] = [];

    // Do not rely on the undocumented "statuses[0] is newest" assumption.
    for (let page = 1; page <= 100; page += 1) {
      const batch = await this.sendJson<GitHubDeploymentStatus[]>({
        method: "GET",
        path:
          `/repos/${segment(input.target.config.owner)}/` +
          `${segment(input.target.config.repository)}/deployments/` +
          `${segment(deploymentId)}/statuses?per_page=100&page=${page}`,
        bearer: token,
        expectedStatus: 200,
      });
      statuses.push(...batch);
      if (batch.length < 100) break;
      if (page === 100) {
        throw new GitHubProviderError(
          "GITHUB_STATUS_HISTORY_TOO_LARGE",
          "GitHub returned more than 10,000 statuses for one deployment",
        );
      }
    }

    const latest = statuses.reduce<GitHubDeploymentStatus | null>(
      (best, candidate) => {
        if (best === null) return candidate;
        const timeOrder = candidate.created_at.localeCompare(best.created_at);
        return timeOrder > 0 || (timeOrder === 0 && candidate.id > best.id)
          ? candidate
          : best;
      },
      null,
    );

    return mapGitHubStatus(latest);
  }

  private async installationToken(input: {
    workspaceId: UUID;
    provider: GitHubProviderRecord;
    target: GitHubDeploymentTargetRecord;
  }): Promise<string> {
    const credential = await this.credentials.open({
      workspaceId: input.workspaceId,
      secretId: input.provider.credentialSecretId,
    });
    const now = Math.floor(this.nowMs() / 1000);
    const jwt = signGitHubAppJwt({
      clientId: input.provider.clientId,
      privateKeyPem: credential.privateKeyPem,
      issuedAt: now - 60,
      expiresAt: now + 9 * 60,
    });

    const response = await this.sendJson<{
      token: string;
      expires_at: string;
    }>({
      method: "POST",
      path:
        `/app/installations/` +
        `${segment(input.provider.installationId)}/access_tokens`,
      bearer: jwt,
      expectedStatus: 201,
      body: {
        repository_ids: [input.target.config.repositoryId],
        permissions: { deployments: "write" },
      },
    });

    // Token formats are opaque; do not assume a fixed prefix or length.
    if (typeof response.token !== "string" || response.token.length === 0) {
      throw new GitHubProviderError(
        "GITHUB_INSTALLATION_TOKEN_INVALID",
        "GitHub returned an empty installation token",
      );
    }
    return response.token;
  }

  private async findExistingDeployment(input: {
    token: string;
    providerId: DeploymentProviderId;
    runId: UUID;
    target: GitHubDeploymentTargetRecord;
    commitSha: string;
  }): Promise<number | null> {
    const query = new URLSearchParams({
      sha: input.commitSha,
      environment: input.target.config.githubEnvironment,
      per_page: "100",
    });

    const deployments = await this.sendJson<
      Array<{ id: number; payload?: unknown }>
    >({
      method: "GET",
      path:
        `/repos/${segment(input.target.config.owner)}/` +
        `${segment(input.target.config.repository)}/deployments?${query}`,
      bearer: input.token,
      expectedStatus: 200,
    });

    for (const deployment of deployments) {
      const payload = asRecord(deployment.payload);
      if (
        payload?.tovu_provider_id === input.providerId &&
        payload.tovu_run_id === input.runId &&
        Number.isSafeInteger(deployment.id)
      ) {
        return deployment.id;
      }
    }
    return null;
  }

  private async sendJson<T>(input: {
    method: "GET" | "POST";
    path: string;
    bearer: string;
    expectedStatus: number;
    body?: unknown;
  }): Promise<T> {
    const url = githubApiUrl(input.path); // Adapter-owned origin assertion.

    const request = {
      method: input.method,
      url,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${input.bearer}`,
        "content-type": "application/json",
        "user-agent": "Tovu-CMS",
        "x-github-api-version": API_VERSION,
      },
      ...(input.body === undefined
        ? {}
        : { body: JSON.stringify(input.body) }),
      policy: GITHUB_EGRESS_POLICY,
    } satisfies HttpRequest;

    // Real contract: one request argument, through .send().
    const response: HttpResponse = await this.http.send(request);
    if (response.status !== input.expectedStatus) {
      throw new GitHubProviderError(
        "GITHUB_HTTP_ERROR",
        `GitHub returned HTTP ${response.status}`,
      );
    }

    try {
      const text =
        typeof response.body === "string"
          ? response.body
          : new TextDecoder().decode(response.body);
      return JSON.parse(text) as T;
    } catch {
      throw new GitHubProviderError(
        "GITHUB_RESPONSE_INVALID_JSON",
        "GitHub returned invalid JSON",
      );
    }
  }
}

function githubApiUrl(path: string): string {
  if (!path.startsWith("/")) {
    throw new GitHubProviderError("GITHUB_PATH_INVALID");
  }
  const url = new URL(path, GITHUB_ORIGIN);
  if (
    url.origin !== GITHUB_ORIGIN ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw new GitHubProviderError(
      "GITHUB_ORIGIN_REJECTED",
      `GitHub adapter refused origin '${url.origin}'`,
    );
  }
  return url.toString();
}

function segment(value: string | number): string {
  return encodeURIComponent(String(value));
}

function providerRunRef(repositoryId: number, deploymentId: number): string {
  return `${repositoryId}:${deploymentId}`;
}

function deploymentIdFromRef(ref: string, expectedRepositoryId: number): string {
  const match = /^([1-9][0-9]*):([1-9][0-9]*)$/.exec(ref);
  if (!match || Number(match[1]) !== expectedRepositoryId) {
    throw new GitHubProviderError("GITHUB_PROVIDER_RUN_REF_INVALID");
  }
  return match[2];
}

function assertCompatibleInput(input: {
  provider: GitHubProviderRecord;
  target: GitHubDeploymentTargetRecord;
  environment: DeploymentEnvironmentRecord;
  release: ReleaseRecord;
}): void {
  if (
    !input.provider.enabled ||
    !input.target.enabled ||
    input.target.providerId !== input.provider.id ||
    input.target.environmentId !== input.environment.id ||
    input.release.artifact.kind !== "github-commit" ||
    input.release.artifact.repositoryId !== input.target.config.repositoryId ||
    !/^[0-9a-f]{40}$/i.test(input.release.artifact.commitSha)
  ) {
    throw new GitHubProviderError("GITHUB_DEPLOYMENT_INPUT_INVALID");
  }
}

function signGitHubAppJwt(input: {
  clientId: string;
  privateKeyPem: string;
  issuedAt: number;
  expiresAt: number;
}): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iat: input.issuedAt,
      exp: input.expiresAt,
      iss: input.clientId,
    }),
  ).toString("base64url");
  const unsigned = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256")
    .update(unsigned)
    .sign(input.privateKeyPem)
    .toString("base64url");
  return `${unsigned}.${signature}`;
}

interface GitHubDeploymentStatus {
  readonly id: number;
  readonly state: string;
  readonly description?: string | null;
  readonly created_at: string;
}

function mapGitHubStatus(status: GitHubDeploymentStatus | null) {
  if (status === null) {
    return {
      providerState: "queued",
      providerStatusId: null,
      providerStatusAtIso: null,
      state: "submitted" as const,
    };
  }

  const common = {
    providerState: status.state,
    providerStatusId: String(status.id),
    providerStatusAtIso: status.created_at,
    summary: sanitize(status.description),
  };

  switch (status.state) {
    case "success":
      return { ...common, state: "succeeded" as const };
    case "failure":
    case "error":
      return { ...common, state: "failed" as const };
    case "inactive":
      return { ...common, state: "inactive" as const };
    case "in_progress":
      return { ...common, state: "running" as const };
    case "queued":
    case "pending":
    default:
      return { ...common, state: "submitted" as const };
  }
}

function sanitize(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.replace(/[\r\n\0]/g, " ").slice(0, 500);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
```

`githubApiUrl()` is the host-pinning boundary. Every path begins from an adapter-owned origin, every user-controlled path component is encoded, the final origin is asserted, redirects are disabled, and the shared policy still enforces HTTPS, address classification, timeouts, and byte ceilings.

**Signed callback and transactionally derived workspace**

```ts
// deployments/github-webhook.ts
import express, { type Express } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { DeploymentProviderId } from "./domain";

export interface GitHubWebhookSecretPort {
  // The opaque provider id selects a sealed webhook secret, not a workspace
  // supplied by the callback.
  openByProviderId(providerId: DeploymentProviderId): Promise<string | null>;
}

export interface DeploymentProviderEventRepoPort {
  /**
   * One SQLite transaction:
   * 1. SELECT workspace_id,id FROM deployment_runs
   *      WHERE provider_id=? AND provider_run_ref=?;
   * 2. INSERT deployment_provider_deliveries for deduplication;
   * 3. apply only a newer valid state transition;
   * 4. append a sanitized event;
   * 5. on success, version-update deployment_environments.
   *
   * There is deliberately no workspaceId input.
   */
  applyVerifiedStatus(input: {
    providerId: DeploymentProviderId;
    providerRunRef: string;
    deliveryId: string;
    providerStatusId: string;
    providerStatusAtIso: string;
    providerState: string;
    state:
      | "submitted"
      | "running"
      | "succeeded"
      | "failed"
      | "inactive";
    summary: string | null;
  }): Promise<"applied" | "duplicate" | "stale" | "not-found">;
}

interface WebhookDeps {
  readonly secrets: GitHubWebhookSecretPort;
  readonly events: DeploymentProviderEventRepoPort;
}

export function registerGitHubDeploymentWebhookRoute(
  app: Express,
  deps: WebhookDeps,
): void {
  // Register before any global JSON parser; verification needs the exact bytes.
  app.post(
    "/api/webhooks/deployments/github/:providerId",
    express.raw({ type: "application/json", limit: "256kb" }),
    async (req, res) => {
      const providerId = String(req.params.providerId ?? "");
      const rawBody = req.body;
      const signature = String(req.header("x-hub-signature-256") ?? "");
      const deliveryId = String(req.header("x-github-delivery") ?? "");

      if (!Buffer.isBuffer(rawBody) || providerId === "" || deliveryId === "") {
        res.status(400).json({ error: "invalid webhook request" });
        return;
      }

      const secret = await deps.secrets.openByProviderId(providerId);
      if (
        secret === null ||
        !verifyGitHubSignature(rawBody, signature, secret)
      ) {
        res.status(401).json({ error: "invalid webhook signature" });
        return;
      }

      if (req.header("x-github-event") !== "deployment_status") {
        res.status(202).json({ ignored: true });
        return;
      }

      let payload: unknown;
      try {
        payload = JSON.parse(rawBody.toString("utf8"));
      } catch {
        res.status(400).json({ error: "invalid JSON" });
        return;
      }

      const event = parseDeploymentStatusEvent(payload);
      if (event === null) {
        res.status(400).json({ error: "invalid deployment_status payload" });
        return;
      }

      const result = await deps.events.applyVerifiedStatus({
        providerId,
        providerRunRef: `${event.repositoryId}:${event.deploymentId}`,
        deliveryId,
        providerStatusId: String(event.statusId),
        providerStatusAtIso: event.createdAtIso,
        providerState: event.providerState,
        state: event.state,
        summary: event.summary,
      });

      res.status(202).json({
        accepted: result !== "not-found",
        duplicate: result === "duplicate",
      });
    },
  );
}

export function verifyGitHubSignature(
  rawBody: Buffer,
  supplied: string,
  secret: string,
): boolean {
  const match = /^sha256=([0-9a-f]{64})$/i.exec(supplied);
  if (!match) return false;

  const actual = Buffer.from(match[1], "hex");
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function parseDeploymentStatusEvent(value: unknown): {
  repositoryId: number;
  deploymentId: number;
  statusId: number;
  createdAtIso: string;
  providerState: string;
  state: "submitted" | "running" | "succeeded" | "failed" | "inactive";
  summary: string | null;
} | null {
  const root = record(value);
  const deployment = record(root?.deployment);
  const status = record(root?.deployment_status);
  const repository = record(root?.repository);

  if (
    root?.action !== "created" ||
    !isPositiveInteger(repository?.id) ||
    !isPositiveInteger(deployment?.id) ||
    !isPositiveInteger(status?.id) ||
    typeof status?.state !== "string" ||
    typeof status.created_at !== "string"
  ) {
    return null;
  }

  const mapped = mapWebhookState(status.state);
  if (mapped === null) return null;

  return {
    repositoryId: repository.id,
    deploymentId: deployment.id,
    statusId: status.id,
    createdAtIso: status.created_at,
    providerState: status.state,
    state: mapped,
    summary:
      typeof status.description === "string"
        ? status.description.replace(/[\r\n\0]/g, " ").slice(0, 500)
        : null,
  };
}

function mapWebhookState(
  state: string,
): "submitted" | "running" | "succeeded" | "failed" | "inactive" | null {
  switch (state) {
    case "queued":
    case "pending":
      return "submitted";
    case "in_progress":
      return "running";
    case "success":
      return "succeeded";
    case "failure":
    case "error":
      return "failed";
    case "inactive":
      return "inactive";
    default:
      return null;
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}
```

The callback never accepts a workspace in its URL, headers, query, body, or repository command. The repository derives it from the unique provider pair and performs deduplication and the versioned update in one transaction.

**Worker and admin call sites**

```ts
// deployments/call-sites.ts
import type { Express } from "express";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { UUID } from "@jini-ai/cms/core";
import type { DeploymentRunRecord } from "./domain";
import type { DeploymentRuntimePort } from "./runtime";

export interface DeploymentRunRepoPort {
  markSubmitted(input: {
    workspaceId: UUID;
    runId: UUID;
    expectedVersion: number;
    providerRunRef: string;
    providerState: string;
    nextPollAtIso: string;
  }): Promise<void>;

  applyPolledStatus(input: {
    workspaceId: UUID;
    runId: UUID;
    expectedVersion: number;
    observation: Awaited<ReturnType<DeploymentRuntimePort["inspect"]>>;
    nextPollAtIso: string | null;
  }): Promise<void>;
}

export async function reconcileDeploymentRun(
  run: DeploymentRunRecord,
  deps: {
    runtime: DeploymentRuntimePort;
    runs: DeploymentRunRepoPort;
    loadInputs(run: DeploymentRunRecord): Promise<{
      provider: Parameters<DeploymentRuntimePort["submit"]>[0]["provider"];
      target: Parameters<DeploymentRuntimePort["submit"]>[0]["target"];
      environment: Parameters<DeploymentRuntimePort["submit"]>[0]["environment"];
      release: Parameters<DeploymentRuntimePort["submit"]>[0]["release"];
    }>;
    nowPlusSeconds(seconds: number): string;
  },
): Promise<void> {
  const input = await deps.loadInputs(run);

  if (run.providerRunRef === null) {
    const submitted = await deps.runtime.submit({
      workspaceId: run.workspaceId,
      runId: run.id,
      ...input,
    });
    await deps.runs.markSubmitted({
      workspaceId: run.workspaceId,
      runId: run.id,
      expectedVersion: run.version,
      providerRunRef: submitted.providerRunRef,
      providerState: submitted.providerState,
      nextPollAtIso: deps.nowPlusSeconds(15),
    });
    return;
  }

  const observed = await deps.runtime.inspect({
    workspaceId: run.workspaceId,
    provider: input.provider,
    target: input.target,
    providerRunRef: run.providerRunRef,
  });

  const terminal = ["succeeded", "failed", "inactive"].includes(observed.state);
  await deps.runs.applyPolledStatus({
    workspaceId: run.workspaceId,
    runId: run.id,
    expectedVersion: run.version,
    observation: observed,
    nextPollAtIso: terminal ? null : deps.nowPlusSeconds(30),
  });
}

export interface DeploymentAdminService {
  list(workspaceId: UUID): Promise<{
    targets: Array<{
      id: UUID;
      name: string;
      providerKind: string;
      environmentId: UUID;
      credentialConfigured: boolean;
      enabled: boolean;
    }>;
    runs: DeploymentRunRecord[];
  }>;

  createRun(input: {
    workspaceId: UUID;
    targetId: UUID;
    releaseId: UUID;
    requestedByPrincipalId: UUID;
    idempotencyKey: string;
  }): Promise<DeploymentRunRecord>;
}

export function registerAdminDeploymentRoutes(
  app: Express,
  deps: {
    workspaceId: UUID;
    deployments: DeploymentAdminService;
    authorize(input: {
      principalId: UUID;
      permission: string;
      workspaceId: UUID;
      entityType: string;
    }): Promise<{ allowed: boolean; reason: string }>;
  },
): void {
  const guard = async (
    requestedWorkspaceId: unknown,
    res: Parameters<Parameters<Express["get"]>[1]>[1],
  ) => {
    if (String(requestedWorkspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return null;
    }
    const principal = getAuthedPrincipal(res);
    const auth = await deps.authorize({
      principalId: principal.id,
      permission: "admin.integrations.manage",
      workspaceId: deps.workspaceId,
      entityType: "deployment",
    });
    if (!auth.allowed) {
      res.status(403).json({ error: "forbidden", code: "FORBIDDEN" });
      return null;
    }
    return principal;
  };

  app.get(
    "/api/admin/v1/workspaces/:workspaceId/deployments",
    async (req, res) => {
      if (!(await guard(req.params.workspaceId, res))) return;
      res.json(await deps.deployments.list(deps.workspaceId));
    },
  );

  app.post(
    "/api/admin/v1/workspaces/:workspaceId/deployments/targets/:targetId/runs",
    async (req, res) => {
      const principal = await guard(req.params.workspaceId, res);
      if (!principal) return;

      const body = (req.body ?? {}) as Record<string, unknown>;
      if (
        typeof body.releaseId !== "string" ||
        typeof req.params.targetId !== "string"
      ) {
        res.status(400).json({ error: "releaseId is required" });
        return;
      }

      // The browser supplies identifiers, never provider records, secrets,
      // workspace ownership, or a mutable branch name.
      const run = await deps.deployments.createRun({
        workspaceId: deps.workspaceId,
        targetId: req.params.targetId,
        releaseId: body.releaseId,
        requestedByPrincipalId: principal.id,
        idempotencyKey:
          String(req.header("idempotency-key") ?? "") || crypto.randomUUID(),
      });
      res.status(202).json({ run });
    },
  );
}
```

**Admin honesty banner**

```tsx
// deployments/DeploymentsPage.tsx
export const DEPLOYMENT_HONESTY_COPY =
  "Tovu does not build or export your site yet. Deployments trigger and " +
  "track an external system using a commit that already exists.";

export function DeploymentsPage(props: {
  targets: Array<{ id: string; name: string; enabled: boolean }>;
  runs: Array<{
    id: string;
    releaseLabel: string;
    environmentName: string;
    state: string;
    requestedAtIso: string;
  }>;
  openTargetConfiguration(): void;
}) {
  return (
    <main>
      <aside role="note" className="callout callout--info">
        <strong>External deployment orchestration</strong>
        <p>{DEPLOYMENT_HONESTY_COPY}</p>
      </aside>

      {props.targets.length === 0 ? (
        <section aria-labelledby="no-deployment-target">
          <h2 id="no-deployment-target">No deployment target configured</h2>
          <p>
            Configure a provider before attempting a deployment. Nothing is
            built, uploaded, or published by Tovu itself.
          </p>
          <button type="button" onClick={props.openTargetConfiguration}>
            Configure target
          </button>
        </section>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Environment</th>
              <th>Release</th>
              <th>Status</th>
              <th>Requested</th>
            </tr>
          </thead>
          <tbody>
            {props.runs.map((run) => (
              <tr key={run.id}>
                <td>{run.environmentName}</td>
                <td>{run.releaseLabel}</td>
                <td>{run.state}</td>
                <td>{run.requestedAtIso}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
```

**Contract tests for the corrected defects**

```ts
// deployments/runtime.test.ts
import { describe, expect, it, vi } from "vitest";
import type { HttpClientPort, HttpRequest } from "../integrations-ports";
import {
  GITHUB_EGRESS_POLICY,
  GitHubDeploymentAdapter,
  verifyGitHubSignature,
} from "./runtime";

describe("GitHubDeploymentAdapter", () => {
  it("uses send(), narrows the token, and pins every request origin", async () => {
    const requests: HttpRequest[] = [];
    const responses = [
      { status: 201, headers: {}, body: JSON.stringify({
        token: "opaque-token-with-no-length-assumption",
        expires_at: "2026-08-12T20:00:00Z",
      }) },
      { status: 200, headers: {}, body: "[]" },
      { status: 201, headers: {}, body: '{"id":91}' },
    ];

    const http: HttpClientPort = {
      send: vi.fn(async (request: HttpRequest) => {
        requests.push(request);
        return responses.shift()!;
      }),
    };

    const adapter = new GitHubDeploymentAdapter(
      http,
      {
        open: vi.fn(async () => ({
          // Test key omitted here by replacing signing in an integration fixture.
          privateKeyPem: TEST_RSA_PRIVATE_KEY,
        })),
      },
      () => Date.parse("2026-08-12T19:00:00Z"),
    );

    const result = await adapter.submit(fixtureInput());

    expect(result.providerRunRef).toBe("7001:91");
    expect(http.send).toHaveBeenCalledTimes(3);
    expect(requests.every((r) => new URL(r.url).origin ===
      "https://api.github.com")).toBe(true);
    expect(requests.every((r) => r.policy === GITHUB_EGRESS_POLICY)).toBe(true);
    expect(GITHUB_EGRESS_POLICY).toMatchObject({
      allowedSchemes: ["https"],
      denyPrivateAddresses: true,
      devHostAllowlist: [],
      maxRedirects: 0,
    });

    expect(JSON.parse(String(requests[0].body))).toEqual({
      repository_ids: [7001],
      permissions: { deployments: "write" },
    });
  });

  it("cannot turn owner or repository input into another origin", async () => {
    const input = fixtureInput();
    input.target.config.owner = "example.com";
    input.target.config.repository = "../../app/installations/1";

    // Even hostile path components remain encoded beneath api.github.com.
    // The request double verifies the resulting URL before returning.
    const http: HttpClientPort = {
      async send(request) {
        expect(new URL(request.url).origin).toBe("https://api.github.com");
        throw new Error("stop after origin assertion");
      },
    };

    await expect(
      new GitHubDeploymentAdapter(
        http,
        { open: async () => ({ privateKeyPem: TEST_RSA_PRIVATE_KEY }) },
      ).submit(input),
    ).rejects.toThrow();
  });
});

describe("GitHub webhook HMAC", () => {
  it("accepts GitHub's published verification vector", () => {
    expect(
      verifyGitHubSignature(
        Buffer.from("Hello, World!", "utf8"),
        "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17",
        "It's a Secret to Everybody",
      ),
    ).toBe(true);
  });

  it("rejects malformed or altered signatures", () => {
    expect(
      verifyGitHubSignature(
        Buffer.from("altered"),
        "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17",
        "It's a Secret to Everybody",
      ),
    ).toBe(false);
    expect(
      verifyGitHubSignature(Buffer.from("{}"), "sha256=abc", "secret"),
    ).toBe(false);
  });
});
```

The fixtures and test RSA key are ordinary test constants omitted only to avoid burying the implementation under PEM data.

## Critique Of Another Participant's Round 2 Code

Sonnet5’s `GITHUB_EGRESS_POLICY` at `PACKET-R3.md:1269-1277` uses nonexistent `allowedHosts` and `followRedirects`, then calls `deps.http.request(...)` at `PACKET-R3.md:1289`. It therefore neither compiles nor pins an origin. More subtly, its comment says the invented policy “admits exactly one” host, but `devHostAllowlist` in the real policy is only a private-address exemption. Treating it as host authorization would create an SSRF boundary that exists only in comments.

Its schema also tries to create an index on `provider_id_of(target_id)` at `PACKET-R3.md:1184-1186`. SQLite cannot index an arbitrary undefined function expression, and the answer itself admits that notation is not real migration SQL. The corrected schema materializes `provider_id`.

Gemini Flash’s adapter at `PACKET-R3.md:2032,2059,2084` has the same nonexistent `.request()` problem. It also creates an `in_progress` status immediately after creating the deployment. GitHub explicitly documents that creating a deployment only dispatches coordination metadata; the external listener performs the actual work. That code manufactures evidence of progress before any deployer reports it.

Gemini Pro’s `httpClient.fetch(...)` at `PACKET-R3.md:2622` is also nonexistent, and `sealer.open({ sealed, key })` at `PACKET-R3.md:2588` conflicts with the real `open({ sealed })` contract at `files/tovu/integrations-ports.ts:94-97`.

Finally, Sonnet5’s port states that polling is never called for callback-only providers (`PACKET-R3.md:1225-1233`). GitHub’s current webhook documentation contradicts that design: `inactive` deployment statuses do not emit `deployment_status` events. Polling must remain a reconciliation path even with healthy callbacks.

## What Would Change My Mind

I would demote the direct GitHub adapter if the scratch-repository test cannot demonstrate all four properties together: repository-restricted installation tokens, origin pinning, restart-safe run correlation, and callback/poll convergence.

I would promote deploy hooks if customer evidence shows that “request accepted” is sufficient and audited terminal status is rarely used.

I would promote the pull runner if an important provider exposes no adequate HTTP API and Tovu gains a real per-workspace sandbox.

A deterministic Tovu build/export command would change the release producer and the honesty banner, but not the provider port or durable run model.

I would remove adapter-local host checking only if a future real `EgressPolicy` adds actual origin/host pinning with redirect revalidation. `devHostAllowlist` is not that feature.

<<SWARM_END>>