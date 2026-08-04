import type { ClockPort, ISODateTime, UUID } from "@jini-ai/cms/core";

import type { KeyringPort, SecretSealerPort } from "../integrations/ports";
import type { SealedSecret } from "../integrations/types";

/**
 * @file The SITE's provider credential (ADR-058) — one encrypted key per workspace, powering the
 * PUBLIC visitor assistant (`server/modules/site-assistant.ts`). NOT the admin's own BYOK key
 * (`apps/admin/src/lib/execution-settings.ts`, browser-local, powers the admin's own assistant dock
 * only) — see ADR-058's "Distinction from BYOK" for why these two are kept structurally apart.
 *
 * Three functions, one contract each:
 * - {@link getSiteAssistantCredential} — read model only. Never decrypts (`masked` is a plain
 *   column, computed once at write time — ADR-058 §3), so this never touches the sealer/keyring and
 *   never fails on a misconfigured master secret.
 * - {@link setSiteAssistantCredential} — write-only for the key itself: `apiKey`, when provided, is
 *   sealed and never echoed back. Omitted `apiKey` leaves the stored key untouched.
 * - {@link deleteSiteAssistantCredential} — clears the key only; `provider`/`baseUrl`/`model` are
 *   left as they were (ADR-058 §8: deleting the credential is not the same operation as resetting
 *   the whole row).
 *
 * {@link resolveSiteAssistantApiKey} is the fourth function and the odd one out: it is the RUNTIME
 * consumer's read path (called from `site-assistant.ts` per chat request, not from an admin route),
 * and its contract is the opposite of the other three — it must NEVER throw. A missing row, a
 * missing master secret, or a corrupt/tampered ciphertext all resolve to `null`, which the caller
 * treats as "fall back to `env.GEMINI_API_KEY`" (ADR-058 §4/§6). A visitor-facing request must
 * degrade, never 500, when the credential store is unavailable.
 */

/** The SITE's provider credential, as this store persists it. `sealed` is `null` iff no key has
 *  ever been saved (or the key has been deleted) — the DB CHECK constraint on
 *  `site_assistant_credentials` enforces `sealed`/`masked` are both-null or both-set together. */
