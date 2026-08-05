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
 * 2. **Credential storage — now server-side, write-only (2026-08-05).**
 *    Superseded design note, kept because the reasoning still explains why
 *    the key is NOT a `core.execution` ledger field: ADR-028 §6 rejects any
 *    `secret:true` definition, and a plain-string definition would sit in
 *    the ledger's append-only `setting_revisions` table in plaintext
 *    forever. That gap is why the key used to live in this browser's own
 *    `localStorage`. It no longer does — `admin_execution_credentials`
 *    (design: `ADS-memory/reports/analysis/2026-08-05-admin-byok-keystore-
 *    design.md`, owner-approved) is a real, encrypted, write-only
 *    server-side store, one row per `(workspace, this admin)`, reusing
 *    ADR-058's sealer. `apps/admin/src/lib/api.ts`'s `getAdminExecutionCredential`/
 *    `setAdminExecutionCredential` are the routes; {@link loadAdminExecutionCredential}/
 *    {@link saveAdminExecutionCredential} below are the wrappers.
 *
 *    The move changes two things this file has to account for:
 *    - **Write-only means no read-back.** `loadExecutionConfig`'s `byok.apiKey`
 *      is now ALWAYS `""` — the server never returns key material, so there is
 *      nothing to hydrate it with. A caller that needs to know "is a key
 *      already stored" reads {@link loadAdminExecutionCredential}'s `isSet`
 *      separately; it is not merged into `ExecutionConfig`.
 *    - **The key must not ride the debounced ledger auto-save.** `saveExecutionConfig`
 *      below no longer persists `apiKey` anywhere — see that function's own
 *      doc for why. A destructive incident already happened once from
 *      exactly this shape (a 900ms-debounced auto-save on the VISITOR key
 *      screen encrypted a half-typed stub over a live production key,
 *      `ADS-memory/reports/refactors/2026-08-04-handoff-admin-byok-and-
 *      visitor-key-ui.md`'s "Two mistakes I made" §1). The fix there was an
 *      explicit Save button; the fix here is structural — this file's
 *      generic save path physically cannot write the key, so there is
 *      nothing for a debounce to accidentally trigger. Only an explicit
 *      caller of {@link saveAdminExecutionCredential} (the "Save key" control
 *      both `SettingsUi.tsx` and `AiAssistant.tsx`'s `AdminExecutionMode`
 *      render) can persist it.
 *    - **The key must survive a RELOAD, not just avoid being sent by one.** Excluding `apiKey`
 *      from the debounced write is not sufficient on its own: `useSettingsSlice`'s `refresh()` — an
 *      out-of-band re-read triggered by the settings-changed SSE feed, including a same-tab echo of
 *      this slice's OWN write — replaces the WHOLE in-memory value with whatever `loadExecutionConfig`
 *      returns, and that is always `apiKey: ""`. {@link reconcileExecutionConfigRefresh} closes that
 *      second hole; see its own doc for the exact sequence that used to wipe a typed key out from
 *      under the operator mid-edit.
 *
 *    `readLegacyLocalCredential`/`clearLegacyLocalCredential` below exist
 *    ONLY for the one-time rollout prompt migrating an admin's pre-existing
 *    `localStorage` key to the server — see their own docs.
 *
 * 3. **The port.** `ExecutionPort` is the tab's async edge (agent detection,
 *    connection test, model discovery). All three methods now call real
 *    Tovu server routes backed by `@jini-ai/agent-runtime` — see
 *    `createExecutionPort` below.
 */

import { api, ApiError, type AdminExecutionCredential, type AdminExecutionCredentialPatch, type SettingScope } from "./api";
import type { ByokConfig, ExecutionConfig, ExecutionPort } from "@jini-ai/ui";

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
  localCliAgentId: "localCli.agentId",
  localCliModel: "localCli.model",
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

/** The PRE-server-store `localStorage` key this admin's browser may still hold — read-only from
 *  here on. Same literal key `readStoredCredentials`/`writeStoredCredentials` used before the
 *  server-side store shipped, kept unchanged so an admin's existing browser data is still found.
 *  Never written to again by this file; see {@link readLegacyLocalCredential}. */
const LEGACY_CREDENTIALS_STORAGE_KEY = "tovu:execution-credentials:v1";

