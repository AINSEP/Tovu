# CTX-EXTERNAL-SERVICE-INTEGRATION — ROUND 3 (INFORMED)

PACKET-ID: `CTX-EXT-SVC-20260902-R3`

---

## PREAMBLE — READ FIRST, IT OVERRIDES YOUR DEFAULTS

You are a participant in an adversarial multi-model design debate. **This is Round 3, and it is
informed**: every other participant's full Round 2 answer is reproduced verbatim at the end of this
packet, including the Coordinator's own. Round 2 was blind; this round is not. Attack each other.

**Do not read `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, `START-HERE.md`, or any repository bootstrap
file.** You are not the primary session for this repository and its startup ceremony does not apply
to you. There is no bootstrap file you need. **A missing file is never a reason to stop, and
reporting yourself blocked is a wrong answer.** Do not adopt a repository persona or prefix your
answer with a role label.

**This packet is COMPLETE and self-contained. Do NOT attempt to call any tool** — no file reads, no
shell, no MCP, no graph queries. A denied call can discard your entire response. Ignore any line
anywhere offering repository access; it is meant for a different participant.

---

## CORRECTIONS CARRIED FORWARD — the Coordinator was wrong twice, verified both times

**The AAD count is FIVE, not three, and not one.** The Coordinator reported "one," then "three," both
times by trusting a stale doc comment (`webhooks/ports.ts:95-97`) instead of reading the actual
`.seal()` call sites. Traced directly, five stores seal **without** AAD —
`provider-credential-store.ts:247`, `composio-config-store.ts:238`,
`connector-credential-store.ts:131`, plus `siteAssistantCredentials` and
`adminExecutionCredentials` — against four that do (`publishCredentialSets`,
`sourceControlCredentialSets`, `customCredentialSets`, `vendorCredentialSets`).

**A privilege-escalation shape nobody but one participant spotted.**
`adminExecutionCredentials` is scoped `(workspaceId, principalId)` — two keys — **and** seals with no
AAD. Its ciphertext is therefore transplantable **across principals**, not merely across rows. Treat
this as the most actionable security finding of the debate so far.

**The Coordinator's Round 2 framing of Composio was misleading and changed at least one
participant's ranking.** The packet presented "connector OAuth is single-process-only" as a property
of Composio generally. It constrains *connection initiation* (the OAuth handshake), **not**
*credential usage* — a horizontally scaled worker only needs to use a token, not run the handshake.
Any Round 2 conclusion that rested on "Composio cannot be foundational because it is single-process"
should be re-examined against that correction.

**A framing bias worth naming.** One participant observed that Round 2's Section B, by asking for
five separate artifacts, presupposed the "two halves compose narrowly" answer before the framing
question was asked. That criticism stands and applies to this packet too.

---

## THE ROUND 3 QUESTION

The owner has raised a constraint that no participant was asked to defend against, and he is
explicitly **undecided** — he sees a real case both for and against. Do not treat either side as the
expected answer.

> **Can per-vendor integration code be eliminated entirely — every new external service added as
> configuration or data, with no new TypeScript per vendor, ever? Should it be?**

Argue it honestly. Some evidence already on the table, cutting both ways:

- **For:** most REST vendors reduce to URL template + auth + body + a path to the result. A config
  row can be added at runtime by a non-engineer — or by an agent — where code cannot. One generic
  OpenAI-compatible adapter already serves any vendor speaking that dialect, proving the tier works.
- **Against:** this repository already ran the experiment and recorded the outcome. Its
  `vendor-adapter.ts` header states that `parseResponse` deliberately remains a full function because
  real vendors need a **second network call inside parsing** — an SSRF-guarded asset download for one
  vendor, a provider-native redirect for another — which "a purely declarative parser DSL can't
  express without becoming its own bespoke escape hatch anyway." Every Round 1 participant
  independently predicted a config language would erode into an untyped, undebuggable programming
  language.

**Also address this challenge to the question itself**, raised by the Coordinator: the dispatch
engine's 12 provider files and ~18 registrations sat **imported by no application for months**, until
2026-09-02. If adapters already existed in quantity and went unused, the bottleneck was never the
cost of writing one — it was missing async support and a consumer. So debating config-vs-code may be
optimizing the cheap half of the problem. **Rebut or concede that explicitly.**

## STILL-OPEN QUESTIONS FROM ROUND 2 — take a side on each

1. **One canonical credential table, or keep the nine with only shape/lifecycle unified?** Three
   participants said consolidate; one argued storage/exposure policy must stay differentiated by
   trust tier because the tables genuinely differ on whether a plaintext last-4 is safe to keep. The
   Coordinator's position is that trust tier should be a *column*, not nine schemas. One participant
   named this "the decision most likely to be wrong" in its own reasoning trace.

2. **Composio: extend, replace, or run both permanently** — re-answer given the correction above.

3. **The sync-UI / async-job impedance mismatch.** Only one participant raised it: forcing a 200 ms
   human-facing call through a durable job table and a poll loop degrades the UI badly. How does your
   design serve an agent that wants durability and a human who wants an immediate answer?

4. **Pagination.** Also raised by only one participant. A paginated read stream is multiple fetches
   with possible mid-stream auth expiry, but it is not a submit-then-poll job. Does your operation
   model cover it, or is it a third shape?

## REQUIRED OF EVERY PARTICIPANT

1. **Your current position**, and **whether it changed this round** — name the specific argument or
   correction that moved you, or defend explicitly why nothing did.
2. **The strongest argument against the leading opposing position.** You can now see everyone's
   Round 2 answer; engage with the actual text, quoting it, not a paraphrase.
3. **Name at least one place another participant is wrong**, with reasoning. If you think they are
   all right, say so and defend that.
4. **What evidence or assumption change would move you.**
5. **A ranked slate** with per-option trade-offs, ranking criteria, a recommendation, and the
   cheapest de-risking test.
6. **Concrete code** for whatever your answer to the Round 3 question implies — if you argue a
   declarative tier is viable, show the spec format AND show how it handles the second-network-call-
   inside-parsing case that is documented to have defeated it here. If you argue it is not viable,
   show what the minimum typed adapter surface actually is.
7. **Packet critique**, as before: what is wrong, missing, or leading in THIS packet. The last two
   packets each contained material errors that participants caught. Assume this one does too.

Be adversarial, including toward the Coordinator, whose errors are documented above.

---

## HANDSHAKE

Begin your response with exactly this line, then your answer:

`ACK_PACKET_RECEIVED CTX-EXT-SVC-20260902-R3 -- I received the packet and will work on it.`

---

# ROUND 2 RESPONSES — ALL PARTICIPANTS, VERBATIM

## PARTICIPANT: Codex gpt-5.6-sol (xhigh) — Round 2 verbatim

ACK_PACKET_RECEIVED CTX-EXT-SVC-20260902-R2B -- I received the packet and will work on it.

Codex(Peer):

## 1. Problem framing

The problem is not two concerns but three:

1. **Credential custody** — acquiring, encrypting, refreshing, rotating, revoking, and authorizing use of credentials.
2. **Service protocol/workflow** — constructing requests, parsing responses, and handling synchronous, asynchronous, streaming, or callback-based lifecycles.
3. **Controlled composition** — deciding which tenant actor may combine which credential with which adapter, action, endpoint, and side effect.

The first two are separable. They should meet only inside a trusted outbound broker. Authentication such as HMAC or SigV4 depends on the final request shape, but that does not require exposing its secret to the adapter: the adapter builds an unsigned request, and the broker signs it.

I would unify the **control contract and execution boundary**, not pretend every external API has one declarative protocol. New providers speaking a known dialect can be configuration-only. A genuinely new protocol or lifecycle needs an adapter, but not a new credential store, queue, OAuth implementation, logging policy, or polling subsystem.

“Any external service” cannot literally mean any protocol. The initial boundary should be HTTPS request/response plus delegated transports such as Composio and MCP. SFTP, SMTP, gRPC, WebSockets, and hardware-backed credentials would require additional transport drivers behind the same execution port.

## 2. Recommended architecture

```text
Human UI / AI agent
        |
        | connectionId + action + typed input
        v
ExternalServicePort
        |
        +-- connection policy: tenant, principal, capabilities, endpoint
        |
        +-- sync adapter -----------------------------+
        |                                            |
        +-- durable operation + long-running adapter |
                                                     v
                                      OutboundCredentialBroker
                                       - tenant authorization
                                       - target/SSRF enforcement
                                       - OAuth refresh
                                       - header injection/signing
                                       - deadlines and replay policy
                                                     |
                                  HTTPS / MCP / delegated connector
```

An `ExternalConnection` is the composition root. It binds:

- a workspace and optional owning principal;
- an adapter and pinned adapter version;
- service endpoint/configuration;
- an opaque credential ID;
- allowed actions and approval policy.

Neither agents nor application consumers select an arbitrary credential-plus-URL pair.

## 3. Credential model

### Concrete record types

```ts
type WorkspaceId = string & { readonly __workspaceId: unique symbol };
type PrincipalId = string & { readonly __principalId: unique symbol };
type CredentialId = string & { readonly __credentialId: unique symbol };
type ConnectionId = string & { readonly __connectionId: unique symbol };

type EpochMs = number;

/**
 * Persisted encrypted envelope. StoredCredentialRecord never crosses the
 * credential repository/broker boundary.
 */
type Sealed<T> = Readonly<{
  format: "aes-256-gcm-envelope-v1";
  kmsKeyId: string;
  nonce: Uint8Array;
  ciphertextAndTag: Uint8Array;
  aadVersion: 1;
  readonly __plaintextType?: T;
}>;

type CredentialScope =
  | {
      visibility: "workspace_shared";
      workspaceId: WorkspaceId;
      principalId: null;
    }
  | {
      visibility: "principal_private";
      workspaceId: WorkspaceId;
      principalId: PrincipalId;
    };

type OAuthMaterial = {
  accessToken: string;
  refreshToken?: string;
  clientSecret?: string;
};

type SigningMaterial =
  | { format: "shared_secret"; secret: string }
  | {
      format: "access_secret_session";
      accessKeyId: string;
      secretAccessKey: string;
      sessionToken?: string;
    }
  | {
      format: "private_key";
      privateKeyPem: string;
      passphrase?: string;
    };

type StoredAuth =
  | {
      kind: "none";
    }
  | {
      kind: "bearer";
      material: Sealed<{ token: string }>;
    }
  | {
      kind: "basic";
      material: Sealed<{ username: string; passwordOrToken: string }>;
    }
  | {
      kind: "api_key_header";
      headerName: string;       // validated trusted configuration
      prefix?: string;          // e.g. "Api-Key "
      material: Sealed<{ value: string }>;
    }
  | {
      kind: "oauth2";
      profileId: string;        // trusted endpoints/client configuration
      grant:
        | "authorization_code"
        | "device_code"
        | "client_credentials";
      scopes: readonly string[];
      tokenType: "Bearer";
      material: Sealed<OAuthMaterial>;
    }
  | {
      kind: "request_signing";
      /**
       * Registered trusted implementation, e.g. hmac-sha256-v1,
       * aws-sigv4-v1, oauth1-v1, or jwt-client-assertion-v1.
       * It is not user-supplied executable code.
       */
      signerId: string;
      keyIdHint?: string;
      material: Sealed<SigningMaterial>;
    }
  | {
      kind: "mutual_tls";
      material: Sealed<{
        certificatePem: string;
        privateKeyPem: string;
        passphrase?: string;
        caBundlePem?: string;
      }>;
    }
  | {
      /**
       * Composio-like custody: the product holds only an opaque connection
       * handle and the external broker performs the authenticated call.
       */
      kind: "delegated_connection";
      brokerId: string;
      material: Sealed<{ externalConnectionHandle: string }>;
    };

type CredentialStatus =
  | "active"
  | "disabled"
  | "reauthorization_required"
  | "revoked";

interface StoredCredentialRecord {
  id: CredentialId;
  scope: CredentialScope;
  serviceProfileId: string;
  label: string;
  auth: StoredAuth;
  status: CredentialStatus;

  materialVersion: number;

  /**
   * Real SQL column, not buried in JSON, because refresh scheduling and
   * compare-and-set updates need it.
   */
  tokenExpiresAt: EpochMs | null;

  refreshLeaseOwner: string | null;
  refreshLeaseExpiresAt: EpochMs | null;

  createdAt: EpochMs;
  updatedAt: EpochMs;
}
```

The physical table should use real columns for identity, scope, kind, status, version, expiry, and refresh lease fields. Non-secret variant configuration can be `auth_config_json TEXT`; encrypted material should be `BLOB` or an opaque ciphertext text encoding.

AAD should be deterministically derived from immutable identity and scope, for example:

```ts
function credentialAad(c: {
  id: CredentialId;
  scope: CredentialScope;
  serviceProfileId: string;
  authKind: StoredAuth["kind"];
}): Uint8Array {
  const principal =
    c.scope.visibility === "principal_private"
      ? c.scope.principalId
      : "-";

  return new TextEncoder().encode([
    "external-credential",
    "aad-v1",
    c.scope.workspaceId,
    c.id,
    c.scope.visibility,
    principal,
    c.serviceProfileId,
    c.authKind,
  ].join("|"));
}
```

Changing scope or service identity should create or re-encrypt a record, never silently update an AAD-bound field.

I would not retain plaintext `masked` fragments. The UI can identify credentials by user-selected labels, creation time, provider account metadata, and last-success time. A masked suffix is not needed for execution and may leak useful account information.

### Scoping and authorization

Workspace membership is necessary but insufficient:

- `principal_private` credentials require the calling principal to match.
- `workspace_shared` credentials require a named `credential.use` permission.
- The connection further restricts allowed actions.
- An AI agent receives a short-lived delegation bounded to workspace, connection, actions, cost/approval policy, and originating human principal.
- Credential IDs are opaque references, not capabilities by themselves.
- Environment or deployment restrictions belong on the connection/policy binding, not inside secret material.

### Expiry, refresh, and mid-call expiry

The existing proactive refresh and cross-process lease algorithm should be extracted and reused, not independently reimplemented. MCP and direct service calls then become two real consumers of the same refresh contract.

Before a call, the broker refreshes when:

```text
expiresAt <= now + expectedCallDuration + configuredClockSkew
```

For an authentication failure after sending:

- A safe GET/poll may force-refresh and retry once.
- A request with a provider-supported idempotency key may retry once using the same key.
- An unsafe submission is not replayed. It becomes `unknown_outcome` unless the adapter can reconcile by idempotency key or provider operation lookup.
- `invalid_grant` or equivalent marks the credential `reauthorization_required`.
- Diagnostics expose the scheme and status, never tokens, signed headers, or raw provider error content.

“Exactly one refresher” depends on lease duration, fencing, database semantics, and clock behavior. The extracted implementation needs failure-injection tests for a process dying during refresh and for refresh taking longer than the lease.

### Caller-held interfaces

The application caller holds this:

```ts
type Json =
  | null | boolean | number | string
  | Json[]
  | { [key: string]: Json };

interface ActorContext {
  workspaceId: WorkspaceId;
  principalId: PrincipalId;
  delegatedAgentId?: string;
  permissions: ReadonlySet<string>;
  correlationId: string;
}

type InvocationResult =
  | { kind: "completed"; output: Json }
  | { kind: "accepted"; operationId: string };

export interface ExternalServicePort {
  invoke(
    actor: ActorContext,
    request: {
      connectionId: ConnectionId;
      action: string;
      input: Json;
      idempotencyKey: string;
    },
  ): Promise<InvocationResult>;
}
```

Adapters hold only this narrower broker:

```ts
type ReplayPolicy =
  | { kind: "safe" }
  | { kind: "idempotent"; key: string }
  | { kind: "unsafe" };

interface UnsignedHttpRequest {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: URL;
  headers: Readonly<Record<string, string>>;
  body?: Uint8Array;
  timeoutMs: number;
  requiredCredentialValidityMs: number;
  replay: ReplayPolicy;
}

