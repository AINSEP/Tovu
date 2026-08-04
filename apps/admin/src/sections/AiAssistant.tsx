import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  DEFAULT_PROVIDER_PRESETS,
  I18nProvider,
  SETTINGS_DIALOG_DICTIONARIES,
  SettingsDialogShell,
  type ByokConfig,
  type ModelDiscoveryState,
  type SettingsDialogTab,
} from "@jini-ai/ui";
import "@jini-ai/ui/settings-dialog.css";
import { ApiError, api, describeApiError as describeApiErrorDefault, type PublicAssistantSettings, type SiteCredentialView } from "../lib/api";
import {
  getAssistantDockOpen,
  requestAssistantDock,
  subscribeToAssistantDock,
} from "../lib/assistant-dock-bus";
import { createExecutionPort } from "../lib/execution-settings";

/**
 * @file "AI Assistant" admin screen — the `/admin/ai-assistant` route.
 *
 * Two things, and deliberately only two.
 *
 * 1. The master on/off switch for the VISITOR-FACING assistant. Off is the default and off is a
 *    hard off: the server ships no assistant bundle and exposes no assistant endpoint when this is
 *    false (see `src/assistant/public-assistant-settings.ts` for the contract in full). Saved
 *    immediately on toggle rather than behind a Save button, because the reason an operator opens
 *    this screen is usually that something is going wrong — a permissions problem, a bad deploy,
 *    runaway token spend — and an off switch that needs a second click to take effect is the wrong
 *    shape for that moment. The screen re-renders from the SERVER's response, never from the value
 *    it optimistically sent, so a failed write cannot leave the UI claiming the assistant is off
 *    while it is still live.
 *
 * 2. A roadmap accordion naming the operator controls that are NOT built. Present, not hidden:
 *    somebody about to turn this on needs to know that there is currently no cost ceiling, no
 *    per-visitor rate limit, and no live spend view, and the place to learn that is the screen where
 *    they flip the switch — not a backlog. Rendered as inert unchecked items with no toggles, per
 *    the same reasoning `sections/Workspace.tsx` uses for its always-disabled delete control: a
 *    control that looks live but does nothing is worse than an honest "not yet".
 *
 * Mirrors `sections/Workspace.tsx`'s fetch/loading/error shape and `sections/Comments.tsx`'s
 * settings-form conventions; no new CSS is introduced beyond the two classes below.
 */

/** Overrides layered on the shared default (`lib/api.ts`'s `describeApiError`) — this screen's
 *  `FORBIDDEN` copy names the specific setting, unlike the generic "You do not have permission to
 *  do that." most other screens use for the same code (audit cross-cutting finding #2). */
function describeApiError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    if (e.code === "FORBIDDEN") return "You do not have permission to change the AI assistant's settings.";
    if (e.code === "ASSISTANT_SETTINGS_VALIDATION_ERROR") return e.message || "That value was rejected.";
  }
  return describeApiErrorDefault(e, fallback);
}

/** One not-yet-built control. `detail` is the operator-facing "what would this do for me", not an
 * implementation note — the point of surfacing these is that the gaps are decision-relevant. */
interface RoadmapItem {
  key: string;
  label: string;
  detail: string;
}

/**
 * The controls this screen deliberately does not have yet.
 *
 * Two distinct concerns, kept distinct rather than collapsed into one "limits" row, because they
 * fail differently: a cost cap bounds the bill, and a status view is how you notice a problem is
 * happening. Shipping only one of them would leave a real hole that a combined label would hide.
 *
 * Per-visitor rate limiting used to be listed here and **shipped** in SPEC-046 REQ-7 — the public
 * chat endpoint is now bounded at 10 requests / 5 min / IP (`SITE_ASSISTANT_PER_IP` in
 * `server/middleware/rate-limit.ts`). It is deliberately not surfaced as a *control* yet: the window
 * is a code constant, not an operator-editable setting, so a row here would imply a knob that does
 * not exist. Move it into the settings surface above, not back into this list, if it becomes tunable.
 */