/**
 * One-time migration read: does this browser still hold a pre-server-store API key?
 *
 * Read-only and side-effect-free — callers use this ONLY to decide whether to show the "we found a
 * saved key in this browser — save it to your account?" prompt (owner-approved rollout, design
 * doc §6). Deliberately does NOT clear or upload anything itself: the two failure modes the design
 * explicitly rules out are auto-upload (sending a secret the admin never took an in-the-moment
 * action to send) and auto-clear (silently breaking BYOK for an admin who hasn't opened the
 * screen). Both are avoided by construction here — this function only ever reads.
 *
 * `savedByProviderId` (other providers' drafts) is deliberately not read or migrated — scoped out
 * of v1 per the design doc's owner-flagged item; only the ACTIVE key is worth a migration prompt.
 *
 * @returns The stored `apiKey`, trimmed, or `null` when there is nothing to migrate (absent,
 *   malformed, or blank). `null` is also what a browser that has already migrated (or never had a
 *   local key) returns — the caller cannot and does not need to distinguish those cases.
 * @complexity O(1) — one `localStorage` read plus a JSON parse.
 * @overallScore 100
 */
export function readLegacyLocalCredential(): string | null {
  try {
    const raw = window.localStorage.getItem(LEGACY_CREDENTIALS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { apiKey?: unknown };
    const apiKey = typeof parsed.apiKey === "string" ? parsed.apiKey.trim() : "";
    return apiKey.length > 0 ? apiKey : null;
  } catch {
    // Malformed/inaccessible localStorage (private-browsing quota errors, a hand-edited value)
    // reads as "nothing to migrate" rather than throwing — the prompt is a convenience, not a
    // guarantee, and a parse failure here must not block the rest of the screen from rendering.
    return null;
  }
}

/**
 * Clears the pre-server-store `localStorage` entry.
 *
 * Callers MUST only invoke this after a confirmed successful {@link saveAdminExecutionCredential}
 * call for the SAME key — never speculatively, never on a failed save (design doc §6: "only after
 * that PUT succeeds does the code clear the localStorage entry"). This function itself has no way
 * to enforce that ordering; it is a plain, unconditional clear, and the caller's sequencing is what
 * makes it safe. See the migration-prompt component for the enforced order.
 *
 * @complexity O(1).
 * @overallScore 100
 */
export function clearLegacyLocalCredential(): void {
  try {
    window.localStorage.removeItem(LEGACY_CREDENTIALS_STORAGE_KEY);
  } catch {
    // Best-effort. A browser that cannot clear localStorage could not have written it moments ago
    // either — this is not a new failure mode, and swallowing it here matches
    // `readLegacyLocalCredential`'s own defensive posture rather than surfacing a confusing error
    // after the part the admin actually cares about (the server save) already succeeded.
  }
}

/**
 * Reads the calling admin's OWN stored BYOK credential view — `isSet`/`masked`/the non-secret
 * fields, never the key. Thin wrapper so callers do not reach into `api.ts` directly; mirrors
 * `loadExecutionConfig`'s role for the ledger half.
 *
 * Deliberately NOT merged into `ExecutionConfig`/`loadExecutionConfig`: the ledger's
 * `byok.protocol`/`baseUrl`/`model`/`maxTokens` are the live, currently-selected values an
 * operator sees and edits every time they open Execution mode, while this store's copy of those
 * same fields is a snapshot from whenever the key was last explicitly saved — used server-side
 * only as the turn-execution fallback for a browser with an empty key field. Merging the two would
 * let a stale snapshot silently overwrite a live ledger value the admin has not saved yet.
 *
 * @complexity O(1) — one GET.
 * @overallScore 100
 */
export async function loadAdminExecutionCredential(): Promise<AdminExecutionCredential> {
  return (await api.getAdminExecutionCredential()).data;
}

/**
 * Explicit-only save for the admin's own BYOK credential. NEVER called from
 * {@link saveExecutionConfig}'s debounced ledger path — see this file's header, item 2, for why
 * that separation exists. Every caller of this function must be a deliberate operator action (a
 * "Save key" button press), not a side effect of editing an unrelated field.
 *
 * `apiKey` omitted leaves the stored key untouched (the server's own contract); an empty string is
 * rejected server-side (400) rather than silently ignored, matching `SiteAssistantCredentialPatch`.
 *
 * @complexity O(1) — one PUT.
 * @overallScore 100
 */
export async function saveAdminExecutionCredential(
  patch: AdminExecutionCredentialPatch,
): Promise<AdminExecutionCredential> {
  return (await api.setAdminExecutionCredential(patch)).data;
}

/** A key exists — either just typed in this form, or already stored on the server. Both make the
 *  BYOK runtime picker and the probe controls meaningful, which is the only thing they need to
 *  decide. Mirrors `features/ai-assistant/rules.ts`'s identical `hasUsableKey`, generalized over
 *  just the one field every caller here actually has (`isSet`) since `AdminExecutionCredential`
 *  and `SiteAssistantCredential` are otherwise differently shaped.
 *
 * @complexity O(1).
 * @overallScore 100
 */
export function hasUsableAdminKey(apiKey: string, stored: { isSet: boolean } | null): boolean {
  return Boolean(apiKey.trim()) || stored?.isSet === true;
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
  localCli: { agentId: null },
};

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

/**
 * Reads the non-secret ledger namespace and returns it as an `ExecutionConfig`. Unknown/missing
 * ledger keys fall back to `DEFAULT_EXECUTION_CONFIG` field by field, so a partially written
 * namespace still yields a usable config instead of throwing.
 *
 * `byok.apiKey` is ALWAYS `""` — the key is write-only server-side (this file's header, item 2),
 * so there is nothing to hydrate it with. A caller that needs to know whether a credential is
 * already stored must call {@link loadAdminExecutionCredential} separately and read its `isSet`.
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
  const rawLocalCliAgentId = asString(byKey.get(KEYS.localCliAgentId), "").trim();
  const rawLocalCliModel = asString(byKey.get(KEYS.localCliModel), "").trim();

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
      // Write-only — see this function's own doc. Never anything but "", regardless of whether a
      // credential is stored server-side.
      apiKey: "",
      baseUrl: asString(byKey.get(KEYS.baseUrl), defaults.byok.baseUrl),
      model: asString(byKey.get(KEYS.model), defaults.byok.model),
      ...(typeof rawMaxTokens === "number" && rawMaxTokens !== MAX_TOKENS_UNSET_SENTINEL
        ? { maxTokens: rawMaxTokens }
        : {}),
      // `savedByProviderId` (other providers' drafts) is scoped out of v1 — see this file's
      // header. Never populated; a host storing it would need its own per-provider server rows.
    },
    localCli: {
      // `""` is the ledger's "nothing picked yet" (a non-null default is
      // required — see `execution-mode-settings.ts`), which `@jini-ai/ui`
      // spells as `null`.
      agentId: rawLocalCliAgentId ? rawLocalCliAgentId : null,
      // Only the SELECTED agent's model round-trips through the ledger; see
      // the `localCli.model` definition for why the per-agent map does not.
      ...(rawLocalCliAgentId && rawLocalCliModel
        ? { modelByAgentId: { [rawLocalCliAgentId]: rawLocalCliModel } }
        : {}),
    },
  };
}

/** The model of whichever agent is currently selected — the one value the
 *  ledger persists out of `LocalCliConfig.modelByAgentId`. Returns `""` when
 *  no agent is picked or that agent has no explicit model, which is exactly
 *  the registered default. */
function selectedLocalCliModel(config: ExecutionConfig): string {
  const agentId = config.localCli.agentId;
  if (!agentId) return "";
  return config.localCli.modelByAgentId?.[agentId] ?? "";
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
    {
      key: KEYS.localCliAgentId,
      valueJson: next.localCli.agentId ?? "",
      changed: (next.localCli.agentId ?? "") !== (previous.localCli.agentId ?? ""),
    },
    {
      key: KEYS.localCliModel,
      valueJson: selectedLocalCliModel(next),
      changed: selectedLocalCliModel(next) !== selectedLocalCliModel(previous),
    },
  ];
  return pairs.filter((pair) => pair.changed).map(({ key, valueJson }) => ({ key, valueJson }));
}

