import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_PROVIDER_PRESETS,
  nextConfigForPresetSelect,
  resolveSelectedPreset,
  type ByokConfig,
  type ConnectionTestState,
  type ModelDiscoveryState,
  type ProviderPreset,
} from "@jini-ai/ui";

import { api, type SiteAssistantCredential, type SiteAssistantCredentialPatch } from "../../../lib/api";
import { createExecutionPort } from "../../../lib/execution-settings";
import { configuredPresetIds as configuredPresetIdsRule, describeApiError, hasStoredCredential, hasUsableKey, isPresetSuppliedEndpoint } from "../rules";

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
  saveState: SaveState;
  /**
   * True once the operator has actually changed something — what Save is enabled by.
   *
   * State rather than a ref because a button's disabled-ness has to re-render on it. Set ONLY from
   * `editConfig`, so neither hydration nor discovery seeding a model counts as an edit; without
   * that separation Save would light up on load offering to write back the values the server just
   * sent, and — if the initial GET had failed — to write this form's hardcoded defaults over a
   * perfectly good stored credential.
   */
  dirty: boolean;
  /** A key exists — either just typed here, or already stored on the server. Both make the two probe
   *  controls meaningful, which is the only thing they need to decide. */
  hasUsableKey: boolean;
  hasStoredKey: boolean;
  /** Which provider presets the current credentials already satisfy — feeds each `ProviderChipGroup`'s
   *  filled/unfilled dot. */
  configuredPresetIds: Set<string>;
  selectPreset: (next: ProviderPreset) => void;
  saveCredential: () => Promise<void>;
  runKeyTest: () => Promise<void>;
  runTestConnection: () => Promise<void>;
}