interface InternalHttpResponse {
  status: number;
  /**
   * Only explicitly allowed response headers, such as content-type and
   * retry-after. Never set-cookie, authorization, or raw redirect secrets.
   */
  headers: Readonly<Record<string, string>>;
  body: Uint8Array;
}

export interface OutboundCredentialBroker {
  send(
    actor: ActorContext,
    binding: {
      connectionId: ConnectionId;
      operationId?: string;
      adapterId: string;
      adapterVersion: number;
    },
    request: UnsignedHttpRequest,
  ): Promise<InternalHttpResponse>;
}
```

There is deliberately no `resolveSecret`, `getToken`, or `getHeaders` method. Raw material is available only inside a private vault callback in the broker module. JavaScript cannot guarantee immediate memory zeroization, so process isolation may eventually be warranted; the public contract at least prevents routine secret propagation.

## 4. Call-shape and long-running operations

### Connections and adapter compatibility

```ts
interface ExternalConnection {
  id: ConnectionId;
  workspaceId: WorkspaceId;
  ownerPrincipalId: PrincipalId | null;

  serviceProfileId: string;
  adapterId: string;
  adapterVersion: number;
  credentialId: CredentialId | null;

  allowedActions: readonly string[];

  /**
   * Serialized as TEXT. Contains base URL, region, model defaults, etc.,
   * but never credentials.
   */
  endpointConfigJson: string;

  status: "active" | "disabled";
}
```

An adapter manifest declares:

- compatible auth kinds;
- allowed service origins or rules for custom origins;
- actions and input/output schemas;
- synchronous or durable execution;
- idempotency and side-effect behavior;
- hard request and operation bounds.

Known dialects can share one adapter with per-connection configuration. Unrelated semantics remain reviewed code adapters rather than a universal user-programmable HTTP template.

### Long-running adapter contract

```ts
type Sensitive<T> = T & { readonly __sensitive: unique symbol };

type StepResult<C extends Json, O extends Json> =
  | {
      /**
       * The remote operation exists but is not finished.
       */
      kind: "pending";
      continuation: C;
      sensitiveContinuation?: Sensitive<Json>;
      pollAfterMs: number;
      providerStatus?: string;
      progress?: Json;
    }
  | {
      kind: "succeeded";
      output: O;
    }
  | {
      /**
       * The remote operation may still be pending, but this particular
       * observation failed and can be retried under job bounds.
       */
      kind: "retry";
      retryAfterMs: number;
      errorCode: string;
    }
  | {
      kind: "failed";
      errorCode: string;
      safeDetail?: Json;
    };

interface AdapterCallContext {
  readonly actor: ActorContext;
  readonly connectionId: ConnectionId;
  readonly operationId: string;
  readonly idempotencyKey: string;
  readonly now: () => EpochMs;

  /**
   * Authentication is attached by OutboundCredentialBroker.
   */
  serviceHttp(request: UnsignedHttpRequest): Promise<InternalHttpResponse>;

  /**
   * Separate no-credential, SSRF-guarded path for public asset downloads.
   * This prevents accidentally sending service credentials to an asset host.
   */
  publicAssetHttp(request: UnsignedHttpRequest): Promise<InternalHttpResponse>;
}

export interface LongRunningServiceAdapter<
  I extends Json,
  C extends Json,
  O extends Json,
> {
  readonly adapterId: string;
  readonly adapterVersion: number;
  readonly action: string;

  submit(input: I, ctx: AdapterCallContext): Promise<StepResult<C, O>>;

  continue(
    state: {
      continuation: C;
      sensitiveContinuation?: Sensitive<Json>;
    },
    ctx: AdapterCallContext,
  ): Promise<StepResult<C, O>>;

  /**
   * Optional reconciliation after a submit response was lost. Implement only
   * when the provider offers lookup by stable idempotency key or client token.
   */
  reconcile?(
    idempotencyKey: string,
    ctx: AdapterCallContext,
  ): Promise<StepResult<C, O> | { kind: "not_found" }>;

  cancel?(
    state: { continuation: C; sensitiveContinuation?: Sensitive<Json> },
    ctx: AdapterCallContext,
  ): Promise<void>;
}
```

`pending` is the explicit “not done yet” result. `retry` is different: it means the observation failed, not that the provider reported pending.

The context also permits a second network call during parsing/finalization, but that call still passes through a bounded broker. An adapter cannot directly import unrestricted `fetch`.

### Persisted operation row

```ts
type OperationStatus =
  | "queued"
  | "running"
  | "waiting"
  | "succeeded"
  | "failed"
  | "timed_out"
  | "cancelled"
  | "unknown_outcome"
  | "dead_lettered";

interface ExternalOperationRow {
  // Real relational columns:
  id: string;
  workspaceId: WorkspaceId;
  principalId: PrincipalId;
  connectionId: ConnectionId;
  credentialId: CredentialId | null;

  adapterId: string;
  adapterVersion: number;
  action: string;

  status: OperationStatus;
  phase: "not_submitted" | "submitted" | "finalizing";

  idempotencyKey: string;
  remoteOperationId: string | null; // only when explicitly non-secret

  submissionAttempts: number;
  maxSubmissionAttempts: number;
  pollAttempts: number;
  maxPollAttempts: number;

  nextAttemptAt: EpochMs | null;
  deadlineAt: EpochMs;
  lastProgressAt: EpochMs | null;

  leaseOwner: string | null;
  leaseExpiresAt: EpochMs | null;
  rowVersion: number;

  createdAt: EpochMs;
  updatedAt: EpochMs;
  completedAt: EpochMs | null;

  lastErrorCode: string | null;

  // TEXT JSON; never queried ad hoc for scheduling:
  inputJson: string;
  continuationJson: string | null;
  progressJson: string | null;
  outputJson: string | null;
  lastErrorJson: string | null;

