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

  useEffect(() => {
    let alive = true;
    loadExecutionConfig()
      .then((loaded) => {
        if (!alive) return;
        persisted.current = loaded;
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

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onConfigChange = useCallback((next: ExecutionConfig) => {
    setConfig(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setSave({ status: "saving" });
      saveExecutionConfig(next, persisted.current)
        .then((written) => {
          persisted.current = next;
          setSave(written.length > 0 ? { status: "saved" } : { status: "idle" });
        })
        .catch((error: unknown) => {
          setSave({
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          });
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
          localCliUnavailableReason="No local agent runtime is wired to this Tovu instance yet."
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