export function useVisitorCredentialForm(): VisitorCredentialFormController {
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
  // so what hydrates is everything else — provider, base URL, model — plus `isSet`/`masked`, which is
  // what the "A key is stored" line under the field reports.
  useEffect(() => {
    let cancelled = false;
    api
      .getAssistantSiteCredential()
      .then(({ data }) => {
        if (cancelled) return;
        setStored(data);
        setConfig((current) => ({
          ...current,
          baseUrl: data.baseUrl ?? current.baseUrl,
          model: data.model ?? current.model,
        }));
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
   */
  useEffect(() => {
    if (!stored?.isSet || apiKey.trim()) return;
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
        setDiscovery({ status: "error", message: e instanceof Error ? e.message : "Model discovery failed" });
      });
    return () => {
      cancelled = true;
    };
    // Keyed on the stored flag and the endpoint only. `config` as a whole would re-run this on every
    // model or max-tokens edit, none of which can change which models the stored key allows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored?.isSet, baseUrl, protocol]);

  /**
   * Explicit save. Nothing on this screen writes a credential except this function, called from the
   * Save button.
   *
   * ## Why this is not a debounce any more
   *
   * It was: the key auto-saved 2 seconds after typing stopped. That is a fine pattern for a
   * preference and a bad one for a production secret, because it makes every keystroke in the key
   * field a WRITE to the credential a live site is serving. It cost a real key during this session —
   * a verification script typed into the field to trigger model discovery, and two seconds later the
   * owner's working key had been encrypted over and was unrecoverable. There was no user error in
   * that sequence, which is the point: the affordance made an incidental action destructive.
   *
   * An explicit Save costs one click and makes the destructive step the one the operator actually
   * asked for.
   *
   * ## Why `apiKey` is omitted when the field is empty
   *
   * That is the route's documented "leave the stored key alone" case (`put-site-credential.ts`), and
   * it is what lets an operator change the model or base URL of an existing credential without
   * re-pasting the secret — the field shows only a masked placeholder, after all. It also means Save
   * can never blank a working key by accident; clearing is DELETE, a separate deliberate act.
   */
  const hasStoredKey = hasStoredCredential(stored);

  async function saveCredential() {
    // No key typed AND none stored: the only thing a write could do is create a keyless row, which
    // would make `isSet` lie about a credential that does not exist.
    if (!apiKey.trim() && !hasStoredKey) return;

    const patch: SiteAssistantCredentialPatch = { provider: protocol, baseUrl, model: config.model };
    if (apiKey.trim()) patch.apiKey = apiKey.trim();

    setSaveState({ status: "saving" });
    try {
      const { data } = await api.setAssistantSiteCredential(patch);
      // The SERVER's view, not the patch that was sent — same reasoning as `setPublicEnabled` in
      // `use-ai-assistant.hooks.ts`. A partially-applied or rejected write must not leave this screen
      // claiming a key is stored when it is not.
      setStored(data);
      setSaveState({ status: "saved", at: data.updatedAt });
      setDirty(false);
      // Clear the field once the key is safely stored. Leaving the plaintext sitting in a React
      // state tree after it has been persisted keeps it readable in devtools for no benefit, and the
      // masked placeholder now carries the "which key" answer the field would otherwise be giving.
      if (patch.apiKey) setConfig((current) => ({ ...current, apiKey: "" }));
    } catch (e) {
      setSaveState({ status: "error", message: describeApiError(e, "failed to save the key") });
    }
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
    // `config` is intentionally not a dependency — only the credential fields above should re-trigger
    // a provider call. Including it would fire discovery when the operator edits the model or
    // max-tokens field, which cannot change the answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, baseUrl, protocol, presetSuppliedEndpoint]);

  /**
   * The explicit "Test Key" press. Unlike the automatic effect above this runs against WHATEVER
   * endpoint is in the field, preset or not — an operator pressing a button labelled "Test Key" has
   * deliberately chosen to send this credential to the host they typed, which is precisely the
   * explicit gate the keystroke-leak finding asks for. The difference between the two paths is
   * consent, not capability.
   */
  async function runKeyTest() {
    setDiscovery({ status: "loading" });
    try {
      const models = (await port.current.listModels?.(config)) ?? [];
      setDiscovery({ status: "ok", models });
      setConfig((current) =>
        current.model.trim() || models.length === 0
          ? current
          : { ...current, model: models.find((m) => m === "gemini-flash-latest") ?? (models[0] as string) },
      );
    } catch (e) {
      setDiscovery({ status: "error", message: e instanceof Error ? e.message : "Could not reach the provider with that key" });
    }
  }

  // Also refresh discovery on an explicit test. The debounced effect above cannot recover from a
  // discovery attempt that failed transiently, because nothing about the credential changed
  // afterwards — so without this the operator would be stuck looking at a stale error next to a
  // connection that just went green. (The same trap was found and fixed independently upstream in
  // Jini's `ExecutionTab`; this screen must not reintroduce it.)
  async function refreshDiscoveryAfterTest() {
    if (!config.apiKey.trim()) return;
    try {
      const models = await port.current.listModels?.(config);
      if (models) setDiscovery({ status: "ok", models });
    } catch {
      // Leave whatever discovery state already exists — the connection result is the answer the
      // operator asked for, and failing to also refresh the list must not overwrite it.
    }
  }

  async function runTestConnection() {
    setConnectionTest({ status: "testing" });
    try {
      const result = await port.current.testConnection?.(config);
      setConnectionTest(
        result?.ok
          ? { status: "ok", message: result.message }
          : { status: "error", message: result?.message || "Connection test failed" },
      );
      if (result?.ok) await refreshDiscoveryAfterTest();
    } catch (e) {
      setConnectionTest({ status: "error", message: e instanceof Error ? e.message : "Connection test failed" });
    }
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
    dirty,
    hasUsableKey: hasUsableKey(apiKey, stored),
    hasStoredKey,
    configuredPresetIds: configuredPresetIdsRule(config),
    selectPreset,
    saveCredential,
    runKeyTest,
    runTestConnection,
  };
}
