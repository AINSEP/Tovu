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