const ROADMAP: readonly RoadmapItem[] = [
  {
    key: "budget",
    label: "Token / cost budget caps",
    detail:
      "Per-day and per-conversation spend ceilings, with the assistant disabling itself when a ceiling is exhausted. Until this exists, the switch above is the only spending control.",
  },
  {
    key: "status",
    label: "Live status and recent activity",
    detail:
      "Assistant health, recent conversation counts, and spend to date — the view that would tell you a budget or rate-limit problem is happening while it is happening.",
  },
];

/** Shared 16px icon frame, so a tab's glyph can be written as bare path data. Same helper, same
 *  reason, as `sections/SettingsUi.tsx`'s — kept local rather than exported from there because that
 *  file is a screen, not a component library, and importing a screen for one SVG wrapper would couple
 *  two unrelated sections. If a third screen needs it, that is the point to promote it. */
function TabIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
      {children}
    </svg>
  );
}

function RoadmapChecklist() {
  return (
    <section className="assistant-roadmap">
      <p className="muted-cell">
        These operator controls are planned but not implemented. Nothing below is active — turning the assistant on today
        means running it without a cost ceiling, without per-visitor rate limiting, and without a live activity view.
      </p>
      {ROADMAP.map((item) => (
        <details key={item.key}>
          <summary>
            {/* Disabled and unchecked: this is a status marker, not a control. A live-looking
                checkbox here would imply the feature can be enabled from this screen. */}
            <input type="checkbox" checked={false} disabled readOnly aria-hidden="true" tabIndex={-1} />
            <span>{item.label}</span>
            <span className="assistant-roadmap-tag">Not implemented</span>
          </summary>
          <p className="muted-cell">{item.detail}</p>
        </details>
      ))}
    </section>
  );
}

/**
 * Opens or closes the admin's own assistant dock — the same thing the floating action button does.
 *
 * ## Why this exists when a FAB already does it
 *
 * The FAB is a single 56px circle pinned to the bottom-right corner, and it has a history of not
 * being where the operator expects it. If it is ever off-screen, obscured, or simply not noticed,
 * the admin assistant becomes unreachable with no other affordance anywhere in the product. This is
 * the discoverable, keyboard-reachable fallback: a labelled control on the page that is *about* the
 * assistant, which is where someone looking for it would go.
 *
 * Deliberately NOT a persisted setting, unlike the public-site switch directly above it. The admin
 * assistant is always available to a signed-in administrator (see that switch's own copy) — there is
 * nothing to enable. This reflects and drives panel visibility for the current session only, which
 * is why it reads its value live rather than from `settings`.
 *
 * `useSyncExternalStore` rather than `useState` + an effect: the dock can be toggled by the FAB, by
 * Escape, or by this control, and a local copy would drift out of date the moment one of the other
 * two won. A checkbox that misreports whether the panel is open is worse than no checkbox.
 */
function AdminAssistantSwitch() {
  const open = useSyncExternalStore(subscribeToAssistantDock, getAssistantDockOpen, () => false);

  return (
    <div className="">
      <label>
        <input type="checkbox" checked={open} onChange={(e) => requestAssistantDock(e.target.checked)} />
         Enable the AI assistant on the admin site
      </label>
      <p className="muted-cell">
        {open
          ? "Open. The assistant panel is showing on the right."
          : "Opens the assistant panel in this admin — the same thing the floating button in the bottom-right corner does."}
      </p>
      <p className="muted-cell">
        Always available to signed-in administrators, so this only shows or hides the panel. Use it if the floating
        button is ever off-screen or hard to find.
      </p>
    </div>
  );
}

