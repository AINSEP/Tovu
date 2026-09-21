import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_PROVIDER_PRESETS,
  nextConfigForPresetSelect,
  resolveSelectedPreset,
  type ByokConfig,
  type ConnectionTestState,
  type ExecutionPort,
  type ModelDiscoveryState,
  type ProviderPreset,
} from "@jini-ai/ui";

import { useSerialWrites } from "@/hooks/use-serial-writes.hooks";
import type { SiteAssistantCredential, SiteAssistantCredentialPatch } from "@/lib/api";
import type { Translate } from "@/lib/dictionary-translator";
import { createExecutionPort } from "@/lib/execution-settings";
import {
  STORED_KEY_OTHER_PROVIDER_COPY,
  describeProbeError,
  hasUsableKey,
  storedKeyBlocksProbe,
  storedKeyIsForOtherEndpoint as storedKeyIsForOtherEndpointRule,
} from "@/lib/stored-credential-endpoint";
import {
  configuredPresetIds as configuredPresetIdsRule,
  describeApiError,
  hasStoredCredential,
  hydrateVisitorCredentialConfig,
  isPresetSuppliedEndpoint,
} from "../rules";
import { defaultVisitorCredentialFormPort } from "./visitor-credential-form-dependencies.hooks";
import type { VisitorCredentialFormPort } from "./visitor-credential-form-port.hooks";

/**
 * @file Everything `VisitorCredentialForm` does, so the component in `AiAssistant.tsx` is only
 * markup. Extracted verbatim — same state, same order, same effects, same error strings.
 *
 * See `VisitorCredentialForm`'s own doc comment in `AiAssistant.tsx` for what this form is (the
 * SITE's provider credential, distinct from the admin's own BYOK key in Settings → Execution mode)
 * and for the ADR-058 write-only server-side store it saves to.
 */

/** How long the key field must be quiet before discovery fires. Long enough that typing or pasting a
 *  key is one request rather than one per keystroke — the concern `ExecutionTab`'s own discovery
 *  effect documents ("refetching on every keystroke would spam the provider") — and short enough
 *  that a paste feels immediate. */
const MODEL_DISCOVERY_DEBOUNCE_MS = 700;

/** Save's user-visible state. `saved` carries the server's own view back so the line under the key
 *  field can report what is actually stored rather than what was sent. */
export type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; at: string | null }
  | { status: "error"; message: string };

/** The writers {@link saveVisitorKey} needs, grouped rather than passed as loose setters beside
 *  loose values. A save either advances all of them or none.
 *
 *  `setDirty` is deliberately absent: `dirty` tracks unsaved SETTINGS, and a key write does not save
 *  them — see {@link saveVisitorSettings}, which is the only thing that clears it. */
export interface VisitorCredentialSaveWriters {
  setSaveState: (state: SaveState) => void;
  setStored: (stored: SiteAssistantCredential) => void;
  setConfig: (updater: (current: ByokConfig) => ByokConfig) => void;
}

/** {@link saveVisitorSettings}'s own writers — its own save state, the server's returned view, and
 *  the `dirty` flag it is the sole clearer of. */
export interface VisitorCredentialSettingsSaveWriters {
  setSettingsSaveState: (state: SaveState) => void;
  setStored: (stored: SiteAssistantCredential) => void;
  setDirty: (dirty: boolean) => void;
}

