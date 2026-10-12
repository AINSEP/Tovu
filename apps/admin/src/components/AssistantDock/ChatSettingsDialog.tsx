import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { I18nProvider, SETTINGS_DIALOG_DICTIONARIES, SettingsDialogShell, type SettingsDialogTab } from "@jini-ai/ui";
import { InfoTip } from "@jini-ai/ui/admin-widgets";

import "@jini-ai/ui/settings-dialog.css";
import "./chat-settings-dialog.css";
import { CHAT_TOOL_CALL_OPTIONS } from "./chat-display-preferences";
import type { ChatDisplayPreferencesController } from "./hooks/use-chat-display-preferences.hooks";

/**
 * The dock gear's "Chat settings" dialog (owner, 2026-10-11): the admin's own tabbed settings shell
 * (`SettingsDialogShell`, the one Settings uses), as a modal, portaled to `<body>` so the narrow dock
 * never clips it. One tab today, Display; another tab is one more entry in `tabs`.
 * Props and JSX only — the choices and their saving live in `useChatDisplayPreferences`.
 */
export function ChatSettingsDialog({ locale, t, display, onClose }: {
  locale: string;
  t: (key: string) => string;
  display: ChatDisplayPreferencesController;
  onClose: () => void;
}) {
  const tabs: SettingsDialogTab[] = [
    // The heading names the dialog, not the tab (Chrome check, 2026-10-11): "Chat settings" as the
    // title, Display only in the tab list, and no kicker above it.
    { id: "display", label: t("Display"), title: t("Chat settings"), panel: <ChatDisplayPanel t={t} display={display} /> },
  ];
  return createPortal(
    <I18nProvider initialLocale={locale} dictionaries={SETTINGS_DIALOG_DICTIONARIES} fallbackLocale="en" syncDocumentAttributes={false}>
      <div className="chat-settings-dialog" data-theme="light">
        <SettingsDialogShell
          tabs={tabs}
          presentation="modal"
          onClose={onClose}
          fullscreenEnabled={false}
          labels={{ kicker: "" }}
          dialogAriaLabelledBy="chat-settings-dialog-title"
        />
      </div>
    </I18nProvider>,
    document.body,
  );
}

/** Display tab: each row is a label, an ⓘ explaining it, and its control, on one line. */
function ChatDisplayPanel({ t, display }: { t: (key: string) => string; display: ChatDisplayPreferencesController }) {
  const { preferences, update } = display;
  return (
    <div className="chat-settings-panel">
      <ChatSettingRow id="chat-settings-tool-calls" label={t("Tool calls")}
        tip={t("Show: every tool call. Collapsed: one line per reply, click to open. Hidden: only failed calls.")}>
        <div className="segmented" role="group" aria-labelledby="chat-settings-tool-calls">
          {CHAT_TOOL_CALL_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={preferences.toolCalls === option.value ? "is-active" : undefined}
              aria-pressed={preferences.toolCalls === option.value}
              onClick={() => update({ toolCalls: option.value })}
            >
              {t(option.label)}
            </button>
          ))}
        </div>
      </ChatSettingRow>
      <ChatSettingRow id="chat-settings-usage-line" label={t("Done line")} tip={t("Time, cost and running total under each reply.")}>
        <ChatSettingSwitch labelledBy="chat-settings-usage-line" checked={preferences.showUsageLine}
          onToggle={() => update({ showUsageLine: !preferences.showUsageLine })} />
      </ChatSettingRow>
      <ChatSettingRow id="chat-settings-thinking" label={t("Thinking")} tip={t("The model's reasoning, folded where it happened, when the agent shares it.")}>
        <ChatSettingSwitch labelledBy="chat-settings-thinking" checked={preferences.showThinking}
          onToggle={() => update({ showThinking: !preferences.showThinking })} />
      </ChatSettingRow>
      {display.saveFailed ? <p className="chat-settings-error" role="status">{t("Couldn't save. This choice lasts until you reload.")}</p> : null}
    </div>
  );
}

function ChatSettingRow({ id, label, tip, children }: { id: string; label: string; tip: string; children: ReactNode }) {
  return (
    <div className="chat-settings-row">
      <span className="chat-settings-label">
        <span id={id}>{label}</span>
        <InfoTip label={tip} />
      </span>
      {children}
    </div>
  );
}

/** The admin's on/off switch paint (`.agent-plugin-switch`, same as Settings → User Interface). */
function ChatSettingSwitch({ labelledBy, checked, onToggle }: { labelledBy: string; checked: boolean; onToggle: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-labelledby={labelledBy} className="agent-plugin-switch" onClick={onToggle}>
      <span className="agent-plugin-switch-knob" aria-hidden="true" />
    </button>
  );
}