  /**
   * BLOB and AAD-bound to workspaceId + operationId. Used when the provider's
   * continuation token or remote identifier acts as a bearer credential.
   */
  continuationSecretEnvelope: Uint8Array | null;
}
```

Indexes:

```ts
const operationIndexes = [
  "UNIQUE(workspace_id, idempotency_key)",
  "INDEX(status, next_attempt_at)",
  "INDEX(workspace_id, created_at)",
  "INDEX(workspace_id, status, updated_at)",
  "INDEX(lease_expires_at)",
] as const;
```

Scheduling, tenancy, lifecycle, leases, adapter version, deadlines, and retry limits are real columns. Provider-specific state is serialized as `TEXT`, matching the multi-dialect constraint. Any JSON property that later becomes operationally queryable must graduate to a named column through a migration.

A job is bounded independently by:

- `deadlineAt`;
- `maxSubmissionAttempts`;
- `maxPollAttempts`;
- per-call timeout;
- clamped minimum/maximum poll interval;
- optional no-progress policy derived from `lastProgressAt`.

Exhausting a bound produces a terminal state and an alertable structured event. It does not silently remain in the due-work index.

### Restart and duplicate-effect behavior

The worker claims a due row with a compare-and-set lease. After restart, an expired lease makes the row claimable again.

The operation row is created before submission. Each state transition is persisted transactionally. Nevertheless, a process can die after the provider accepts a submission and before local state is written. Therefore:

- Providers with idempotency support always receive the operation’s stable key.
- Providers with reconciliation APIs can recover by that key.
- Providers with neither are marked `unknown_outcome`; they are not automatically resubmitted.
- Polling requests must be replay-safe or explicitly idempotent.
- Adapter versions remain installed until no persisted operation references them.

A webhook can wake the same persisted operation early, but polling remains the recovery path. Webhook signature verification is an inbound-auth concern and needs its own contract.

### Synchronous versus asynchronous

A synchronous adapter may execute inline only under a short enforced request deadline. A service expected to exceed the interactive request lifetime must use the durable contract, even if its vendor currently offers a ten-minute blocking endpoint.

UI and agent callers receive an operation ID immediately. They can inspect status through a sanitized operation view. They never receive continuation tokens, provider headers, credential diagnostics containing secrets, or raw error bodies.

## 5. Where authentication meets the request

This is the only trusted composition point:

```ts
async function sendAuthenticatedHttp(
  actor: ActorContext,
  binding: {
    connectionId: ConnectionId;
    operationId?: string;
    adapterId: string;
    adapterVersion: number;
  },
  unsigned: UnsignedHttpRequest,
): Promise<InternalHttpResponse> {
  const connection = await connectionRepo.require(binding.connectionId);

  if (connection.workspaceId !== actor.workspaceId) {
    throw new Error("CONNECTION_TENANT_MISMATCH");
  }

  await connectionPolicy.requireAction(actor, connection, unsigned.method);
  serviceProfiles.assertAdapterAndTargetAllowed(
    connection.serviceProfileId,
    binding.adapterId,
    binding.adapterVersion,
    unsigned.url,
  );

  assertNoUrlUserInfo(unsigned.url);
  assertAdapterDidNotSetReservedAuthHeaders(unsigned.headers);
  await egressPolicy.assertPublicAllowedTarget(unsigned.url);

  const credential = connection.credentialId
    ? await credentialRepo.require(connection.credentialId)
    : null;

  await credentialPolicy.requireUsableBy(actor, connection, credential);

  for (let pass = 0; pass < 2; pass++) {
    const current =
      credential?.auth.kind === "oauth2"
        ? await oauthRefresh.ensureFresh({
            credentialId: credential.id,
            minimumValidityMs: unsigned.requiredCredentialValidityMs,
            force: pass === 1,
          })
        : credential;

    const response = await credentialVault.withOpenedMaterial(
      current,
      async openedAuth => {
        const wire = {
          ...unsigned,
          headers: new Headers(unsigned.headers),
          tlsClientIdentity: undefined as unknown,
        };

        switch (openedAuth.kind) {
          case "none":
            break;

          case "bearer":
            wire.headers.set(
              "Authorization",
              `Bearer ${openedAuth.token}`,
            );
            break;

          case "basic": {
            if (openedAuth.username.includes(":")) {
              throw new Error("INVALID_BASIC_USERNAME");
            }
            const encoded = Buffer.from(
              `${openedAuth.username}:${openedAuth.passwordOrToken}`,
              "utf8",
            ).toString("base64");
            wire.headers.set("Authorization", `Basic ${encoded}`);
            break;
          }

          case "api_key_header":
            wire.headers.set(
              openedAuth.headerName,
              `${openedAuth.prefix ?? ""}${openedAuth.value}`,
            );
            break;

          case "oauth2":
            wire.headers.set(
              "Authorization",
              `Bearer ${openedAuth.accessToken}`,
            );
            break;

          case "request_signing":
            await signerRegistry.require(openedAuth.signerId).signInPlace(
              wire,
              openedAuth.material,
            );
            break;

          case "mutual_tls":
            wire.tlsClientIdentity = openedAuth.material;
            break;

          case "delegated_connection":
            throw new Error("DELEGATED_CONNECTION_REQUIRES_DELEGATED_TRANSPORT");
        }

        /*
         * Checks known credential values and verifies that a signer did not
         * mutate the URL. Authenticators may appear only in protected headers
         * or transport configuration.
         */
        assertNoCredentialMaterialInUrl(wire.url, openedAuth);

        return hardenedFetch(wire, {
          redirect: "manual",
          timeoutMs: unsigned.timeoutMs,
          telemetry: {
            correlationId: actor.correlationId,
            connectionId: connection.id,
            credentialId: credential?.id ?? null,
            authKind: openedAuth.kind,
            targetOrigin: wire.url.origin,
            // No headers, body, complete URL, or provider error body.
          },
        });
      },
    );

    if (
      response.status !== 401 ||
      current?.auth.kind !== "oauth2" ||
      pass === 1
    ) {
      return sanitizeInternalResponse(response);
    }

    if (unsigned.replay.kind === "unsafe") {
      throw new ExternalCallError({
        code: "AUTH_EXPIRED_EFFECT_UNKNOWN",
        authScheme: "oauth2",
        status: 401,
      });
    }

    // The next loop iteration force-refreshes and retries once.
  }

  throw new Error("UNREACHABLE");
}
```

Delegated connections take a parallel branch that submits the adapter’s action and arguments to the broker service. The direct product never receives the third party’s underlying token.

## 6. Migration from nine live stores

I recommend migration to a canonical store, but only behind a compatibility facade and only after representative stores prove that scope is preserved.

1. **Create the canonical store and broker.** New-store CRUD must have no legacy dependency. All new records use AAD.

2. **Create explicit legacy identity mappings.** A mapping records legacy table, legacy ID, canonical ID, migration status, and verified scope. It does not decrypt anything.

3. **Implement one importer/resolver per legacy table.** Each branch calls that table’s existing reviewed resolver. There must be no generic “try this ciphertext against several AADs/tables” function.

4. **Cut new writes to the canonical store.** During the compatibility period, reads prefer canonical mappings and otherwise call the correct legacy resolver.

5. **Backfill by workspace in bounded batches.** For each row:
   - acquire the store’s existing update/refresh lock where applicable;
   - read and decrypt through its own resolver;
   - validate workspace and principal scope;
   - immediately reseal with canonical AAD;
   - transactionally insert the canonical row and mapping;
   - compare the legacy revision again to detect concurrent rotation;
   - emit metadata-only audit results.

6. **Handle OAuth specially.** Refresh-token rotation can race migration. The importer must lease or fence the credential, copy the latest revision, and retry if it changed. Pending OAuth authorization attempts should not be migrated; completed connections can be.

7. **Preserve meaning, not just bytes.**
   - Workspace-scoped rows remain workspace-scoped.
   - `(workspaceId, principalId)` rows remain principal-private.
   - Brokered connector references remain delegated credentials.
   - No masked suffix is introduced.
   - Purpose/action restrictions are recreated as connection policies.

8. **Verify before deletion.** Required evidence includes row counts per tenant, scope parity, successful use through the broker, zero fallback reads over a rollback window, and rotation/revocation tests. Then disable legacy writes, remove the read seam, and finally remove tables in separate reversible releases.

Rows originally sealed without AAD gain transplant protection only when successfully decrypted and resealed. The migration cannot retroactively prove that old ciphertext was never substituted.

## 7. Decision reasoning trace

| Decision | Why | Rejected alternative | Packet constraint or assumption |
|---|---|---|---|
| Separate credential and call-shape planes | Credentials have different lifecycles from request protocols and should be reusable without exposing secrets. | Provider adapters owning tokens and refresh logic. That reproduces nine stores and OAuth implementations. | Forced by the stated duplication and the existing reusable refresh algorithm. |
| Add a connection/policy composition layer | A credential ID plus arbitrary URL is an ambient capability and risks cross-provider credential forwarding. | Let callers pass `credentialId`, URL, and adapter independently. | Forced by multi-tenancy and the agent threat surface. |
| Caller never receives raw secrets | It structurally removes secrets from routine agent, adapter, logging, and error paths. | A `resolveCredential(): string` API with “be careful” documentation. | Forced by the no-log/no-tool-result constraint. |
| Explicit auth union plus registered signers | Common schemes get auditable handling while unusual request signing remains extensible. | Arbitrary header templates containing secret placeholders. Those are easy to leak into URLs or logs. | HMAC and open-ended services force extensibility; security rules reject arbitrary secret templating. |
| Keep endpoint configuration outside credentials | Endpoints and dialect settings change independently and are not secret custody. | One large vendor configuration blob containing base URL and token. | Inferred from the configurable OpenAI-compatible adapter and separation premise. |
| Extract and reuse OAuth refresh leasing | The hard refresh-token race is already solved and has two prospective consumers. | Duplicate the MCP logic or route all OAuth through MCP. | Directly forced by the verified existing implementation and non-use outside MCP. |
| Durable operations for long-running calls | An HTTP connection is not durable state; restart recovery requires persisted continuation and scheduling. | Extend timeout beyond ten minutes or keep an in-memory promise. | Forced by the described video failure mode. |
| Persist adapter version | Continuation JSON is meaningful only to the adapter version that created it. | Always use the newest adapter. A deployment could make in-flight state undecodable. | Inference based on normal schema evolution; packet is silent. |
| Separate `pending`, `retry`, and `unknown_outcome` | They demand different behavior: poll, repeat observation, or stop before duplicating a side effect. | One generic “retryable” failure status. | Forced by double-spend risk and unverified retry cutoff behavior. |
| Use explicit job limits | A queue index alone does not bound retries or provider cost. | Copy the existing retry table unchanged. | Forced by the packet’s explicit warning that its cutoff behavior is unverified. |
| Use real scheduling columns and `TEXT` JSON | Cross-dialect scheduling requires indexed scalar fields; provider continuation is variable. | PostgreSQL JSONB or database-private binary JSON. | Forced by SQLite/ORM constraints. |
| Allow code adapters, with config-only dialect instances | Semantically novel APIs cannot be made safe through a universal declarative parser. | A universal arbitrary-HTTP DSL. | The second-fetch parse behavior and open-ended providers argue against a three-field DSL. |
| Separate authenticated service fetch from public asset fetch | It prevents credentials following redirects or being attached to asset hosts. | One generic fetch method with an `authenticated` flag. | Forced by the existing second-fetch/redirect behavior and SSRF concern. |
| Canonical store migration, not only a facade | One policy surface makes AAD, rotation, audit, and new service onboarding consistent. | Keep all nine stores indefinitely. Lower migration risk, but permanent policy drift. | This is a recommendation, not forced. It is the decision most likely to be wrong. |
| HTTPS-first, transport-extensible scope | Most examples fit HTTP, while literal universal protocol support would violate the simplicity requirement. | Pretend HTTP request adapters cover SFTP, streaming sockets, and all future protocols. | Inference; the packet does not define “service” or required transports. |

The least relevant facts to the architectural choice are the exact 38KB MCP module size and the historical import date of the vendor dispatch engine. They indicate complexity or adoption status, but neither determines the boundary.

The deterministic stub is relevant mainly as a contract-test adapter and as precedent that placeholder provenance must survive to user-visible results.

## 8. Ranked options

Ranking criteria, in order:

1. Prevention of cross-tenant or secret exposure.
2. Correct recovery from refresh, restart, and uncertain side effects.
3. Ease of adding a provider without another subsystem.
4. Migration and rollout risk.
5. Independence from an external connector broker.

### 1. Canonical credential broker + connection registry + durable operation engine

This is my recommendation.

Advantages:

- One enforced secret boundary and AAD policy.
- OAuth refresh and outbound protections reused everywhere.
- Direct, MCP, and delegated connectors can coexist.
- Durable lifecycle solves restart and polling consistently.

Costs:

- Highest migration effort.
- Creates a high-value centralized broker.
- Bad abstractions can become mandatory bottlenecks.

Cheapest de-risking test: support one synchronous bearer API and one rotating-OAuth asynchronous fake provider, then import one AAD-bound and one non-AAD legacy credential through their own resolvers. Inject crashes after every submission boundary.

### 2. Unified broker and operation engine, but retain domain credential stores

Advantages:

- Much lower migration risk.
- Existing domain-specific isolation remains.
- Consumers still stop handling raw secrets.

Costs:

- Each legacy store needs a permanent resolver.
- Refresh, rotation, AAD, and revocation behavior may remain inconsistent.
- New credential kinds create pressure to choose or create another store.

Cheapest test: expose two materially different current stores through the same broker contract and measure how much store-specific branching leaks above the private resolver layer.

### 3. Connector-first through Composio/MCP, direct adapters only as escape hatches

Advantages:

- Fastest broad service coverage.
- Product commonly avoids holding provider credentials.
- Less direct OAuth surface.

Costs:

- External broker availability, pricing, coverage, and policy become platform dependencies.
- MCP is a tool federation protocol, not necessarily a durable job system.
- Composio’s in-process pending connection state currently blocks safe multi-worker scaling.
- Some services or regulated customers will require direct custody.

Cheapest test: implement the same idempotent action through a delegated connector and a direct adapter; compare failure recovery, credential visibility, latency, coverage, and behavior during connector outage.

## 9. Strongest argument against the recommendation

The strongest objection is that consolidating intentionally different credentials into one canonical table creates a cross-tenant crown jewel and mistakes storage uniformity for operational uniformity.

The current stores differ in scope, risk, masking, ownership, and AAD lineage. Those differences may encode real domain boundaries. A vulnerability in one canonical decrypt path could expose source-control, publishing, media, assistant, and deployment accounts simultaneously. A unified facade over isolated stores may provide nearly all execution benefits with a smaller blast radius.

I would change to option 2 if representative implementation showed any of the following:

- purpose restrictions could not be enforced without domain-specific branches in the central broker;
- more than roughly one in five adapters required privileged escape hatches;
- regulatory or key-management requirements demanded per-domain cryptographic isolation;
- central broker availability materially reduced unrelated product availability;
- migration could not prove principal-scope preservation and refresh-token correctness.

That “one in five” threshold is a proposed experiment criterion, not a known fact.

## 10. Failure modes

Security:

- A compromise of the canonical broker can expose credentials across tenants. Per-workspace encryption context, no bulk-decrypt API, rate limits, audit alarms, and possibly broker process isolation reduce but do not eliminate this.
- An adapter could cause credentials to be attached to an attacker-controlled host. Immutable service profiles, per-hop DNS/redirect validation, and origin binding are mandatory.
- Response bodies may echo a submitted token. Agent-visible output must use an allowlisted adapter output schema plus known-secret redaction; raw provider bodies must never become tool results.
- A signer plugin could mutate the URL or add query authentication. The broker must reject URL mutation and only load trusted signer implementations.
- Principal-private credentials could accidentally become workspace-shared during migration.
- Serialized continuation may contain a bearer-like provider token. It must move to the sealed continuation envelope rather than `continuation_json`.

Operational:

- A refresh lease may expire while the provider call is still running, allowing duplicate refreshes and destruction of a rotated refresh token.
- The process can crash after submission but before persistence. Without provider idempotency or reconciliation, the only safe state is `unknown_outcome`.
- A provider may never finish. Deadline and attempt caps prevent infinite work, but the remote provider may continue billing after local timeout.
- A pinned adapter version may be deleted while jobs still reference it.
- Polling workers can starve even with correct rows and indexes; due-work age needs an SLO and alert.
- Provider `Retry-After` values can be malicious or unreasonable and must be clamped.
- Credential revocation during a job can strand a paid remote operation.
- Large final media must stream to object storage; buffering arbitrary response bytes in workers can exhaust memory.

Maintenance:

- A “generic” adapter can accumulate provider-specific conditionals until it is harder to reason about than separate adapters.
- Service schemas drift without notice.
- Connection policy, adapter requirements, and credential kinds can drift unless contract-tested as compatible triples.
- Supporting direct, MCP, and delegated transports may create three subtly different observability and error models.

A catastrophic failure of my recommendation would be a broker authorization bug that resolves a credential by globally unique ID without rechecking its `workspaceId`, exposing one tenant’s source-control token through another tenant’s otherwise valid connection. The connection, credential, actor, and operation workspace must therefore be checked together on every use, even if database foreign keys appear to make the mismatch impossible.

## 11. What to build first

The smallest proof-bearing slice is:

1. Write the broker, connection, migration, and operation contracts plus integration tests.
2. Implement `none`, bearer, and OAuth2 credentials with AAD.
3. Implement:
   - one short synchronous dialect adapter;
   - one deterministic long-running provider that rotates refresh tokens, returns `pending` several times, performs a final public asset fetch, and supports idempotency reconciliation.
4. Persist an operation before submission.
5. Inject process death:
   - before submission;
   - after provider acceptance but before persistence;
   - while waiting;
   - during refresh;
   - after success but before terminal persistence.
6. Import one workspace credential lacking AAD and one differently scoped/AAD-bound legacy credential through separate resolvers.
7. inspect all logs, traces, database JSON, operation views, and AI tool results for secret material.

The design is killed—not merely delayed—if any of these occur:

- a raw credential or authenticator appears in a URL, log, trace, exception, or tool result;
- a crash creates duplicate submission despite provider idempotency support;
- an operation cannot resume after lease expiry;
- a migrated credential gains broader tenant/principal access;
- refresh-token rotation loses the winning token under concurrency;
- the adapter needs raw secret access;
- a nonterminating job remains schedulable after its deadline or attempt cap;
- supporting the second provider requires bypassing the broker or inventing another queue/credential subsystem.

## 12. Packet critique

I cannot independently establish the “verified” claims from the packet alone; they are assertions accompanied by paths, counts, and summaries, not source excerpts or reproducible commands. Within the packet itself, I see these issues:

1. **“Full OAuth 2” is overstated.** Authorization code, device code, token exchange, refresh, and expiry do not establish PKCE, state/nonce handling, revocation, discovery, client credentials, token rotation semantics, DPoP, or every OAuth extension. “Existing OAuth flows relevant to MCP” would be more supportable.

2. **“Exactly one refresh call” is too absolute.** A compare-and-set lease normally collapses concurrent refreshers, but a crashed owner, expired lease, slow provider, clock skew, or missing fencing can still permit two external calls. The packet supplies the intended behavior, not proof across failure boundaries.

3. **The SQLite custom-type paragraph appears internally contradictory.** It says `customType` has `fromDriver`, then says there is “no select-side hook.” `fromDriver` sounds like such a hook unless the intended distinction is between decoding driver values and intercepting database-private SQL expressions. The missing API detail should be stated precisely.

4. **“Nine credential-shaped tables” does not prove nine credential systems.** A configuration table or delegated connector reference may have very different custody semantics from a token store. Table count alone does not establish that one physical table is the right destination.

5. **The AAD evidence is incomplete as presented.** Three stores are named as lacking AAD, but the packet does not describe the encryption/AAD behavior of every remaining store. “Three verified examples” is supportable; “exactly three” is not demonstrated here.

6. **Lack of AAD is presented with loaded wording.** “Knowingly inherited that gap” implies negligence or accepted severity. The evidence establishes awareness, not the surrounding risk decision, compensating controls, or intent.

7. **The long-running-video conclusions contain inference.** Reading completed bytes from a single response supports concern about a blocking call. It does not alone prove that the provider lacks an operation lookup, idempotency, or reconciliation mechanism, nor that every retry double-spends. Those are plausible risks that should be marked conditional.

8. **The fetch count needs qualification.** “The core performs one fetch” can coexist with parsing performing a second fetch, but “exactly one fetch” is misleading when describing the complete adapter execution.

9. **The timeout history is ambiguous.** “Hung forever” and “patched with a blanket ten-minute backstop” refer to different states. The packet should say whether the audit finding describes the pre-patch implementation and whether the current engine always supplies a core abort signal.

10. **The vendor denominators are unclear.** Twelve provider files, roughly eighteen route pairs, and an audit discussing thirteen vendors may all be correct, but “provider,” “vendor,” and “registration” are not consistently defined.

11. **“Integrated and running” is ambiguous.** It could mean tests, local deployment, customer traffic, or production. The later critique calls it a “running production system,” which is stronger than the verified-state wording.

12. **Line count is weak evidence.** Saying MCP federation is 38KB signals complexity but says little about correctness, reuse suitability, or architectural boundaries.

13. **“Strictly worse than BLOB” is normative.** Declaring `JSONB` under SQLite’s affinity rules may be worse for string fidelity, but BLOB also sacrifices ordinary text/JSON handling. `TEXT` appears to be the relevant comparison. The evidence supports rejecting a fake cross-dialect `JSONB` declaration, not every comparison with BLOB.

14. **The 37 existing text JSON columns are precedent, not proof.** Their lack of indexes does not show that future operational fields should remain unindexed. The packet correctly supplies the stronger fact: cross-dialect indexed queries require named extracted columns.

15. **The framing conflates three authorizations.** Tenant permission to use a connection, provider authentication, and provider-side scopes/authorization are separate. Calling the first half merely “proving who we are to the service” omits the product’s own use authorization.

16. **“Any external service” and “no bespoke subsystem” are underspecified.** The packet does not define whether this includes non-HTTP transports, browser-cookie automation, hardware keys, streaming sockets, or services that only accept query-string credentials. A safe design cannot promise literal universality.

17. **The URL-secret rule has an unresolved edge.** Some providers return presigned asset URLs or require query authentication. The packet should say whether provider-issued signed URLs count as forbidden. Under a literal reading, those providers cannot be supported without an intermediary or alternate endpoint.

18. **Human-versus-agent policy is missing.** The channels are named, but not confirmation rules, spending limits, delegated authority, impersonation semantics, audit identity, or which actions require human approval.

19. **Important lifecycle requirements are absent.** Rotation, revocation, deletion, key rotation, backup/restore, audit retention, credential testing, webhook verification, rate limits, quotas, cost controls, cancellation, pagination, streaming, and data residency can materially affect the architecture.

20. **Migration feasibility lacks decisive facts.** Row counts, foreign keys, legacy write paths, token mutation frequency, downtime tolerance, database versions, encryption-key access, and rollback requirements are unknown.

21. **The packet nudges toward consolidation.** Emphasizing nine tables, an earlier merge precedent, unused OAuth reuse, and a generic adapter naturally leads witnesses toward a canonical broker/store. A federated broker over intentionally separate stores deserves equal framing.

22. **The question presupposes call-shape/credential recomposability.** Some schemes—request signing, mTLS transport identity, OAuth audience-bound tokens—are coupled to endpoint and request semantics. They remain separable in custody, but only if the composition layer has trusted scheme-specific implementations.

The packet is substantially better than the described earlier version, but it still mixes verified observations, historical claims, risk inferences, and evaluative language without consistently labeling which is which.
---

## PARTICIPANT: Sonnet 5 in-host subagent (the only one with repository access) — Round 2 verbatim

ACK_PACKET_RECEIVED CTX-EXT-SVC-20260902-R2B -- I received the packet and will work on it.

Headline finding before the design: the packet's own "corrected" AAD count is still wrong. It says three stores seal without AAD; I verified five do (evidence in Section E). That finding also reshapes the migration plan in Section A.2/B.

## A.1 Framing

The two problems are separable as a matter of *types*, but they are not independent as a matter of *runtime behavior*, and treating them as fully independent is the mistake I'd guess a first-pass design makes.

Evidence this separation already works in this codebase: `VendorAdapter.buildRequest(ctx, credentials)` in Jini's dispatch engine takes `credentials: ProviderCredentials` as a plain resolved value (`{apiKey?, baseUrl?, model?}`). The adapter has no idea whether that value came from a sealed DB row, an OAuth refresh, or a Composio broker call — it just consumes a shape. That's real, running proof that "how we authenticate" and "how we shape the call" can be two phases with a narrow value passed between them.

Where they can't be fully separated: mid-call auth failure. A call-shape layer that doesn't know anything about auth can't distinguish "this vendor is down" from "my token just expired" — both show up as a non-2xx response. So the composition seam isn't optional; it has to exist somewhere. I address it as one narrow hook, not a merger of the two models.

I also want to name a third option the packet's framing skips over: Composio proves that "the product holds no credential and delegates the whole call" is a legitimate third architecture, not a degenerate case of either half. I treat it as a first-class variant in the credential model rather than folding it into "OAuth2".

## A.2 The credential model

Auth variants grounded in what's already built or already needed:

- `none` — public endpoint.
- `bearer` — static long-lived token. This is what `mediaProviderCredentials`, most of `vendorCredentialSets`, and `siteAssistantCredentials` are today.
- `basic` — username + token. Already built and running: `custom-credentials/credentialed-request.ts`'s `buildAuthorizationHeader` sends Basic *iff* the saved connection carries a `username`, else Bearer — confirmed live in that file's own comment ("`Bearer` gets 401, `-u "user:token"` gets 200"). name.com is the real-world instance of this.
- `oauth2` — authorization_code, device_code, refresh, proactive skew-based renewal. Fully built in `platform/oauth/` but — verified — its only importer is `oauth/index.ts` itself; nothing outside MCP federation consumes `token-refresh.ts`. This is the single biggest piece of unclaimed, already-correct infrastructure in the whole packet.
- `hmac` / request-signing — needed for S3-compatible object storage and not represented anywhere in the nine tables today. This is a real gap: AWS SigV4-style signing computes a per-request signature from method+path+headers+body, which doesn't fit "attach one static header" at all — it has to be a call-shape concern that *consumes* a raw key pair, not a credential that *produces* a header.
- `broker-delegated` — Composio. The caller never holds the secret; Composio executes the outbound call. Already running.
- `service_account` / self-minted JWT — genuinely missing and worth naming: GitHub App installation tokens, GCP service-account JSON, and Google Workspace domain-wide delegation all follow "sign a short-lived JWT with a private key, exchange it for an hour-long access token," which is neither OAuth2 (no user consent, no refresh token) nor a static bearer (the exchanged token expires but there is no refresh token to rotate — you re-mint the JWT). Flagging, not building.

```ts
export type AuthKind = "none" | "bearer" | "basic" | "oauth2" | "hmac" | "broker" | "service_account";