export interface VisitorCredentialFormController {
  config: ByokConfig;
  /** Every edit that originates from a CONTROL goes through here, so `dirty` reflects the operator
   *  and never hydration or discovery. */
  editConfig: (next: ByokConfig) => void;
  preset: ProviderPreset | null;
  discovery: ModelDiscoveryState;
  connectionTest: ConnectionTestState;
  /** The server's write-only view of what is currently stored (`isSet` + `masked`), never the key. */
  stored: SiteAssistantCredential | null;
  /** The "Save key" button's own save state. Never advanced by {@link saveSettings}. */
  saveState: SaveState;
  /** The "Save settings" button's own save state, deliberately separate from {@link saveState}: two
   *  buttons writing two disjoint patches need two answers, and one shared state is exactly what let
   *  a settings-only press report that a key had been stored. */
  settingsSaveState: SaveState;
  /**
   * True once the operator has actually changed something — what "Save settings" is enabled by.
   *
   * State rather than a ref because a button's disabled-ness has to re-render on it. Set ONLY from
   * `editConfig`, so neither hydration nor discovery seeding a model counts as an edit; without
   * that separation the button would light up on load offering to write back the values the server
   * just sent, and — if the initial GET had failed — to write this form's hardcoded defaults over a
   * perfectly good stored credential.
   */
  dirty: boolean;
  /** A key a probe can use here — just typed, or stored on the server FOR THIS ENDPOINT. That is what
   *  makes the two probe controls meaningful, which is the only thing they need to decide. */
  hasUsableKey: boolean;
  hasStoredKey: boolean;
  /** A key is stored, but the server saved it for another endpoint than the form's (a provider
   *  switch). With nothing typed, no probe sends it and the key line asks for this provider's key.
   *  See `rules.ts`'s `storedKeyIsForOtherEndpoint`. */
  storedKeyIsForOtherEndpoint: boolean;
  /** Which provider presets the current credentials already satisfy — feeds each `ProviderChipGroup`'s
   *  filled/unfilled dot. */
  configuredPresetIds: Set<string>;
  selectPreset: (next: ProviderPreset) => void;
  /** Writes the KEY only — see {@link saveVisitorKey}. */
  saveKey: () => Promise<void>;
  /** Writes provider/baseUrl/model only, never a key — see {@link saveVisitorSettings}. */
  saveSettings: () => Promise<void>;
  runKeyTest: () => Promise<void>;
  runTestConnection: () => Promise<void>;
}

/**
 * The "Save key" press — writes the KEY and nothing else.
 *
 * ## Why this is half of what it used to be (owner ruling, 2026-09-02)
 *
 * One control used to write the key AND provider/baseUrl/model together, mirroring the admin BYOK
 * panel's identical overload. A button with two jobs cannot honestly report which one it just did:
 * pressing it with an empty field sent a patch carrying no `apiKey` at all and still answered "Saved
 * to the server, encrypted." The fix is not a better message, it is one job per button —
 * {@link saveVisitorSettings} took the other half.
 *
 * A blank or whitespace-only field is a no-op, not a partial write. That is a real narrowing: the
 * old guard let a blank field through whenever a key was already stored, on the strength of the
 * OTHER fields being worth writing. Those fields have their own button now, so the only thing left
 * to check is whether there is a key to send.
 *
 * Extracted as a top-level function, not a nested closure, per the complexity-pass extraction rule —
 * see `VisitorCredentialForm`'s own doc comment in `AiAssistant.tsx` for the "why an explicit press,
 * not a debounce" reasoning both halves implement.
 */
export async function saveVisitorKey(deps: {
  /** Injected, not imported — see {@link VisitorCredentialFormPort}. */
  api: VisitorCredentialFormPort;
  /** The whole draft, rather than the one field picked out of it, for symmetry with
   *  {@link saveVisitorSettings} and so a future field cannot be forgotten at one call site. */
  config: ByokConfig;
  writers: VisitorCredentialSaveWriters;
}): Promise<void> {
  const { setSaveState, setStored, setConfig } = deps.writers;
  const apiKey = deps.config.apiKey.trim();
  if (!apiKey) return; // nothing typed — there is no key to write

  // The key ALONE, built from one literal so no branch here can let another field through.
  const patch: SiteAssistantCredentialPatch = { apiKey };

  setSaveState({ status: "saving" });
  try {
    const { data } = await deps.api.setAssistantSiteCredential(patch);
    // The SERVER's view, not the patch that was sent — same reasoning as `setPublicEnabled` in
    // `use-ai-assistant.hooks.ts`. A partially-applied or rejected write must not leave this screen
    // claiming a key is stored when it is not.
    setStored(data);
    setSaveState({ status: "saved", at: data.updatedAt });
    // Clear the field once the key is safely stored. Leaving the plaintext sitting in a React
    // state tree after it has been persisted keeps it readable in devtools for no benefit, and the
    // masked placeholder now carries the "which key" answer the field would otherwise be giving.
    setConfig((current) => ({ ...current, apiKey: "" }));
  } catch (e) {
    setSaveState({ status: "error", message: describeApiError(e, "failed to save the key") });
  }
}

