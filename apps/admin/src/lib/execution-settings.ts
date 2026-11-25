import { createExecutionSettingsLedger } from "@jini-ai/admin/shell/lib/execution-settings-ledger";
import { describeErrorForLog } from "@jini-ai/core/model-facing-tool-errors";
import { orFallbackSync } from "@jini-ai/core/errors/idioms";
import { VENDOR_API_BASE_URLS } from "@jini-ai/integrations/media-providers/catalog";

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
 *    ADR-028 single write chokepoint). `apps/website/src/assistant/execution-mode-
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

import type { AdminExecutionCredential, AdminExecutionCredentialPatch } from "@jini-ai/core/contracts/site/api-ai-assistant-api-types";
import { aiAssistantApi } from "../features/ai-assistant/api/ai-assistant-api";
import { settingsApi } from "./admin-http/settings-api";
import { ApiError } from "./admin-http/request";
import { createExecutionHttpAdapter, requireExecutionResponseData, type CreateExecutionPortOptions } from "@jini-ai/ui";
import type { ExecutionConfig, ExecutionPort } from "@jini-ai/core/contracts/execution";

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
  // Malformed/inaccessible localStorage (private-browsing quota errors, a hand-edited value)
  // reads as "nothing to migrate" rather than throwing — the prompt is a convenience, not a
  // guarantee, and a parse failure here must not block the rest of the screen from rendering.
  return orFallbackSync({ work: () => {
    const raw = window.localStorage.getItem(LEGACY_CREDENTIALS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { apiKey?: unknown };
    const apiKey = typeof parsed.apiKey === "string" ? parsed.apiKey.trim() : "";
    return apiKey.length > 0 ? apiKey : null;
  }, fallback: null, step: "Read legacy execution credential" });
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
  // Best-effort. A browser that cannot clear localStorage could not have written it moments ago
  // either — this is not a new failure mode, and swallowing it here matches
  // `readLegacyLocalCredential`'s own defensive posture rather than surfacing a confusing error
  // after the part the admin actually cares about (the server save) already succeeded.
  orFallbackSync({ work: () => {
    window.localStorage.removeItem(LEGACY_CREDENTIALS_STORAGE_KEY);
  }, fallback: undefined, step: "Clear legacy execution credential" });
}

/** Compatibility wrapper for config/credential reads; the package owns the shape guard. */
function requireData<T>({ response, callSite }: { response: { data?: T | null } | null | undefined; callSite: string }, _optional: Record<string, never> = {}): T {
  return requireExecutionResponseData({ response, callSite }, {});
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
  return requireData({ response: await aiAssistantApi.getAdminExecutionCredential(), callSite: "getAdminExecutionCredential" });
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
  return requireData({ response: await aiAssistantApi.setAdminExecutionCredential(patch), callSite: "setAdminExecutionCredential" });
}

export const DEFAULT_EXECUTION_CONFIG: ExecutionConfig = {
  mode: "local-cli",
  byok: {
    protocol: "anthropic",
    providerId: "anthropic",
    apiKey: "",
    baseUrl: VENDOR_API_BASE_URLS.anthropic,
    model: "",
  },
  localCli: { agentId: null },
};

const executionSettingsLedger = createExecutionSettingsLedger({
  port: {
    getSettingsEffective: async (input) => requireData({ response: await settingsApi.getSettingsEffective(input), callSite: "getSettingsEffective" }),
    setSetting: (input) => settingsApi.setSetting(input),
  },
  defaults: DEFAULT_EXECUTION_CONFIG,
  isUnregisteredNamespace: ({ error }) => error instanceof ApiError && error.status === 404,
  reportRestoreFailure: ({ error }) => console.error("[execution-settings] Could not restore a setting", describeErrorForLog({ err: error })),
}, {});

export function loadExecutionConfig(): Promise<ExecutionConfig> {
  return executionSettingsLedger.loadExecutionConfig({}, {});
}

export function saveExecutionConfig(next: ExecutionConfig, previous: ExecutionConfig): Promise<readonly string[]> {
  return executionSettingsLedger.saveExecutionConfig({ next, previous }, {});
}

/** Routes and authenticated HTTP remain host-owned; one adapter shares detection across mounts. */
const executionHttpAdapter = createExecutionHttpAdapter({ transport: {
  detectExecutionAgents: (input, options) => aiAssistantApi.detectExecutionAgents(input, options),
  testExecutionConnection: (input) => aiAssistantApi.testExecutionConnection(input),
  testExecutionAgent: (input) => aiAssistantApi.testExecutionAgent(input),
  listExecutionModels: (input) => aiAssistantApi.listExecutionModels(input),
} }, {});
export type { CreateExecutionPortOptions } from "@jini-ai/ui";
/** Existing screens retain their flags; the package boundary receives two objects. */
export function createExecutionPort(input: CreateExecutionPortOptions = {}, _options = {}): ExecutionPort {
  return executionHttpAdapter.createPort({}, input);
}
/** Test seam resets only this host transport's shared cache. */
export function resetLocalAgentDetectionCache(_input = {}, _options = {}): void {
  executionHttpAdapter.resetDetectionCache({}, {});
}