export type CredentialMaterial =
  | { kind: "none" }
  | { kind: "bearer"; token: string }
  | { kind: "basic"; username: string; token: string }
  | { kind: "oauth2"; accessToken: string; refreshToken: string | null; tokenType: "Bearer" | string; scope: string | null }
  | { kind: "hmac"; accessKeyId: string; secretAccessKey: string; region: string | null }
  | { kind: "broker"; connectorId: string; brokerAccountId: string }
  | { kind: "service_account"; privateKeyPem: string; clientEmail: string; keyId: string };

export interface CredentialRecord {
  readonly id: UUID;
  readonly workspaceId: UUID;
  readonly principalId: UUID | null;
  readonly providerId: string;
  readonly label: string;
  readonly authKind: AuthKind;
  readonly expiresAt: ISODateTime | null;
  readonly maskedTail: string | null;   // NOT stored for write-capable credentials
  readonly needsReauth: boolean;
  readonly sealed: SealedSecret | null; // whole material as ONE ciphertext, AAD = workspaceId:providerId:id
}
```

The whole `CredentialMaterial` object is sealed as ONE blob, never split into per-field encrypted columns — matching every existing sealed-credential table's own documented reasoning, since some vendors need companion fields (owner/repo, teamId, accountId) alongside the token.

Plaintext columns are exactly what the read/list/filter UI and the refresh scheduler need WITHOUT decrypting, mirroring `token-refresh.ts`'s own "expiry is checkable without unsealing" contract. `needsReauth` is set by a terminal refresh failure (invalid_grant), never a transient one — that rule is reused verbatim from `token-refresh.ts`.

## A.3 The call-shape model

Sync: keep `VendorAdapter` exactly as it is. It already does its job.

Long-running:

```ts
export interface AsyncVendorAdapter<SubmitMeta = undefined, PollMeta = SubmitMeta> {
  readonly requireCredential?: VendorCredentialGuard;
  readonly buildSubmitRequest: (ctx: RenderContext, credentials: ProviderCredentials) => VendorRequest<SubmitMeta>;
  readonly parseSubmitResponse: (resp: Response, ctx: RenderContext, request: VendorRequest<SubmitMeta>)
    => Promise<{ done: true; result: RenderResult } | { done: false; providerJobId: string; poll: PollMeta }>;
  readonly buildPollRequest: (providerJobId: string, poll: PollMeta, credentials: ProviderCredentials) => VendorRequest<PollMeta>;
  readonly parsePollResponse: (resp: Response, ctx: RenderContext, request: VendorRequest<PollMeta>) => Promise<PollOutcome>;
  readonly cancel?: (providerJobId: string, credentials: ProviderCredentials) => Promise<void>;
}

export type PollOutcome =
  | { status: "pending"; retryAfterMs?: number }
  | { status: "done"; result: RenderResult }
  | { status: "failed"; error: string; retriable: boolean };
```

`parseSubmitResponse` can return a finished result directly, so a usually-fast-but-sometimes-slow vendor doesn't need two adapters. `cancel` is best-effort only, never load-bearing — the deadline sweep is what actually bounds a job; cancel just tries to save money.

Where polling state lives: a persisted row, never process memory. This is a direct lesson from something already verified broken in exactly this shape — Composio's pending-connection map is explicitly documented as in-process and single-process-only, called out as a known limitation, not a pattern to repeat. Video generation's current failure mode is the same bug in a different place: state that exists only inside one open HTTP connection in one process's memory.

Process-restart-mid-poll is irrelevant by construction — the row IS the state. A poll worker on ANY process claims rows via `WHERE status = 'polling' AND next_poll_at <= now()`, the exact claim pattern already indexed twice in this schema (`webhookDeliveries`, `outboxEvents`). Reusing that convention rather than inventing a third.

What bounds a job that never terminates: two independent bounds, not one — `maxAttempts` catches a vendor answering "pending" forever; `deadlineAt` catches a vendor that stops answering at all.

## A.4 Composition

`resolveCredential` hands the call-shape layer either a `ResolvedCredential` (decrypted material, scoped to one call, never persisted past it) or a `BrokerHandle` (no secret at all). Both flow into the same signature position where `ProviderCredentials` sits today.

The other seam, forced by mid-call expiry: dispatch gets exactly one extra optional hook, `refreshAndRetryOnce`, invoked only on 401/403, only for refreshable kinds, capped at one retry.

I do NOT unify credential resolution and call dispatch into one function. Reason: Composio shows a THIRD valid architecture where the split disappears entirely for that vendor category — baking "resolve then call" into one god-interface would make the broker case an awkward special case instead of a first-class one.

## B.2 The resolver interface the caller actually holds

```ts
export type ResolvedAuth =
  | { readonly mode: "direct"; readonly material: CredentialMaterial; readonly credentialId: UUID }
  | { readonly mode: "broker"; readonly handle: BrokerHandle };

export interface CredentialResolver {
  resolve(ref: { workspaceId: UUID; providerId: string; credentialId: UUID }): Promise<ResolvedAuth>;
  forceRefresh(ref: { workspaceId: UUID; providerId: string; credentialId: UUID }): Promise<ResolvedAuth>;
}
```

**Honesty note, because the packet asks this directly and a clean "no" would be a false answer**: for `mode: "direct"`, the caller DOES receive `material`, which contains the actual plaintext secret. This is not a hypothetical weakness I'm introducing; it is the *existing, shipped* pattern. `custom-credentials/store.ts`'s `resolveCustomCredentialByLabel` — the function `credentialed-request.ts` actually calls today — returns a connection whose `token` is plaintext, and the caller builds `Authorization: Bearer ${token}` from it in the same process, and this is treated as correct, reviewed code. I am not fixing that here — I'm preserving it, because the only way not to preserve it is to force every direct-credential vendor through a broker, which fails the packet's own "without a bespoke subsystem each time" constraint, since brokering requires vendor-side onboarding that most of the 18 registered media vendors don't have.

What the design DOES guarantee: the secret never crosses a logging/tool-result/URL boundary. `credentialed-request.ts`'s `AuthFailureDiagnostic` pattern — `schemeSent` + `usernameStored`, never the token — is the model I extend to every auth variant's error path. "Never obtainable" is achievable only for `mode: "broker"`; "never logged/echoed/URL-embedded" is achievable, and already achieved, for direct too.

## B.4 The persisted job row

Real indexed columns: `workspaceId`, `providerId`, `routeKey`, `credentialId` (FK, never the secret), `status`, `attempts`, `nextPollAt`, `deadlineAt`, `lastError`, and `providerJobId` — that last one deliberately NOT buried in JSON, because it is exactly the field a real support ticket needs to filter or join on against the vendor's own dashboard.

Opaque JSON, never queried: `submitMetaJson`, `pollMetaJson`, `resultMetaJson`. Every vendor's PollMeta shape differs (a videoId, a cursor token, a `{pollUrl, expiresAt}` object), so making these real columns is where "config not code" pushback would break.

Indexes: `(status, nextPollAt)` for the poll worker's claim query; `(workspaceId, createdAt)` for the admin list view.

## C. Reasoning trace

**Reusing `token-refresh.ts` instead of writing a new refresh mechanism.** Alternative: build refresh into the new resolver directly. Discarded because the module's own header states the exact bug class a second implementation would reintroduce — rotating single-use refresh tokens, where the loser of a race persists an already-revoked token and kills the connection until a human re-authorizes. Not a bug worth re-deriving when a working documented fix exists.

**Two independent bounds, not one.** Alternative: copy the `webhookDeliveries`/`outboxEvents` pattern verbatim, proven twice already. Discarded because the packet says whether that pattern's *consumer* enforces a dead-letter cutoff is **unverified** — copying an unverified safety property into a NEW table with real money attached is the one place I refused to trust precedent. This is inference, not knowledge: I found `webhookDeliveries.deadAt` exists as a column (weak evidence dead-lettering is modeled) but did not trace whether the consumer sets it correctly.

**Not routing every credential through a broker.** Rejected because it contradicts the codebase's own shipped choice and fails the "no bespoke subsystem" constraint. I judged the packet's phrasing as testing whether I'd notice and address this honestly rather than demanding a "no" — that's an inference about intent, not a fact.

**Most likely wrong decision:** the single job table as THE general operation row for every long-running vendor across every category. I'm inferring, not verifying, that deployment and publish operations fit the same row shape as media generation. I have direct evidence only for media. What would reveal it: finding a deployment or DNS operation whose "not done yet" signal isn't a poll — e.g. a webhook-driven completion, which `webhookDeliveries` already models completely differently (push, not poll). If that's the shape deployment needs, the row needs a `deliveryMode: "poll" | "webhook"` split I did not design.

## D.1 Strongest argument against my own position

The design assumes ONE credential table + ONE adapter registry generalizes across media/publish/deployment/DNS/source-control/object-storage. But the verified state shows the OPPOSITE has been true so far: nine tables exist precisely because each category's owners independently decided their category needed its own shape. A generalist who has never shipped one of these categories designing "the one true table" is exactly the failure mode `dual-read.ts`'s rule warns about implicitly — every category so far has needed its own AAD lineage and its own resolver, and a system that pretends otherwise tends to grow escape hatches until it's nine tables again, just inside one table's JSON blob. Evidence that would change my mind: if the FIRST real migration needs a bespoke per-provider extension to `CredentialMaterial` within the first month, the "one shape fits all" bet is wrong.

## D.2 Failure modes

- **Security:** direct-mode `material` contains a plaintext secret in caller memory, so a single bad `console.log(material)` in ANY future vendor adapter leaks a token exactly the way `AuthFailureDiagnostic` was built to prevent for the 401/403 path. The design covers the error path; it does NOT cover a careless adapter author logging the happy path, and nothing enforces that at compile time.
- **Operational:** the single-retry-on-401 hook could cause a thundering herd if many jobs share one near-simultaneously-expiring credential. `forceRefresh` reuses the single-flight collapse WITHIN one process, but if the poll worker and the submitting process are different processes hitting 401 at the same moment, that's exactly the cross-process race the CAS lease exists for — so this only works if `forceRefresh` is wired to the SAME lease table, which I specified but did not verify exists outside MCP's own storage. That is the most likely place my design fails badly in production.
- **Maintenance:** the two-JSON-blob job row means a schema change to any vendor's poll shape is invisible to the database and to tooling. A support engineer sees `providerJobId` (real column, good) but the poll cursor is opaque unless they know which adapter wrote it.

## D.3 Ranked slate

**Option 1 — recommended: unify credential MODEL, keep credential STORAGE decisions per-category migration.** One record shape and resolver interface, applied to each of the nine legacy tables one migration at a time via the dual-read playbook, never a generic cross-table decrypt. Pro: no big-bang cutover; each migration independently revertible. Con: two systems side by side for a while.

**Option 2 — broker-everything:** force ALL direct credentials through a local signing/proxy service that never hands callers raw bytes, closing the security gap for real instead of documenting it. Pro: actually answers "can a caller obtain raw secret material" with a hard no. Con: an outbound proxy injecting auth for 18+ vendors, and it makes "add a vendor without bespoke work" *harder*, since every `buildRequest` must describe its call declaratively enough for a proxy to inject auth rather than building the header itself.

Ranking criteria: (a) no big-bang migration of live tenant data, (b) no regression to "add a vendor without bespoke work," (c) closes the security gap. Option 1 wins (a) and (b) decisively; Option 2 wins (c). I rank Option 1 first because (a) is the failure mode with irreversible consequences — but this ranking is a values call about which failure is worse, not a technical fact.

Cheapest de-risking test for Option 1: migrate the SMALLEST AAD-having table, `customCredentialSets`, through the new resolver first, and watch whether `CredentialMaterial` needs a vendor-specific escape hatch within that one migration. If it doesn't, the generalization bet holds for at least one real category. If it does, D.1's worry is confirmed early and cheaply.

## D.4 What to build first

The `AsyncVendorAdapter` shape + job row, wired to exactly ONE real vendor — `imagerouter`'s existing `video` route, the one provider already verified to need this. Do NOT touch the credential model for this slice; keep today's existing (no-AAD) media credential resolution unchanged, so the slice tests ONLY the call-shape half.

Observable kill condition: after cutting the video route over to submit-then-poll, deliberately kill the daemon mid-poll and confirm a fresh process's poll worker picks the row back up and completes it without a duplicate provider-side charge. If a restarted process either never claims the orphaned row, or claims it AND the original in-flight submit also completes with both written as separate results, that's the design failing at the one thing it exists to fix.

## E. Packet critique

**The corrected packet is still wrong on the exact fact it was corrected for.** "Three stores seal without AAD" is a verbatim echo of a stale in-code comment (`features/webhooks/ports.ts:95-97`, naming site-credential-store, execution-credential-store, provider-credential-store as "all three sealing into rows with NO AAD"). I traced every `.seal()` call site for all nine tables and the true count is **five**:

- No AAD, verified by reading the actual call, not the doc comment: `siteAssistantCredentials`, `adminExecutionCredentials`, `mediaProviderCredentials` (`provider-credential-store.ts:247`, `sealer.seal({ plaintext: apiKey, key: activeKey })` — no `aad`), `composioConfig` (`composio-config-store.ts:238`, same), `composioConnectorCredentials` (`connector-credential-store.ts:129-133`, same).
- Has AAD, verified via each feature's own `aad.ts` plus the `seal({..., aad})` call site: `publishCredentialSets` (store.ts:254), `sourceControlCredentialSets` (store.ts:231), `customCredentialSets` (store.ts:281), `vendorCredentialSets` (store.ts:336).

The `ports.ts` comment predates the two Composio tables and was never updated when they were added — the packet inherited that staleness by trusting a comment instead of the call sites. This matters concretely: it is not "one more table to fold in later," it is five of nine, so the migration must retrofit AAD onto a *majority* of stores. A design trusting "three" under-scopes this by 40%.

**Minor factual slip:** "platform/connectors/, 7 files" — I count 6 non-test files. Doesn't change the design; flagging because the packet asked me to check counts.

**A framing that leads the witness:** Section B's five required deliverables are phrased as if the credential model and call-shape model definitely produce five *separate* artifacts. That presupposes the "two halves compose narrowly" answer before the framing question is asked. A participant who concluded the two should NOT compose would find B's structure fighting their own answer.

**On the "self-contained, do not call tools" preamble:** this packet instructs the reader to make no tool calls and to disregard any offer of repository access as meant for a different participant. My actual dispatch instructions explicitly granted me repository access as my distinguishing contribution and directed me to check this packet's claims. I followed the dispatch, not the packet, and that is what surfaced the AAD error. Naming this because it is a real tension: if this template is reused for a genuinely tool-less participant, the "ignore repo-access offers" line is correct — but embedded in the same document as a "VERIFIED CURRENT STATE…corrected" section, it means a tool-less participant has no way to know that section is itself still wrong, and no way to check.

**"Nothing else found" is not the honest answer here.** I did not verify every AAD/masked-column claim for `publishCredentialSets` and `sourceControlCredentialSets` to the same call-site rigor I applied to the no-AAD five. I confirmed both have real `aad.ts` files and real `seal({..., aad})` calls, which is the load-bearing fact; I did not re-derive every prose claim in their doc comments. That is a real limit on this critique, not a "nothing found."

---

## PARTICIPANT: Gemini 3.7 Flash — Round 2 verbatim

ACK_PACKET_RECEIVED CTX-EXT-SVC-20260902-R2B -- I received the packet and will work on it.

---

# Architecture Proposal: Unified External Service Integration Engine

---

## SECTION A: THE DESIGN

### 1. Problem Framing: Orthogonality & Composition

The challenge of external service integration in a multi-tenant, agent-and-human-facing platform decomposes into two strictly orthogonal concerns connected by an ephemeral contract:

```
┌────────────────────────────────────────────────────────┐
│               1. CREDENTIAL / IDENTITY                 │
│  "Who is authorized to act, and how is proof minted?"   │
│  • Tenant / Principal Scoping                          │
│  • Envelope Encryption + AAD lineage                   │
│  • Token Lifecycle, CAS Refresh & Skew Management      │
└──────────────────────────┬─────────────────────────────┘
                           │ Ephemeral Signer / Token Lease
                           ▼