/**
 * The "Save settings" press — writes provider/baseUrl/model and NEVER an `apiKey` property.
 *
 * Not even an empty string: `put-site-credential.ts` rejects that with a 400, and it is precisely
 * the write the old overloaded control could make. The field's contents are not read here at all, so
 * there is no state of the form in which this patch can grow a key.
 *
 * `dirty` is cleared here and only here — it means "settings changed since they were last written",
 * which is exactly the question this button answers. {@link saveVisitorKey} leaves it alone.
 */
export async function saveVisitorSettings(deps: {
  api: VisitorCredentialFormPort;
  config: ByokConfig;
  writers: VisitorCredentialSettingsSaveWriters;
}): Promise<void> {
  const { config } = deps;
  const { setSettingsSaveState, setStored, setDirty } = deps.writers;

  const patch: SiteAssistantCredentialPatch = {
    provider: config.protocol,
    baseUrl: config.baseUrl,
    model: config.model,
  };

  setSettingsSaveState({ status: "saving" });
  try {
    const { data } = await deps.api.setAssistantSiteCredential(patch);
    setStored(data);
    setSettingsSaveState({ status: "saved", at: data.updatedAt });
    setDirty(false);
  } catch (e) {
    setSettingsSaveState({ status: "error", message: describeApiError(e, "failed to save the settings") });
  }
}

/**
 * Save key's status line — whether the KEY reached the server, and nothing else. One of four
 * mutually exclusive messages keyed on `saveState.status` (plus `stored` for the two "idle"
 * variants), pulled to a top-level pure function for the same reason as `AiAssistant.tsx`'s
 * `visitorCredentialKeyStatusMessage`.
 *
 * `dirty` is deliberately NOT read here any more (two-button split, 2026-09-02). It means "settings
 * changed since they were last written", which is {@link visitorCredentialSettingsStatusMessage}'s
 * question — under the KEY field it would have announced an unsaved model change as though the key
 * were the thing left unsaved.
 *
 * The "WHICH key is stored" question lives in the field's own masked placeholder
 * (`visitorCredentialApiKeyPlaceholder`, `AiAssistant.tsx`), which is where an operator looks for it.
 * That mask went through a full round trip of being removed and restored during design, so the
 * conclusion is worth recording here too: it is a deliberate, bounded disclosure — without it the
 * field is blank and cannot distinguish "nothing was ever saved" from "a key is saved and working",
 * an ambiguity worse than four characters.
 *
 * @param t - Defaults to English passthrough for `VisitorCredentialForm.unit.test.tsx`'s direct,
 *   locale-unaware calls, which keep asserting the exact English strings they always have.
 * @param storedKeyIsForOtherEndpoint - The controller's flag of the same name. When set, the idle line
 *   asks for this provider's key instead of reporting a stored key this provider cannot use.
 */
export function visitorCredentialSaveStatusMessage(
  saveState: VisitorCredentialFormController["saveState"],
  stored: VisitorCredentialFormController["stored"],
  t: Translate = (key) => key,
  storedKeyIsForOtherEndpoint = false,
): string | null {
  if (saveState.status === "saving") return t("Saving…");
  if (saveState.status === "saved") return t("Saved to the server, encrypted.");
  if (saveState.status !== "idle") return null;
  if (storedKeyIsForOtherEndpoint) return t(STORED_KEY_OTHER_PROVIDER_COPY);
  if (stored?.isSet) return t("Stored on the server, encrypted. Paste a new key to replace it.");
  return t("Paste your key, check it with Show, then press Save key.");
}

