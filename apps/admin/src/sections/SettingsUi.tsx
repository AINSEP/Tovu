/**
 * @file Admin "Settings (New)" screen — the Open Design settings-dialog port.
 *
 * Ships *beside* the SPEC-007 raw ledger browser (`sections/Settings.tsx`),
 * which is deliberately untouched: the curated tabbed surface and the raw
 * namespace/key inspector are two views of the same `content.db` store, and
 * the decision on record is that both stay available.
 *
 * Canary scope: one tab (Execution mode). The shell is generic over its tab
 * array, so adding the remaining thirteen is appending entries to
 * `TAB_REGISTRY` below — not restructuring this file.
 *
 * Both render modes are exercised here on purpose. `SettingsDialogShell`
 * treats `onClose` as the modal/inline switch (omit it and the shell renders
 * inline with no close affordance), so the page view and the modal view are
 * the same component with one prop different — which is the property the
 * canary is meant to prove.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ExecutionTab,
  SettingsDialogShell,
  type ExecutionConfig,
  type SettingsDialogTab,
} from "@jini-ai/ui";
import "@jini-ai/ui/settings-dialog.css";
import {
  DEFAULT_EXECUTION_CONFIG,
  createExecutionPort,
  loadExecutionConfig,
  saveExecutionConfig,
} from "../lib/execution-settings";

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string };

/** Debounce for text fields: the tab is controlled and fires on every
 *  keystroke, and each ledger write is an append-only revision. Without this,
 *  typing an API key would write one revision per character. */
const SAVE_DEBOUNCE_MS = 600;

