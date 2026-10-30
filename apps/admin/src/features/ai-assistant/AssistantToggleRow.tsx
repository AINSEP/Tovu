import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { InfoTip } from "@jini-ai/ui/admin-widgets";
import type { AgentHandleProps } from "@jini-ai/agentic";

/**
 * One on/off setting on the AI Assistant screen: checkbox, bold label, and an ⓘ holding the
 * explainer that used to sit inline under it (2026-10-09 redesign — the copy stays, it just no
 * longer pushes the controls apart). The InfoTip is a sibling of the `<label>`, never inside it,
 * so tapping ⓘ cannot also toggle the checkbox.
 *
 * The checkbox's own `aria-describedby` points at the tip's hidden text, so a screen reader still
 * hears the explainer with the control, as it did when the paragraph was inline.
 */
export interface AssistantToggleRowProps {
  label: string;
  info: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  t: (key: string) => string;
  /** Extra ids for `aria-describedby` (an owner-only note rendered by the caller). */
  describedBy?: string;
  /** `role="switch"` styling for the one control a tab is about (the visitor enable switch). */
  variant?: "checkbox" | "switch";
  /** Agent handle spread, attributes only. */
  inputProps?: InputHTMLAttributes<HTMLInputElement> & Partial<AgentHandleProps>;
  infoHandle?: string;
  /** Status, errors or a nested checklist, rendered under the row. */
  children?: ReactNode;
  className?: string;
}

export function AssistantToggleRow(props: AssistantToggleRowProps) {
  const infoId = useId();
  const inputId = useId();
  const describedBy = [infoId, props.describedBy].filter(Boolean).join(" ");
  const isSwitch = props.variant === "switch";
  return (
    <div className={["assistant-toggle", isSwitch ? "assistant-toggle--switch" : "", props.className ?? ""].filter(Boolean).join(" ")}>
      <div className="assistant-toggle-head">
        <input type="checkbox" {...props.inputProps} id={inputId} {...(isSwitch ? { role: "switch" } : {})}
          checked={props.checked} disabled={props.disabled} aria-describedby={describedBy}
          onChange={(event) => props.onChange(event.target.checked)} />
        <div className="assistant-toggle-copy">
          <label htmlFor={inputId}>{props.label}</label>
          {"\u00a0"}
          <InfoTip label={props.info} triggerLabel={props.t("More info: {name}").replace("{name}", props.label)}
            descriptionId={infoId} agentHandle={props.infoHandle} />
        </div>
      </div>
      {props.children}
    </div>
  );
}