/**
 * The SITE's provider credential — the key that lets anonymous VISITORS chat on the deployed public
 * site. Reuses `@jini-ai/ui`'s `ByokProviderForm` unmodified, the same component
 * `sections/SettingsUi.tsx`'s Execution-mode tab renders, because this is deliberately the same
 * credential-entry surface rather than a lookalike.
 *
 * ## The distinction this tab exists to make legible
 *
 * There are two API keys in this product and until now only one of them had a screen, which is why
 * an operator could save a key, see it persisted, and still get nothing on their public site:
 *
 * - **Settings → Execution mode → BYOK** is the ADMIN's own key. `lib/execution-settings.ts` stores
 *   it browser-local on purpose (its own comment: "the browser is the source of truth for `apiKey`
 *   (the ledger never sees it)"). It powers the assistant dock in THIS browser. A deployed server
 *   never sees it, and it cannot serve visitors.
 * - **This tab** is the SITE's key. It must live server-side, because the thing consuming it is
 *   `src/server/modules/site-assistant.ts` answering anonymous internet traffic on a machine the
 *   admin's browser is not.
 *
 * That is why the copy below states it in plain language rather than relying on the tab title: the
 * failure mode is silent, and an operator who assumes the Settings key covers this gets a visitor
 * assistant that is enabled, mounted, and permanently unable to answer.
 *
 * ## Not yet wired, and deliberately honest about it
 *
 * The server-side encrypted credential store is in flight (its own ADR, per the owner's decision to
 * encrypt at rest under a deploy-time master secret rather than put a secret in the ADR-028 settings
 * ledger). Until its `PUT /api/admin/v1/workspaces/:id/assistant/site-credential` route exists, this
 * form holds its values in local state only and Save is disabled with the reason shown on screen —
 * NOT silently accepting a key it cannot persist, which would be the same class of quiet failure
 * this tab was built to end.
 */
/** How long the key field must be quiet before discovery fires. Long enough that typing or pasting a
 *  key is one request rather than one per keystroke — the concern `ExecutionTab`'s own discovery
 *  effect documents ("refetching on every keystroke would spam the provider") — and short enough
 *  that a paste feels immediate. */
const MODEL_DISCOVERY_DEBOUNCE_MS = 700;

/** Longer than the discovery debounce, deliberately — see the auto-save effect for why the two
 *  costs are not symmetric. */
const AUTO_SAVE_DEBOUNCE_MS = 900;