export function SettingsUi() {
  const [config, setConfig] = useState<ExecutionConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const [modalOpen, setModalOpen] = useState(false);

  /** Last value known to be persisted — the diff base for `saveExecutionConfig`. */
  const persisted = useRef<ExecutionConfig>(DEFAULT_EXECUTION_CONFIG);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const port = useRef(createExecutionPort());

  /** The newest config the operator has produced, saved or not. A queued save
   *  writes THIS rather than whatever value was current when it was scheduled,
   *  so a save that waited behind another one still persists the latest state
   *  instead of resurrecting an intermediate one. */
  const latest = useRef<ExecutionConfig>(DEFAULT_EXECUTION_CONFIG);

  /**
   * Saves run strictly one at a time, chained off this promise.
   *
   * The debounce alone does NOT prevent overlap: it only cancels a save that
   * has not STARTED. Once one is in flight, the next edit schedules a fresh
   * timer that can fire while the first is still running, and then two saves
   * race — their per-key `setSetting` calls interleave (so the ledger can end
   * on the older value), and both diff against the same `persisted` base,
   * which the slower one then overwrites on completion. That leaves the diff
   * base claiming a value was persisted that never was, so the next edit
   * skips writing the fields it thinks are already saved.
   */
  const saveChain = useRef<Promise<void>>(Promise.resolve());

  /** Monotonic ticket, so only the newest save may write the status
   *  indicator. Without it a slow earlier save resolving last would paint
   *  "Saved" over a newer save's error, or vice versa. */
  const saveTicket = useRef(0);

  /**
   * True whenever `latest` has moved ahead of `persisted` — i.e. the operator
   * has edited something that no save has committed yet.
   *
   * The ticket alone does NOT cover this. A ticket is only taken when a
   * DEBOUNCE TIMER FIRES, so an edit made while an earlier save is still in
   * flight has no ticket yet: the in-flight save still owns the newest one,
   * completes, and paints "Saved" over changes that are not saved at all. If
   * the operator then navigates away, unmount clears the pending timer and
   * those edits are gone — with the UI's last word having been "Saved".
   */
  const hasUnsavedEdits = useRef(false);

  useEffect(() => {
    let alive = true;
    loadExecutionConfig()
      .then((loaded) => {
        if (!alive) return;
        persisted.current = loaded;
        latest.current = loaded;
        setConfig(loaded);
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setLoadError(error instanceof Error ? error.message : String(error));
        setConfig(DEFAULT_EXECUTION_CONFIG);
      });
    return () => {
      alive = false;
    };
  }, []);

  // On unmount, don't just drop a debounced edit — run it. Cancelling the
  // timer silently discards whatever the operator typed in the last 600ms.
  useEffect(
    () => () => {
      if (!timer.current) return;
      clearTimeout(timer.current);
      if (!hasUnsavedEdits.current) return;
      const target = latest.current;
      const base = persisted.current;
      // Fire-and-forget: the component is going away, so there is no status
      // left to paint. The write itself still has to happen.
      saveChain.current = saveChain.current.then(() =>
        saveExecutionConfig(target, base).then(
          () => {},
          () => {},
        ),
      );
    },
    [],
  );

  const onConfigChange = useCallback((next: ExecutionConfig) => {
    setConfig(next);
    latest.current = next;
    hasUnsavedEdits.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const ticket = ++saveTicket.current;
      setSave({ status: "saving" });
      saveChain.current = saveChain.current.then(async () => {
        // Read both the target and the diff base at RUN time, not at schedule
        // time: by the time this link runs, an earlier save may have already
        // advanced `persisted`, and the operator may have edited further.
        const target = latest.current;
        try {
          const written = await saveExecutionConfig(target, persisted.current);
          persisted.current = target;
          // Only clear the flag if nothing was edited WHILE this save ran.
          if (latest.current === target) hasUnsavedEdits.current = false;
          if (saveTicket.current !== ticket) return;
          // A newer edit is already queued behind this one, so "Saved" would
          // be a claim about state that is not saved. Stay in "saving".
          if (hasUnsavedEdits.current) return;
          setSave(written.length > 0 ? { status: "saved" } : { status: "idle" });
        } catch (error: unknown) {
          // `persisted` is deliberately NOT advanced on failure, so the next
          // save re-attempts the fields this one could not write.
          if (saveTicket.current !== ticket) return;
          setSave({
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });
    }, SAVE_DEBOUNCE_MS);
  }, []);

  if (!config) {
    return (
      <div className="settings-ui-section">
        <p className="muted">Loading settings…</p>
      </div>
    );
  }

  const tabs: SettingsDialogTab[] = [
    {
      id: "execution",
      label: "Execution mode",
      navHint: "Local CLI / BYOK",
      title: "Execution mode",
      subtitle: "Choose Local CLI or BYOK.",
      icon: (
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 5h3M9 5h6M12 9H9M6 9H3M3 13h7M13 13h2" />
          <circle cx="7.5" cy="5" r="1.6" />
          <circle cx="7.5" cy="9" r="1.6" transform="translate(3 0)" />
          <circle cx="11.5" cy="13" r="1.6" />
        </svg>
      ),
      panel: (
        <ExecutionTab
          config={config}
          onConfigChange={onConfigChange}
          port={port.current}
          // Detection runs wherever the Tovu SERVER runs, not on the browser's
          // machine. For a deployed CMS those are different computers, so the
          // component's own default ("on this machine") would be a false claim
          // about whose CLIs these are.
          localCliScopeLabel="Detected on the Tovu server, not on your own computer."
        />
      ),
    },
  ];

  /**
   * Top-right chrome. Lives in the shell's own `chromeExtra` slot rather than
   * in a banner above it, so the page is exactly what it looks like: the admin
   * sidebar, the settings sidebar, and the panel — no third strip of header
   * competing with the shell's own title.
   */
  const saveStatus = (
    <span
      className={`settings-ui-save is-${save.status}`}
      role={save.status === "error" ? "alert" : "status"}
    >
      {save.status === "saving"
        ? "Saving…"
        : save.status === "saved"
          ? "Saved"
          : save.status === "error"
            ? save.message
            : ""}
    </span>
  );

  /** Page chrome carries the "open as dialog" affordance; the dialog itself
   *  obviously must not offer to open itself, so it gets the status alone. */
  const pageChrome = (
    <>
      {saveStatus}
      <button type="button" className="settings-ui-dialog-btn" onClick={() => setModalOpen(true)}>
        Open as dialog
      </button>
    </>
  );

  return (
    <div className="settings-ui-section">
      {loadError ? (
        <p className="settings-ui-load-error" role="alert">
          Could not load saved settings ({loadError}). Showing defaults — edits will still save.
        </p>
      ) : null}

      {/* Page mode: `presentation="inline"` renders the shell in the admin's own
          content column — two sidebars (admin, then settings) and the panel. */}
      <SettingsDialogShell
        tabs={tabs}
        presentation="inline"
        className="jini-settings-dialog--inline"
        fullscreenEnabled={false}
        chromeExtra={pageChrome}
      />

      {/* Modal mode: same component, same tabs, one different prop. */}
      {modalOpen ? (
        <SettingsDialogShell
          tabs={tabs}
          onClose={() => setModalOpen(false)}
          chromeExtra={saveStatus}
        />
      ) : null}
    </div>
  );
}