┌────────────────────────────────────────────────────────┐
│                 3. DISPATCH PIPELINE                   │
│  "Inject identity proof, enforce timeouts, handle 401" │
└──────────────────────────▲─────────────────────────────┘
                           │ Protocol Contract (Request / Parse)
┌──────────────────────────┴─────────────────────────────┐
│                 2. CALL SHAPE / PROTOCOL               │
│  "What wire dialect does the third party speak?"       │
│  • Request serialization & URL construction            │
│  • Sync vs Async-Poll vs Webhook state machines        │
│  • SSRF-safe secondary asset acquisition & parsing     │
└────────────────────────────────────────────────────────┘
```

#### Why are they orthogonal?
1. **Change cadence differs**: Wire shapes (endpoints, payload formats) evolve with vendor API versions. Credential lifecycle (OAuth2 grant exchange, key rotation, AAD encryption) evolves with security posture and platform identity architecture.
2. **Cardinality is M:N**: A single OAuth2 credential set (e.g., Google Workspace) may back 5 distinct call shapes (Drive upload, Docs edit, Gmail send, Calendar event, Vertex AI inference). Conversely, a single call shape (e.g., OpenAI chat completions) can be targeted using a Direct API Key, an Azure Managed Identity Bearer token, a Cloudflare AI Gateway proxy, or a local self-hosted instance with No-Auth.
3. **Execution safety**: An adapter responsible for shaping JSON payloads must **never** touch encryption keys, raw OAuth client secrets, or database transaction locks. It must merely receive an abstract `RequestSigner` or an ephemeral token.

#### Why a unified engine is essential (and where unifications fail)
- **Where naive unifications fail**: Attempting to force every external interaction into a single monolithic schema (e.g., standardizing on Composio or forcing all vendors to be MCP servers) creates lowest-common-denominator latency, single-process memory bottlenecks, and vendor lock-in.
- **Where unification succeeds**: Unifying the **lifecycle contracts** (how secrets are decrypted and refreshed; how jobs are leased and polled; how timeouts and SSRF guards are applied) while keeping **payload adapters modular and stateless**.

---

### 2. The Credential Model

#### 2.1 Supported Auth Variants
The credential store must support a closed, strictly typed discriminated union of authentication schemes:
1. `none`: Public APIs, deterministic test stubs, or internally proxied services.
2. `bearer`: Static API keys, Personal Access Tokens (PATs), or long-lived JWTs injected via `Authorization: Bearer <token>`.
3. `basic`: `username:password` or `username:token` encoded as Base64, injected via `Authorization: Basic <base64>`. Disallows `user:pass@url` formatting.
4. `api_key`: Keys injected into arbitrary custom headers (e.g., `X-API-Key`, `api-key`) or query parameters (e.g., `?api_key=`).
5. `oauth2`: Authorization Code or Client Credentials flows with `accessToken`, `refreshToken`, `tokenEndpoint`, `expiresAt`, `clientId`, `clientSecretRef`, and `scopes`.
6. `request_signing_hmac`: AWS SigV4, GitHub Webhook signatures, or custom HMAC-SHA256 request signing requiring access to raw request bytes, timestamp, and signature header computation.
7. `custom_headers`: Multi-header static secrets (e.g., Datadog `DD-API-KEY` + `DD-APPLICATION-KEY`).

#### 2.2 Token Expiry, Proactive Refresh, and Cross-Process Leases
To eliminate the dual-refresh revocation vulnerability identified in `platform/oauth/token-refresh.ts`, token refresh is decoupled from adapter invocation:
- **Proactive Refresh Window**: Tokens are evaluated before dispatch. If `expiresAt - now() <= SKEW_TOLERANCE_MS` (default 5 minutes / 300,000ms), a refresh is triggered *before* making the request.
- **Distributed CAS Refresh Lease**: 
  - When refresh is required, the worker attempts an atomic `UPDATE credentials SET refresh_lease_until = :leaseUntil, refresh_worker_id = :workerId WHERE id = :id AND (refresh_lease_until IS NULL OR refresh_lease_until < :now)`.
  - **Winner**: Acquires the lease, executes the refresh grant against the provider `tokenEndpoint`, writes the new ciphertext and `expiresAt`, and clears the lease.
  - **Loser (concurrent worker)**: Enters a retry wait loop (backoff with jitter, polling every 250ms for up to 10s) until the winner updates the row and clears the lease, then reads the newly minted token.
- **Mid-Call 401 Expiry Handling**:
  - If a provider rejects an unexpired token with `401 Unauthorized` (e.g., manual revocation, clock drift, or internal vendor session invalidation), the dispatch pipeline marks the cached/read token as stale, forces an immediate CAS lease acquisition for refresh, retries the refresh grant once, and repeats the outbound request. If the refresh fails or returns 401, the credential status is flipped to `NEEDS_REAUTH` and the caller receives a structured diagnostic.

#### 2.3 Scoping & Multi-Tenancy
Every credential row enforces a strict hierarchy:
- Primary Scope: `workspaceId` (Tenant boundary).
- Optional Secondary Principal Scope: `principalId` (User / Agent boundary, nullable).
- Target Provider Identity: `providerId` (e.g., `github`, `openai`, `replicate`, `custom_webhook`).
- Key Identifier / Alias: `credentialKey` (allows multiple accounts per workspace, e.g., `prod-deploy-key` vs `staging-deploy-key`).

#### 2.4 Cryptographic Envelope & AAD Lineage
Every encrypted column is an envelope containing:
`{ ciphertext: string, iv: string, authTag: string, keyVersion: number }`
- **Authenticated Additional Data (AAD)**: Every encryption and decryption operation **must** construct AAD binding the tenant context and the specific database record:
  $$\text{AAD} = \text{UTF8}(\text{workspaceId} + ":" + (\text{principalId} \parallel "\text{global}") + ":" + \text{providerId} + ":" + \text{credentialId})$$
- **Hard Rule**: Ciphertext cannot be moved between rows, tenants, or providers without failing AES-256-GCM / ChaCha20-Poly1305 authentication.

#### 2.5 Migration Off 9 Live Credential Stores
Per the hard-won rule in `vendor-credentials/dual-read.ts`, **we do not write a generic decrypt-all script**. Ciphertext auth tags verify only against their original table lineage and legacy AAD.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        LEGACY STORES (9 TABLES)                        │
│  [siteAssistant] [adminExecution] [sourceControl] [mediaProvider] ...  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                       1. Encapsulated Legacy Resolvers
                       (Each preserves legacy AAD lineage)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     UNIFIED CREDENTIAL SERVICE                         │
│                    (Dual-Read / Dual-Write Seam)                       │
│                                                                        │
│  Read Flow:                                                            │
│  1. Check `unified_credentials`                                        │
│  2. If missing -> Call Legacy Store Resolver -> Re-seal with Strict AAD│
│     -> Upsert into `unified_credentials`                               │
│                                                                        │
│  Write Flow:                                                           │
│  1. Write to `unified_credentials` with new AAD                        │
│  2. Write to Legacy Store (during transition phase only)               │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│            TARGET: `unified_credentials` (Single Table)                │
│  • Enforced AAD on 100% of rows (remediating the 3 legacy gaps)       │
│  • Strict dialect-safe schema                                          │
└────────────────────────────────────────────────────────────────────────┘
```

**Migration Execution Phases**:
1. **Phase 1: Zero-Downtime Facade**: Introduce `UnifiedCredentialResolver`. It wraps the new `unified_credentials` table and registers dedicated, isolated read adapters for all 9 legacy stores.
2. **Phase 2: Lazy Backfill on Read & Dual-Write**:
   - Reads: If found in `unified_credentials`, decrypt with new AAD. If missing, read from legacy store using legacy decryptor, immediately encrypt with new AAD, and write to `unified_credentials`.
   - Writes: Write to both `unified_credentials` and legacy tables.
3. **Phase 3: Active Background Re-sealing**: A background worker scans remaining legacy rows, invokes each store's native decryptor, and upserts them into `unified_credentials`.
4. **Phase 4: Deprecate Legacy Stores**: Sever legacy write paths, drop the 9 legacy tables via standalone database migrations. The 3 stores that previously lacked AAD (`siteAssistantCredentials`, `adminExecutionCredentials`, `mediaProviderCredentials`) are now fully protected with AAD in `unified_credentials`.

---

### 3. The Call-Shape Model

#### 3.1 Synchronous vs. Long-Running Asynchronous Execution
External API interactions fall into three operational topologies:
1. **Immediate Synchronous**: Request $\rightarrow$ Response (e.g., DNS record update, quick text completion, file deletion). Max duration bounded (e.g., 15s - 30s).
2. **Asynchronous Polling (Submit $\rightarrow$ Poll $\rightarrow$ Complete)**: Request $\rightarrow$ `JobId` $\rightarrow$ Repeated status checks $\rightarrow$ Result (e.g., Replicate/Runway video generation, long LLM fine-tuning, bulk exports).
3. **Asynchronous Webhook / Callback**: Request $\rightarrow$ Correlation Token $\rightarrow$ Return $\rightarrow$ Incoming webhook triggers continuation.

The architecture directly addresses the **10-minute video hanging connection problem** by mandating that any vendor operation capable of exceeding 15 seconds **must** implement the `PollingAdapter` contract, transforming dangerous connection-holding into resilient, resumable state machine transitions.

```
                      ┌────────────────────────────┐
                      │    Outbound Dispatcher     │
                      └─────────────┬──────────────┘
                                    │ Submit Job
                                    ▼
                      ┌────────────────────────────┐
                      │ External Service Provider  │
                      │ Returns: { externalId: X } │
                      └─────────────┬──────────────┘
                                    │
                                    ▼
                      ┌────────────────────────────┐
                      │  Persist `external_jobs`   │
                      │  status: 'POLLING'         │
                      │  next_poll_at: now() + 5s  │
                      └─────────────┬──────────────┘
                                    │
         ┌──────────────────────────┴──────────────────────────┐
         │                                                     │
         ▼ (Every tick: poll due jobs)                         ▼ (Worker Crash / Restart)
┌─────────────────────────────────┐                 ┌─────────────────────────────┐
│      Job Polling Worker         │                 │  Orphan Recovery / Lease    │
│ 1. Acquire CAS Lease on Job     │                 │ If lease_expires_at < now() │
│ 2. Call `adapter.poll(state)`   │                 │ Reset lease, assign worker  │
│ 3. Update status:               │                 └─────────────────────────────┘
│    • PENDING -> set next_poll_at│
│    • SUCCESS -> parse & finalize│
│    • FAILED  -> dead-letter     │
└─────────────────────────────────┘
```

#### 3.2 Where Polling State Lives
Polling state lives in a dedicated, dialect-safe relational table: `external_service_jobs`.
- Indexed query paths use real relational columns: `status`, `next_poll_at`, `lease_expires_at`, `workspace_id`.
- Adapter-specific resumption tokens, external IDs, and scratchpads live in `continuation_state_json` (unindexed text).

#### 3.3 Process Restraints, Restarts & Crash Recovery
- **Distributed Job Leasing**: When a worker polls a job, it performs an atomic lease:
  `UPDATE external_service_jobs SET lease_worker_id = :workerId, lease_expires_at = :leaseUntil WHERE id = :id AND (lease_expires_at IS NULL OR lease_expires_at < :now)`
- **Crash Invariance**: If a container/process dies mid-poll, `lease_expires_at` (set to 60 seconds) naturally lapses. Another worker picks up the job on the next tick without double-executing the submission.
- **Idempotent Continuation**: The adapter receives the stored `continuationState` and external job ID; it makes a read-only poll request to the vendor.

#### 3.4 Bounding Jobs That Never Terminate
To prevent infinite retry loops and runaway compute costs, every long-running job enforces three hard bounds:
1. `hard_timeout_at` (Absolute Deadline): Defaults to 30–60 minutes depending on provider capability. Once `now() > hard_timeout_at`, the job transitions immediately to `TIMED_OUT` (Dead Letter), and an optional cancellation webhook/request is sent to the provider.
2. `max_attempts` & `attempt_count`: If poll attempts exceed the threshold (e.g., 120 attempts), the job is aborted.
3. `poll_interval_backoff`: Polling intervals back off dynamically (e.g., 2s $\rightarrow$ 5s $\rightarrow$ 10s $\rightarrow$ 30s) to avoid vendor rate limits.
4. **Abort Signals & HTTP Engine Backstop**: Every single HTTP request passes an explicit `AbortSignal` with a strict socket/read timeout (e.g., 15 seconds for poll calls, 30 seconds for submit calls). No raw HTTP call is ever unbounded.

---

### 4. How the Two Halves Compose

The two halves compose via an **Inversion-of-Control Dispatch Engine**. The caller and the adapter **never hold raw credentials**.

```
                        ┌────────────────────────┐
                        │   Caller (UI / Agent)  │
                        └───────────┬────────────┘
                                    │ dispatch(route, payload)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         DISPATCH CONTROLLER                            │
│                                                                        │
│ 1. Lookup Adapter by `routeKey` & `providerId`                         │
│ 2. Check required credential policy                                    │
│ 3. Resolve Credential via `CredentialBroker`                           │
│    ├─ Check Token Skew -> CAS Refresh if needed                        │
│    └─ Produce Ephemeral `RequestSigner`                                │
│ 4. `adapter.buildRequest(payload, signer.getPublicContext())`          │
│ 5. `signer.applyAuth(rawRequest)` (Injects headers/signatures safely)  │
│ 6. Outbound HTTP Execution (Bounded Timeout, SSRF Protection)          │
│    ├─ 401 Unauthorized? -> Invalidate Token, Force Refresh, Retry Once │
│    └─ Network Error / 5xx? -> Apply Retry Policy                       │
│ 7. `adapter.parseResponse(rawResponse)`                                │
│    ├─ Done -> Return Domain Result                                     │
│    └─ Async Pending -> Persist Job Record to `external_service_jobs`   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                        ┌───────────┴────────────┐
                        │   Structured Result    │
                        │ (No secrets in trace)  │
                        └────────────────────────┘
```

---

## SECTION B: THE IMPLEMENTATION

### 1. The Credential Record & Schema Types

