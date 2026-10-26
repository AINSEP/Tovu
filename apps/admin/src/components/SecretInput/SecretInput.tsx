import { forwardRef } from "react";
import { SecretInput as JiniSecretInput } from "@jini-ai/ui";
import type { SecretInputProps as JiniSecretInputProps } from "@jini-ai/ui";
import { interpolate } from "@jini-ai/ui/panel-kit";
import { t } from "../shared-components-i18n";

/**
 * @file The admin's one masked-input primitive: Jini's `SecretInput` (a password/token/key `<input>`
 * with an eye toggle inside its right edge), named in the admin locale. Drop-in for
 * `<input type="password">` — every other input prop passes straight through (id, value, onChange,
 * autoComplete, agent handles, …).
 *
 * Keep it OUT of a wrapping `<label>`: the toggle's "Show <label>" name would join the input's
 * own accessible name. Pair it with a sibling `<label htmlFor>` instead.
 *
 * Styling lives with the shared `.jini-secret` rules in `styles.css`, the same classes the Jini
 * ui-kit's password `TextField` emits, so both field systems look identical.
 */
export type SecretInputProps = Omit<JiniSecretInputProps, "toggleLabels"> & {
  /** Overrides the `<html lang>` locale the toggle's name is translated into. */
  readonly locale?: string;
  /** `false` for a declared field that is not secret: a plain text input, no toggle, and
   *  `autoComplete="off"` (only a non-password field may use `off`; Chrome ignores it on passwords). */
  readonly secret?: boolean;
};

/**
 * The toggle's "Show/Hide <label>" names in the admin locale. Jini's own `I18nProvider` is mounted
 * only under Settings, so its default names would stay English on every other admin screen.
 *
 * @param required.label - The field's visible label, already translated by the caller.
 * @param optional.locale - Defaults to `<html lang>`, which the admin shell keeps on `core.language`
 *   (`useAdminDocumentLocale`). Read, not fetched, so this leaf field needs no query provider.
 * @complexity O(1).
 */
export function secretToggleLabels(required: { label: string }, optional: { locale?: string } = {}): { show: string; hide: string } {
  const locale = optional.locale ?? (typeof document === "undefined" ? "en" : document.documentElement.lang || "en");
  const name = (key: string) => interpolate({ template: t({ locale, key }), vars: { label: required.label } });
  return { show: name("Show {label}"), hide: name("Hide {label}") };
}

export const SecretInput = forwardRef<HTMLInputElement, SecretInputProps>(function SecretInput({ secret = true, locale, ...props }, ref) {
  if (!secret) {
    const { label: _label, toggleAttrs: _toggleAttrs, revealed: _revealed, onRevealedChange: _onRevealedChange, ...inputProps } = props;
    return <input {...inputProps} ref={ref} type="text" autoComplete="off" />;
  }
  return <JiniSecretInput {...props} ref={ref} toggleLabels={secretToggleLabels({ label: props.label }, locale === undefined ? {} : { locale })} />;
});