/**
 * Save settings' own status line.
 *
 * Says "Settings saved." and never anything about encryption or the server holding a key: this
 * button sends no `apiKey`, so borrowing {@link visitorCredentialSaveStatusMessage}'s "Saved to the
 * server, encrypted." would recreate — under a new button — the exact false confirmation the split
 * exists to remove.
 *
 * @param t - Same seam as its sibling above.
 */
export function visitorCredentialSettingsStatusMessage(
  settingsSaveState: VisitorCredentialFormController["settingsSaveState"],
  t: Translate = (key) => key,
): string | null {
  if (settingsSaveState.status === "saving") return t("Saving…");
  if (settingsSaveState.status === "saved") return t("Settings saved.");
  return null;
}

/**
 * The explicit "Test Key" press — extracted for the same reason as {@link saveVisitorCredential}.
 * Runs against WHATEVER endpoint is in `config`, preset or not, unlike the debounced automatic
 * discovery effect: an operator pressing a button labelled "Test Key" has deliberately chosen to
 * send this credential to the host they typed.
 */
async function runVisitorKeyTest(deps: {
  port: ExecutionPort;
  config: ByokConfig;
  setDiscovery: (state: ModelDiscoveryState) => void;
  setConfig: (updater: (current: ByokConfig) => ByokConfig) => void;
}): Promise<void> {
  const { port, config, setDiscovery, setConfig } = deps;
  setDiscovery({ status: "loading" });
  try {
    const models = (await port.listModels?.(config)) ?? [];
    setDiscovery({ status: "ok", models });
    setConfig((current) =>
      current.model.trim() || models.length === 0
        ? current
        : { ...current, model: models.find((m) => m === "gemini-flash-latest") ?? (models[0] as string) },
    );
  } catch (e) {
    setDiscovery({ status: "error", message: describeProbeError(e, "Could not reach the provider with that key") });
  }
}

/**
 * Refreshes discovery after an explicit connection test — extracted for the same reason as
 * {@link saveVisitorCredential}. The debounced effect can't recover from a transient discovery
 * failure on its own (nothing about the credential changed afterwards), so without this the
 * operator would be stuck looking at a stale error next to a connection that just went green. Only
 * called by {@link runVisitorTestConnection} below, on a successful test.
 */
async function refreshVisitorDiscoveryAfterTest(deps: {
  port: ExecutionPort;
  config: ByokConfig;
  setDiscovery: (state: ModelDiscoveryState) => void;
}): Promise<void> {
  const { port, config, setDiscovery } = deps;
  if (!config.apiKey.trim()) return;
  try {
    const models = await port.listModels?.(config);
    if (models) setDiscovery({ status: "ok", models });
  } catch {
    // Leave whatever discovery state already exists — the connection result is the answer the
    // operator asked for, and failing to also refresh the list must not overwrite it.
  }
}

/** Turns the port's raw `testConnection` result into the screen's `ConnectionTestState` — pulled
 *  out of {@link runVisitorTestConnection} per the complexity-pass extraction rule. This was an
 *  inline optional-chain/`||`/ternary cluster that put the parent at 10/5 — over the ceiling on
 *  cyclomatic alone once it tightened to ≤9/≤9 mid-pass. Same treatment as `AiAssistant.tsx`'s
 *  `visitorCredentialSaveStatusMessage` sibling. */
function connectionTestStateFromResult(result: { ok: boolean; message?: string } | undefined): ConnectionTestState {
  if (!result) return { status: "error", message: "Connection test failed" };
  if (result.ok) return { status: "ok", message: result.message };
  return { status: "error", message: result.message || "Connection test failed" };
}

/** The explicit "Test connection" press — extracted for the same reason as
 *  {@link saveVisitorCredential}. */
