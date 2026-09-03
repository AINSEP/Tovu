import {
  ByokProviderForm,
  DEFAULT_PROVIDER_PRESETS,
  ExecutionTab,
  I18nProvider,
  ProviderChipGroup,
  SETTINGS_DIALOG_DICTIONARIES,
  SettingsDialogShell,
  groupPresets,
  type SettingsDialogTab,
} from "@jini-ai/ui";
import "@jini-ai/ui/settings-dialog.css";
import { SeeMore } from "../../components/SeeMore/SeeMore";
import { AdminByokKeyFooter, AdminByokMigrationPrompt, AdminByokSettingsFooter } from "../../components/AdminByokKeyPanel";
import { useAdminAssistantSwitch } from "./hooks/use-admin-assistant-switch.hooks";
import { useAdminExecutionMode } from "./hooks/use-admin-execution-mode.hooks";
import { useWiredAssistantDaemonRestart, type AssistantDaemonRestartController } from "./hooks/use-assistant-daemon-restart.hooks";
import { useWiredAdminExecutionCredential } from "../../hooks/use-admin-execution-credential.hooks";
import { DEFAULT_EXECUTION_CONFIG } from "../../lib/execution-settings";
import { useWiredAiAssistant } from "./hooks/use-ai-assistant.hooks";
import { useWiredVisitorCredentialForm, type VisitorCredentialFormController } from "./hooks/use-visitor-credential-form.hooks";
import { useWiredAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { translateAdminNavLabel } from "../../lib/admin-nav-i18n";
import { AI_ASSISTANT_DICT } from "./ai-assistant-i18n";
import { useWiredAiAssistantLocaleSync } from "./hooks/use-ai-assistant-locale-sync.hooks";
import type { Translate } from "../../lib/dictionary-translator";

/**
 * @file "AI Assistant" admin screen — the `/admin/ai-assistant` route. Markup only.
 *
 * State and API calls for each stateful piece live in their own `hooks/use-<thing>.hooks.ts` file
 * (one per component, per this feature's convention — see `features/integrations/hooks/` for the
 * same split applied to a smaller feature); pure derivations live in `rules.ts`.
 *
 * Three things.
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
 *    the same reasoning `features/workspace/Workspace.tsx` uses for its always-disabled delete control: a
 *    control that looks live but does nothing is worse than an honest "not yet".
 *
 * 3. Execution mode for the ADMIN's own assistant — a second mount of the same `ExecutionTab` over
 *    the same `core.execution` ledger namespace that Settings → Execution mode uses. See
 *    {@link AdminExecutionMode} for why it is copied here rather than moved, and for the one prop
 *    the two mounts must never disagree about.
 *
 * Mirrors `features/workspace/Workspace.tsx`'s fetch/loading/error shape and `features/comments/Comments.tsx`'s
 * settings-form conventions. Its CSS lives with the other `--page-flow` rules in `styles.css`,
 * scoped to `.settings-ui-section--page-flow` so nothing here can reach the Settings screen, which
 * renders the same shell and the same `ByokProviderForm` and deliberately keeps its card look.
 */

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
 *  reason, as `features/settings/SettingsUi.tsx`'s — kept local rather than exported from there because that
 *  file is a screen, not a component library, and importing a screen for one SVG wrapper would couple
 *  two unrelated sections. If a third screen needs it, that is the point to promote it. */
function TabIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
      {children}
    </svg>
  );
}