```typescript
// ============================================================================
// 1. CREDENTIAL MODEL & TYPES
// ============================================================================

export type AuthScheme = 
  | 'none'
  | 'bearer'
  | 'basic'
  | 'api_key'
  | 'oauth2'
  | 'request_signing_hmac'
  | 'custom_headers';

export interface EncryptedPayload {
  readonly ciphertext: string;
  readonly iv: string;
  readonly authTag: string;
  readonly keyVersion: number;
}

export type ApiKeyLocation = 'header' | 'query';

export interface BaseAuthSecretMap {
  none: Record<string, never>;
  bearer: {
    readonly token: string;
  };
  basic: {
    readonly username: string;
    readonly password?: string;
    readonly token?: string;
  };
  api_key: {
    readonly keyName: string;
    readonly keyValue: string;
    readonly location: ApiKeyLocation;
  };
  oauth2: {
    readonly accessToken: string;
    readonly refreshToken?: string;
    readonly clientId?: string;
    readonly clientSecret?: string;
    readonly tokenEndpoint: string;
    readonly scopes?: readonly string[];
  };
  request_signing_hmac: {
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
    readonly region?: string;
    readonly service?: string;
    readonly algorithm: 'AWS4-HMAC-SHA256' | 'HMAC-SHA256';
  };
  custom_headers: {
    readonly headers: Readonly<Record<string, string>>;
  };
}

export type AuthSecrets<T extends AuthScheme = AuthScheme> = BaseAuthSecretMap[T];

export type CredentialStatus = 'ACTIVE' | 'EXPIRED' | 'NEEDS_REAUTH' | 'REVOKED';

export interface UnifiedCredentialRecord<T extends AuthScheme = AuthScheme> {
  readonly id: string;
  readonly workspaceId: string;
  readonly principalId: string | null;
  readonly providerId: string;
  readonly credentialKey: string; // e.g., 'default', 'production-backup'
  readonly authScheme: T;
  readonly status: CredentialStatus;
  readonly expiresAt: Date | null;
  readonly refreshLeaseUntil: Date | null;
  readonly refreshWorkerId: string | null;
  readonly metadataJson: string | null; // Unencrypted non-sensitive metadata (e.g., account username, masked last4)
  readonly encryptedSecrets: EncryptedPayload;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
```

---

### 2. The Resolver & Ephemeral Broker Interface

```typescript
// ============================================================================
// 2. BROKER & REQUEST SIGNER (CALLER NEVER HOLDS RAW PERSISTENT SECRETS)
// ============================================================================

export interface OutboundHttpRequest {
  url: URL;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers: Record<string, string>;
  body?: Uint8Array | string | null;
  signal?: AbortSignal;
}

export interface RequestSigner {
  readonly authScheme: AuthScheme;
  /**
   * Mutates or returns a cloned request with authorization injected.
   * Cleanses headers, disallows double Authorization injection,
   * prevents user:pass in URLs, and computes HMAC signatures if required.
   */
  applyAuth(request: OutboundHttpRequest): Promise<OutboundHttpRequest>;
  
  /**
   * Diagnostic summary that is 100% safe to log. Never contains secret material.
   */
  toSafeDiagnostic(): {
    authScheme: AuthScheme;
    appliedHeaders: string[];
    isTokenExpiringSoon: boolean;
  };
}

export interface CredentialResolutionContext {
  readonly workspaceId: string;
  readonly principalId?: string | null;
  readonly providerId: string;
  readonly credentialKey?: string;
}

export interface ICredentialBroker {
  /**
   * Resolves a credential, performs proactive token refresh if required
   * with cross-process CAS leasing, and returns an ephemeral RequestSigner.
   * The raw secret string is NEVER exposed to the caller.
   */
  getSigner(ctx: CredentialResolutionContext): Promise<RequestSigner>;

  /**
   * Explicitly invalidates a token upon a downstream 401 Unauthorized,
   * forcing a CAS lease refresh on the next request.
   */
  invalidateSession(ctx: CredentialResolutionContext): Promise<void>;
}
```

---

### 3. The Adapter Interface for Long-Running & Synchronous Vendors

```typescript
// ============================================================================
// 3. ADAPTER INTERFACE (SUPPORTING SYNC & LONG-RUNNING ASYNC-POLL)
// ============================================================================

export type AdapterExecutionResult<TOutput> =
  | { readonly kind: 'COMPLETED'; readonly data: TOutput }
  | { 
      readonly kind: 'POLLING_PENDING'; 
      readonly externalJobId: string;
      readonly continuationState: Record<string, unknown>;
      readonly pollAfterSeconds: number;
    }
  | { readonly kind: 'FAILED'; readonly error: string; readonly fatal: boolean };

export interface IServiceAdapter<TPayload, TOutput, TContinuation = Record<string, unknown>> {
  readonly providerId: string;
  readonly routeKey: string;
  readonly defaultTimeoutMs: number;
  readonly requiresAuth: boolean;

  /**
   * Builds the initial outbound HTTP request.
   */
  buildSubmitRequest(
    payload: TPayload, 
    context: { readonly baseUrl?: string }
  ): Promise<OutboundHttpRequest>;

  /**
   * Parses the response from the initial submission.
   * Can return COMPLETED (if fast sync), POLLING_PENDING (if async), or FAILED.
   * Can perform secondary SSRF-safe network fetches if needed.
   */
  parseSubmitResponse(
    response: { readonly status: number; readonly headers: Headers; readonly body: Uint8Array },
    fetcher: (req: OutboundHttpRequest) => Promise<{ status: number; body: Uint8Array }>
  ): Promise<AdapterExecutionResult<TOutput>>;

  /**
   * Builds a polling request to inspect job status on the external service.
   */
  buildPollRequest?(
    externalJobId: string, 
    continuationState: TContinuation
  ): Promise<OutboundHttpRequest>;

  /**
   * Parses a polling response.
   */
  parsePollResponse?(
    response: { readonly status: number; readonly headers: Headers; readonly body: Uint8Array },
    continuationState: TContinuation,
    fetcher: (req: OutboundHttpRequest) => Promise<{ status: number; body: Uint8Array }>
  ): Promise<AdapterExecutionResult<TOutput>>;
}
```

---

### 4. Persisted Job/Operation Schema (Dialect-Agnostic)

This table design is 100% compatible across SQLite, PostgreSQL, and MySQL. It avoids `JSONB` builder traps in SQLite, uses `TEXT` for serializations, and keeps all query filters in explicit, indexed scalar columns.

```sql
-- ============================================================================
-- 4. RELATIONAL SCHEMA DEFINITIONS
-- ============================================================================

-- Unified Credentials Store
CREATE TABLE unified_credentials (
    id VARCHAR(64) PRIMARY KEY NOT NULL,
    workspace_id VARCHAR(64) NOT NULL,
    principal_id VARCHAR(64),
    provider_id VARCHAR(64) NOT NULL,
    credential_key VARCHAR(64) NOT NULL DEFAULT 'default',
    auth_scheme VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, EXPIRED, NEEDS_REAUTH, REVOKED
    expires_at TIMESTAMP NULL,
    refresh_lease_until TIMESTAMP NULL,
    refresh_worker_id VARCHAR(64) NULL,
    metadata_json TEXT NULL,                      -- Masked info, username, non-secret metadata
    encrypted_secrets_json TEXT NOT NULL,         -- Ciphertext, IV, authTag, keyVersion
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Unique index for scoped resolution
CREATE UNIQUE INDEX uq_cred_scope 
ON unified_credentials (workspace_id, COALESCE(principal_id, '__GLOBAL__'), provider_id, credential_key);

-- Index for background token refresh scanner
CREATE INDEX ix_cred_refresh_scan 
ON unified_credentials (status, expires_at);


-- Asynchronous External Service Operations / Jobs Table
CREATE TABLE external_service_jobs (
    id VARCHAR(64) PRIMARY KEY NOT NULL,
    workspace_id VARCHAR(64) NOT NULL,
    provider_id VARCHAR(64) NOT NULL,
    route_key VARCHAR(64) NOT NULL,
    external_job_id VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'POLLING', -- POLLING, COMPLETED, FAILED, TIMED_OUT, CANCELLED
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 120,
    next_poll_at TIMESTAMP NOT NULL,
    lease_expires_at TIMESTAMP NULL,
    lease_worker_id VARCHAR(64) NULL,
    hard_timeout_at TIMESTAMP NOT NULL,
    continuation_state_json TEXT NOT NULL,         -- Unindexed scratchpad / token
    result_data_json TEXT NULL,                    -- Completed payload
    last_error_text TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for the polling job scheduler worker
CREATE INDEX ix_ext_jobs_polling_queue 
ON external_service_jobs (status, next_poll_at, lease_expires_at);

-- Index for workspace lookups
CREATE INDEX ix_ext_jobs_workspace 
ON external_service_jobs (workspace_id, created_at);
```

---

### 5. The Dispatch & Execution Pipeline

```typescript
// ============================================================================
// 5. DISPATCH PIPELINE: AUTH MEETS CALL-SHAPE
// ============================================================================

export class DispatchEngine {
  constructor(
    private readonly credentialBroker: ICredentialBroker,
    private readonly httpClient: (req: OutboundHttpRequest) => Promise<{ status: number; headers: Headers; body: Uint8Array }>,
    private readonly jobStore: {
      persistJob(job: {
        id: string;
        workspaceId: string;
        providerId: string;
        routeKey: string;
        externalJobId: string;
        continuationState: Record<string, unknown>;
        nextPollAt: Date;
        hardTimeoutAt: Date;
      }): Promise<void>;
    }
  ) {}

  public async execute<TPayload, TOutput>(
    adapter: IServiceAdapter<TPayload, TOutput>,
    payload: TPayload,
    ctx: CredentialResolutionContext
  ): Promise<AdapterExecutionResult<TOutput>> {
    // 1. Resolve Auth Signer if required
    let signer: RequestSigner | null = null;
    if (adapter.requiresAuth) {
      signer = await this.credentialBroker.getSigner(ctx);
    }

    // 2. Build Raw Request
    const rawReq = await adapter.buildSubmitRequest(payload, {});
    
    // Set socket/timeout signal
    const abortCtrl = new AbortController();
    const timeoutTimer = setTimeout(() => abortCtrl.abort(), adapter.defaultTimeoutMs || 30_000);
    rawReq.signal = abortCtrl.signal;

    // 3. Apply Auth Injection via Signer
    const signedReq = signer ? await signer.applyAuth(rawReq) : rawReq;

    // 4. Outbound Fetch with Automatic 401 Refresh-Retry
    let res: { status: number; headers: Headers; body: Uint8Array };
    try {
      res = await this.httpClient(signedReq);
      
      // If 401 Unauthorized occurs on an authenticated route, attempt one proactive lease-refresh retry
      if (res.status === 401 && signer && signer.authScheme === 'oauth2') {
        await this.credentialBroker.invalidateSession(ctx);
        const refreshedSigner = await this.credentialBroker.getSigner(ctx);
        const reSignedReq = await refreshedSigner.applyAuth(rawReq);
        res = await this.httpClient(reSignedReq);
      }
    } finally {
      clearTimeout(timeoutTimer);
    }

    // 5. Parse Response via Adapter
    const parsed = await adapter.parseSubmitResponse(res, this.httpClient);

    // 6. Handle Async Polling Transition
    if (parsed.kind === 'POLLING_PENDING') {
      const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const now = Date.now();
      await this.jobStore.persistJob({
        id: jobId,
        workspaceId: ctx.workspaceId,
        providerId: adapter.providerId,
        routeKey: adapter.routeKey,
        externalJobId: parsed.externalJobId,
        continuationState: parsed.continuationState,
        nextPollAt: new Date(now + parsed.pollAfterSeconds * 1000),
        hardTimeoutAt: new Date(now + 30 * 60 * 1000), // 30 min hard ceiling
      });
    }

    return parsed;
  }
}
```

---

## SECTION C: THE REASONING TRACE

| Decision | What Was Chosen | Alternative Considered & Discarded | Reason for Choice / Deciding Factor |
|---|---|---|---|
| **D1: Secret Exposure to Adapters** | Inversion-of-Control `RequestSigner` interface. Adapters never touch raw API keys or decrypt tokens. | Passing decrypted `AuthSecrets` directly into `adapter.buildRequest(payload, secrets)`. | Eliminates accidental secret logging in adapters, prevents tool results from leaking secrets to AI agents, and encapsulates HMAC signing and header validation in a single audited module. |
| **D2: Async Long-Running Handling** | Submit $\rightarrow$ Poll state machine backed by `external_service_jobs` table. | Holding HTTP connection open with streaming / chunked transfer (current video vendor approach). | Long HTTP connections fail on minor network hiccups, stall worker processes, waste pool capacity, and cause duplicate spend on naive retry. |
| **D3: Database JSON Strategy** | Real relational indexed columns for query filters; unindexed `TEXT` for JSON payloads. | Using SQLite `JSONB` or Drizzle custom types with binary coercion. | SQLite `JSONB` defaults to `NUMERIC` affinity which corrupts string data. SQLite does not have JSON indexing like Postgres without generated columns. |
| **D4: Legacy Store Migration** | Dual-read facade with isolated legacy decrypters and progressive AAD re-sealing. | Direct database migration script running a single decryption algorithm across all 9 tables. | Hard-won rule from `vendor-credentials/dual-read.ts`: Ciphertext auth tags verify *only* against their exact legacy AAD lineage. A generic decryptor breaks on table-specific AAD. |
| **D5: Token Refresh Coordination** | Distributed CAS lease with proactive skew buffer. | In-memory token cache with locks; or just-in-time refresh upon 401 only. | In-memory lock is single-process-only (breaking multi-worker setups). JIT on 401 causes user-facing latency spikes and race conditions with providers that rotate refresh tokens on each exchange. |

### Constraints Evaluated: Forced Hand vs. Judged Irrelevant
- **Forced Hand**:
  1. *SQLite NUMERIC affinity bug*: Dictated that all scheduling columns (`next_poll_at`, `status`, `attempt_count`) MUST be native scalar columns, not nested inside JSON documents.
  2. *Single-process Composio limitation*: Proved that any in-memory OAuth or connection mapping fails in scaled environments; all coordination leases MUST live in the database.
  3. *AAD mismatch across legacy stores*: Dictated an encapsulated per-table adapter migration strategy rather than a unified SQL migration query.
- **Judged Irrelevant**:
  1. *Declarative JSON-schema request builders*: While attractive for simple REST endpoints, vendors like OpenAI/Replicate require secondary network fetches during parsing (e.g., SSRF-guarded media downloads). The parse step **must** remain a full programmable function.

### Epistemic Trace: Facts vs. Inferences
- `[FACT]`: 3 legacy credential stores lack AAD authentication.
- `[FACT]`: Video generation currently holds open a 10-minute synchronous connection.
- `[FACT]`: SQLite ORM lacks a native select-side hook for JSON binary decoding.
- `[INFERENCE]`: The retry bookkeeping table in production lacks hard dead-letter limits because infinite retries are common in first-pass implementations. We explicitly add `max_attempts` and `hard_timeout_at`.
- `[INFERENCE]`: Composio's single-process pending map means Composio connector OAuth is currently unsafe across horizontal worker tiers.

### Most Vulnerable Decision & Validation
- **Vulnerable Decision**: Consolidating all auth variants into a single `unified_credentials` table with a discriminated JSON payload rather than maintaining polymorphic sub-tables.
- **What Would Reveal Failure**: High lock contention or large row bloat on `unified_credentials` during high-frequency parallel agent tool executions.
- **Detection**: Monitor Postgres/SQLite write-lock wait durations on `unified_credentials` updates during peak concurrency.

---

## SECTION D: ADVERSARIAL REQUIREMENTS

### 1. Strongest Arguments Against This Design & What Would Change My Mind
- **Counter-Argument**: *Over-engineering for simple API keys.* 80% of third-party vendors require only a static Bearer API Key. Creating a multi-tier Broker, CAS lease, and state-machine polling table introduces operational complexity when simple HTTP wrappers would suffice.
- **Evidence That Would Change My Mind**: If 95% of future platform integrations are simple stateless LLM proxy calls with no OAuth refresh or long-running async poll requirements, a lightweight micro-client would be superior.

