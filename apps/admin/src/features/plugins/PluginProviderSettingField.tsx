import { agentHandle } from "@jini-ai/agentic";
import { interpolate } from "@jini-ai/ui/panel-kit";
import { useState, type InputHTMLAttributes } from "react";

import type { AdminPluginProviderSettingField } from "@/lib/api";

/**
 * @file One declared provider setting on `PluginProviderSettingsDialog` (2026-10-25 redesign): label
 * above a full-width control, the manifest's hint below in muted text. The control is whatever the
 * plugin declared — a select of its `options` (with "Custom…" free text when `allowCustom`), a
 * masked secret with a show/hide eye, or plain text. No vendor knowledge here: every label, hint,
 * default and option comes from the plugin's manifest.
 */

export interface ProviderSettingFieldProps {
  readonly field: AdminPluginProviderSettingField;
  readonly id: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Agent handle for the control (`<base>-setting-<field words>`). */
  readonly handle: string;
  readonly pluginName: string;
  readonly t: (key: string) => string;
}

/** The `Custom…` option's value; never a real setting value (those are URLs or plain text). */
const CUSTOM = "\u0000custom";

/**
 * Mirrors the shared `components/SecretInput` (eye inside the input's right edge, `.jini-secret`
 * classes, "Show/Hide <label>", re-masks when the field is cleared, e.g. after a save) until that
 * component lands on this branch; merging swaps this for it.
 */
function SecretControl({ label, t, ...inputProps }: InputHTMLAttributes<HTMLInputElement> & { label: string; t: (key: string) => string }) {
  const [revealed, setRevealed] = useState(false);
  if (revealed && inputProps.value === "") setRevealed(false);
  const toggleLabel = interpolate({ template: t(revealed ? "Hide {label}" : "Show {label}"), vars: { label } });
  return (
    <span className="jini-secret">
      {/* spellCheck off: once revealed as type="text", enhanced spellcheck would send the secret out. */}
      <input spellCheck={false} {...inputProps} type={revealed ? "text" : "password"} />
      <button type="button" className="jini-secret-toggle" aria-label={toggleLabel} aria-pressed={revealed} title={toggleLabel}
        onClick={() => setRevealed((shown) => !shown)}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {revealed ? <path d="M4 4l16 16" /> : null}
        </svg>
      </button>
    </span>
  );
}

/** A select of the declared options; "Custom…" (when allowed) reveals a text input for any other value. */
function ChoiceControl({ field, id, value, onChange, t, controlAttrs }: Omit<ProviderSettingFieldProps, "handle" | "pluginName"> & { controlAttrs: Record<string, unknown> }) {
  const options = field.options ?? [];
  const listed = options.some((option) => option.value === value);
  const [custom, setCustom] = useState(Boolean(field.allowCustom) && value !== "" && !listed);
  const choose = (next: string) => {
    setCustom(next === CUSTOM);
    onChange(next === CUSTOM ? "" : next);
  };
  return (
    <>
      <select id={id} value={custom ? CUSTOM : value} onChange={(event) => choose(event.target.value)} {...controlAttrs}>
        {!custom && !listed ? <option value="">—</option> : null}
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        {field.allowCustom ? <option value={CUSTOM}>{t("Custom…")}</option> : null}
      </select>
      {custom ? (
        <input type="url" className="provider-settings-custom" autoComplete="off" spellCheck={false} value={value} placeholder="https://"
          aria-label={interpolate({ template: t("Custom {label}"), vars: { label: field.label } })} onChange={(event) => onChange(event.target.value)} />
      ) : null}
    </>
  );
}

export function ProviderSettingField({ field, id, value, onChange, handle, pluginName, t }: ProviderSettingFieldProps) {
  const hintId = `${id}-hint`;
  const controlAttrs = {
    "aria-describedby": field.hint ? hintId : undefined,
    "aria-required": field.required && !(field.secret && field.saved) ? true : undefined,
    ...agentHandle({ handle }, { role: "field", label: `${pluginName} setting: ${field.label}` }),
  };
  const textProps = { id, value, autoComplete: "off", onChange: (event: { target: { value: string } }) => onChange(event.target.value), ...controlAttrs };
  return (
    <div className="field provider-settings-field">
      <label className="field-label" htmlFor={id}>
        {field.label}
        {field.required ? <span className="provider-settings-required" aria-hidden="true"> *</span> : null}
      </label>
      {field.options?.length ? <ChoiceControl field={field} id={id} value={value} onChange={onChange} t={t} controlAttrs={controlAttrs} />
        : field.secret ? <SecretControl {...textProps} label={field.label} t={t} placeholder={field.saved ? t("Saved — leave blank to keep") : ""} />
          : <input type="text" {...textProps} />}
      {field.hint ? <p className="field-hint" id={hintId}>{field.hint}</p> : null}
    </div>
  );
}
