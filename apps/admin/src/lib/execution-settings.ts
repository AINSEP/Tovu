/**
 * @file Tovu adapter for `@jini-ai/ui`'s `ExecutionTab` — the Open Design
 * settings-dialog port, now wired to a real backend end to end.
 *
 * THREE responsibilities, deliberately kept apart:
 *
 * 1. **Non-secret persistence.** Everything except the BYOK API key — mode,
 *    protocol, providerId, baseUrl, model, maxTokens for the ACTIVE selection
 *    — is stored as SPEC-007 `setting_definitions` values in the
 *    `core.execution` namespace, written through `api.setSetting` (the
 *    ADR-028 single write chokepoint). `src/assistant/execution-mode-
 *    settings.ts` registers these definitions at server boot.
 *
 * 2. **Credential storage (the ADR-028 §6 gate).** ADR-028 §6 is normative:
 *    `registerDefinitions` REJECTS any `secret:true` definition until the
 *    Integrations/secret-store ADR lands, and registering the raw API key as
 *    a plain (non-secret) string definition would be worse — it would sit in
 *    plaintext in the ledger's append-only `setting_revisions` table
 *    forever, with no redaction path. So the API key — for the active
 *    selection AND every OTHER provider's saved draft
 *    (`ByokConfig.savedByProviderId`) — lives in this browser's own
 *    `localStorage` instead, and is never sent to Tovu's settings routes.
 *    This mirrors Open Design's OWN real security model exactly (trace §1:
 *    `state/config.ts`'s `STORAGE_KEY = 'open-design:config'`, a plaintext
 *    localStorage blob the daemon never persists server-side) rather than
 *    inventing a new server-side secret store. The key still leaves the
 *    browser on every connection test / model-discovery / real-dispatch
 *    call — that is unavoidable for a BYOK feature — but it goes straight
 *    into a per-request POST body to `src/server/modules/assistant-
 *    execution.ts`'s routes, which use it for exactly one outbound call and
 *    write it nowhere.
 *
 * 3. **The port.** `ExecutionPort` is the tab's async edge (agent detection,
 *    connection test, model discovery). All three methods now call real
 *    Tovu server routes backed by `@jini-ai/agent-runtime` — see
 *    `createExecutionPort` below.
 */

import { api, ApiError, type SettingScope } from "./api";
import type { ByokConfig, ByokProviderCredentials, ExecutionConfig, ExecutionPort } from "@jini-ai/ui";

/** SPEC-007 namespace holding every NON-SECRET execution-mode key. No
 *  `byok.apiKey` here — see this file's header, item 2. */
export const EXECUTION_NAMESPACE = "core.execution";

/** One ledger key per field rather than a single blob: the ledger's whole
 *  point is per-key layering and per-key revisions, and a JSON blob would
 *  collapse that back into one opaque value. */
const KEYS = {
  mode: "mode",
  protocol: "byok.protocol",
  providerId: "byok.providerId",
  baseUrl: "byok.baseUrl",
  model: "byok.model",
  maxTokens: "byok.maxTokens",
} as const;

/** Mirrors `assistant/execution-mode-settings.ts`'s identical sentinel —
 *  the ledger's `byok.maxTokens` definition cannot default to `null`
 *  (ADR-028 totality rejects a null default for every non-secret
 *  definition), so `0` round-trips as "unset" in both directions. `0` can
 *  never collide with a real cap: `@jini-ai/ui`'s `parseMaxTokens` already
 *  treats 0 as meaningless. */
const MAX_TOKENS_UNSET_SENTINEL = 0;

/** Scope for the ledger values. Workspace-scoped so one operator's endpoint
 *  choice doesn't silently become every workspace's. */
const SCOPE: SettingScope = "workspace";

/** `localStorage` key for the credential half (API keys only) — deliberately
 *  named/shaped so it is obvious on inspection that this is BYOK credential
 *  material living client-side by design, not an accidental leak. */
const CREDENTIALS_STORAGE_KEY = "tovu:execution-credentials:v1";

interface StoredCredentials {
  /** The active selection's API key. */
  apiKey: string;
  /** Every OTHER provider's last-saved credentials, keyed by preset id —
   *  mirrors `ByokConfig.savedByProviderId`, but this copy is the source of
   *  truth for `apiKey` (the ledger never sees it); `baseUrl`/`model`/
   *  `maxTokens` here are a convenience cache of the same non-secret values
   *  the ledger could in principle hold per-provider, kept alongside the key
   *  so a provider's draft round-trips as one unit instead of split across
   *  two stores.
   */
  savedByProviderId: Record<string, ByokProviderCredentials>;
}

