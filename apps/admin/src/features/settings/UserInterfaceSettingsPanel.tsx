import { agentHandle } from "@jini-ai/agentic";

import "./user-interface-settings.css";
import { t as tInterface } from "./settings-interface-i18n";
import { useUserInterfaceTab, type UserInterfaceTabSlice } from "./hooks/use-user-interface-tab.hooks";

/**
 * Settings → User Interface (owner, 2026-10-06). Switches for how the admin's chrome behaves for
 * this operator: whether the floating chat button hides while the assistant dock is open, and
 * (2026-10-07) whether phone tab strips wrap instead of scrolling. Autosaves through the tab's
 * settings slice like every other Settings control; `App.tsx` reads the same `core.interface`
 * values live (`useInterfacePreferences`). The switch reuses `.agent-plugin-switch`'s paint, and
 * the label says the on/off meaning in words so position is never the only signal.
 */
export function UserInterfaceSettingsPanel(props: { slice: UserInterfaceTabSlice; locale: string }) {
  const tab = useUserInterfaceTab(props.slice);
  const t = (key: string) => tInterface(props.locale, key);
  return (
    <>
      <InterfaceSwitchRow
        id="settings-interface-hide-fab-label"
        label={t("Hide the chat button while the chat is open")}
        hint={t("On: the chat panel's ✕ closes it. Off: the button stays on screen above the open panel and closes it.")}
        checked={tab.hideChatFabWhileOpen}
        onToggle={tab.toggleHideChatFabWhileOpen}
        handle="settings-interface-hide-chat-fab"
        agentLabel="Hide the chat button while the chat is open"
      />
      <InterfaceSwitchRow
        id="settings-interface-wrap-tabs-label"
        label={t("Wrap tabs instead of scrolling")}
        hint={t("On: on narrow screens, tab rows wrap onto more lines so every tab is visible. Off: they stay on one row you swipe sideways.")}
        checked={tab.wrapTabs}
        onToggle={tab.toggleWrapTabs}
        handle="settings-interface-wrap-tabs"
        agentLabel="Wrap tabs instead of scrolling"
      />
    </>
  );
}

function InterfaceSwitchRow(props: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onToggle: () => void;
  handle: string;
  agentLabel: string;
}) {
  return (
    <div className="settings-interface-row">
      <div className="settings-interface-text">
        <span id={props.id} className="settings-interface-label">{props.label}</span>
        <p className="settings-interface-hint">{props.hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={props.checked}
        aria-labelledby={props.id}
        className="agent-plugin-switch"
        onClick={props.onToggle}
        // `checkbox` for the page driver; ARIA stays `switch` (same split as `AgentPluginRow.tsx`).
        {...agentHandle({ handle: props.handle }, { role: "checkbox", label: props.agentLabel })}
      >
        <span className="agent-plugin-switch-knob" aria-hidden="true" />
      </button>
    </div>
  );
}