async function runVisitorTestConnection(deps: {
  port: ExecutionPort;
  config: ByokConfig;
  setConnectionTest: (state: ConnectionTestState) => void;
  setDiscovery: (state: ModelDiscoveryState) => void;
}): Promise<void> {
  const { port, config, setConnectionTest, setDiscovery } = deps;
  setConnectionTest({ status: "testing" });
  try {
    const result = await port.testConnection?.(config);
    setConnectionTest(connectionTestStateFromResult(result));
    if (result?.ok) await refreshVisitorDiscoveryAfterTest({ port, config, setDiscovery });
  } catch (e) {
    setConnectionTest({ status: "error", message: describeProbeError(e, "Connection test failed") });
  }
}

export interface VisitorCredentialFormDependencies {
  /** Follows `useAiAssistant`/`useComposioConfig`'s `{ port }` dependencies shape — required here
   *  (not defaulted internally), so the real client is supplied exactly once, by
   *  {@link useWiredVisitorCredentialForm} below, rather than by every caller re-stating the
   *  fallback. */
  port: VisitorCredentialFormPort;
}

/**
 * Everything `VisitorCredentialForm` does: config state, hydration from the server, the two debounced
 * and on-demand model-discovery paths, connection testing, and the explicit save. See this file's own
 * header for what this form is and `VisitorCredentialForm`'s doc comment in `AiAssistant.tsx` for the
 * screen it backs.
 *
 * `port` is injected — see `visitor-credential-form-port.hooks.ts` — rather than importing `lib/api`
 * directly, so a test can describe hydration/save against `createFakeVisitorCredentialFormPort`
 * instead of stubbing global `fetch` or spying on the module singleton.
 * {@link useWiredVisitorCredentialForm} below is the zero-argument pair `AiAssistant.tsx` actually
 * mounts.
 *
 * @param deps - `{ port }` — the site-credential client this form reads and writes through.
 * @returns The full form controller: config, discovery/connection-test state, and the save/test
 *   handlers `VisitorCredentialForm` renders.
 * @complexity Time: O(1) per call across every handler — one request per save/test/discovery pass,
 *   no caller-controlled collections. Space: O(1).
 */
