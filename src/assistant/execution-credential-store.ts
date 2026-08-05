import type { ClockPort, ISODateTime, UUID } from "@jini-ai/cms/core";

import type { KeyringPort, SecretSealerPort } from "../integrations/ports";
import type { SealedSecret } from "../integrations/types";

/**
 * @file The ADMIN's own BYOK credential — one encrypted key per `(workspace, principal)`, powering
 * the admin assistant dock's BYOK mode (`server/modules/assistant-byok.ts`). NOT the SITE's
 * credential (`site-credential-store.ts`, ADR-058) — that one is per-workspace and powers the
 * PUBLIC visitor assistant; this one is per-admin and never leaves that admin's own dock. Design:
 * `ADS-memory/reports/analysis/2026-08-05-admin-byok-keystore-design.md` (owner-approved).
 *
 * Same four-function shape as `site-credential-store.ts`, same contracts, composite-scoped instead
 * of workspace-only:
 * - {@link getExecutionCredential} — read model only. Never decrypts (`masked` is a plain column,
 *   computed once at write time), so this never touches the sealer/keyring and never fails on a
 *   misconfigured master secret.
 * - {@link setExecutionCredential} — write-only for the key itself: `apiKey`, when provided, is
 *   sealed and never echoed back. Omitted `apiKey` leaves the stored key untouched.
 * - {@link deleteExecutionCredential} — clears the key only; `protocol`/`providerId`/`baseUrl`/
 *   `model`/`maxTokens` are left as they were (deleting the credential is not the same operation as
 *   resetting the whole row).
 *
 * {@link resolveExecutionCredential} is the fourth function and the odd one out: it is the BYOK-turn
 * route's read path (called per admin turn, not from an admin CRUD route), and it must NEVER throw.
 * A missing row, a missing master secret, or a corrupt/tampered ciphertext all resolve to `null`,
 * which the caller (`byok-credential.ts`'s stored port) treats as "no stored credential" — unlike
 * ADR-058's sibling function there is no env-var fallback to degrade to here; `null` just means the
 * turn has no usable credential from this source.
 */

/** The ADMIN's own BYOK credential, as this store persists it. `sealed` is `null` iff no key has
 *  ever been saved (or the key has been deleted) — the DB CHECK constraint on
 *  `admin_execution_credentials` enforces `sealed`/`masked` are both-null or both-set together. */