/**
 * Writes only the non-secret ledger fields that actually changed. Returns the ledger keys written,
 * for "saved" UI feedback.
 *
 * Deliberately does NOT touch `next.byok.apiKey` at all, in either direction — no read, no write,
 * no comparison against `previous`. This is the function `useSettingsSlice`'s 600ms debounce calls
 * on every settled edit (`use-settings-slice.hooks.ts`), including a keystroke in the API-key
 * field that changed nothing else — see this file's header, item 2, for why the key must never be
 * reachable from that path. The practical effect: typing into the key field alone produces an
 * empty `changed` list here and writes nothing, which is the SAFE no-op this function's silence on
 * `apiKey` is meant to guarantee, not an oversight. Persisting the key is
 * {@link saveAdminExecutionCredential}'s job, called only from an explicit "Save key" action.
 */
export async function saveExecutionConfig(
  next: ExecutionConfig,
  previous: ExecutionConfig,
): Promise<readonly string[]> {
  const changed = changedLedgerEntries(next, previous);
  for (const { key, valueJson } of changed) {
    await api.setSetting({ namespace: EXECUTION_NAMESPACE, key, scope: SCOPE, valueJson });
  }
  return changed.map((entry) => entry.key);
}

/**
 * `useSettingsSlice`'s `reconcileRefresh` option for the Execution slice — preserves the operator's
 * in-memory, typed-but-not-yet-explicitly-saved `byok.apiKey` across a `refresh()`-triggered reload.
 *
 * `loadExecutionConfig` always returns `byok.apiKey: ""` (this file's header, item 2 — the server
 * never returns key material), and `refresh()` fires on ANY out-of-band notification — including a
 * same-tab echo of THIS SLICE'S OWN debounced write arriving back over the settings-changed SSE feed
 * (`settings-events.ts`; `src/server/routes/admin/settings/events.ts` broadcasts to every open
 * connection for the workspace on a ~1s poll, the writer's own tab included, with no self-exclusion).
 *
 * The failure this prevents: an operator types a key, then edits a ledger field (baseUrl, model,
 * ...) in the same 600ms window. The settled debounce calls {@link saveExecutionConfig}, which
 * persists the ledger field and correctly ignores `apiKey`. `refresh()`'s own guards
 * (`use-settings-slice.hooks.ts`) see no pending timer and no unsaved edit once that save resolves —
 * by design, since the edit WAS saved, just not the key half of it — so when the SSE echo of that
 * same write arrives moments later, `refresh()` proceeds and would otherwise overwrite `value` with
 * the reload's `apiKey: ""`, silently discarding the typed key before the operator can reach the
 * explicit "Save key" control. Measured as: type a key, wait ~600ms, and the field goes empty and
 * "Save key" disables itself with no operator action in between.
 *
 * Preserving the in-memory key across every reload is correct precisely because
 * {@link saveExecutionConfig} never persists it in the first place (this file's header, item 2) — a
 * reload can never be "more current" about a field it never wrote or read, so `loaded`'s empty value
 * carries no information worth keeping. Every OTHER `byok`/`localCli`/`mode` field still takes the
 * reload's value unconditionally, same as a slice with no reconciler at all.
 *
 * @complexity O(1).
 * @overallScore 100
 */
