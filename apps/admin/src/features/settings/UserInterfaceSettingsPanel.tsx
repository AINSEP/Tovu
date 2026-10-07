import { agentHandle } from "@jini-ai/agentic";

import "./user-interface-settings.css";
import { t as tInterface } from "./settings-interface-i18n";
import { useUserInterfaceTab, type UserInterfaceTabSlice } from "./hooks/use-user-interface-tab.hooks";

/**
 * Settings → User Interface (owner, 2026-10-06). One switch so far: whether the floating chat
 * button hides while the assistant dock is open. Autosaves through the tab's settings slice like
 * every other Settings control; `App.tsx` reads the same `core.interface` value live
 * (`useChatFabHideWhileOpen`). The switch reuses `.agent-plugin-switch`'s paint, and the label
 * says the on/off meaning in words so position is never the only signal.
 */
export function UserInterfaceSettingsPanel(props: { slice: UserInterfaceTabSlice; locale: string }) {
  const tab = useUserInterfaceTab(props.slice);
  const t = (key: string) => tInterface(props.locale, key);
  const label = t("Hide the chat button while the chat is open");
  return (
    <div className="settings-interface-row">
      <div className="settings-interface-text">
        <span id="settings-interface-hide-fab-label" className="settings-interface-label">{label}</span>
        <p className="settings-interface-hint">
          {t("On: the chat panel's ✕ closes it. Off: the button stays on screen above the open panel and closes it.")}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={tab.hideChatFabWhileOpen}
        aria-labelledby="settings-interface-hide-fab-label"
        className="agent-plugin-switch"
        onClick={tab.toggleHideChatFabWhileOpen}
        // `checkbox` for the page driver; ARIA stays `switch` (same split as `AgentPluginRow.tsx`).
        {...agentHandle({ handle: "settings-interface-hide-chat-fab" }, { role: "checkbox", label: "Hide the chat button while the chat is open" })}
      >
        <span className="agent-plugin-switch-knob" aria-hidden="true" />
      </button>
    </div>
  );
}
