import { useId, type ComponentType } from "react";
import { agentHandle } from "@jini-ai/agentic";
import { InfoTip } from "@jini-ai/ui/admin-widgets";

import { AssistantToggleRow } from "./AssistantToggleRow";
import type { AiAssistantController } from "./hooks/use-ai-assistant.hooks";
import { useVisitorAssistantPanel } from "./hooks/use-visitor-assistant-panel.hooks";
import { useWiredVisitorCredentialForm } from "./hooks/use-visitor-credential-form.hooks";

/**
 * The Visitor tab (2026-10-09 redesign): a status pill, then three numbered steps in the order an
 * operator actually does them — connect a provider, pick the widget, turn it on. The switch comes
 * LAST and stays disabled until a key is saved, because an assistant switched on with no key is
 * mounted on every public page and cannot answer.
 *
 * Every explanation that used to sit inline as a paragraph is an ⓘ tip now; none was dropped.
 *
 * The credential controller is created HERE, once, and handed to the form, so the pill and the
 * switch gate read the same `hasStoredKey` the form's own save line does. `CredentialForm` is
 * injected (it lives in `AiAssistant.tsx`, which imports this file) to avoid an import cycle.
 */
export interface VisitorAssistantPanelProps {
  controller: Pick<AiAssistantController, "saveError" | "saving" | "setPublicEnabled" | "setWidget"> & {
    settings: NonNullable<AiAssistantController["settings"]>;
  };
  CredentialForm: ComponentType<{ useVisitorCredentialFormHook: typeof useWiredVisitorCredentialForm; t: (key: string) => string }>;
  t: (key: string) => string;
  /** Test seams, defaulted to the real hooks. */
  useVisitorCredentialFormHook?: typeof useWiredVisitorCredentialForm;
  useVisitorAssistantPanelHook?: typeof useVisitorAssistantPanel;
}

export function VisitorAssistantPanel({
  controller,
  CredentialForm,
  t,
  useVisitorCredentialFormHook = useWiredVisitorCredentialForm,
  useVisitorAssistantPanelHook = useVisitorAssistantPanel,
}: VisitorAssistantPanelProps) {
  const { settings, saving, saveError, setPublicEnabled, setWidget } = controller;
  const credential = useVisitorCredentialFormHook();
  const panel = useVisitorAssistantPanelHook({ settings, hasStoredKey: credential.hasStoredKey, setWidget });
  const widgetId = useId();
  const reasonId = useId();
  const moreInfo = (name: string) => t("More info: {name}").replace("{name}", name);

  if (credential.loadState.status === "loading") return <p role="status">{t("Loading saved settings…")}</p>;
  if (credential.loadState.status === "error") return <p role="alert">{t(credential.loadState.message)}</p>;

  return (
    <div className="visitor-assistant">
      {saveError ? <div className="save-error">{saveError}</div> : null}

      <p className="visitor-status" role="status">
        <span className="visitor-status-caption">{t("Public site")}</span>
        <span className={`visitor-pill is-${panel.status}`}>{t(panel.statusCopy.label)}</span>
        <span className="visitor-status-hint">{t(panel.statusCopy.hint)}</span>
      </p>

      <ol className="visitor-steps">
        <li className="visitor-step">
          <div className="visitor-step-head">
            <h3 className="visitor-step-title">{t("Connect an AI provider")}</h3>
          </div>
          {/* One short line, the full explanation in the ⓘ. Every sentence of it is load-bearing —
              this screen exists because an operator could not tell the two API keys apart. */}
          <p className="visitor-step-hint">
            {t("This key is for your visitors, not for you.")}
            <InfoTip
              label={`${t("This key is for your visitors, not for you. It is what lets people reading your published site ask questions and get answers. It is stored on the server and used for every visitor conversation.")} ${t("It is a different key from the one under Settings → AI agent → BYOK. That one is your own, it is stored on the server, encrypted, for your admin account only, and it powers the assistant in this admin. A deployed site can never use it — which is why saving a key there does not switch on the visitor chat.")}`}
              triggerLabel={t("About the visitor key")}
              agentHandle="ai-assistant-visitor-key-info"
            />
          </p>
          <CredentialForm useVisitorCredentialFormHook={() => credential} t={t} />
        </li>

        <li className="visitor-step">
          <div className="visitor-step-head">
            <h3 className="visitor-step-title"><label htmlFor={widgetId}>{t("Widget")}</label></h3>
            <InfoTip
              label={`${t("Applies to this site. Changing the widget keeps the assistant's on/off setting.")} ${t("Standard is the full widget, about 200 KB gzipped. Lightweight (beta) is a smaller build, about 30 KB gzipped, that loads faster.")}`}
              triggerLabel={moreInfo(t("Widget"))}
              agentHandle="ai-assistant-visitor-widget-info"
            />
            <select id={widgetId} className="jini-input visitor-compact-select" value={panel.widget} disabled={saving}
              onChange={(event) => panel.chooseWidget(event.target.value)}
              {...agentHandle({ handle: "ai-assistant-visitor-widget" }, { role: "field", label: "Visitor chat widget" })}>
              <option value="react">{t("Standard")}</option>
              <option value="vanilla">{t("Lightweight (beta)")}</option>
            </select>
          </div>
        </li>

        <li className="visitor-step">
          <div className="visitor-step-head">
            <h3 className="visitor-step-title">{t("Turn it on")}</h3>
          </div>
          <AssistantToggleRow t={t} variant="switch" label={t("Enable the AI assistant on the public site")}
            info={t(panel.enableInfo)} checked={settings.publicEnabled}
            disabled={saving || !panel.canEnable} onChange={(checked) => void setPublicEnabled(checked)}
            describedBy={panel.enableBlockedReason ? reasonId : undefined}
            inputProps={agentHandle({ handle: "ai-assistant-visitor-enable" }, { role: "field", label: "Enable the AI assistant on the public site" })}
            infoHandle="ai-assistant-visitor-enable-info">
            {panel.enableBlockedReason ? <p id={reasonId} className="visitor-step-hint">{t(panel.enableBlockedReason)}</p> : null}
          </AssistantToggleRow>
        </li>
      </ol>
    </div>
  );
}