export interface AdminExecutionCredentialRecord {
  workspaceId: UUID;
  principalId: UUID;
  protocol: string;
  providerId: string | null;
  baseUrl: string | null;
  model: string | null;
  maxTokens: number | null;
  sealed: SealedSecret | null;
  /** `••••<last 4 chars>` — precomputed at write time. `null` iff `sealed` is `null`. */
  masked: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Persistence for {@link AdminExecutionCredentialRecord}, scoped by `(workspaceId, principalId)`
 *  together — every method requires both, so there is no query shape that can return one admin's
 *  row for another admin's id. `upsert` always writes the full row; `clearKey` is a narrower
 *  partial update because deleting the key must not disturb the other fields. */
export interface AdminExecutionCredentialRepoPort {
  findByWorkspaceAndPrincipal(required: { workspaceId: UUID; principalId: UUID }): Promise<AdminExecutionCredentialRecord | null>;
  upsert(record: AdminExecutionCredentialRecord): Promise<void>;
  /** No-op if no row exists for `(workspaceId, principalId)` — idempotent, not an error to delete an
   *  already-unset key. */
  clearKey(input: { workspaceId: UUID; principalId: UUID; updatedAt: ISODateTime }): Promise<void>;
}

/** The read model every route in this feature returns — never contains key material, only whether
 *  one is set and what it ends in. */
export interface AdminExecutionCredentialView {
  isSet: boolean;
  masked: string | null;
  protocol: string;
  providerId: string | null;
  baseUrl: string | null;
  model: string | null;
  maxTokens: number | null;
  updatedAt: ISODateTime | null;
}

const DEFAULT_PROTOCOL = "anthropic";
/** Matches `@jini-ai/ui`'s `maskedKeyLabel` convention and ADR-058's identical constant. */
const MASK_TAIL_LENGTH = 4;
const MASK_PREFIX = "••••";

function toView(record: AdminExecutionCredentialRecord | null): AdminExecutionCredentialView {
  if (!record) {
    return {
      isSet: false,
      masked: null,
      protocol: DEFAULT_PROTOCOL,
      providerId: null,
      baseUrl: null,
      model: null,
      maxTokens: null,
      updatedAt: null,
    };
  }
  return {
    isSet: record.sealed !== null,
    masked: record.masked,
    protocol: record.protocol,
    providerId: record.providerId,
    baseUrl: record.baseUrl,
    model: record.model,
    maxTokens: record.maxTokens,
    updatedAt: record.updatedAt,
  };
}

export interface ExecutionCredentialReadDeps {
  repo: AdminExecutionCredentialRepoPort;
}

/**
 * The read model an admin screen renders. Pure DB read — no sealer, no keyring, cannot fail on a
 * misconfigured master secret.
 *
 * @complexity O(1) — one `findByWorkspaceAndPrincipal` lookup.
 * @overallScore 100
 */
export async function getExecutionCredential(
  deps: ExecutionCredentialReadDeps,
  input: { workspaceId: UUID; principalId: UUID }
): Promise<AdminExecutionCredentialView> {
  const record = await deps.repo.findByWorkspaceAndPrincipal(input);
  return toView(record);
}

export class ExecutionCredentialValidationError extends Error {}

/** Thrown when a caller supplies a new `apiKey` but the master secret
 *  (`TOVU_INTEGRATIONS_ROOT_KEY`) is unavailable — fail-closed, mirroring
 *  `SiteAssistantSecretStoreUnconfiguredError`. Distinct from
 *  {@link ExecutionCredentialValidationError} so the route can map it to its own `503
 *  SECRET_STORE_UNCONFIGURED` response rather than a `400`. */
export class ExecutionCredentialSecretStoreUnconfiguredError extends Error {}

export interface ExecutionCredentialWriteDeps extends ExecutionCredentialReadDeps {
  sealer: SecretSealerPort;
  keyring: KeyringPort;
  clock: ClockPort;
}

export interface SetExecutionCredentialInput {
  workspaceId: UUID;
  principalId: UUID;
  /** Omitted = leave the stored key untouched. Empty string is rejected (use DELETE to clear). */
  apiKey?: string;
  protocol?: string;
  providerId?: string | null;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
}

function maskOf(apiKey: string): string {
  return `${MASK_PREFIX}${apiKey.slice(-MASK_TAIL_LENGTH)}`;
}

/**
 * Validate-then-write chokepoint, mirroring `setSiteAssistantCredential`'s shape: an omitted field
 * is left alone, an invalid one is rejected before any write.
 *
 * `apiKey`, when present and non-empty, is sealed under the keyring's CURRENT `activeKey()` — a
 * fresh seal on every save, never a re-wrap of the old ciphertext, so rotation is a plain overwrite.
 * When `apiKey` is omitted, the previously-sealed value (if any) is carried forward unchanged in the
 * same `upsert` call, so `protocol`/`providerId`/`baseUrl`/`model`/`maxTokens`-only edits never touch
 * the sealer or the keyring at all.
 *
 * @throws {ExecutionCredentialValidationError} `apiKey` is an empty/whitespace-only string, or
 *   `protocol`/`baseUrl`/`model` is present and not a string, or `maxTokens` is present and not a
 *   positive number.
 * @throws {ExecutionCredentialSecretStoreUnconfiguredError} `apiKey` was provided but the master
 *   secret is unavailable — propagated from `sealer.seal()`/`keyring.activeKey()`, never silently
 *   downgraded to a plaintext write or a silent no-op.
 * @complexity O(1) — one keyring derivation (only when `apiKey` is provided) plus one upsert.
 * @overallScore 100
 */
export async function setExecutionCredential(
  deps: ExecutionCredentialWriteDeps,
  input: SetExecutionCredentialInput
): Promise<AdminExecutionCredentialView> {
  if (input.apiKey !== undefined && input.apiKey.trim().length === 0) {
    throw new ExecutionCredentialValidationError("apiKey must not be empty — use DELETE to clear it");
  }
  for (const [field, value] of [
    ["protocol", input.protocol],
    ["baseUrl", input.baseUrl],
    ["model", input.model],
  ] as const) {
    if (value !== undefined && typeof value !== "string") {
      throw new ExecutionCredentialValidationError(`${field} must be a string`);
    }
  }
  if (input.providerId !== undefined && input.providerId !== null && typeof input.providerId !== "string") {
    throw new ExecutionCredentialValidationError("providerId must be a string or null");
  }
  if (input.maxTokens !== undefined && !(typeof input.maxTokens === "number" && input.maxTokens > 0)) {
    throw new ExecutionCredentialValidationError("maxTokens must be a positive number");
  }

  const existing = await deps.repo.findByWorkspaceAndPrincipal(input);
  const now = deps.clock.nowIso();

  let sealed: SealedSecret | null = existing?.sealed ?? null;
  let masked: string | null = existing?.masked ?? null;
  if (input.apiKey !== undefined) {
    try {
      const activeKey = await deps.keyring.activeKey();
      sealed = await deps.sealer.seal({ plaintext: input.apiKey, key: activeKey });
    } catch (err) {
      // Any failure deriving/sealing under the current root key is treated as "the secret store is
      // unconfigured" — the realistic failure mode is a missing `TOVU_INTEGRATIONS_ROOT_KEY`, and
      // this must never fall through to a plaintext write.
      throw new ExecutionCredentialSecretStoreUnconfiguredError(
        `admin execution credential secret store is unconfigured: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    masked = maskOf(input.apiKey);
  }

  const record: AdminExecutionCredentialRecord = {
    workspaceId: input.workspaceId,
    principalId: input.principalId,
    protocol: input.protocol ?? existing?.protocol ?? DEFAULT_PROTOCOL,
    providerId: input.providerId !== undefined ? input.providerId : (existing?.providerId ?? null),
    baseUrl: (input.baseUrl ?? existing?.baseUrl) ?? null,
    model: (input.model ?? existing?.model) ?? null,
    maxTokens: (input.maxTokens ?? existing?.maxTokens) ?? null,
    sealed,
    masked,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await deps.repo.upsert(record);
  return toView(record);
}

/**
 * Clears the stored key only. `protocol`/`providerId`/`baseUrl`/`model`/`maxTokens` are left exactly
 * as they were. No-op (not an error) if no key is currently stored.
 *
 * @complexity O(1) — one `clearKey` call plus one read to build the return view.
 * @overallScore 100
 */
export async function deleteExecutionCredential(
  deps: ExecutionCredentialReadDeps & { clock: ClockPort },
  input: { workspaceId: UUID; principalId: UUID }
): Promise<AdminExecutionCredentialView> {
  await deps.repo.clearKey({ workspaceId: input.workspaceId, principalId: input.principalId, updatedAt: deps.clock.nowIso() });
  return getExecutionCredential(deps, input);
}

/** What the BYOK-turn runtime path resolves to. Fields are populated together — a stored row with a
 *  stale/corrupt key never leaks partial fields. */
export interface ResolvedAdminExecutionCredential {
  apiKey: string;
  protocol: string;
  providerId: string | null;
  baseUrl: string | null;
  model: string | null;
  maxTokens: number | null;
}

/**
 * The BYOK-turn runtime path's read path — called per admin turn from `byok-credential.ts`'s stored
 * port. Returns `null` on ANYTHING that would otherwise throw: no row, no key stored, the master
 * secret missing, a tampered/corrupt ciphertext. The caller's contract is to treat `null` as "no
 * stored credential for this admin," never to surface a 500 over a credential-store problem.
 *
 * @param onDecryptFailure - Optional operator-visible warning hook, invoked (not thrown) when a row
 *   with a stored key exists but could not be opened. Separate from "no key stored" — that is normal
 *   and not logged. Defaults to a no-op so tests and callers that don't care can omit it.
 * @complexity O(1) — one repo read plus, at most, one decrypt.
 * @overallScore 100
 */
export async function resolveExecutionCredential(
  deps: { repo: AdminExecutionCredentialRepoPort; sealer: SecretSealerPort },
  input: { workspaceId: UUID; principalId: UUID },
  onDecryptFailure: (error: unknown) => void = () => {}
): Promise<ResolvedAdminExecutionCredential | null> {
  let record: AdminExecutionCredentialRecord | null;
  try {
    record = await deps.repo.findByWorkspaceAndPrincipal(input);
  } catch (err) {
    onDecryptFailure(err);
    return null;
  }
  if (!record || !record.sealed) return null;

  try {
    const apiKey = await deps.sealer.open({ sealed: record.sealed });
    return {
      apiKey,
      protocol: record.protocol,
      providerId: record.providerId,
      baseUrl: record.baseUrl,
      model: record.model,
      maxTokens: record.maxTokens,
    };
  } catch (err) {
    onDecryptFailure(err);
    return null;
  }
}