function RoadmapChecklist({ t = (key: string) => key }: { t?: (key: string) => string }) {
  return (
    <section className="assistant-roadmap">
      <h2>{t("Not built yet")}</h2>
      <p className="muted-cell">
        {t(
          "These operator controls are planned but not implemented. Nothing below is active — turning the assistant on today means running it without a cost ceiling, without per-visitor rate limiting, and without a live activity view.",
        )}
      </p>
      {ROADMAP.map((item) => (
        <details key={item.key}>
          <summary>
            {/* Disabled and unchecked: this is a status marker, not a control. A live-looking
                checkbox here would imply the feature can be enabled from this screen. */}
            <input type="checkbox" checked={false} disabled readOnly aria-hidden="true" tabIndex={-1} />
            <span>{t(item.label)}</span>
            <span className="assistant-roadmap-tag">{t("Not implemented")}</span>
          </summary>
          <p className="muted-cell">{t(item.detail)}</p>
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
 * is why it reads its value live rather than from `settings`. State lives in
 * `hooks/use-admin-assistant-switch.hooks.ts`.
 */
interface AdminAssistantSwitchProps {
  /**
   * Dependency injection seam for tests — the same convention `features/posts/Posts.tsx`'s
   * `usePostsHook` uses. Defaulted to the real hook, so production callers pass nothing.
   */
  useAdminAssistantSwitchHook?: typeof useAdminAssistantSwitch;
  /** `AiAssistant`'s own `t`, threaded rather than read here via `useAdminLocale()` directly — see
   *  that component's own comment for why. Defaults to English passthrough. */
  t?: (key: string) => string;
}

function AdminAssistantSwitch({
  useAdminAssistantSwitchHook = useAdminAssistantSwitch,
  t = (key: string) => key,
}: AdminAssistantSwitchProps = {}) {
  const { open, setOpen } = useAdminAssistantSwitchHook();

  // No `.notice` wrapper, matching the Visitor tab's switch: this screen's `--page-flow` block
  // flattens the shell's card chrome so each panel reads as one form on the page's own background,
  // and a boxed switch here was the last thing still drawing a card outline.
  return (
    <div className="assistant-switch">
      <label>
        <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} />
        {t("Show the AI assistant on the admin site")}
      </label>
      <p className="muted-cell">
        {open
          ? t("Open. The assistant panel is showing on the right.")
          : t("Opens the assistant panel in this admin — the same thing the floating button in the bottom-right corner does.")}
      </p>
      <p className="muted-cell">
        {t(
          "Always available to signed-in administrators, so this only shows or hides the panel. Use it if the floating button is ever off-screen or hard to find.",
        )}
      </p>
    </div>
  );
}

/**
 * Execution mode for the ADMIN's own assistant — the Local CLI / BYOK segmented control and the
 * detected-CLI grid, mounted here directly under {@link AdminAssistantSwitch}.
 *
 * ## Copied, not moved
 *
 * `features/settings/SettingsUi.tsx`'s "Execution mode" tab still exists and still renders the same
 * `ExecutionTab` against the same ledger namespace. This is a second mount of one component over one
 * store, not a fork and not a relocation: both screens read and write `core.execution`, so a change
 * made here is visible there and vice versa. That is the intended behaviour — the setting has one
 * home in the ledger and two places an operator might look for it — but it does mean the two mounts
 * cannot be allowed to drift in their props. If one gains a prop that changes what gets stored, the
 * other needs it too.
 *
 * ## Why this belongs on the Admin tab
 *
 * This is the tab about the assistant in THIS admin, and execution mode is the single setting that
 * decides what actually answers it: a CLI detected on the Tovu server, or a BYOK key held in this
 * browser. The switch above only shows and hides the panel. Everything that determines whether the
 * panel can do anything is here.
 *
 * ## The port, and the one thing it must not do
 *
 * `createExecutionPort({ useAdminStoredCredential: true })` — the same call `SettingsUi.tsx` makes.
 * The `useStoredCredential: true` opt-in that {@link VisitorCredentialForm} passes must never appear
 * here: that flag makes the probe routes fall back to the SITE's server-side visitor credential, and
 * this screen is about the admin's own key. Opting in would silently test a different key than the
 * one this tab configures.
 *
 * `useAdminStoredCredential` is the correct flag for that same key, which is server-side and
 * write-only since 2026-08-05 — so the field this screen renders is legitimately empty and the
 * probes had nothing to send. It is what makes the Model field a live picker here instead of the
 * free-text box it fell back to. See `lib/execution-settings.ts`'s comments on both options for the
 * full reasoning. State lives in `hooks/use-admin-execution-mode.hooks.ts`.
 */
interface AdminExecutionModeProps {
  useAdminExecutionModeHook?: typeof useAdminExecutionMode;
  /**
   * Dependency injection seam for tests — same convention as `useAdminExecutionModeHook` above, and
   * the same seam `SettingsUi.tsx`'s own `useAdminExecutionCredentialHook` prop opens over the SAME
   * shared hook. Was an inline `useWiredAdminExecutionCredential({...})` call in the body until this
   * pass; the two mounts must stay consistent (see this component's own "must never disagree" doc
   * above), so both convert together rather than one seaming ahead of the other.
   */
  useAdminExecutionCredentialHook?: typeof useWiredAdminExecutionCredential;
  /** `AiAssistant`'s own `t` — see {@link AdminAssistantSwitchProps.t}'s doc. */
  t?: (key: string) => string;
}

/**
 * Resolves `t` to the English-passthrough default when a caller passes none — same
 * `??`-avoidance idiom `MenuEditor.tsx`'s `orEmpty`/`AssistantDock.tsx`'s/`App.tsx`'s resolver
 * groups use (2026-08-14, DI migration sweep's complexity follow-up): ESLint's
 * cyclomatic-complexity rule counts a default parameter value inside a function's OWN body as one
 * of that function's own branches — a call out to a separately-scoped resolver does not. Shared by
 * `AdminExecutionMode` and `VisitorCredentialKeyFooter` below, this file's two debt-listed
 * functions, since both use the identical `(key: string) => key` fallback.
 */
function resolveT(override: ((key: string) => string) | undefined): (key: string) => string {
  return override ?? ((key: string) => key);
}
function resolveAdminExecutionModeHook(
  override: typeof useAdminExecutionMode | undefined
): typeof useAdminExecutionMode {
  return override ?? useAdminExecutionMode;
}
function resolveAdminExecutionCredentialHook(
  override: typeof useWiredAdminExecutionCredential | undefined
): typeof useWiredAdminExecutionCredential {
  return override ?? useWiredAdminExecutionCredential;
}

/** Exported (unlike `AdminAssistantSwitch`) so `AdminExecutionMode.unit.test.tsx` can drive its two
 *  DI seams directly, the same way `VisitorCredentialForm` is exported for its own test file. */
export function AdminExecutionMode(props: AdminExecutionModeProps) {
  // No `AdminExecutionModeProps = {}` default on the parameter itself (2026-08-14, same reasoning
  // as `App.tsx`'s own removal): every real call site is JSX, which always constructs an actual
  // props object — `{}` when no attributes are given, never `undefined` — and every field on
  // `AdminExecutionModeProps` is optional, so `{}` still satisfies the type.
  const useAdminExecutionModeHook = resolveAdminExecutionModeHook(props.useAdminExecutionModeHook);
  const useAdminExecutionCredentialHook = resolveAdminExecutionCredentialHook(props.useAdminExecutionCredentialHook);
  const t = resolveT(props.t);
  const { port, execution } = useAdminExecutionModeHook();

  // Called unconditionally, ahead of the `execution.value === null` gate below (rules of hooks) —
  // same reasoning `SettingsUi.tsx`'s identical call documents: the credential hook's own effects
  // don't read `byok` until an explicit Save/migrate press, and the panel this feeds isn't rendered
  // until past the gate anyway.
  const adminCredential = useAdminExecutionCredentialHook({
    byok: execution.value?.byok ?? DEFAULT_EXECUTION_CONFIG.byok,
    onByokChange: (byok) => execution.onChange({ ...(execution.value ?? DEFAULT_EXECUTION_CONFIG), byok }),
  });

  // `null` until the initial ledger read settles. Rendering `ExecutionTab` against the default config
  // in the meantime would show "Local CLI" selected for a workspace that has BYOK stored, and the
  // first edit would then diff against a base that was never what was persisted.
  if (execution.value === null) return <p className="muted-cell">{t("Loading execution settings…")}</p>;

  return (
    <section className="assistant-execution">
      {execution.loadError ? <div className="save-error">{execution.loadError}</div> : null}
      <AdminByokMigrationPrompt controller={adminCredential} />
      <ExecutionTab
        config={execution.value}
        onConfigChange={execution.onChange}
        port={port.current}
        // Detection runs wherever the Tovu SERVER runs, not on the browser's machine. For a deployed
        // CMS those are different computers, so the component's own default ("on this machine") would
        // be a false claim about whose CLIs these are. Same string as the Settings mount — if one
        // changes, both must.
        localCliScopeLabel={t("Detected on the Tovu server, not on your own computer.")}
        // The admin's own BYOK credential is encrypted server-side and write-only (2026-08-05) —
        // same four pass-through props `SettingsUi.tsx`'s mount sets, and for the same "must never
        // disagree" reason this file's own header already documents for `useStoredCredential`. The
        // two footers write DISJOINT patches (key vs. settings); see
        // `hooks/use-admin-execution-credential.hooks.ts`.
        apiKeyStoredExternally={adminCredential.apiKeyStoredExternally}
        apiKeyPlaceholder={adminCredential.apiKeyPlaceholder}
        apiKeyFooter={<AdminByokKeyFooter controller={adminCredential} />}
        formFooter={<AdminByokSettingsFooter controller={adminCredential} />}
      />
      {/*
        Save feedback, which `SettingsUi.tsx` gets from its page chrome (`mergeSaveStates` across six
        slices) and this screen has no equivalent of. Without a line here the debounced write is
        completely silent: an operator switches to BYOK, sees nothing acknowledge it, and has no way
        to tell a saved setting from a dropped one. Not the shared indicator, because there is only
        one slice on this tab and merging over a set of one would be ceremony.
      */}
      <p className="assistant-save-line" role="status">
        {execution.saveState.status === "saving" ? t("Saving…") : null}
        {execution.saveState.status === "saved" ? t("Saved.") : null}
      </p>
      {execution.saveState.status === "error" ? <div className="save-error">{execution.saveState.message}</div> : null}
    </section>
  );
}

/**
 * Manual recovery control for the Local CLI daemon process `AdminExecutionMode` just configured —
 * the "human's not gonna know how to restart a Node process" seam
 * (`server/routes/admin/system/assistant-daemon.ts`, backed by `src/assistant/daemon-supervisor.ts`).
 *
 * Renders directly under `AdminExecutionMode` in the same tab, not on its own tab: this control is
 * only meaningful in the context of "Local CLI" mode (a BYOK-mode admin has no daemon process to
 * restart), and putting it beside the mode picker keeps that context visible without a separate
 * screen having to re-explain it.
 *
 * ## Why this never says "restarted successfully" or "healthy"
 *
 * `restart()`'s own contract (`use-assistant-daemon-restart.hooks.ts`) is that a restart being
 * ACCEPTED and the daemon becoming HEALTHY are two different facts, and only the first one is ever
 * knowable from this button press — there is no "daemon became healthy" signal anywhere in
 * `daemon-supervisor.ts`. This component's copy is written to match that exactly: the result line
 * says "accepted", never "restarted" on its own, and the status line below it says "no known
 * failure right now" rather than "healthy". Reporting anything stronger would repeat the same
 * lying-comment failure mode a past defect in this repo was caused by.
 */
interface AssistantDaemonRestartProps {
  /** Dependency injection seam for tests — same convention as `AdminExecutionModeProps
   *  .useAdminExecutionModeHook`. */
  useAssistantDaemonRestartHook?: () => AssistantDaemonRestartController;
  /** `AiAssistant`'s own `t` — see {@link AdminAssistantSwitchProps.t}'s doc. */
  t?: (key: string) => string;
}

function resolveAssistantDaemonRestartHook(
  override: (() => AssistantDaemonRestartController) | undefined
): () => AssistantDaemonRestartController {
  return override ?? useWiredAssistantDaemonRestart;
}

/** The status line under the button — one of three mutually exclusive messages keyed on
 *  `knownFailed`/`checkingStatus`/`statusError`. Pulled to a top-level pure function for the same
 *  reason `visitorCredentialKeyStatusMessage` above is: an independently testable decision instead
 *  of a ternary chain inline in the component's JSX. */
export function assistantDaemonStatusMessage(
  controller: Pick<AssistantDaemonRestartController, "knownFailed" | "checkingStatus" | "statusError">,
  t: Translate = (key) => key
): string | null {
  if (controller.statusError) return controller.statusError;
  if (controller.checkingStatus && controller.knownFailed === null) return t("Checking status…");
  if (controller.knownFailed === true) return t("Known failed — the last attempt to start it did not succeed.");
  if (controller.knownFailed === false) return t("No known failure right now.");
  return null;
}

export function AssistantDaemonRestart(props: AssistantDaemonRestartProps) {
  const useAssistantDaemonRestartHook = resolveAssistantDaemonRestartHook(props.useAssistantDaemonRestartHook);
  const t = resolveT(props.t);
  const controller = useAssistantDaemonRestartHook();
  const { restarting, restartResult, restartError, checkingStatus, checkStatus, restart } = controller;
  const statusMessage = assistantDaemonStatusMessage(controller, t);

  return (
    <section className="assistant-daemon-restart">
      <h2>{t("Local CLI process")}</h2>
      <p className="muted-cell">
        {t(
          "The Local CLI mode above runs as its own process on the server. Tovu already retries it automatically after a crash — use this only if you don't want to wait for that."
        )}
      </p>
      <div className="assistant-daemon-restart-actions">
        <button type="button" className="btn-secondary" onClick={() => void restart()} disabled={restarting}>
          {restarting ? t("Restarting…") : t("Restart assistant")}
        </button>
        <button type="button" className="btn-secondary" onClick={() => void checkStatus()} disabled={checkingStatus}>
          {t("Check status")}
        </button>
      </div>
      {restartError ? <div className="save-error">{restartError}</div> : null}
      {!restartError && restartResult ? (
        <p className="assistant-save-line" role="status">
          {restartResult.ok
            ? t("Restart accepted. This does not confirm the process is healthy yet — check the status below.")
            : t("Restart refused: {reason}").replace("{reason}", restartResult.reason ?? "")}
        </p>
      ) : null}
      {statusMessage ? <p className="muted-cell" role="status">{statusMessage}</p> : null}
    </section>
  );
}

/**
 * The SITE's provider credential — the key that lets anonymous VISITORS chat on the deployed public
 * site. Reuses `@jini-ai/ui`'s `ByokProviderForm` unmodified, the same component
 * `features/settings/SettingsUi.tsx`'s Execution-mode tab renders, because this is deliberately the same
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
 * ## Saving
 *
 * Wired to ADR-058's encrypted server-side store (`GET`/`PUT`/`DELETE
 * /api/admin/v1/workspaces/:id/assistant/site-credential`), which encrypts at rest under a
 * deploy-time master secret rather than putting a secret in the ADR-028 settings ledger.
 *
 * Writing is an explicit press of one of TWO buttons — "Save key" writes the key, "Save settings"
 * writes provider/base URL/model and never a key (owner ruling, 2026-09-02; the single overloaded
 * Save could not honestly report which of its two jobs it had just done). See
 * `hooks/use-visitor-credential-form.hooks.ts`'s `saveVisitorKey`/`saveVisitorSettings` for that
 * split and for why the earlier debounced auto-save was removed (it made every keystroke in a
 * credential field a write, and destroyed a live key during development), and `dirty` for why a mount
 * or a hydration can never trigger one.
 *
 * ⚠️ Operationally required: the server must have `TOVU_INTEGRATIONS_ROOT_KEY` (hex) set, or every
 * save answers `503 SECRET_STORE_UNCONFIGURED`. That is ADR-058 failing CLOSED on purpose — a
 * missing master secret must not silently mint a key file — not a bug in this screen. `rules.ts`'s
 * `describeApiError` translates it into copy that tells the operator their key is fine and the
 * server is not.
 */
/** The "test it, see what it allows, know it saved" trio directly under the key field — the Save
 *  button, the Test Key button, and the discovery/save status lines. Split out of
 *  `VisitorCredentialForm` per the complexity-pass extraction rule: this block alone accounted for
 *  nearly all of the parent's branches (the Save/Test-Key `disabled` conditions, the three
 *  discovery-status lines, the five save-state lines), so pulling it into its own top-level
 *  component — mirroring `AdminExecutionMode`'s own `AdminByokKeyFooter` split immediately above in
 *  this same file — is what actually moved the parent's score, not just its ESLint per-closure one. */
type VisitorCredentialKeyFooterProps = Pick<
  VisitorCredentialFormController,
  "config" | "saveState" | "stored" | "hasUsableKey" | "discovery" | "saveKey" | "runKeyTest"
> & {
  /** `AiAssistant`'s own `t` — see {@link AdminAssistantSwitchProps.t}'s doc. Defaults to English
   *  passthrough so `VisitorCredentialForm.unit.test.tsx`'s direct renders (no `t` passed) keep
   *  finding "Save key"/"Test Key" by their exact English accessible names. */
  t?: (key: string) => string;
};

/** The "Save settings" control and its status line, at the foot of the shared BYOK card — the
 *  sibling of {@link VisitorCredentialKeyFooter}, and separate from it for the same reason the admin
 *  panel's two footers are separate: two buttons writing two disjoint patches belong beside the
 *  fields each one writes, and neither may report the other's work. */
type VisitorCredentialSettingsFooterProps = Pick<
  VisitorCredentialFormController,
  "dirty" | "settingsSaveState" | "saveSettings"
> & {
  /** `AiAssistant`'s own `t` — see {@link AdminAssistantSwitchProps.t}'s doc. */
  t?: (key: string) => string;
};

/** The status span next to the Save/Test Key buttons — one of three mutually exclusive messages
 *  keyed on `discovery.status`. Pulled to a top-level pure function, same reasoning as
 *  `visitorCredentialApiKeyPlaceholder` above: it was three sibling ternaries in the footer's JSX,
 *  now one independently testable decision. */
/**
 * @param t - `AiAssistant`'s own `t` — see {@link AdminAssistantSwitchProps.t}'s doc. Defaults to
 *   English passthrough so `VisitorCredentialForm.unit.test.tsx`'s direct, locale-unaware calls
 *   keep asserting the exact English strings they always have.
 */
export function visitorCredentialKeyStatusMessage(
  discovery: VisitorCredentialFormController["discovery"],
  t: Translate = (key) => key,
): string | null {
  if (discovery.status === "ok") {
    return t("Key works — {count} models available.").replace("{count}", String(discovery.models.length));
  }
  if (discovery.status === "idle") return t("Checks the key against the provider and lists the models it can use.");
  if (discovery.status === "loading") return t("Asking the provider which models this key allows…");
  return null;
}

/** Save key's status line — whether the KEY reached the server, and nothing else. One of four
 *  mutually exclusive messages keyed on `saveState.status` (plus `stored` for the two "idle"
 *  variants), pulled to a top-level pure function for the same reason as
 *  {@link visitorCredentialKeyStatusMessage} above.
 *
 *  `dirty` is deliberately NOT read here any more (two-button split, 2026-09-02). It means "settings
 *  changed since they were last written", which is {@link visitorCredentialSettingsStatusMessage}'s
 *  question — under the KEY field it would have announced an unsaved model change as though the key
 *  were the thing left unsaved.
 *
 *  The "WHICH key is stored" question lives in the field's own masked placeholder
 *  ({@link visitorCredentialApiKeyPlaceholder}), which is where an operator looks for it. That mask
 *  went through a full round trip of being removed and restored during design, so the conclusion is
 *  worth recording here too: it is a deliberate, bounded disclosure — without it the field is blank
 *  and cannot distinguish "nothing was ever saved" from "a key is saved and working", an ambiguity
 *  worse than four characters. */
/**
 * @param t - Same seam as {@link visitorCredentialKeyStatusMessage}'s own `t` param — defaults to
 *   English passthrough for the same test-compatibility reason.
 */
export function visitorCredentialSaveStatusMessage(
  saveState: VisitorCredentialFormController["saveState"],
  stored: VisitorCredentialFormController["stored"],
  t: Translate = (key) => key,
): string | null {
  if (saveState.status === "saving") return t("Saving…");
  if (saveState.status === "saved") return t("Saved to the server, encrypted.");
  if (saveState.status !== "idle") return null;
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
 * @param t - Same seam as its siblings above.
 */
export function visitorCredentialSettingsStatusMessage(
  settingsSaveState: VisitorCredentialFormController["settingsSaveState"],
  t: Translate = (key) => key,
): string | null {
  if (settingsSaveState.status === "saving") return t("Saving…");
  if (settingsSaveState.status === "saved") return t("Settings saved.");
  return null;
}

export function VisitorCredentialKeyFooter({
  config,
  saveState,
  stored,
  hasUsableKey,
  discovery,
  saveKey,
  runKeyTest,
  t: tProp,
}: VisitorCredentialKeyFooterProps) {
  // `t`'s default is resolved through `resolveT` (see that function's own doc, next to
  // `AdminExecutionMode` above) rather than inline here — this was the one thing keeping this
  // function's cyclomatic complexity at 10, one over the 9/9 ceiling.
  const t = resolveT(tProp);
  return (
    <div className="assistant-key-footer">
      <div className="assistant-key-actions">
        {/* The ONLY control that writes the KEY on this screen (its sibling
            `VisitorCredentialSettingsFooter` writes the other fields, and never a key).

            Disabled whenever the field is blank, stored key or not: this button's only job is to
            write the key, and an empty field has no key to write. A stored key does NOT re-enable
            it — the same narrowing the admin panel's Save key already carries. */}
        <button
          type="button"
          className="btn-primary"
          onClick={() => void saveKey()}
          disabled={!config.apiKey.trim() || saveState.status === "saving"}
        >
          {saveState.status === "saving" ? t("Saving…") : t("Save key")}
        </button>
        {/*
          An explicit "Test Key" control, in addition to the debounced automatic discovery
          above. Two reasons, and the second is the important one:

          1. The automatic path only fires against a PRESET-supplied endpoint (see the security
             gate above). For a custom or hand-typed base URL, this button is the only way to
             discover models — and being an explicit, deliberate press is exactly what makes
             sending the credential to an operator-chosen host acceptable there.
          2. Even on a preset endpoint, "type a key and wait for a list to appear" is a weak
             affordance: nothing tells the operator whether the key was accepted, rejected, or
             simply not looked at yet. A button that reports a count answers the question they
             actually have, which is "is this key any good?"
        */}
        <button
          type="button"
          className="btn-secondary"
          onClick={() => void runKeyTest()}
          // `hasUsableKey`, not `config.apiKey.trim()`. A stored key is a perfectly testable
          // key — the server has it even though this field is empty — and disabling the
          // control told the operator their working credential could not be checked.
          disabled={!hasUsableKey || discovery.status === "loading"}
        >
          {discovery.status === "loading" ? t("Testing…") : t("Test Key")}
        </button>
        <span className="assistant-key-status" role="status">{visitorCredentialKeyStatusMessage(discovery, t)}</span>
      </div>

      {discovery.status === "error" ? <div className="save-error">{discovery.message}</div> : null}

      {/*
        No model picker here any more, deliberately.

        This slot briefly carried a "Model for visitors" select listing the discovered models,
        because the shared form's Model field was a text input backed by a `<datalist>` — and a
        datalist stays invisible until the operator types, so a successful 42-model discovery
        showed them an empty box. That worked, but it put a SECOND control for `config.model`
        on the screen: the same value, editable in two places, four fields apart.

        Fixed upstream instead. `ByokProviderForm`'s own Model field now renders a real
        searchable picker whenever live discovery returns models (falling back to the text
        input + datalist when it does not), so there is one model control again — and the
        Settings screen gained the same fix rather than only this one.
      */}

      {/* Save key's status line — see `visitorCredentialSaveStatusMessage`'s own doc comment above
          for the mask/placeholder reasoning, and for why `dirty` is no longer read here. */}
      <p className="assistant-save-line">{visitorCredentialSaveStatusMessage(saveState, stored, t)}</p>
      {saveState.status === "error" ? <div className="save-error">{saveState.message}</div> : null}
    </div>
  );
}

/**
 * The "Save settings" control and its status line, for `ByokProviderForm`'s `formFooter` slot — at
 * the foot of the card, under Base URL / Max tokens / Model, which are the fields it writes.
 *
 * Gated on `dirty` exactly as the old single Save was: this is the button that could otherwise
 * offer, on load, to write back the values the server just sent — or, if hydration had failed, this
 * form's hardcoded defaults over a perfectly good stored credential. See the controller's `dirty`
 * doc. It is NOT gated on the key field, because settings are not the key.
 *
 * @complexity Time/space: O(1).
 */
export function VisitorCredentialSettingsFooter({
  dirty,
  settingsSaveState,
  saveSettings,
  t: tProp,
}: VisitorCredentialSettingsFooterProps) {
  const t = resolveT(tProp);
  const statusLine = visitorCredentialSettingsStatusMessage(settingsSaveState, t);

  return (
    <div className="assistant-settings-footer">
      <div className="assistant-key-actions">
        {/* `.btn-primary`, the same burnt-orange as Save key — see `AdminByokKeyPanel.tsx`'s
            identical button for the reasoning. The two panels must not disagree about this. */}
        <button
          type="button"
          className="btn-primary"
          onClick={() => void saveSettings()}
          disabled={!dirty || settingsSaveState.status === "saving"}
        >
          {settingsSaveState.status === "saving" ? t("Saving…") : t("Save settings")}
        </button>
      </div>
      {statusLine ? <p className="assistant-save-line">{statusLine}</p> : null}
      {settingsSaveState.status === "error" ? <div className="save-error">{settingsSaveState.message}</div> : null}
    </div>
  );
}

/** The server's `••••<last 4>` shown IN the key field — which key is stored, answered where the
 *  operator is already looking, instead of in a sentence underneath. `undefined` (no placeholder)
 *  whenever nothing is stored or the server didn't send a mask.
 *
 *  Safe precisely BECAUSE it is a placeholder: `config.apiKey` stays empty, so `saveKey`
 *  sends nothing at all and the stored key is left alone. A pre-filled value here would be a
 *  real value the save path would persist AS the key. Pulled to a top-level pure function per the
 *  complexity-pass extraction rule — one of the few remaining branch points in
 *  `VisitorCredentialForm` itself once {@link VisitorCredentialKeyFooter} moved out. */
export function visitorCredentialApiKeyPlaceholder(stored: VisitorCredentialFormController["stored"]): string | undefined {
  return stored?.isSet ? (stored.masked ?? undefined) : undefined;
}

interface VisitorCredentialFormProps {
  useVisitorCredentialFormHook?: typeof useWiredVisitorCredentialForm;
  /** `AiAssistant`'s own `t` — see {@link AdminAssistantSwitchProps.t}'s doc. Defaults to English
   *  passthrough so `VisitorCredentialForm.unit.test.tsx`'s direct render (no `t` passed) keeps
   *  finding "Protocols"/"Gateways"/the intro copy by their exact English text. */
  t?: (key: string) => string;
}

export function VisitorCredentialForm({
  useVisitorCredentialFormHook = useWiredVisitorCredentialForm,
  t = (key: string) => key,
}: VisitorCredentialFormProps = {}) {
  const {
    config,
    editConfig,
    preset,
    discovery,
    connectionTest,
    stored,
    saveState,
    settingsSaveState,
    dirty,
    hasUsableKey,
    configuredPresetIds,
    selectPreset,
    saveKey,
    saveSettings,
    runKeyTest,
    runTestConnection,
  } = useVisitorCredentialFormHook();

  /**
   * The provider picker — the two chip rows ("Protocols" / "Gateways") that let an operator choose
   * Anthropic, OpenAI, Azure OpenAI, Google Gemini, OpenRouter, or Ollama.
   *
   * Structure and wiring lifted verbatim from `ExecutionTab`'s own BYOK section in `@jini-ai/ui`
   * (`groupPresets` → two `ProviderChipGroup`s → `ByokProviderForm`), which is what the Settings →
   * Execution mode screen renders. See `hooks/use-visitor-credential-form.hooks.ts`'s `selectPreset`
   * for the non-obvious snapshotting behaviour behind switching providers, and `rules.ts`'s
   * `configuredPresetIds` for what a chip's filled dot actually claims.
   */
  const { protocols, gateways } = groupPresets(DEFAULT_PROVIDER_PRESETS);

  return (
    <>
      {/*
        Clamped to 3 lines behind `SeeMore` rather than shortened. Every sentence below is load-bearing
        — this screen exists because an operator could not tell the two API keys apart — but all of it
        at once is a wall of explanation standing between the operator and the one field they came to
        fill in. Clamping keeps the full text in the DOM (findable by in-page search and by a screen
        reader walking the region; see `components/SeeMore/SeeMore.tsx`'s header) while letting the form be the
        first thing on the screen.

        3 lines, not the component's default 2, so the first paragraph's point — "this key is for your
        visitors, not for you" — is complete before the fold. A 2-line clamp cuts it mid-sentence.
      */}
      {/*
        No `<strong>` anywhere below, and no `.muted-cell`. Every emphasis here was competing with
        every other one — three bolded lead-ins down one column reads as three headings rather than
        as three sentences, and it made the copy shout next to a form whose own labels are a quiet
        12px. The only bold thing on this tab is now the enable switch's label, which is the one
        control the whole tab is about. Weight is a hierarchy signal and it only works while it is
        scarce.
      */}
      <SeeMore
        lines={3}
        textClassName="assistant-intro"
        toggleAriaLabel={t("See more about the visitor key")}
        moreLabel={t("See more")}
        lessLabel={t("See less")}
      >
        <p>
          {t(
            "This key is for your visitors, not for you. It is what lets people reading your published site ask questions and get answers. It is stored on the server and used for every visitor conversation.",
          )}
        </p>
        <p>
          {t(
            "It is a different key from the one under Settings → Execution mode → BYOK. That one is your own, it is saved only in this browser, and it powers the assistant in this admin. A deployed site can never use it — which is why saving a key there does not switch on the visitor chat.",
          )}
        </p>
        {/*
          KNOWN COPY CONFLICT, stated here rather than papered over: the shared `ByokProviderForm`
          below renders its own hint under the API-key field reading "Stored only by this host." That
          string is correct for its original caller (Settings → Execution mode, where the key really
          is browser-local) and WRONG here, where the whole point is that the key goes to the server.
          Two host screens now need two different answers from one shared component.

          Not fixed by hiding it with CSS and not fixed by forking the component — the standing
          decision on this workstream is to reuse via `@jini-ai/ui` and push gaps UPSTREAM to Jini.
          The correct fix is a prop on `ByokProviderForm` letting the host supply that hint, which is
          a change in the Jini repo. Until that lands, this line is the compensating control: it
          appears ABOVE the card so the operator reads the true statement first.
        */}
        <p>
          {t(
            'Ignore the "Stored only by this host" note below. It belongs to the shared form component and is accurate on the Settings screen, not here. This key will be stored on the server, encrypted.',
          )}
        </p>
      </SeeMore>

      {/* Same `jini-settings-byok` section wrapper `ExecutionTab` puts around this exact trio, so the
          chip rows inherit the spacing the shared stylesheet already defines for them rather than
          needing a second set of rules here. */}
      <section className="jini-settings-section jini-settings-byok">
        <ProviderChipGroup
          label={t("Protocols")}
          presets={protocols}
          selectedPresetId={preset?.id ?? null}
          configuredPresetIds={configuredPresetIds}
          onSelect={selectPreset}
          configuredLabel={t("Configured")}
          unsetLabel={t("Not configured")}
        />
        <ProviderChipGroup
          label={t("Gateways")}
          presets={gateways}
          selectedPresetId={preset?.id ?? null}
          configuredPresetIds={configuredPresetIds}
          onSelect={selectPreset}
          configuredLabel={t("Configured")}
          unsetLabel={t("Not configured")}
        />

      {/* `canTestConnection` left at its default (true): the probe is real here. It posts the typed
          key to the same admin route the Settings screen uses, so it answers "is this key good?"

          `apiKeyFooter`/`formFooter` are slots added UPSTREAM in `@jini-ai/ui` for this screen rather
          than a fork of the component — the standing decision on this workstream. The first puts the
          things that are about the KEY (test it, see what it allows, know it saved) directly under
          the key field, which is where the operator is looking when they have those questions; the
          second puts "Save settings" under the fields IT writes, at the foot of the card. Two slots
          because they are two buttons with two disjoint jobs. */}
      <ByokProviderForm
        config={config}
        onConfigChange={editConfig}
        preset={preset}
        modelDiscovery={discovery}
        connectionTest={connectionTest}
        onTestConnection={() => void runTestConnection()}
        // Tells the shared form that the empty key field is not a missing required field, so
        // "Test connection" stops being permanently disabled on a screen whose key lives on the
        // server. Only affects the emptiness check for `apiKey`; base URL and model still validate.
        apiKeyStoredExternally={stored?.isSet === true}
        apiKeyPlaceholder={visitorCredentialApiKeyPlaceholder(stored)}
        apiKeyFooter={
          <VisitorCredentialKeyFooter
            config={config}
            saveState={saveState}
            stored={stored}
            hasUsableKey={hasUsableKey}
            discovery={discovery}
            saveKey={saveKey}
            runKeyTest={runKeyTest}
            t={t}
          />
        }
        formFooter={
          <VisitorCredentialSettingsFooter
            dirty={dirty}
            settingsSaveState={settingsSaveState}
            saveSettings={saveSettings}
            t={t}
          />
        }
        />
      </section>
    </>
  );
}

/**
 * Bridges `AiAssistant`'s own `locale` to the mounted `I18nProvider`'s active locale. Renders
 * nothing; see `hooks/use-ai-assistant-locale-sync.hooks.ts` for the full rationale (an
 * uncontrolled `initialLocale` prop that only applies at mount) — same shape as
 * `features/settings/SettingsUi.tsx`'s own `SettingsLocaleSync`.
 *
 * @complexity O(1) — one equality check per render, no iteration.
 * @overallScore 100
 */
function AiAssistantLocaleSync({
  locale,
  useAiAssistantLocaleSyncHook = useWiredAiAssistantLocaleSync,
}: {
  locale: string;
  /** Dependency injection seam for tests — same convention as `PostsProps.usePostsHook`. */
  useAiAssistantLocaleSyncHook?: typeof useWiredAiAssistantLocaleSync;
}) {
  useAiAssistantLocaleSyncHook({ locale });
  return null;
}

export interface AiAssistantProps {
  /**
   * Dependency injection seam for tests — the same convention `@jini-ai/ui`'s `CustomSelect` uses
   * for `useCustomSelect`, and `features/posts/Posts.tsx`'s `usePostsHook`.
   *
   * Defaulted to the real hook, so production callers (`panels.tsx`) pass nothing and behave
   * exactly as before. A test supplies a stub and drives the visitor on/off switch through any
   * state without module mocking or a fake `fetch`. The three sub-components below (`AdminAssistantSwitch`,
   * `AdminExecutionMode`, `VisitorCredentialForm`) take the same seam over their own hooks, for the
   * same reason — this is the screen with the most independent state in the app.
   */
  useAiAssistantHook?: typeof useWiredAiAssistant;
}

export function AiAssistant({ useAiAssistantHook = useWiredAiAssistant }: AiAssistantProps = {}) {
  const { settings, loadError, saveError, saving, setPublicEnabled } = useAiAssistantHook();

  /**
   * The one `useWiredAdminLocale()` call for this whole screen — every subcomponent below (
   * `AdminAssistantSwitch`, `AdminExecutionMode`, `RoadmapChecklist`, `VisitorCredentialForm`, and
   * that last one's own `VisitorCredentialKeyFooter`) takes the resulting `t` as a prop rather than
   * calling the hook itself, so switching the Language setting re-fetches once here, not once per
   * subcomponent — same "take `t` as a prop" shape `features/settings/SettingsUi.tsx`'s own
   * `AboutPanel({ t })` uses, for the same reason (a component that isn't a descendant of the
   * `I18nProvider` mounted below can't call that package's own `useT()`).
   */
  const locale = useWiredAdminLocale();
  const t = (key: string): string => AI_ASSISTANT_DICT[locale]?.[key] ?? key;

  if (loadError) return <div className="notice error">{loadError}</div>;
  if (!settings) return <div className="notice">{t("Loading AI assistant settings…")}</div>;

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
      label: t("Visitor's AI Assistant"),
      title: t("Visitor's AI Assistant"),
      subtitle: t("The assistant your published site offers to readers."),
      icon: (
        <TabIcon>
          <circle cx="9" cy="9" r="6.5" />
          <path d="M2.5 9h13M9 2.5c1.8 2 2.7 4.2 2.7 6.5S10.8 15 9 15.5C7.2 15 6.3 11.3 6.3 9S7.2 4.5 9 2.5z" />
        </TabIcon>
      ),
      panel: (
        <>
          {/* No `.notice` here, unlike the Admin tab's equivalent below: this tab is deliberately
              card-free (see `styles.css`'s `--page-flow` flattening block) so the panel reads as one
              form on the page's own background rather than a stack of boxes. */}
          <div className="assistant-switch">
            {saveError ? <div className="save-error">{saveError}</div> : null}
            <label>
              <input
                type="checkbox"
                checked={settings.publicEnabled}
                disabled={saving}
                onChange={(e) => void setPublicEnabled(e.target.checked)}
              />
              {t("Enable the AI assistant on the public site. *API Key needed*")}
            </label>
            {/* `.muted-cell` dropped along with the intro's: it is an admin-table class (0.85rem,
                `--faint`) that made this tab's body copy a third size next to the Jini form's own
                12px labels and hints. Typography for both now comes from one scoped rule in
                `styles.css`. */}
            <p>
              {settings.publicEnabled
                ? t("Visitors can chat with the assistant. It is served on every public page.")
                : t(
                    "Off. The public site ships no assistant code and exposes no assistant endpoint — this is a full disable, not a hidden widget.",
                  )}
            </p>
          </div>

          <VisitorCredentialForm t={t} />
        </>
      ),
    },
    {
      id: "admin",
      label: t("Admin AI Assistant"),
      title: t("Admin AI Assistant"),
      subtitle: t("The assistant in this admin, for signed-in administrators."),
      icon: (
        <TabIcon>
          <rect x="3" y="5" width="12" height="9" rx="2.5" />
          <path d="M9 5V2.5M6.5 9v.01M11.5 9v.01M7 12h4" />
        </TabIcon>
      ),
      panel: (
        <>
          <AdminAssistantSwitch t={t} />
          <AdminExecutionMode t={t} />
          <AssistantDaemonRestart t={t} />
        </>
      ),
    },
    {
      id: "roadmap",
      label: t("Not built yet"),
      title: t("Not built yet"),
      subtitle: t("Operator controls that are planned but not implemented."),
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
      panel: <RoadmapChecklist t={t} />,
    },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          {/* Reuses the exact nav vocabulary (`admin-nav-i18n.ts`'s `ES` dict) rather than a second,
              independent translation of the same two words — "Overview" and "AI Assistant" are the
              sidebar's own kicker/label for this screen. */}
          <p className="page-kicker">{translateAdminNavLabel(locale, "Overview")}</p>
          <h1 className="page-title">{translateAdminNavLabel(locale, "AI Assistant")}</h1>
          <p className="page-description">{t("Turn the visitor-facing assistant on or off for your public site.")}</p>
        </div>
      </div>

      {/*
        Same shell, same props, and the same `presentation="inline"` page mode `features/settings/SettingsUi.tsx`
        already uses — so this screen inherits that tab chrome rather than growing a second, similar-
        but-different one. `I18nProvider` is required, not decorative: `ByokProviderForm` and the shell
        both call `useT()`, and without a provider above them their strings fall back to raw keys.
        `syncDocumentAttributes={false}` for the identical reason SettingsUi documents — only this
        panel's content is translated, so claiming a document-wide language would misinform assistive
        tech about the untranslated rest of the admin.

        `initialLocale={locale}`, not the hardcoded `"en"` this used to read — `SETTINGS_DIALOG_DICTIONARIES`
        already ships an `es` dictionary (the same one `SettingsUi.tsx`'s own mount uses), so this is
        what makes `ByokProviderForm`'s/`SettingsDialogShell`'s OWN internal chrome (field labels,
        hints, "Test connection", the shell's tab-strip chrome) follow the operator's Language setting
        too, not just the literal strings this file passes in as props above.
      */}
      <I18nProvider initialLocale={locale} dictionaries={SETTINGS_DIALOG_DICTIONARIES} fallbackLocale="en" syncDocumentAttributes={false}>
        <AiAssistantLocaleSync locale={locale} />
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
            className="jini-tabbed-dialog--inline"
            fullscreenEnabled={false}
          />
        </div>
      </I18nProvider>
    </div>
  );
}