export function reconcileExecutionConfigRefresh(current: ExecutionConfig, loaded: ExecutionConfig): ExecutionConfig {
  return { ...loaded, byok: { ...loaded.byok, apiKey: current.byok.apiKey } };
}

/**
 * Tovu's real `ExecutionPort` — wired to `src/server/modules/assistant-
 * execution.ts`'s 3 routes (`@jini-ai/agent-runtime` underneath). Follows
 * `@jini-ai/ui`'s `ports.ts` contract (error-reporting contract §3.1):
 *
 * - `detectLocalAgents`/`rescanLocalAgents`/`listModels` REJECT on any
 *   failure (a network error, a non-2xx from this admin's own route, a
 *   provider that could not be reached). An empty array is reserved for a
 *   real "detection ran, found nothing" / "no models" outcome — collapsing a
 *   broken request into `[]` would make it indistinguishable from that,
 *   which is exactly the bug this port used to have.
 * - `testConnection` is the one documented exception: `api.testExecutionConnection`
 *   already classifies "reached the provider, credentials rejected" as an
 *   `{ok:false}` VALUE server-side (`test-connection.ts`), so this method
 *   simply returns whatever it resolves with. It only REJECTS when the
 *   route call itself fails (session expired, network down, this admin's own
 *   route 500ing) — a case with no provider-side answer to report as a value.
 */
async function requestAgentDetection() {
  return (await api.detectExecutionAgents()).data;
}