const EMPTY_STORED_CREDENTIALS: StoredCredentials = { apiKey: "", savedByProviderId: {} };

function readStoredCredentials(): StoredCredentials {
  try {
    const raw = window.localStorage.getItem(CREDENTIALS_STORAGE_KEY);
    if (!raw) return EMPTY_STORED_CREDENTIALS;
    const parsed = JSON.parse(raw) as Partial<StoredCredentials>;
    return {
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      savedByProviderId:
        parsed.savedByProviderId && typeof parsed.savedByProviderId === "object" ? parsed.savedByProviderId : {},
    };
  } catch {
    // Malformed/absent localStorage (private-browsing quota errors, a hand-edited value, a
    // pre-this-feature empty profile) all fall back to "no credentials yet" rather than throwing —
    // the same defensive posture `loadExecutionConfig` takes for a cold-start ledger namespace.
    return EMPTY_STORED_CREDENTIALS;
  }
}

function writeStoredCredentials(next: StoredCredentials): void {
  try {
    window.localStorage.setItem(CREDENTIALS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage can be full or disabled (private browsing in some browsers); losing the convenience
    // cache is not worth surfacing an error over — the operator can retype the key.
  }
}

export const DEFAULT_EXECUTION_CONFIG: ExecutionConfig = {
  mode: "local-cli",
  byok: {
    protocol: "anthropic",
    providerId: "anthropic",
    apiKey: "",
    baseUrl: "https://api.anthropic.com",
    model: "",
  },
};

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

/**
 * Reads the non-secret ledger namespace plus the localStorage credential
 * half, and merges them into one `ExecutionConfig`. Unknown/missing ledger
 * keys fall back to `DEFAULT_EXECUTION_CONFIG` field by field, so a
 * partially written namespace still yields a usable config instead of
 * throwing.
 */
export async function loadExecutionConfig(): Promise<ExecutionConfig> {
  let rows: Awaited<ReturnType<typeof api.getSettingsEffective>>["data"];
  try {
    rows = (await api.getSettingsEffective({ namespace: EXECUTION_NAMESPACE })).data;
  } catch (error) {
    // A namespace with no registered definitions is the expected cold-start
    // state, not an error worth surfacing — fall back to defaults.
    if (error instanceof ApiError && error.status === 404) return DEFAULT_EXECUTION_CONFIG;
    throw error;
  }

  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const defaults = DEFAULT_EXECUTION_CONFIG;
  const rawMode = byKey.get(KEYS.mode);
  const rawMaxTokens = byKey.get(KEYS.maxTokens);
  const rawProviderId = byKey.get(KEYS.providerId);
  const rawProtocol = byKey.get(KEYS.protocol);
  const credentials = readStoredCredentials();

  return {
    mode: rawMode === "local-cli" || rawMode === "byok" ? rawMode : defaults.mode,
    byok: {
      protocol:
        rawProtocol === "anthropic" ||
        rawProtocol === "openai" ||
        rawProtocol === "azure" ||
        rawProtocol === "google"
          ? rawProtocol
          : defaults.byok.protocol,
      // `null` is a real, distinct value here (it selects the custom endpoint),
      // so only `undefined` falls back to the default.
      providerId:
        rawProviderId === null
          ? null
          : typeof rawProviderId === "string"
            ? rawProviderId
            : defaults.byok.providerId,
      apiKey: credentials.apiKey,
      baseUrl: asString(byKey.get(KEYS.baseUrl), defaults.byok.baseUrl),
      model: asString(byKey.get(KEYS.model), defaults.byok.model),
      ...(typeof rawMaxTokens === "number" && rawMaxTokens !== MAX_TOKENS_UNSET_SENTINEL
        ? { maxTokens: rawMaxTokens }
        : {}),
      ...(Object.keys(credentials.savedByProviderId).length > 0
        ? { savedByProviderId: credentials.savedByProviderId }
        : {}),
    },
  };
}

/** Field-level diff so a keystroke in one input writes one revision, not six
 *  — and so the API key never appears in this list at all (see this file's
 *  header, item 2). */
function changedLedgerEntries(
  next: ExecutionConfig,
  previous: ExecutionConfig,
): Array<{ key: string; valueJson: unknown }> {
  const pairs: Array<{ key: string; valueJson: unknown; changed: boolean }> = [
    { key: KEYS.mode, valueJson: next.mode, changed: next.mode !== previous.mode },
    { key: KEYS.protocol, valueJson: next.byok.protocol, changed: next.byok.protocol !== previous.byok.protocol },
    {
      key: KEYS.providerId,
      valueJson: next.byok.providerId,
      changed: next.byok.providerId !== previous.byok.providerId,
    },
    { key: KEYS.baseUrl, valueJson: next.byok.baseUrl, changed: next.byok.baseUrl !== previous.byok.baseUrl },
    { key: KEYS.model, valueJson: next.byok.model, changed: next.byok.model !== previous.byok.model },
    {
      key: KEYS.maxTokens,
      valueJson: next.byok.maxTokens ?? MAX_TOKENS_UNSET_SENTINEL,
      changed: (next.byok.maxTokens ?? MAX_TOKENS_UNSET_SENTINEL) !== (previous.byok.maxTokens ?? MAX_TOKENS_UNSET_SENTINEL),
    },
  ];
  return pairs.filter((pair) => pair.changed).map(({ key, valueJson }) => ({ key, valueJson }));
}

function credentialsEqual(a: StoredCredentials, b: StoredCredentials): boolean {
  return a.apiKey === b.apiKey && JSON.stringify(a.savedByProviderId) === JSON.stringify(b.savedByProviderId);
}

/**
 * Writes only the non-secret ledger fields that actually changed, and
 * refreshes the localStorage credential half whenever the API key or any
 * saved-provider draft changed. Returns the LEDGER keys written (for "saved"
 * UI feedback) — a credential-only change (e.g. just typing an API key with
 * no other field touched) is reported as saved too, even though it wrote no
 * ledger revision, since from the operator's point of view something was
 * persisted either way.
 */
export async function saveExecutionConfig(
  next: ExecutionConfig,
  previous: ExecutionConfig,
): Promise<readonly string[]> {
  const changed = changedLedgerEntries(next, previous);
  for (const { key, valueJson } of changed) {
    await api.setSetting({ namespace: EXECUTION_NAMESPACE, key, scope: SCOPE, valueJson });
  }

  const nextCredentials: StoredCredentials = {
    apiKey: next.byok.apiKey,
    savedByProviderId: (next.byok.savedByProviderId as Record<string, ByokProviderCredentials> | undefined) ?? {},
  };
  const previousCredentials: StoredCredentials = {
    apiKey: previous.byok.apiKey,
    savedByProviderId: (previous.byok.savedByProviderId as Record<string, ByokProviderCredentials> | undefined) ?? {},
  };
  const credentialsChanged = !credentialsEqual(nextCredentials, previousCredentials);
  if (credentialsChanged) {
    writeStoredCredentials(nextCredentials);
  }

  const writtenKeys = changed.map((entry) => entry.key);
  // Not a real ledger key — a synthetic marker so callers see "something was
  // saved" when only the browser-local credential half changed (e.g. typing
  // an API key with every other field untouched), without implying a ledger
  // revision was written for it.
  return credentialsChanged ? [...writtenKeys, "byok.apiKey (browser-local)"] : writtenKeys;
}

/**
 * Tovu's real `ExecutionPort` — wired to `src/server/modules/assistant-
 * execution.ts`'s 3 routes (`@jini-ai/agent-runtime` underneath). Every
 * method resolves (never throws) so the tab renders its normal empty/error
 * states rather than an unhandled rejection; a transport failure is reported
 * through the SAME `{ok:false}`/error shape a reachable-but-rejecting
 * endpoint would produce.
 */
export function createExecutionPort(): ExecutionPort {
  return {
    async detectLocalAgents() {
      try {
        return (await api.detectExecutionAgents()).data;
      } catch {
        return [];
      }
    },
    async rescanLocalAgents() {
      try {
        return (await api.detectExecutionAgents()).data;
      } catch {
        return [];
      }
    },
    async testConnection(config: ByokConfig) {
      try {
        const result = await api.testExecutionConnection({
          protocol: config.protocol,
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          model: config.model,
        });
        return result;
      } catch (error) {
        return {
          ok: false,
          message: error instanceof ApiError ? error.message : "Connection test failed",
        };
      }
    },
    async listModels(config: ByokConfig) {
      try {
        const result = await api.listExecutionModels({
          protocol: config.protocol,
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
        });
        return result.ok ? result.models : [];
      } catch {
        return [];
      }
    },
  };
}
