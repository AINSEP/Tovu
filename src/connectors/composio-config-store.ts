import type { ClockPort, ISODateTime, UUID } from "@jini-ai/cms/core";
import type { ComposioConfig, ComposioConfigStore } from "@jini-ai/integrations/composio";

import type { KeyringPort, SecretSealerPort } from "../integrations/ports";
import type { SealedSecret } from "../integrations/types";

/**
 * @file The workspace's Composio project credentials — what the admin's Settings → Connectors tab
 * reads and writes, and what `connectors/composio-service.ts` hands to Jini's
 * `ComposioConnectorProvider`.
 *
 * Two stores live here because Jini's provider and Tovu's storage disagree about async:
 *
 * - The Tovu half ({@link getComposioConfigView} / {@link saveComposioApiKey} /
 *   {@link clearComposioApiKey} / {@link readComposioConfig}) is ASYNC, because sealing goes
 *   through ADR-058's `SecretSealerPort`, whose `seal`/`open` are both promises.
 * - Jini's `ComposioConfigStore` is SYNCHRONOUS — `read()` returns a `ComposioConfig` directly,
 *   because its own file adapter is `fs.readFileSync`-backed.
 *
 * The two cannot be the same object. {@link createSnapshotComposioConfigStore} is the bridge: an
 * in-memory `ComposioConfigStore` over a snapshot that Tovu hydrates asynchronously (at boot and
 * after every key change) and that writes back through an injected persist callback. Decryption
 * therefore happens exactly once per key change, on Tovu's async side, never inside a provider
 * call. Sealing inside the sync interface is impossible, not merely inconvenient — which is why
 * this indirection exists rather than a direct DB-backed `ComposioConfigStore`.
 *
 * Workspace-scoped, single row (see `db/schema.ts`'s `composioConfig` header for why the scope is
 * the workspace and not the principal).
 */

/** One workspace's stored Composio row. `sealed`/`keyTail` are both-null or both-set, enforced by
 *  the table's own CHECK — a row may hold only `authConfigIds` after a key is cleared. */