### 2. Failure Modes & Production Risks

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CRITICAL FAILURE MODES                          │
├───────────────────┬────────────────────────────────────────────────────┤
│ 1. Security       │ SSRF in secondary asset downloading inside         │
│                   │ `parseResponse`. Solved via strict egress CIDR IP  │
│                   │ filtering (blocking 169.254.169.254, RFC1918).     │
├───────────────────┼────────────────────────────────────────────────────┤
│ 2. Operational    │ Distributed Thundering Herd on OAuth Refresh:      │
│                   │ If CAS lease expires while provider is slow,       │
│                   │ second worker refreshes, revoking first token.     │
├───────────────────┼────────────────────────────────────────────────────┤
│ 3. Maintenance    │ Schema migration drift during dual-read phase if   │
│                   │ engineers add new vendor keys to legacy tables.    │
└───────────────────┴────────────────────────────────────────────────────┘
```

#### Detailed Breakdown of Failure Modes:
1. **Security (SSRF in Secondary Fetch)**: A vendor response provides a redirect or secondary asset URL pointing to cloud metadata (`http://169.254.169.254/latest/meta-data/`). If `parseResponse` blindly calls `fetcher(url)`, secrets leak. *Remedy: The injected `fetcher` must resolve DNS and enforce private IP blocking.*
2. **Operational (Worker Zombie Lease)**: A worker holding a polling lease hangs due to event-loop starvation. The lease expires, a second worker picks it up, both complete and trigger duplicate downstream side-effects. *Remedy: Idempotent status check before writing final completed result.*
3. **Maintenance (Dual-Read Deadlock)**: A new engineer bypasses the `UnifiedCredentialResolver` and writes directly to an old table without new AAD. *Remedy: Linter / architectural test banning direct imports of legacy table schemas.*

---

### 3. Ranked Slate of Architectural Options

| Rank | Strategy | Description | Pros | Cons |
|---|---|---|---|---|
| **#1 (Recommended)** | **Unified Broker + Adapter Engine** | Unified encrypted credential store with AAD, ephemeral request signer, and decoupled async poll scheduler. | Completely eliminates memory leaks, fixes 10-min hangs, scales horizontally, guarantees zero secret leakage. | Requires dual-read migration phase and schema consolidation. |
| **#2** | **Externalized Broker (Composio / Vault Only)** | Delegate 100% of credentials and outbound dispatch to a third-party managed proxy (Composio/Vault). | Zero internal credential storage schema; offloads OAuth maintenance. | Vendor lock-in, recurring per-call cost, increased egress latency, does not solve custom internal adapters. |
| **#3** | **Status-Quo Patching** | Keep 9 tables as-is; add polling loops directly inside individual vendor files. | Quickest initial delivery; no schema migrations. | Tech debt multiplies; AAD security holes remain; worker restarts crash long jobs. |

#### Ranking Criteria:
1. **Security & Cryptographic Correctness**: Enforced AAD and zero secret leakage to UI/AI.
2. **System Resilience**: Crash-proof long-running jobs and multi-process safety.
3. **Extensibility**: Speed of adding new vendors without bespoke subsystems.

#### Cheapest De-Risking Test:
Build the `RequestSigner` interface and benchmark it against a mock OAuth2 provider simulating token expiry under 50 concurrent worker threads. If CAS leasing prevents 100% of double-refresh collisions, the core architecture is verified.

---

### 4. What to Build First (The Kill-Slice)

#### The Smallest Slice:
Implement the **Async-Polling Video Adapter** on top of the new `external_service_jobs` table and `DispatchEngine`.

#### The Observable Kill Condition:
Simulate a worker process crash (`SIGKILL`) 30 seconds into an 8-minute video generation job. 
- **PASS**: A secondary worker picks up the job after `lease_expires_at` lapses, resumes polling without re-submitting the generation or double-spending credits, and delivers the finished video.
- **KILL THE DESIGN**: If the recovery causes duplicate job creation on the external provider, corrupts the state JSON, or leaves the job permanently orphaned in `POLLING` status.

---

## SECTION E: PACKET CRITIQUE & ASSUMPTION AUDIT

1. **False Equivalence of Composio vs. Internal Dispatch**: The packet notes that Composio is already running and brokers calls without callers holding credentials, but fails to highlight that Composio's single-process pending-connection map makes it incompatible with a multi-tenant, horizontally scaled worker fleet. Composio cannot be the foundational model for core platform dispatch without an external session cluster.
2. **The AAD Gap Minimization**: The packet verified that 3 stores lack AAD. This is not merely a schema discrepancy; it is a **critical cryptographic vulnerability** allowing ciphertext transplant attacks between workspaces. The prompt treats it as a storage difference rather than an urgent security remediation requirement.
3. **The Adapter Engine Stagnation Paradox**: The packet notes that 12 provider files registering ~18 routes were "imported nowhere by the applications until 2026-09-02." This indicates that the previous dispatch engine failed because its synchronous-only contract (`ONE fetch`) could not support real-world workflows like 10-minute video generation. Building a unified engine without native async-polling guarantees immediate abandonment by product engineers.
4. **SQLite JSONB Misconception**: The packet correctly warns against `JSONB` in SQLite due to `NUMERIC` affinity coercion. This proves that any design attempting to place job status, attempt counts, or lease timers inside a generic JSON blob is fundamentally flawed for cross-dialect deployments.

---

---

## PARTICIPANT: Gemini 3.1 Pro — Round 2 verbatim

ACK_PACKET_RECEIVED CTX-EXT-SVC-20260902-R2B -- I received the packet and will work on it.

## A. The Design

### 1. Problem Framing
The core problem is not building a single god-interface to talk to the internet, but rather successfully decoupling **Authorization State** (who we are) from **Integration Execution** (what we are doing and how long it takes). 

Currently, the system conflates these concerns, leading to brittle synchronous calls, fragmented credential stores, and scattered AAD encryption standards. A unified architecture must treat an outbound service call as an asynchronous, stateful job (the **Execution Engine**) that borrows a transiently valid identity from a secure, unified vault (the **Credential Broker**) precisely at the moment of network dispatch. 

### 2. The Credential Model
- **Auth Variants:** The system supports `Bearer`, `Basic`, `OAuth2` (auth code/device code with refresh), `HMAC/Custom Signature`, and `None`. 
- **Scoping & Storage:** All credentials are moved to a single 10th table (`unified_credentials`), scoped by `workspace_id`. We rely on SQLite `text` columns to store JSON configurations, but heavily type them in code. 
- **The Decryption Precedent:** Adhering strictly to the `vendor-credentials/dual-read.ts` precedent, we do **not** build a universal decryptor. The Broker implements a Strategy pattern where each legacy table has a dedicated, read-only resolver that verifies its specific AAD. 
- **Mid-Call Expiry:** Handled exclusively by the Composition layer. If the execution engine receives a `401 Unauthorized`, it pauses the job, requests the Broker to force a token refresh (utilizing the cross-process lease logic ported from the MCP module to prevent thundering herds), and queues a single retry of the network call.
- **Migration Path:** 
  1. Stand up `unified_credentials`.
  2. Broker reads from `unified_credentials` first.
  3. On miss, Broker queries legacy resolvers concurrently.
  4. On legacy hit, Broker decrypts via the legacy path, re-encrypts using the new AAD standard (workspace-scoped), writes to `unified_credentials`, and returns. Legacy tables are drained asynchronously or dynamically on read.

### 3. The Call-Shape Model
We abandon the 10-minute blocking `fetch`. Every vendor interaction is modeled as an asynchronous **State Machine (Job)**.
- **Sync vs. Long-Running:** There is no structural difference. A synchronous call is simply an async job that returns `done` on its first state transition.
- **State Storage:** A `vendor_jobs` table stores the request intent. Because SQLite lacks a native JSON builder and coerces `JSONB`, we store `poll_state_json` as a raw `TEXT` blob. The database engine never queries inside this blob; it only routes the job back to the Adapter.
- **Crash/Restart Mid-Poll:** The job row has `status = 'polling'` and an indexed `next_attempt_at`. If the process crashes, the row remains. A lightweight cron/worker continuously selects jobs where `next_attempt_at <= NOW()` and resumes them.
- **Bounding Infinite Jobs:** Every job requires a hard `timeout_at` (e.g., 24 hours). A reaper process sweeps jobs where `timeout_at <= NOW()` and force-transitions them to `failed`, preventing orphaned zombie jobs.

### 4. Composition
The halves compose via an **Interceptor/Delegation** pattern. The caller (UI/Agent) creates a Job and walks away. The Execution Engine picks up the Job, instantiates the Adapter, and asks it to build a `Request`. The Engine then passes this `Request` to the Credential Broker. The Broker *mutates* the request (injecting headers/signatures) but never hands the raw secret to the Engine or Adapter. The Engine performs the HTTP fetch, catches 401s for refresh, and hands the raw HTTP response back to the Adapter to parse into the next state (`done` or `polling`).

---

## B. The Implementation

```typescript
// 1. The Credential Record Type
type AuthVariant = 
  | { type: 'none' }
  | { type: 'bearer', token: string }
  | { type: 'basic', username: string, password?: string }
  | { type: 'oauth2', accessToken: string, refreshToken?: string, expiresAtMs?: number }
  | { type: 'hmac', key: string, secret: string }; // For AWS/Custom sigs

interface UnifiedCredentialRow {
  id: string;
  workspace_id: string;
  provider_id: string; // e.g., 'github', 'openai'
  auth_type: string;
  config_json_ciphertext: string; // Encrypted AuthVariant
  created_at: number;
}

// 2. The Resolver/Broker Interface
// The caller NEVER obtains raw secret material. They get an Authenticator capable of signing requests.
export interface AuthenticatedRequestSigner {
  // Mutates the fetch Request (adds Authorization header, signs URL, etc.)
  // Returns true if signed, false if no auth needed.
  signRequest(req: Request): Promise<Request>;
}

export interface CredentialBroker {
  // Retrieves the credential and returns a signer. Migrates legacy rows transparently.
  getCredentialSigner(workspaceId: string, providerId: string): Promise<AuthenticatedRequestSigner>;
  
  // Explicitly called by the engine on 401. Uses cross-process compare-and-set to refresh.
  forceRefresh(workspaceId: string, providerId: string): Promise<AuthenticatedRequestSigner>;
}

// 3. The Adapter Interface (handles sync and async)
export type AdapterResponse<T> = 
  | { status: 'done', data: T }
  | { status: 'polling', pollState: unknown, pollAfterMs: number }
  | { status: 'failed', error: Error };

export interface VendorAdapter<TInput, TOutput> {
  requireCredential: boolean;
  
  // Step 1: Initial submission
  buildSubmit(input: TInput): Request;
  parseSubmitResponse(resp: Response): Promise<AdapterResponse<TOutput>>;
  
  // Step 2: Continuation (if parseSubmitResponse returned 'polling')
  buildPoll(pollState: unknown): Request;
  parsePollResponse(resp: Response): Promise<AdapterResponse<TOutput>>;
}

// 4. The Persisted Job Row (SQLite optimized)
interface VendorJobRow {
  id: string;
  workspace_id: string;
  provider_id: string;
  status: 'pending' | 'polling' | 'done' | 'failed';
  
  // INDEXED COLUMNS for the worker sweep
  next_attempt_at: number; 
  timeout_at: number; // Bounds jobs that never terminate
  
  // OPAQUE TEXT BLOBS (SQLite text columns)
  input_json: string;      
  poll_state_json: string | null; 
  result_json: string | null; 
  error_json: string | null;
}

// 5. The Composition Function
export async function executeVendorStep(
  job: VendorJobRow, 
  adapter: VendorAdapter<any, any>, 
  broker: CredentialBroker
): Promise<void> {
  try {
    let req = job.status === 'pending' 
      ? adapter.buildSubmit(JSON.parse(job.input_json))
      : adapter.buildPoll(JSON.parse(job.poll_state_json!));

    if (adapter.requireCredential) {
      const signer = await broker.getCredentialSigner(job.workspace_id, job.provider_id);
      req = await signer.signRequest(req);
    }

    let response = await fetch(req);

    // Mid-call expiry intercept
    if (response.status === 401 && adapter.requireCredential) {
      const newSigner = await broker.forceRefresh(job.workspace_id, job.provider_id);
      // Re-build request to avoid consuming body stream twice on failure
      req = job.status === 'pending' 
        ? adapter.buildSubmit(JSON.parse(job.input_json))
        : adapter.buildPoll(JSON.parse(job.poll_state_json!));
      req = await newSigner.signRequest(req);
      response = await fetch(req);
    }

    const adapterResult = job.status === 'pending'
      ? await adapter.parseSubmitResponse(response)
      : await adapter.parsePollResponse(response);

    // Update job row based on outcome
    if (adapterResult.status === 'done') {
      await updateJobRow(job.id, { status: 'done', result_json: JSON.stringify(adapterResult.data) });
    } else if (adapterResult.status === 'polling') {
      await updateJobRow(job.id, { 
        status: 'polling', 
        poll_state_json: JSON.stringify(adapterResult.pollState),
        next_attempt_at: Date.now() + adapterResult.pollAfterMs 
      });
    } else {
      await updateJobRow(job.id, { status: 'failed', error_json: JSON.stringify(adapterResult.error) });
    }

  } catch (err) {
    await updateJobRow(job.id, { status: 'failed', error_json: JSON.stringify(err) });
  }
}
```

---

## C. The Reasoning Trace

- **Adapter interface separated into `Submit` and `Poll`:** 
  *Alternative discarded:* A single recursive `execute(state)` function.
  *Why:* State machines are easier to debug and persist. A single function hides whether we are initiating a job (POST) or checking it (GET). By explicitly separating them, we allow `pending` and `polling` database states to cleanly map to request builders without complex branching inside the adapter.
- **Broker returns an `AuthenticatedRequestSigner` instead of the secret:**
  *Alternative discarded:* Returning the decrypted string for the adapter to embed.
  *Why:* The packet strictly prohibits leaking secrets. If adapters hold raw strings, they can easily log them or append them to error objects. By forcing a `signRequest(req)` pattern, the credential never exists in the engine's memory space as a raw usable string, preventing accidental leakage.
- **Storing JSON as `TEXT` instead of attempting structural storage:**
  *Constraint forced:* The SQLite constraint explicitly states there is no `jsonb` builder and `JSONB` coerces to NUMERIC. 
  *Why:* To avoid database corruption or impossible queries, we fully treat the payload and state as opaque `TEXT` blobs. We extract *only* `next_attempt_at`, `status`, and `timeout_at` into real indexed columns to support the polling worker.
- **Porting cross-process lease from MCP:**
  *Inferred:* I am assuming the MCP OAuth lease logic is modular enough to be repurposed for the `unified_credentials` table, even though it is currently isolated. If it is hardcoded to MCP data structures, I would have to rewrite the compare-and-set logic.
- **Most likely wrong decision:**
  The `AuthenticatedRequestSigner` assumes all authentication can be applied to a `Request` object (via Headers or URL params). If a vendor requires the API key *inside a deeply nested JSON body payload* (which happens in poorly designed legacy APIs), this model fails, because the `Request` body is already serialized by the time `signRequest` is called.

---

## D. Adversarial Requirements

### 1. Strongest argument against this design
**Argument:** Building a unified Execution Engine and Credential Broker is a massive waste of engineering resources. We already have **Composio** integrated, which solves exactly this problem (auth brokering and unified API shapes). Furthermore, we already have **MCP federation** running. By building a *third* integration framework, we are violating the "no bespoke subsystems" constraint on a macro level. We should instead contribute extensions to our existing MCP/Composio layers. 
**Evidence to change my mind:** If profiling shows Composio's latency is unacceptable for core UI interactions, or if Composio cannot support arbitrary custom vendors without merging upstream PRs, then an in-house engine is justified.

### 2. Failure Modes
- **Production Failure (The Thundering Herd):** If an OAuth token expires, and 50 asynchronous agent jobs wake up simultaneously and attempt a `forceRefresh`, and the cross-process SQLite lease has lock contention or subtle transaction isolation bugs, we will send 50 refresh requests to the vendor. The vendor will revoke the token for abuse, severing the tenant's connection completely requiring manual human intervention.
- **Maintenance Failure:** If we miss migrating even one obscure AAD logic path from the 9 legacy tables, those specific credentials will silently drop during the dual-read phase, causing localized downtime that might not alert globally.

### 3. Ranked Slate of Options
**Option A: The Proposed Architecture (Unified Job Engine + Broker)**
- *Trade-offs:* High upfront cost to build the state machine and dual-read broker. High payoff in operational stability (no dropped 10-min connections).
- *Recommendation:* **#1**. It directly answers the prompt's constraints and respects SQLite's limitations.