export function useVisitorCredentialForm({
  // Renamed from the destructured `port` at the binding site — this function ALSO declares its own
  // local `port` below (the unrelated `ExecutionPort` used for model discovery/connection tests), and
  // the two would otherwise collide in the same scope. Same "rename the local binding, not the prop"
  // rule `INFO.md`'s components section documents for an identical name clash.
  port: credentialPort,
}: VisitorCredentialFormDependencies): VisitorCredentialFormController {
  // A ref so the hydration effect can read it without listing it as a dependency, and so swapping
  // the prop mid-life cannot re-run that one-shot effect. Same lifetime rule as `port` below (the
  // OTHER port — `ExecutionPort`, for model discovery/connection tests — not this credential one).
  const apiRef = useRef<VisitorCredentialFormPort>(credentialPort);

  const [config, setConfig] = useState<ByokConfig>(() => ({
    protocol: "google",
    providerId: "google-gemini",
    apiKey: "",
    baseUrl: "https://generativelanguage.googleapis.com",
    // Empty, NOT pre-filled with the server's current default. An earlier revision hardcoded
    // `gemini-flash-latest` here purely to avoid rendering a required-field marker, which was a
    // cosmetic reason to state something the operator had not chosen — and worse, it invited them to
    // keep a value this form had invented. The model list is a property OF THE KEY, so it stays
    // empty until a key produces one. See `discovery` below.
    model: "",
  }));

  const preset = useMemo(() => resolveSelectedPreset(DEFAULT_PROVIDER_PRESETS, config), [config]);
  // One port instance for this component's lifetime, matching `SettingsUi.tsx`'s `useRef` usage —
  // these are the SAME admin routes the Settings screen probes with, and they take the credential in
  // the request body rather than reading a stored one. That is what makes both controls below work
  // today, before this tab's own server-side store exists: they probe the key the operator just
  // typed, which is exactly the question being asked ("is this key any good, and what can it run?").
  // `useStoredCredential` is what makes both probes work against a key this browser does not have.
  // Without it, an operator returning to a screen with a saved key faces an empty field, so
  // "Test Key" and "Test connection" had nothing to send and sat disabled beside a working
  // credential. Settings → Execution mode deliberately does NOT opt in — different key, and an
  // implicit fallback there would probe the visitor credential instead of the admin's own.
  const port = useRef(createExecutionPort({ useStoredCredential: true }));

  const [discovery, setDiscovery] = useState<ModelDiscoveryState>({ status: "idle" });
  const [connectionTest, setConnectionTest] = useState<ConnectionTestState>({ status: "idle" });

  /** The server's write-only view of what is currently stored (`isSet` + `masked`), never the key. */
  const [stored, setStored] = useState<SiteAssistantCredential | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [settingsSaveState, setSettingsSaveState] = useState<SaveState>({ status: "idle" });

  /**
   * True once the operator has actually changed something — what Save is enabled by.
   *
   * State rather than a ref because a button's disabled-ness has to re-render on it. Set ONLY from
   * {@link editConfig}, so neither hydration nor discovery seeding a model counts as an edit; without
   * that separation Save would light up on load offering to write back the values the server just
   * sent, and — if the initial GET had failed — to write this form's hardcoded defaults over a
   * perfectly good stored credential.
   */
  const [dirty, setDirty] = useState(false);

  /** Every edit that originates from a CONTROL goes through here, so `dirty` reflects the operator
   *  and never hydration or discovery. */
  function editConfig(next: ByokConfig) {
    setDirty(true);
    setConfig(next);
  }

  // Hydrate from the server once. This is what makes the screen honest across sessions: without it
  // an operator who saved a key last week reopens the tab, sees an empty key field, and reasonably
  // concludes nothing was ever stored. The KEY cannot come back (the route is write-only by design),
  // so what hydrates is everything else — provider, base URL, model (`rules.ts`'s
  // `hydrateVisitorCredentialConfig`) — plus `isSet`/`masked`, which is what the "A key is stored"
  // line under the field reports.
  useEffect(() => {
    let cancelled = false;
    apiRef.current
      .getAssistantSiteCredential()
      .then(({ data }) => {
        if (cancelled) return;
        setStored(data);
        setConfig((current) => hydrateVisitorCredentialConfig(current, data));
      })
      // Silent: a failed read must not put an error next to a key field the operator has not touched
      // yet. The consequence is only that the stored-state line stays absent, and the save effect's
      // own error path still reports anything that goes wrong on the write.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const { apiKey, baseUrl, protocol } = config;
  const storedKeyIsForOtherEndpoint = storedKeyIsForOtherEndpointRule(stored, baseUrl);
  const usableKey = hasUsableKey(apiKey, stored, baseUrl);

  /**
   * Discovery on load, for a key this browser does not have.
   *
   * The debounced effect below only fires on TYPING, which is right for a key being entered for the
   * first time and useless for one already stored: the field is empty, nothing is typed, and the
   * operator sees no models at all for a credential the server can use perfectly well. So a stored
   * key gets one discovery pass when the screen opens.
   *
   * Runs off `stored?.isSet` rather than the mount, so it fires once hydration has confirmed a key
   * exists — and only when the field is empty, so it can never race or duplicate the typed path.
   *
   * Skipped when the stored key belongs to another endpoint (a provider switch): the server refuses
   * that probe, and the key line asks for this provider's key instead. Deliberately NOT keyed on that
   * flag: it also flips when "Save settings" re-points the stored row at the form's endpoint, and an
   * automatic probe at that moment would send the previous provider's key to the new one unasked.
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on stored flag + endpoint only — see doc comment above; `config` as a whole would re-run on every model/max-tokens edit.
  useEffect(() => {
    if (!stored?.isSet || apiKey.trim() || storedKeyIsForOtherEndpoint) return;
    let cancelled = false;
    setDiscovery({ status: "loading" });
    port.current
      .listModels?.({ ...config, apiKey: "" })
      .then((models) => {
        if (cancelled) return;
        setDiscovery({ status: "ok", models });
        setConfig((current) =>
          current.model.trim() || models.length === 0
            ? current
            : { ...current, model: models.find((m) => m === "gemini-flash-latest") ?? (models[0] as string) },
        );
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setDiscovery({ status: "error", message: describeProbeError(e, "Model discovery failed") });
      });
    return () => {
      cancelled = true;
    };
  }, [stored?.isSet, baseUrl, protocol]);

  // Nothing on this screen writes a credential except these two functions, called from the two Save
  // buttons. Why an explicit press rather than the debounce this used to be, and why each patch
  // carries what it carries — see `saveVisitorKey`/`saveVisitorSettings`'s own doc comments above
  // (moved WITH the functions in the complexity-pass extraction, not summarised here).
  const hasStoredKey = hasStoredCredential(stored);

  // One lane for both Save buttons, which can be enabled at the same time. The server builds every
  // write from the row it reads first (`site-credential-store.ts`'s `setSiteAssistantCredential`:
  // read → seal → upsert the whole merged record), so a key PUT and a settings PUT in flight together
  // each merge over the same old row and the later upsert reverts the other's field. Queued through
  // the shared lane, the second PUT reads what the first wrote. Tab-local — two tabs still race;
  // closing that needs a server-side check. Same shared primitive as
  // `use-other-credentials.hooks.ts`'s `writes`.
  const writes = useSerialWrites();

  function saveKey() {
    return writes.run(() => saveVisitorKey({ api: apiRef.current, config, writers: { setSaveState, setStored, setConfig } }));
  }

  function saveSettings() {
    return writes.run(() =>
      saveVisitorSettings({
        api: apiRef.current,
        config,
        writers: { setSettingsSaveState, setStored, setDirty },
      }),
    );
  }

  // `isPresetSuppliedEndpoint` (in `../rules.ts`) is the SECURITY GATE for the debounced discovery
  // effect below — read its doc comment there before touching either. Memoised on `baseUrl` alone,
  // matching the effect's own dependency list.
  const presetSuppliedEndpoint = useMemo(() => isPresetSuppliedEndpoint(baseUrl), [baseUrl]);

  /**
   * Debounced, key-driven model discovery.
   *
   * Keyed on the credential itself (key + endpoint), unlike `ExecutionTab`'s own effect which is
   * deliberately keyed only on the endpoint. That difference is the point of this screen: there, the
   * key is already saved and the operator is switching providers; here, the operator is entering a
   * key for the first time and the only useful moment to look up its models is right after they
   * finish typing it. The debounce is what makes keying on the key affordable.
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the credential itself (key+endpoint); `config` intentionally excluded so editing model/max-tokens doesn't re-trigger discovery.
  useEffect(() => {
    // Two conditions, and the second is the security gate above — NOT an optimization. Removing it
    // reintroduces the prefix-walk credential leak; read that comment before touching this line.
    if (!apiKey.trim() || !presetSuppliedEndpoint) {
      setDiscovery({ status: "idle" });
      return;
    }
    let cancelled = false;
    setDiscovery({ status: "loading" });
    const timer = setTimeout(() => {
      port.current
        .listModels?.({ ...config, apiKey, baseUrl, protocol })
        // `cancelled` guards the classic out-of-order finish: a slow request for an earlier,
        // half-typed key must never overwrite the result for the key currently in the field.
        .then((models) => {
          if (cancelled) return;
          setDiscovery({ status: "ok", models });
          // Seed the model field from the DISCOVERED list when it is still empty — never from a
          // hardcoded constant, which is what an earlier revision did and what made the field state
          // something this form had invented rather than something the key actually offers.
          // Preferring the server's real default when the account has it keeps the UI agreeing with
          // `site-assistant.ts`'s own `DEFAULT_MODEL`; otherwise the first entry is simply a valid
          // starting point the operator can change. Without this the operator is stuck: `model` is a
          // required field, so `Test connection` stays disabled until something fills it.
          setConfig((current) => {
            if (current.model.trim() || models.length === 0) return current;
            return { ...current, model: models.find((m) => m === "gemini-flash-latest") ?? (models[0] as string) };
          });
        })
        .catch((e: unknown) =>
          !cancelled && setDiscovery({ status: "error", message: e instanceof Error ? e.message : "Model discovery failed" }),
        );
    }, MODEL_DISCOVERY_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [apiKey, baseUrl, protocol, presetSuppliedEndpoint]);

  // The explicit "Test Key" / "Test connection" presses — see `runVisitorKeyTest` and
  // `runVisitorTestConnection`'s own doc comments above for why these run against WHATEVER endpoint
  // is in the field (unlike the debounced automatic effect above) and how the post-test discovery
  // refresh works.
  //
  // With nothing typed and the stored key saved for another endpoint, neither press sends anything:
  // the server would refuse, and the key line already asks for this provider's key. The buttons are
  // disabled in that state too; this keeps the hook honest for any other caller.
  function runKeyTest() {
    if (storedKeyBlocksProbe(apiKey, stored, baseUrl)) return Promise.resolve();
    return runVisitorKeyTest({ port: port.current, config, setDiscovery, setConfig });
  }

  function runTestConnection() {
    if (storedKeyBlocksProbe(apiKey, stored, baseUrl)) return Promise.resolve();
    return runVisitorTestConnection({ port: port.current, config, setConnectionTest, setDiscovery });
  }

  /**
   * The provider picker's selection handler — backs the two chip rows ("Protocols" / "Gateways")
   * that let an operator choose Anthropic, OpenAI, Azure OpenAI, Google Gemini, OpenRouter, or
   * Ollama, rendered by the view from `@jini-ai/ui`'s `groupPresets`/`ProviderChipGroup` (structure
   * and wiring lifted verbatim from `ExecutionTab`'s own BYOK section, the same one the Settings →
   * Execution mode screen renders).
   *
   * `nextConfigForPresetSelect` is where the non-obvious behaviour lives — it snapshots the OUTGOING
   * provider's credentials into `savedByProviderId` before loading the incoming preset's own saved
   * draft, which is what stops one provider's key from making an unrelated provider's chip read as
   * "configured". Hand-rolling `setConfig({protocol, baseUrl})` here would look correct and quietly
   * lose that.
   *
   * `../rules.ts`'s `configuredPresetIds` reads the same per-provider drafts for the chip dots, so a
   * chip's filled dot means "this provider has complete credentials in this form", not "this one is
   * saved on the server". Those are different claims and only the save line under the key field makes
   * the second one.
   */
  const selectPreset = (next: ProviderPreset) => {
    editConfig(nextConfigForPresetSelect(config, next));
    // Both are properties OF THE OUTGOING PROVIDER and neither survives the switch. Left in place,
    // the previous provider's "42 models available" and green connection result would sit under a
    // different provider's empty key field, describing a credential that is no longer in the form.
    setDiscovery({ status: "idle" });
    setConnectionTest({ status: "idle" });
  };

  return {
    config,
    editConfig,
    preset,
    discovery,
    connectionTest,
    stored,
    saveState,
    settingsSaveState,
    dirty,
    hasUsableKey: usableKey,
    hasStoredKey,
    storedKeyIsForOtherEndpoint,
    configuredPresetIds: configuredPresetIdsRule(config),
    selectPreset,
    saveKey,
    saveSettings,
    runKeyTest,
    runTestConnection,
  };
}

/**
 * Binds the real `/api/.../assistant/site-credential` client — see
 * `visitor-credential-form-dependencies.hooks.ts`.
 *
 * The zero-argument-dependencies half of the `useX(dependencies)` / `useWiredX()` pair, so
 * `AiAssistant.tsx` composes this and a test composes {@link useVisitorCredentialForm} with
 * `createFakeVisitorCredentialFormPort` (or, as `use-visitor-credential-form.unit.test.ts`'s own
 * pre-existing "F05 coupling fix" tests do, a hand-rolled fake satisfying
 * {@link VisitorCredentialFormPort}).
 *
 * @returns The full form controller, wired to the real site-credential client.
 */
export function useWiredVisitorCredentialForm(): VisitorCredentialFormController {
  return useVisitorCredentialForm({ port: defaultVisitorCredentialFormPort });
}