function VisitorCredentialForm() {
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

  // One port instance for this component's lifetime, matching `SettingsUi.tsx`'s `useRef` usage —
  // these are the SAME admin routes the Settings screen probes with, and they take the credential in
  // the request body rather than reading a stored one. That is what makes both controls below work
  // today, before this tab's own server-side store exists: they probe the key the operator just
  // typed, which is exactly the question being asked ("is this key any good, and what can it run?").
  const port = useRef(createExecutionPort());

  const [discovery, setDiscovery] = useState<ModelDiscoveryState>({ status: "idle" });

  /** What the SERVER says is stored (ADR-058's write-only read model: `isSet` + a masked tail, never
   *  plaintext). Kept separate from `config`, which is what the operator is currently typing — the
   *  two are different facts and conflating them is how a form ends up claiming a key is saved
   *  because someone typed one. */
  const [stored, setStored] = useState<SiteCredentialView | null>(null);
  const [saveState, setSaveState] = useState("");

  useEffect(() => {
    api
      .getSiteCredential()
      .then(({ data }) => {
        setStored(data);
        // Adopt the saved model so the field reflects what visitors are actually running on, not a
        // blank. The KEY is deliberately never adopted — there is nothing to adopt; the server does
        // not return it, by design.
        if (data.model) setConfig((c) => (c.model ? c : { ...c, model: data.model as string }));
        if (data.baseUrl) setConfig((c) => ({ ...c, baseUrl: data.baseUrl as string }));
      })
      .catch(() => setSaveState("Could not read the saved key's status."));
  }, []);

  /**
   * Automatic save, per the owner's request — no Save button.
   *
   * Debounced on the same principle as discovery: a keystroke is not an intention. 900ms is longer
   * than the discovery debounce on purpose, because the cost of firing early differs. An early
   * DISCOVERY call is a wasted request; an early SAVE writes a half-typed key into the encrypted
   * store and, since the store is write-only, leaves the operator staring at a masked value they
   * cannot inspect to discover it is wrong. Slower is the safe direction here.
   *
   * Guarded on a non-empty key: an empty field must never be interpreted as "clear the stored key".
   * Deletion is a separate, explicit act (the DELETE route ADR-058 defines), not an accident of
   * selecting-all-and-backspacing while looking at a masked placeholder.
   */
  useEffect(() => {
    const key = config.apiKey.trim();
    if (!key) return;
    let cancelled = false;
    setSaveState("Saving…");
    const timer = setTimeout(() => {
      api
        .setSiteCredential({ apiKey: key, baseUrl: config.baseUrl, ...(config.model ? { model: config.model } : {}) })
        .then(({ data }) => {
          if (cancelled) return;
          setStored(data);
          setSaveState(`Saved. Visitors are using ${data.masked ?? "this key"}.`);
        })
        .catch((e: unknown) => !cancelled && setSaveState(describeApiError(e, "Could not save the key.")));
    }, AUTO_SAVE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [config.apiKey, config.model, config.baseUrl]);

  const { apiKey, baseUrl, protocol } = config;

  /**
   * SECURITY GATE on automatic discovery — `true` only when the endpoint is one a PRESET supplied,
   * never one the operator typed.
   *
   * This closes a confirmed credential-transmission bug rather than avoiding a hypothetical one. See
   * `ADS-memory/reports/findings/2026-08-04-byok-discovery-keystroke-key-leak.md`: Jini's
   * `ExecutionTab` lists `config.byok.baseUrl` as a discovery dependency and passes the whole
   * `ByokConfig` — which carries `apiKey` — with no debounce. Consequence, measured live by another
   * session: with a key already present, typing an endpoint transmits that live key to every
   * intermediate prefix of the hostname. `https://api.example.com` sends it to `https://a`,
   * `https://ap`, `https://api`, and so on — each prefix that resolves is a third party receiving a
   * credential the operator never meant to give it. It composes badly with the SSRF guard's
   * deliberate allowance of loopback on any port, which turns a typed `http://localhost:NNNN` into a
   * key-bearing walk of local ports.
   *
   * A debounce alone does NOT fix this, which is why this gate exists in addition to one: debouncing
   * cuts ~30 requests to a handful, but any pause mid-typing still fires, and a pause mid-typing is
   * exactly when the URL is a partial hostname. The number of unintended recipients goes down; it
   * does not go to zero.
   *
   * So the rule here is about the DESTINATION, not the timing: auto-discovery may only ever send the
   * key somewhere a preset already vouched for. A custom or hand-typed endpoint still works — it just
   * requires the operator to press "Test connection", which is an explicit, deliberate act of
   * pointing a credential at a host they chose. That is the "gate the effect on a committed baseUrl"
   * option the finding lists, tightened to "committed by an explicit action".
   */
  const isPresetSuppliedEndpoint = useMemo(
    () => DEFAULT_PROVIDER_PRESETS.some((p) => !p.custom && p.baseUrl === baseUrl.trim()),
    [baseUrl],
  );

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
    if (!apiKey.trim() || !isPresetSuppliedEndpoint) {
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
  }, [apiKey, baseUrl, protocol, isPresetSuppliedEndpoint]);

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


  return (
    <div className="visitor-key-form">
      {/*
        Collapsed by default. The full explanation is genuinely important — it is the only thing
        standing between an operator and the silent failure of saving a key on the WRONG screen — but
        four paragraphs above the one input they came to use made the input feel like a footnote.
        A `<details>` keeps the words available and reversible without a component, a library, or
        any state of our own; the summary line carries the single sentence that actually prevents
        the mistake, so a reader who never expands it still gets the load-bearing part.
      */}
      <details className="visitor-key-help">
        <summary>
          <strong>This key is for your visitors, not for you.</strong> See more
        </summary>
        <p>
          It is what lets people reading your published site ask questions and get answers. It is stored on the server,
          encrypted, and used for every visitor conversation.
        </p>
        <p>
          It is a different key from the one under <strong>Settings → Execution mode → BYOK</strong>. That one is your
          own, it is saved only in this browser, and it powers the assistant in this admin. A deployed site can never
          use it — which is why saving a key there does not switch on the visitor chat.
        </p>
      </details>

      <label className="visitor-key-label" htmlFor="visitor-api-key">
        API key
      </label>
      <input
        id="visitor-api-key"
        className="visitor-key-input"
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder={stored?.isSet ? `Saved — ${stored.masked ?? "••••"}. Paste a new key to replace it.` : "Paste your provider API key"}
        value={config.apiKey}
        onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
      />

      {/* Directly under the key input, per the owner. This is the control that answers the only
          question an operator has at this moment — "is this key any good?" — so it belongs where
          their eyes already are, not below the fields they have not filled in yet. */}
      <div className="visitor-key-actions">
        <button
          type="button"
          className="visitor-key-test"
          onClick={() => void runKeyTest()}
          disabled={!config.apiKey.trim() || discovery.status === "loading"}
        >
          {discovery.status === "loading" ? "Testing…" : "Test Key"}
        </button>
        <span className="visitor-key-status">
          {discovery.status === "ok" ? `Key works — ${discovery.models.length} models available.` : null}
          {discovery.status === "error" ? discovery.message : null}
          {discovery.status === "idle" && !stored?.isSet ? "Checks the key and lists the models it can use." : null}
          {discovery.status === "idle" && stored?.isSet ? `Saved ${stored.masked ?? ""}. Visitors are using this key.` : null}
        </span>
      </div>

      <label className="visitor-key-label" htmlFor="visitor-model">
        Model
      </label>
      <select
        id="visitor-model"
        className="visitor-key-input"
        value={config.model}
        onChange={(e) => setConfig({ ...config, model: e.target.value })}
        disabled={discovery.status !== "ok" && !config.model}
      >
        {config.model ? null : <option value="">Test the key to load models…</option>}
        {(discovery.status === "ok" ? discovery.models : config.model ? [config.model] : []).map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>

      {/* No Save button: the owner asked for automatic saving, and `useAutoSave` below writes on a
          debounce whenever the key or model settles. The status line is the whole feedback surface —
          a disabled button plus an apology paragraph was two pieces of chrome saying less. */}
      <p className="visitor-key-save-state" role="status">
        {saveState}
      </p>
    </div>
  );
}

export function AiAssistant() {
  const [settings, setSettings] = useState<PublicAssistantSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .getAssistantSettings()
      .then((r) => setSettings(r.data))
      .catch((e) => setLoadError(describeApiError(e, "failed to load AI assistant settings")));
  }, []);

  async function setPublicEnabled(publicEnabled: boolean) {
    setSaving(true);
    setSaveError(null);
    try {
      // The response, not `publicEnabled` — the server is the authority on what is now true, and a
      // rejected or partially-applied write must not leave this screen lying about it.
      const { data } = await api.setAssistantSettings({ publicEnabled });
      setSettings(data);
    } catch (e) {
      setSaveError(describeApiError(e, "failed to save AI assistant settings"));
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <div className="notice error">{loadError}</div>;
  if (!settings) return <div className="notice">Loading AI assistant settings…</div>;

  /**
   * Two tabs, split by WHOSE assistant each one configures — not by kind of control.
   *
   * Grouping by kind (all switches on one tab, all credentials on another) was the obvious
   * alternative and is wrong here: the whole defect this screen is being restructured to fix is that
   * an operator could not tell the visitor assistant and the admin assistant apart, so a layout that
   * interleaves them would preserve exactly the confusion the copy is spending words undoing. The
   * public on/off switch and the site's key belong together because they are two halves of one
   * question ("can visitors use this, and with what"), and the roadmap sits with them because every
   * gap it lists — cost caps, live spend — is about visitor traffic, not about the admin dock.
   */
  const tabs: SettingsDialogTab[] = [
    {
      id: "visitor",
      label: "Visitor's AI Assistant",
      title: "Visitor's AI Assistant",
      subtitle: "The assistant your published site offers to readers.",
      icon: (
        <TabIcon>
          <circle cx="9" cy="9" r="6.5" />
          <path d="M2.5 9h13M9 2.5c1.8 2 2.7 4.2 2.7 6.5S10.8 15 9 15.5C7.2 15 6.3 11.3 6.3 9S7.2 4.5 9 2.5z" />
        </TabIcon>
      ),
      panel: (
        <>
          <div className="notice assistant-switch">
            {saveError ? <div className="save-error">{saveError}</div> : null}
            <label>
              <input
                type="checkbox"
                checked={settings.publicEnabled}
                disabled={saving}
                onChange={(e) => void setPublicEnabled(e.target.checked)}
              />
              Enable the AI assistant on the public site
            </label>
            <p className="muted-cell">
              {settings.publicEnabled
                ? "Visitors can chat with the assistant. It is served on every public page."
                : "Off. The public site ships no assistant code and exposes no assistant endpoint — this is a full disable, not a hidden widget."}
            </p>
            <p className="muted-cell">
              This does not affect the assistant in this admin, which stays available to signed-in administrators either
              way.
            </p>
          </div>

          <VisitorCredentialForm />
        </>
      ),
    },
    {
      id: "admin",
      label: "Admin AI Assistant",
      title: "Admin AI Assistant",
      subtitle: "The assistant in this admin, for signed-in administrators.",
      icon: (
        <TabIcon>
          <rect x="3" y="5" width="12" height="9" rx="2.5" />
          <path d="M9 5V2.5M6.5 9v.01M11.5 9v.01M7 12h4" />
        </TabIcon>
      ),
      panel: <AdminAssistantSwitch />,
    },
    {
      id: "roadmap",
      label: "Not built yet",
      title: "Not built yet",
      subtitle: "Operator controls that are planned but not implemented.",
      icon: (
        <TabIcon>
          <path d="M9 2.5v6.5l4 2.2" />
          <circle cx="9" cy="9" r="6.5" strokeDasharray="2.4 2.2" />
        </TabIcon>
      ),
      /**
       * Its own tab rather than a trailing accordion on the visitor tab.
       *
       * Worth stating why, because the original placement had a real argument behind it: the roadmap
       * sat directly under the enable switch so that somebody about to turn the assistant on would
       * read "no cost ceiling, no live spend view" in the same glance as the switch itself. That
       * argument was sound when this screen was one column. It stops working once the visitor tab
       * also carries a credential form — the gaps end up below a fold, after the thing an operator
       * actually came to do, which is worse than a tab they can see the label of from the top.
       *
       * The label stays blunt ("Not built yet") specifically so the tab strip keeps doing the
       * disclosure job the accordion used to do. A softer label like "Roadmap" would hide it.
       */
      panel: <RoadmapChecklist />,
    },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">Overview</p>
          <h1 className="page-title">AI Assistant</h1>
          <p className="page-description">Turn the visitor-facing assistant on or off for your public site.</p>
        </div>
      </div>

      {/*
        Same shell, same props, and the same `presentation="inline"` page mode `sections/SettingsUi.tsx`
        already uses — so this screen inherits that tab chrome rather than growing a second, similar-
        but-different one. `I18nProvider` is required, not decorative: `ByokProviderForm` and the shell
        both call `useT()`, and without a provider above them their strings fall back to raw keys.
        `syncDocumentAttributes={false}` for the identical reason SettingsUi documents — only this
        panel's content is translated, so claiming a document-wide language would misinform assistive
        tech about the untranslated rest of the admin.
      */}
      <I18nProvider initialLocale="en" dictionaries={SETTINGS_DIALOG_DICTIONARIES} fallbackLocale="en" syncDocumentAttributes={false}>
        {/*
          `data-theme="light"` is REQUIRED, not cosmetic. `SettingsUi.tsx` sets this from its own
          "Dialog appearance" setting; with the attribute absent entirely the shell's stylesheet falls
          through to its dark variant, which is why this panel rendered dark inside an otherwise-light
          admin. Pinned to light rather than wired to a setting because this screen has no appearance
          control of its own and the Tovu admin shell is light-only — a themable panel here would just
          be a way to make one page disagree with every other one.

          `--page-flow` opts out of `.settings-ui-section`'s full-height layout; see that modifier's
          comment in styles.css for the nested-scroller trap it exists to avoid.
        */}
        <div className="settings-ui-section settings-ui-section--page-flow" data-theme="light">
          <SettingsDialogShell
            tabs={tabs}
            presentation="inline"
            className="jini-settings-dialog--inline"
            fullscreenEnabled={false}
          />
        </div>
      </I18nProvider>
    </div>
  );
}