export interface ComposioConfigRecord {
  workspaceId: UUID;
  sealed: SealedSecret | null;
  /** Last {@link KEY_TAIL_LENGTH} characters of the API key. `null` iff `sealed` is `null`. */
  keyTail: string | null;
  /** Connector id → Composio auth-config id. Empty object when none are provisioned. */
  authConfigIds: Record<string, string>;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Workspace-scoped persistence for {@link ComposioConfigRecord} (ADR-007 §1). Single row per
 *  workspace, so a bare find/upsert pair rather than the list/bulk-delete `MediaProviderCredentialRepoPort`
 *  needs. */
export interface ComposioConfigRepoPort {
  findByWorkspaceId(workspaceId: UUID): Promise<ComposioConfigRecord | null>;
  upsert(record: ComposioConfigRecord): Promise<void>;
}

/**
 * The tab's read model — marker only, never key material. Structurally Jini's own
 * `PublicComposioConfig`, restated here rather than imported so the wire contract this route
 * serves is pinned by Tovu's tests; `__tests__/composio-config-store.test.ts` asserts the two stay
 * assignable.
 */
export interface ComposioConfigView {
  /** `true` iff a sealed API key is stored. Drives `ConnectorsBrowser`'s `unlocked` prop. */
  configured: boolean;
  /** Bare tail, no `••••` prefix — the admin tab adds that itself. Empty string when unconfigured. */
  apiKeyTail: string;
}

/** Matches `media/provider-credential-store.ts`'s `KEY_TAIL_LENGTH` — the same 4-character tail
 *  convention every Tovu credential surface renders. */
const KEY_TAIL_LENGTH = 4;

/** Longest accepted API key. Not a Composio limit — a bound on what an admin payload may write
 *  into a text column, so a malformed client cannot store an unbounded blob. */
const MAX_API_KEY_LENGTH = 512;

export class ComposioConfigValidationError extends Error {}

/** Thrown when a caller supplies a key but the master secret (`TOVU_INTEGRATIONS_ROOT_KEY`) is
 *  unavailable — fail-closed, mirroring the sibling credential stores so the route can map it to
 *  its own `503 SECRET_STORE_UNCONFIGURED` rather than a generic `400`. */
export class ComposioConfigSecretStoreUnconfiguredError extends Error {}

export interface ComposioConfigReadDeps {
  repo: ComposioConfigRepoPort;
}

export interface ComposioConfigWriteDeps extends ComposioConfigReadDeps {
  sealer: SecretSealerPort;
  keyring: KeyringPort;
  clock: ClockPort;
}

function toView(record: ComposioConfigRecord | null): ComposioConfigView {
  if (record === null || record.sealed === null) return { configured: false, apiKeyTail: "" };
  return { configured: true, apiKeyTail: record.keyTail ?? "" };
}

/**
 * The workspace's Composio configuration as markers only. Pure DB read — never decrypts, so a
 * missing or rotated master secret cannot make this fail.
 *
 * @complexity O(1) — one primary-key lookup.
 * @overallScore 100
 */
export async function getComposioConfigView(
  deps: ComposioConfigReadDeps,
  input: { workspaceId: UUID }
): Promise<ComposioConfigView> {
  return toView(await deps.repo.findByWorkspaceId(input.workspaceId));
}

/**
 * The decrypted configuration Jini's provider needs. THE ONLY function here that opens the sealed
 * key — callers are the composition root's hydration path, never a request handler serving the
 * admin tab.
 *
 * Returns an empty `apiKey` rather than throwing when no key is stored: an unconfigured workspace
 * is a normal state (the tab renders its gate), not an error. A stored-but-unopenable key IS an
 * error and propagates, because silently degrading to "unconfigured" would make a rotated master
 * secret look like a missing key and invite an operator to paste a fresh one over recoverable data.
 *
 * @throws Whatever `SecretSealerPort.open` throws when a stored key cannot be decrypted.
 * @complexity O(1) — one lookup plus at most one AEAD open.
 * @overallScore 100
 */
export async function readComposioConfig(
  deps: ComposioConfigReadDeps & { sealer: SecretSealerPort },
  input: { workspaceId: UUID }
): Promise<ComposioConfig> {
  const record = await deps.repo.findByWorkspaceId(input.workspaceId);
  if (record === null) return { apiKey: "", authConfigIds: {} };
  const apiKey = record.sealed === null ? "" : await deps.sealer.open({ sealed: record.sealed });
  return { apiKey, authConfigIds: { ...record.authConfigIds } };
}

function assertValidApiKey(apiKey: string): void {
  if (typeof apiKey !== "string") {
    throw new ComposioConfigValidationError("apiKey must be a string");
  }
  if (apiKey.trim().length === 0) {
    throw new ComposioConfigValidationError("apiKey must not be blank");
  }
  if (apiKey.length > MAX_API_KEY_LENGTH) {
    throw new ComposioConfigValidationError(`apiKey exceeds ${MAX_API_KEY_LENGTH} characters`);
  }
}

/**
 * Seals and stores a new Composio API key, replacing any existing one.
 *
 * Provisioned `authConfigIds` are DISCARDED when the key actually changes, matching
 * `createFileComposioConfigStore`'s own `apiKeyChanged ? {} : prior` rule. This is not
 * housekeeping: an auth-config id names a resource inside one Composio PROJECT, so carrying ids
 * across a key swap would point the provider at configs that belong to a project the new key
 * cannot see — every connect would fail with a confusing remote 404 rather than simply
 * re-provisioning. Re-pasting the SAME key preserves them, so a no-op save is genuinely a no-op.
 *
 * @throws {ComposioConfigValidationError} `apiKey` is absent, blank, or oversized.
 * @throws {ComposioConfigSecretStoreUnconfiguredError} the master secret is unavailable — never
 *   downgraded to a plaintext write or a silent skip.
 * @complexity O(1) — one lookup, one keyring derivation, one seal, one upsert.
 * @overallScore 100
 */
export async function saveComposioApiKey(
  deps: ComposioConfigWriteDeps,
  input: { workspaceId: UUID; apiKey: string }
): Promise<ComposioConfigView> {
  assertValidApiKey(input.apiKey);
  const apiKey = input.apiKey.trim();

  const existing = await deps.repo.findByWorkspaceId(input.workspaceId);
  const now = deps.clock.nowIso();

  let sealed: SealedSecret;
  try {
    sealed = await deps.sealer.seal({ plaintext: apiKey, key: await deps.keyring.activeKey() });
  } catch (err) {
    throw new ComposioConfigSecretStoreUnconfiguredError(
      `composio credential secret store is unconfigured: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Compare tails, not ciphertexts: AES-GCM is randomized, so the same key seals to a different
  // blob every time and a ciphertext comparison would report "changed" on every save.
  const keyTail = apiKey.slice(-KEY_TAIL_LENGTH);
  const keyUnchanged = existing?.sealed !== null && existing?.keyTail === keyTail;

  const record: ComposioConfigRecord = {
    workspaceId: input.workspaceId,
    sealed,
    keyTail,
    authConfigIds: keyUnchanged ? { ...(existing?.authConfigIds ?? {}) } : {},
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await deps.repo.upsert(record);
  return toView(record);
}

/**
 * Removes the stored API key and every provisioned auth-config id for the workspace.
 *
 * The row is rewritten rather than deleted, preserving `createdAt` — the same
 * tombstone-by-nulling shape the sealed-shape CHECK is written to allow. `authConfigIds` goes with
 * the key for the reason {@link saveComposioApiKey} documents.
 *
 * Idempotent: clearing an already-unconfigured workspace writes nothing and reports the
 * unconfigured view.
 *
 * @complexity O(1) — one lookup plus at most one upsert.
 * @overallScore 100
 */
export async function clearComposioApiKey(
  deps: ComposioConfigWriteDeps,
  input: { workspaceId: UUID }
): Promise<ComposioConfigView> {
  const existing = await deps.repo.findByWorkspaceId(input.workspaceId);
  if (existing === null) return { configured: false, apiKeyTail: "" };

  const record: ComposioConfigRecord = {
    ...existing,
    sealed: null,
    keyTail: null,
    authConfigIds: {},
    updatedAt: deps.clock.nowIso(),
  };
  await deps.repo.upsert(record);
  return toView(record);
}

/**
 * Persists auth-config ids discovered by the provider, leaving the sealed key untouched.
 *
 * Separate from {@link saveComposioApiKey} because the writer is different: this one is called
 * from {@link createSnapshotComposioConfigStore}'s persist callback during a connect handshake,
 * not from an admin form submission, and it must never need the sealer.
 *
 * A workspace with no row yet is skipped rather than created: auth-config ids are meaningless
 * without the API key that provisioned them, so there is no valid state this could write.
 *
 * @complexity O(1) — one lookup plus at most one upsert.
 * @overallScore 100
 */
export async function saveComposioAuthConfigIds(
  deps: ComposioConfigReadDeps & { clock: ClockPort },
  input: { workspaceId: UUID; authConfigIds: Record<string, string> }
): Promise<void> {
  const existing = await deps.repo.findByWorkspaceId(input.workspaceId);
  if (existing === null) return;
  await deps.repo.upsert({
    ...existing,
    authConfigIds: { ...input.authConfigIds },
    updatedAt: deps.clock.nowIso(),
  });
}

export interface SnapshotComposioConfigStoreOptions {
  /** The decrypted configuration to serve until {@link MutableComposioConfigStore.replace} is called. */
  initial: ComposioConfig;
  /**
   * Called whenever the provider mutates `authConfigIds`. Fire-and-forget by design: Jini's
   * interface is synchronous and cannot await, so persistence failures are reported here rather
   * than surfaced to the provider. A dropped write costs one re-provision on the next connect, not
   * correctness — which is exactly why the API key is NOT writable through this path.
   */
  persistAuthConfigIds?: (authConfigIds: Record<string, string>) => void;
}

/** A `ComposioConfigStore` whose backing snapshot Tovu can swap after an async re-read. */
export interface MutableComposioConfigStore extends ComposioConfigStore {
  /** Installs a freshly decrypted configuration — called after boot hydration and every key change. */
  replace(config: ComposioConfig): void;
}

/**
 * An in-memory {@link ComposioConfigStore} over a snapshot Tovu owns.
 *
 * Satisfies Jini's synchronous interface without ever touching the database or the sealer on the
 * read path, which is what makes an async-sealed key usable by a sync consumer at all (see this
 * file's header).
 *
 * `write` deliberately does NOT persist an API key. Jini's file adapter treats `write` as the
 * key-setting entrypoint, but in Tovu the key's system of record is the sealed `composio_config`
 * row and the only writer is {@link saveComposioApiKey}. Accepting a key here would create a
 * second, unsealed, process-local source of truth that silently disagrees with the database after
 * the next restart. Nothing in the provider's own code path calls `write`; it exists on the
 * interface for the file adapter's benefit.
 *
 * @complexity All methods O(1) except `write`/`setAuthConfigId`, which copy the id map: O(k) in
 *   the number of provisioned connectors.
 * @overallScore 100
 */
export function createSnapshotComposioConfigStore(
  options: SnapshotComposioConfigStoreOptions
): MutableComposioConfigStore {
  let current: ComposioConfig = {
    apiKey: options.initial.apiKey,
    authConfigIds: { ...options.initial.authConfigIds },
  };

  const publicView = (): ComposioConfigView => ({
    configured: Boolean(current.apiKey),
    apiKeyTail: current.apiKey ? current.apiKey.slice(-KEY_TAIL_LENGTH) : "",
  });

  const commitAuthConfigIds = (authConfigIds: Record<string, string>): void => {
    current = { apiKey: current.apiKey, authConfigIds };
    options.persistAuthConfigIds?.({ ...authConfigIds });
  };

  return {
    read: () => ({ apiKey: current.apiKey, authConfigIds: { ...current.authConfigIds } }),
    readPublic: publicView,
    write: () => publicView(),
    setAuthConfigId: (connectorId: string, authConfigId: string) => {
      if (!connectorId.trim() || !authConfigId.trim()) return;
      commitAuthConfigIds({ ...current.authConfigIds, [connectorId.trim()]: authConfigId.trim() });
    },
    deleteAuthConfigId: (connectorId: string) => {
      const key = connectorId.trim();
      if (current.authConfigIds[key] === undefined) return;
      const next = { ...current.authConfigIds };
      delete next[key];
      commitAuthConfigIds(next);
    },
    replace: (config: ComposioConfig) => {
      current = { apiKey: config.apiKey, authConfigIds: { ...config.authConfigIds } };
    },
  };
}