/**
 * Last detection, shared across every `ExecutionTab` mount in this tab's
 * lifetime.
 *
 * Detection is not cheap and it is not local: `detect-agents.ts` calls
 * `@jini-ai/agent-runtime`'s `detectAgents()`, which SPAWNS every known CLI
 * with `--version` — two dozen processes on the Tovu server per call. The tab
 * asks for it unconditionally on mount (`useExecutionTab.ts`'s auto-detect
 * effect), and the shell renders only the ACTIVE tab's panel, so leaving
 * Execution mode unmounts the component and returning to it re-runs the whole
 * sweep. Same on every visit to the settings page. Without this cache the
 * operator pays a fresh 24-process scan for what is, in practice, a fixed
 * answer.
 *
 * Module-scoped rather than a `useRef`/context on purpose: the point is to
 * outlive the component, and `SettingsUi` builds a NEW port object per mount
 * (`useRef(createExecutionPort())`), so anything held on the port instance
 * would die with it.
 *
 * Deliberately no TTL. Installing a CLI mid-session is the only way this goes
 * stale, and that case already has a purpose-built, clearly-labelled escape
 * hatch — the Rescan button, which bypasses this cache (see
 * `rescanLocalAgents` below). A reload clears it too. A TTL would only add a
 * second, invisible refresh rule on top of the explicit one.
 */
let cachedDetection: ReturnType<typeof requestAgentDetection> | null = null;

/** Caches the in-flight promise, not just the settled value — two tabs
 *  mounting in the same frame then share one request instead of racing two
 *  identical process sweeps. */
function cacheDetection(inFlight: ReturnType<typeof requestAgentDetection>) {
  cachedDetection = inFlight;
  // A rejection must never be cached: one network blip would otherwise pin the
  // error in place for the rest of the session, and the port's contract is
  // that a failure REJECTS (see this function's doc) — so a retry has to be
  // able to actually retry.
  inFlight.catch(() => {
    if (cachedDetection === inFlight) cachedDetection = null;
  });
  return inFlight;
}

/** Test seam. Module state persists across cases in a file, so a suite that
 *  asserts on detection has to be able to start from cold. */
export function resetLocalAgentDetectionCache(): void {
  cachedDetection = null;
}

export interface CreateExecutionPortOptions {
  /**
   * When `true`, probes that receive no typed API key ask the server to use the workspace's STORED
   * site credential instead.
   *
   * For the AI Assistant tab, whose key is encrypted server-side and write-only: the operator
   * returns to a screen with a saved, working key and an EMPTY field, so "Test connection" and model
   * discovery had nothing to send and sat permanently disabled next to a credential that works.
   *
   * Left `false` for Settings → Execution mode, and that default is the safety property, not an
   * oversight: that screen probes the ADMIN's own credential (server-side since 2026-08-05, but
   * still a DIFFERENT stored row from the site's), a different purpose from this flag entirely. If
   * it opted in, an empty field there would silently probe — and report results for — the visitor
   * key, crossing the boundary ADR-058 §5 makes structural. (The admin's OWN stored fallback for a
   * BYOK *turn* is unconditional and happens entirely server-side in `assistant-byok.ts` — this
   * flag only ever concerns the SITE credential these `test-connection`/`list-models` probes can
   * optionally fall back to.)
   */
  useStoredCredential?: boolean;
}

export function createExecutionPort(options: CreateExecutionPortOptions = {}): ExecutionPort {
  const { useStoredCredential = false } = options;
  return {
    async detectLocalAgents() {
      return cachedDetection ?? cacheDetection(requestAgentDetection());
    },
    async rescanLocalAgents() {
      // Explicit operator action: always re-probe, and make the fresh result
      // the new baseline for subsequent mounts.
      return cacheDetection(requestAgentDetection());
    },
    async testConnection(config: ByokConfig) {
      return api.testExecutionConnection({
        protocol: config.protocol,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        ...(useStoredCredential ? { useStoredCredential: true } : {}),
      });
    },
    async testAgent(agentId: string, model?: string | undefined) {
      // Same `{ok:false}`-is-a-value split as `testConnection`: the route
      // classifies "the CLI ran and reported it is not usable" server-side and
      // returns it as a value, and REJECTS (throws out of `api.*`) only when
      // the probe could not run at all.
      return api.testExecutionAgent({ agentId, ...(model ? { model } : {}) });
    },
    async listModels(config: ByokConfig) {
      const result = await api.listExecutionModels({
        protocol: config.protocol,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        ...(useStoredCredential ? { useStoredCredential: true } : {}),
      });
      // `result.ok === false` here is ALWAYS "discovery could not reach/read the
      // provider" (auth failure, timeout, blocked base URL, unsupported protocol)
      // — `list-models.ts`'s route never reports a reachable-but-genuinely-empty
      // catalog as `ok:false`, so there is no legitimate value to return here.
      // Reject with the server's own message rather than resolving `[]`.
      if (!result.ok) {
        throw new Error(result.message?.trim() ? result.message : "Model discovery failed");
      }
      return result.models;
    },
  };
}