export interface SiteAssistantCredentialRecord {
  workspaceId: UUID;
  provider: string;
  baseUrl: string | null;
  model: string | null;
  sealed: SealedSecret | null;
  /** `••••<last 4 chars>` — precomputed at write time. `null` iff `sealed` is `null`. */
  masked: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Workspace-scoped persistence for {@link SiteAssistantCredentialRecord} (ADR-007 §1). One row per
 *  workspace — `upsert` always writes the full row; `clearKey` is a narrower partial update because
 *  deleting the key must not disturb `provider`/`baseUrl`/`model` (ADR-058 §8). */
export interface SiteAssistantCredentialRepoPort {
  findByWorkspaceId(workspaceId: UUID): Promise<SiteAssistantCredentialRecord | null>;
  upsert(record: SiteAssistantCredentialRecord): Promise<void>;
  /** No-op if no row exists for `workspaceId` — same "clearing nothing is fine" posture DELETE's
   *  route handler needs (idempotent, not an error to delete an already-unset key). */
  clearKey(input: { workspaceId: UUID; updatedAt: ISODateTime }): Promise<void>;
}

/** The read model every route in this feature returns — never contains key material, only whether
 *  one is set and what it ends in. */
export interface SiteAssistantCredentialView {
  isSet: boolean;
  masked: string | null;
  provider: string;
  baseUrl: string | null;
  model: string | null;
  updatedAt: ISODateTime | null;
}

const DEFAULT_PROVIDER = "google";
/** How many trailing characters `masked` reveals — matches `@jini-ai/ui`'s existing
 *  `maskedKeyLabel` convention (`features/media-providers/rules.js`: `` `••••${tail.slice(-4)}` ``),
 *  reusing the visual language admins already see elsewhere rather than inventing a second one. */
const MASK_TAIL_LENGTH = 4;
const MASK_PREFIX = "••••";

function toView(record: SiteAssistantCredentialRecord | null): SiteAssistantCredentialView {
  if (!record) {
    return { isSet: false, masked: null, provider: DEFAULT_PROVIDER, baseUrl: null, model: null, updatedAt: null };
  }
  return {
    isSet: record.sealed !== null,
    masked: record.masked,
    provider: record.provider,
    baseUrl: record.baseUrl,
    model: record.model,
    updatedAt: record.updatedAt,
  };
}

export interface SiteAssistantCredentialReadDeps {
  repo: SiteAssistantCredentialRepoPort;
}

/**
 * The read model an admin screen renders. Pure DB read — no sealer, no keyring, cannot fail on a
 * misconfigured master secret (ADR-058 §4).
 *
 * @complexity O(1) — one `findByWorkspaceId` lookup.
 * @overallScore 100
 */
export async function getSiteAssistantCredential(
  deps: SiteAssistantCredentialReadDeps,
  input: { workspaceId: UUID }
): Promise<SiteAssistantCredentialView> {
  const record = await deps.repo.findByWorkspaceId(input.workspaceId);
  return toView(record);
}

export class SiteAssistantCredentialValidationError extends Error {}

/** Thrown when a caller supplies a new `apiKey` but the master secret
 *  (`TOVU_INTEGRATIONS_ROOT_KEY`) is unavailable — ADR-058 §4's fail-closed contract. Distinct from
 *  {@link SiteAssistantCredentialValidationError} so the route can map it to its own `503
 *  SECRET_STORE_UNCONFIGURED` response rather than a `400`. */
export class SiteAssistantSecretStoreUnconfiguredError extends Error {}

export interface SiteAssistantCredentialWriteDeps extends SiteAssistantCredentialReadDeps {
  sealer: SecretSealerPort;
  keyring: KeyringPort;
  clock: ClockPort;
}

export interface SetSiteAssistantCredentialInput {
  workspaceId: UUID;
  /** Omitted = leave the stored key untouched. Empty string is rejected (use DELETE to clear). */
  apiKey?: string;
  provider?: string;
  baseUrl?: string;
  model?: string;
}

function maskOf(apiKey: string): string {
  return `${MASK_PREFIX}${apiKey.slice(-MASK_TAIL_LENGTH)}`;
}

/**
 * Validate-then-write chokepoint, mirroring `setPublicAssistantSettings`'s shape: an omitted field
 * is left alone, an invalid one is rejected before any write.
 *
 * `apiKey`, when present and non-empty, is sealed under the keyring's CURRENT `activeKey()` — a
 * fresh seal on every save, never a re-wrap of the old ciphertext, so rotation is a plain overwrite
 * (ADR-058 §8). When `apiKey` is omitted, the previously-sealed value (if any) is carried forward
 * unchanged in the same `upsert` call, so `provider`/`baseUrl`/`model`-only edits never touch the
 * sealer or the keyring at all.
 *
 * @throws {SiteAssistantCredentialValidationError} `apiKey` is an empty/whitespace-only string, or
 *   `provider`/`baseUrl`/`model` is present and not a string.
 * @throws {SiteAssistantSecretStoreUnconfiguredError} `apiKey` was provided but the master secret is
 *   unavailable — propagated from `sealer.seal()`/`keyring.activeKey()`, never silently downgraded
 *   to a plaintext write or a silent no-op.
 * @complexity O(1) — one keyring derivation (only when `apiKey` is provided) plus one upsert.
 * @overallScore 100
 */
export async function setSiteAssistantCredential(
  deps: SiteAssistantCredentialWriteDeps,
  input: SetSiteAssistantCredentialInput
): Promise<SiteAssistantCredentialView> {
  if (input.apiKey !== undefined && input.apiKey.trim().length === 0) {
    throw new SiteAssistantCredentialValidationError("apiKey must not be empty — use DELETE to clear it");
  }
  for (const [field, value] of [
    ["provider", input.provider],
    ["baseUrl", input.baseUrl],
    ["model", input.model],
  ] as const) {
    if (value !== undefined && typeof value !== "string") {
      throw new SiteAssistantCredentialValidationError(`${field} must be a string`);
    }
  }

  const existing = await deps.repo.findByWorkspaceId(input.workspaceId);
  const now = deps.clock.nowIso();

  let sealed: SealedSecret | null = existing?.sealed ?? null;
  let masked: string | null = existing?.masked ?? null;
  if (input.apiKey !== undefined) {
    try {
      const activeKey = await deps.keyring.activeKey();
      sealed = await deps.sealer.seal({ plaintext: input.apiKey, key: activeKey });
    } catch (err) {
      // Any failure deriving/sealing under the current root key is treated as "the secret store is
      // unconfigured" (ADR-058 §4) — the realistic failure mode here is a missing
      // `TOVU_INTEGRATIONS_ROOT_KEY`, and this must never fall through to a plaintext write.
      throw new SiteAssistantSecretStoreUnconfiguredError(
        `site assistant secret store is unconfigured: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    masked = maskOf(input.apiKey);
  }

  const record: SiteAssistantCredentialRecord = {
    workspaceId: input.workspaceId,
    provider: input.provider ?? existing?.provider ?? DEFAULT_PROVIDER,
    baseUrl: (input.baseUrl ?? existing?.baseUrl) ?? null,
    model: (input.model ?? existing?.model) ?? null,
    sealed,
    masked,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await deps.repo.upsert(record);
  return toView(record);
}

/**
 * Clears the stored key only. `provider`/`baseUrl`/`model` are left exactly as they were — see this
 * file's header on why deletion is narrower than a full row reset. No-op (not an error) if no key is
 * currently stored.
 *
 * @complexity O(1) — one `clearKey` call plus one read to build the return view.
 * @overallScore 100
 */
export async function deleteSiteAssistantCredential(
  deps: SiteAssistantCredentialReadDeps & { clock: ClockPort },
  input: { workspaceId: UUID }
): Promise<SiteAssistantCredentialView> {
  await deps.repo.clearKey({ workspaceId: input.workspaceId, updatedAt: deps.clock.nowIso() });
  return getSiteAssistantCredential(deps, input);
}

/** What the visitor-assistant runtime path resolves to. `apiKey`/`provider`/`baseUrl`/`model` are
 *  populated together — a stored row with a stale/corrupt key never leaks partial fields. */
export interface ResolvedSiteAssistantCredential {
  apiKey: string;
  provider: string;
  baseUrl: string | null;
  model: string | null;
}

/**
 * The runtime consumer's read path (ADR-058 §6) — called per visitor chat request from
 * `server/modules/site-assistant.ts`. Returns `null` on ANYTHING that would otherwise throw: no row,
 * no key stored, the master secret missing, a tampered/corrupt ciphertext. The caller's contract is
 * to fall back to `env.GEMINI_API_KEY` on `null`, never to surface a 500 to an anonymous visitor over
 * a credential-store problem.
 *
 * @param onDecryptFailure - Optional operator-visible warning hook, invoked (not thrown) when a row
 *   with a stored key exists but could not be opened. Separate from "no key stored" — that is normal
 *   and not logged. Defaults to a no-op so tests and callers that don't care can omit it.
 * @complexity O(1) — one repo read plus, at most, one decrypt.
 * @overallScore 100
 */
export async function resolveSiteAssistantApiKey(
  deps: { repo: SiteAssistantCredentialRepoPort; sealer: SecretSealerPort },
  input: { workspaceId: UUID },
  onDecryptFailure: (error: unknown) => void = () => {}
): Promise<ResolvedSiteAssistantCredential | null> {
  let record: SiteAssistantCredentialRecord | null;
  try {
    record = await deps.repo.findByWorkspaceId(input.workspaceId);
  } catch (err) {
    onDecryptFailure(err);
    return null;
  }
  if (!record || !record.sealed) return null;

  try {
    const apiKey = await deps.sealer.open({ sealed: record.sealed });
    return { apiKey, provider: record.provider, baseUrl: record.baseUrl, model: record.model };
  } catch (err) {
    onDecryptFailure(err);
    return null;
  }
}
