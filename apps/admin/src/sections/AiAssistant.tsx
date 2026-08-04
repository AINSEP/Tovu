import { useEffect, useState, useSyncExternalStore } from "react";
import { ApiError, api, describeApiError as describeApiErrorDefault, type PublicAssistantSettings } from "../lib/api";
import {
  getAssistantDockOpen,
  requestAssistantDock,
  subscribeToAssistantDock,
} from "../lib/assistant-dock-bus";

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
 * Three distinct concerns, kept distinct rather than collapsed into one "limits" row, because they
 * fail differently: a cost cap bounds the bill, a rate limit bounds one abusive visitor, and a
 * status view is how you notice either is happening. Shipping only one of them would leave a real
 * hole that a combined label would hide.
 */
const ROADMAP: readonly RoadmapItem[] = [
  {
    key: "budget",
    label: "Token / cost budget caps",
    detail:
      "Per-day and per-conversation spend ceilings, with the assistant disabling itself when a ceiling is exhausted. Until this exists, the switch above is the only spending control.",
  },
  {
    key: "rate-limit",
    label: "Per-visitor rate limiting",
    detail:
      "A per-IP or per-session request window. Distinct from the budget caps above: this bounds what one abusive visitor can do, rather than what the site spends in aggregate.",
  },
  {
    key: "status",
    label: "Live status and recent activity",
    detail:
      "Assistant health, recent conversation counts, and spend to date — the view that would tell you a budget or rate-limit problem is happening while it is happening.",
  },
];

function RoadmapChecklist() {
  return (
    <section className="assistant-roadmap">
      <h2>Not built yet</h2>
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
    <div className="notice assistant-switch">
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

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">Overview</p>
          <h1 className="page-title">AI Assistant</h1>
          <p className="page-description">Turn the visitor-facing assistant on or off for your public site.</p>
        </div>
      </div>

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
          This does not affect the assistant in this admin, which stays available to signed-in administrators either way.
        </p>
      </div>

      <AdminAssistantSwitch />

      <RoadmapChecklist />
    </div>
  );
}