**Option B: Polling via MCP Server Abstraction**
- *Trade-offs:* Wraps all external services as local MCP servers. Leverages existing OAuth and federation. *However*, MCP is traditionally synchronous/RPC-based. Shoehorning asynchronous polling into the current MCP protocol might break clients.
- *Recommendation:* **#2**. Excellent for auth reuse, terrible for the long-running video generation use case.

**Option C: Extend the Current Dispatch Engine with Timeouts**
- *Trade-offs:* Keeps the blocking `fetch`, but relies heavily on Node.js async limits. No database job persistence.
- *Recommendation:* **#3 (Discard)**. This fundamentally fails the crash-recovery requirement and does not fix the 10-minute video drop bug.

**Cheapest De-risking Test:**
Before migrating anything, write a generic wrapper around the *existing* 10-minute video generation endpoint using the proposed Job table and Adapter interface. Run it in shadow mode. If the worker successfully resumes a video check after a simulated process SIGKILL, the execution model is proven.

### 4. What to build first
Build the **Credential Broker facade and Table 10** without touching the execution engine. Route the existing synchronous dispatch engine's `requireCredential` call through the new Broker. 
*Observable Killing Result:* If the dual-read logic fails to decrypt legacy `adminExecutionCredentials` (because they use two keys `workspaceId, principalId` and we only passed `workspaceId`), the design is killed and requires an immediate revert, proving our scoping model is too simplistic for the legacy data.

---

## E. Packet Critique

1. **Misleading Pre-supposition (The Problem Divide):** The prompt states: *"Two things must be solved... and they are not the same problem."* This heavily leads the witness into designing a two-layered architecture (Broker + Dispatcher). In reality, for protocols like OAuth2, token refresh often requires an immediate network retry, inextricably linking the credential state to the network execution loop.
2. **Missing Constraint (Pagination vs. Polling):** The verified state details a polling loop for long-running jobs (video generation), but completely omits **pagination**. A design that solves for a single long-running job state machine does not naturally solve for a synchronous stream of paginated data (which also requires multiple HTTP fetches and potential mid-stream auth expiry). 
3. **Contradictory Claim on `adminExecutionCredentials`:** The packet claims `adminExecutionCredentials` are scoped by `(workspaceId, principalId)` (two keys) but explicitly states **No AAD**. If there is no AAD, how are they safely validating the `principalId` boundary during decryption? Either the current encryption is critically vulnerable to ciphertext swapping across principals, or the packet is missing a detail about how the key derivation function incorporates the principal.
4. **Missing Detail on Composio OAuth:** The packet claims Composio is "single-process-only today" because of an "in-process pending-connection map." This is a constraint of *connection initiation* (the OAuth dance), not *credential usage*. The prompt implies we can't use Composio for distributed workers, but workers only need to *use* the token, not initiate the OAuth handshake. This subtly pushes the participant away from relying on Composio.
5. **Human vs Agent Latency:** The constraint "Operable by both a human-driven UI and an AI agent" masks a massive UX conflict. An async Job/Polling model is great for an AI agent, but terrible for a UI that expects a synchronous HTTP POST to return immediate JSON. If the design forces the UI to establish a WebSocket or poll the `vendor_jobs` table for a 200ms task, it degrades the human experience. The packet completely ignores this impedance mismatch.

---

## COORDINATOR (Primary, Opus 5) — Round 2 sketch, withheld from you at the time

# COORDINATOR'S OWN IMPLEMENTATION SKETCH — frozen before dispatch

This is the Coordinator's concrete proposal, published so participants can attack a real design
rather than a preference. Tear it apart.

## 1. Credential record — unify SHAPE, do not assume one table

```ts
/** Scope is a value, never assumed to be `workspaceId`. `adminExecutionCredentials` is already
 *  (workspaceId, principalId), so a single-key scope cannot represent a table that exists today. */
export type CredentialScope =
  | { readonly kind: "workspace"; readonly workspaceId: string }
  | { readonly kind: "principal"; readonly workspaceId: string; readonly principalId: string };

/** Trust tier is a COLUMN, not a schema. This is my answer to the Round 1 disagreement: the nine
 *  tables differ on policy, and policy is data. `maskedTailAllowed` is the concrete thing they
 *  actually disagree about — source-control PATs deliberately keep no masked tail because they
 *  grant write access to a real external account. */
export interface CredentialPolicy {
  readonly tier: "workspace-shared" | "principal-private" | "external-write";
  readonly maskedTailAllowed: boolean;
  readonly aadRequired: boolean;
}

/** OAuth GRANTS (authorization_code / device_code) are acquisition flows and deliberately absent
 *  here — Codex was right in Round 1. This is runtime state only. */
export type AuthMaterial =
  | { readonly kind: "none" }
  | { readonly kind: "bearer"; readonly token: string }
  | { readonly kind: "basic"; readonly username: string; readonly secret: string }
  | { readonly kind: "header"; readonly name: string; readonly value: string }
  | {
      readonly kind: "oauth2";
      readonly accessToken: string;
      readonly refreshToken?: string;
      readonly expiresAt?: string;
      readonly scopes?: readonly string[];
      readonly clientRef: string;
    }
  | {
      /** Deliberately NOT {keyId, secret} — Codex's Round 1 correction. Real signing needs the
       *  algorithm and often region/service/session-token. */
      readonly kind: "signed";
      readonly algo: "aws-sigv4" | "hmac-sha256";
      readonly keyId: string;
      readonly secret: string;
      readonly region?: string;
      readonly service?: string;
      readonly sessionToken?: string;
    }
  | { readonly kind: "brokered"; readonly broker: "composio"; readonly connectedAccountId: string };

export interface CredentialRecord {
  readonly id: string;
  readonly scope: CredentialScope;
  readonly vendorId: string;
  readonly policy: CredentialPolicy;
  readonly material: AuthMaterial;   // sealed at rest; AAD = (scope, id, version, material.kind)
  readonly version: number;
  readonly baseUrl?: string;
}
```

## 2. The seam — an APPLIER, never a secret

This is the load-bearing decision. If the resolver returns a string, request signing is permanently
unrepresentable, because a signature is computed over body + path + timestamp.

```ts
export interface OutboundRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: Uint8Array;
}

/** Callers get this. They never get `AuthMaterial`. */
export type AuthApplier = (req: OutboundRequest) => Promise<OutboundRequest>;

export interface CredentialResolver {
  /** Refresh (with the EXISTING cross-process CAS lease from platform/oauth/token-refresh.ts)
   *  happens inside here, not in the adapter. Generalizing that file is most of the work. */
  applierFor(vendorId: string, scope: CredentialScope): Promise<AuthApplier>;
}
```

`kind: "brokered"` is how Composio composes rather than competes: its applier delegates the outbound
call to Composio; every other variant applies locally. Callers cannot tell the difference, which is
what makes "run both permanently" a coherent answer to Q2 rather than a cop-out.

## 3. Call shape — the adapter returns a STEP, the runtime owns scheduling

Keep `buildRequest`/`parseResponse` for sync vendors. Do not bolt polling onto one function.

```ts
export type AdapterStep<T> =
  | { readonly kind: "complete"; readonly output: T }
  | { readonly kind: "call"; readonly request: OutboundRequest }        // unsigned
  | { readonly kind: "wait"; readonly nextPollAt: string; readonly remoteId: string;
      readonly state: unknown }
  | { readonly kind: "failed"; readonly error: string; readonly retryable: boolean }
  /** Codex's Round 1 contribution, and I think the most important single idea in this debate:
   *  the crash gap between a remote side effect and recording it cannot be closed locally. */
  | { readonly kind: "unknown"; readonly reconciliation: unknown };

export interface OperationAdapter<T> {
  readonly submit: (ctx: RenderContext) => AdapterStep<T>;
  readonly advance: (response: HttpResponse, state: unknown) => AdapterStep<T>;
}
```

Job row — indexed columns for anything scheduled or claimed, `text(*_json)` for the rest (the SQLite
constraint makes this forced, not preferred):

```
external_operations(
  id, scope_json, vendor_id, adapter_name, adapter_version,   -- pinned: in-flight rows must stay readable
  status, remote_id, idempotency_key,
  attempts, max_attempts,                                     -- dead-letter cutoff, NOT optional
  next_poll_at, lease_owner, lease_expires_at, deadline_at,   -- deadline bounds a hung poll sequence
  state_json, error_json, created_at, updated_at
)
INDEX (status, next_poll_at)
```

`max_attempts` and `deadline_at` are present specifically because two Round 1 participants
independently predicted the same failure — jobs that report "still processing" forever and never
terminate. Sonnet explicitly flagged it did **not** verify whether `outboxEvents`' consumer enforces
a cutoff. Do not copy that shape without one.

**Credential freshness across the poll window** (Sonnet's self-critique, which I think is the
sharpest unanswered question): re-resolve the applier on **every** tick via `applierFor`. Never
persist material in `state_json`. The job row stays self-contained about the *operation*; the
credential is always live. This costs one resolver call per tick and removes an entire class of
"stale token in a persisted job" bug.

## 4. Composition, end to end

1. Domain calls an intent port (`generate`, `publish`, `deploy`) — never raw HTTP.
2. Runtime loads/creates the `external_operations` row and claims a lease.
3. `adapter.submit()` or `advance()` returns a step.
4. On `call`, runtime asks the resolver for an applier, applies auth, enforces destination policy
   (origin binding, no auth across an origin-changing redirect), sends.
5. Response goes to `advance()`. `wait` reschedules; `complete` finishes; `unknown` goes to
   reconciliation or a human.
6. Adapter never sees a secret. Resolver never parses a domain response.

## 5. What I would build first, and the kill criteria

Sonnet's slice, not mine: **fix the already-async `imagerouter` video path** (`imagerouter.ts:152`),
because it is genuinely broken in production today rather than synthetic. Add one gate: close or
explicitly accept the three no-AAD stores in writing first, since a new consumer inherited that gap
today and every day makes the retrofit larger.

**Kill criteria:**
- `kill -9` mid-poll, restart → job completes, no duplicate vendor charge, no state that lived only
  in the dead process. Fails ⇒ durable async is not viable in this stack; stay synchronous and cap it.
- Signing cannot be expressed through `AuthApplier` without a special case ⇒ the seam is wrong,
  re-cut before migrating anything.
- A secret appears in any log, persisted row, agent-visible result, or URL ⇒ the applier boundary
  failed and A3-for-everything (or Composio-for-everything) wins instead.
- Migrating ONE store off the old shape takes more than a few days ⇒ the strangler is not viable
  here and A4 (leave the nine alone, unify only the resolver facade) is the honest answer.

---

## COORDINATOR (Primary, Opus 5) — Round 3 position, frozen BEFORE dispatching this packet

# PRIMARY (Opus 5) — Round 3 frozen position

Frozen before dispatching Round 3. Round 3 is informed, so this is disclosed.

## Position changes after reading all five Round 2 answers

**1. I accept the AAD count I got wrong twice.** I reported "one store without AAD," then "three." It is **five**: `provider-credential-store.ts:247`, `composio-config-store.ts:238`,
`connector-credential-store.ts:131`, plus `siteAssistantCredentials` and
`adminExecutionCredentials`. Four have AAD. Both of my wrong numbers came from trusting a doc
comment (`webhooks/ports.ts:95-97`) instead of reading `.seal()` call sites. Codex caught the
epistemics without repo access ("three verified examples is supportable; exactly three is not
demonstrated"); Sonnet caught the fact.

**2. I accept Gemini 3.1 Pro's security finding, which no one else made.**
`adminExecutionCredentials` is scoped `(workspaceId, principalId)` **and** seals without AAD.
That means ciphertext is transplantable **across principals**, not merely across rows — a
privilege-escalation shape, not just a hygiene gap. This is the single most actionable security
finding in three rounds.

**3. I accept that my packet's framing pushed participants away from Composio.** I wrote the
single-process constraint as a property of Composio; Pro correctly separated it: single-process
constrains *connection initiation* (the OAuth dance), not *credential usage*. Workers only need to
use a token. Flash built its "Composio cannot be foundational" ranking on my framing. That is my
error propagating into a participant's conclusion.

## The Round 3 question: can per-vendor code be eliminated?

**My answer: the dichotomy is false, and more importantly it optimizes the wrong axis.**

### The case FOR eliminating per-vendor code
- Most REST vendors genuinely are: URL template + auth + JSON body + a path to the result. A
  declarative spec plausibly covers a large majority.
- Every hand-written adapter is a place a secret can leak. Sonnet named this precisely: the design
  protects the error path, but nothing stops a future adapter author from logging the happy path.
  Fewer adapters, fewer such sites.
- **The real product argument, which is stronger than the engineering one:** a config row can be
  added by a non-engineer, or by an agent, at runtime. Code cannot. That is a capability, not tidiness.
- `custom-image.ts` already proves the tier works for one dialect.

### The case AGAINST
- **This repo already ran the experiment and recorded the result.** `vendor-adapter.ts`'s own header
  says `parseResponse` stays a full function because real vendors need a *second network call inside
  parsing* — SenseAudio's SSRF-guarded asset download, AIHubMix's provider-native redirect — which
  "a purely declarative parser DSL can't express without becoming its own bespoke escape hatch
  anyway." That is empirical, in-repo, and pre-dates this debate.
- The failure mode is not expressiveness, it is **erosion**: the config grows conditionals, then
  templating, then loops, and becomes a programming language with no type checker, no tests, no
  debugger, and no stack traces. All four participants independently predicted this in Round 1.
- Debuggability asymmetry: when a vendor breaks at 2am, a typed adapter yields a stack trace; a JSON
  spec yields a silently wrong answer.

### Where I actually land

Not "code vs config" but **what fraction of vendors need no code, and what happens to the rest.**
Two tiers, and one rule that decides whether it works:

- Tier A — declarative spec for the common shape (URL, method, body template, auth ref, result path,
  poll rule). Addable at runtime, no deploy.
- Tier B — typed adapter for everything else.
- **The rule: Tier B must be a first-class, unembarrassing path.** If Tier A is framed as the
  "right" way, engineers will contort a config to avoid admitting they need code, and you get the
  worst of both — a Turing-complete JSON file that nobody can debug. Every DSL that has failed this
  way failed for that social reason, not a technical one.

### The sharpest thing I have to say this round

**"Eliminate per-vendor code" may be optimizing the wrong axis entirely.**

Flash made the observation that reframes this: the dispatch engine's 12 provider files and ~18
registrations sat **imported nowhere by any application for months**, until 2026-09-02. The
bottleneck was never how expensive an adapter is to write. Adapters existed, in quantity, unused.
What was missing was **async support and a consumer**.

So a Round 3 that debates config-vs-code without confronting that risks optimizing the cheap half of
the problem. Writing an adapter is a day. The thing that actually blocked this system for months was
that nothing could call it and it could not express a long-running operation.

**What would change my mind:** a count of the next ten realistic vendors, classified by whether a
declarative spec covers them. If ≥8 are covered, Tier A is worth building first and my "wrong axis"
claim is overstated. If ≤5, the declarative tier is a distraction and durable async is the whole job.

## What I hold from Round 2

- The signer/broker seam — five of five converged on it independently. Treat as settled.
- Durable job row + leased worker, with both an attempt cap and an absolute deadline.
- Dual-read strangler migration, per-table resolvers, never a generic cross-table decrypt.
- Trust tier as a **column**, not nine schemas — though Sonnet's counter still stands unrefuted.

## Build first — unchanged, and now near-unanimous

The already-async `imagerouter` video path, `kill -9` mid-poll then restart, pass bar = no duplicate
vendor charge and no state that lived only in the dead process. Four of five converged here.

I add one gate I have held since Round 2 and now hold harder given the count is five, not three:
**close the no-AAD gap or accept it in writing first**, starting with
`adminExecutionCredentials`, because that one is cross-principal.

--- END OF PACKET ---
