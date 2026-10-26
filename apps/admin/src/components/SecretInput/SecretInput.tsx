import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import { useSecretReveal } from "./SecretInput.hooks";

/**
 * @file The admin's one masked-input primitive: a password/token/key `<input>` with an eye toggle
 * inside its right edge. Drop-in for `<input type="password">` — every other input prop passes
 * straight through (id, value, onChange, autoComplete, agent handles, …).
 *
 * Keep it OUT of a wrapping `<label>`: the toggle's "Show <label>" name would join the input's
 * own accessible name. Pair it with a sibling `<label htmlFor>` instead.
 *
 * Styling lives with the shared `.jini-secret` rules in `styles.css`, the same classes the Jini
 * ui-kit's password `TextField` emits, so both field systems look identical.
 */
export interface SecretInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** The field's visible label, translated; names the toggle ("Show API key"). */
  readonly label: string;
  /** Extra attributes for the toggle button, e.g. an agent handle. */
  readonly toggleAttrs?: Readonly<Record<string, string | undefined>>;
  /** Overrides the `<html lang>` locale the toggle's name is translated into. */
  readonly locale?: string;
  /** `false` for a declared field that is not secret: a plain text input, no toggle, and
   *  `autoComplete="off"` (only a non-password field may use `off`; Chrome ignores it on passwords). */
  readonly secret?: boolean;
}

export const SecretInput = forwardRef<HTMLInputElement, SecretInputProps>(function SecretInput({ label, toggleAttrs, secret = true, locale, ...inputProps }, ref) {
  const reveal = useSecretReveal({ label, value: inputProps.value }, locale === undefined ? {} : { locale });
  if (!secret) return <input {...inputProps} ref={ref} type="text" autoComplete="off" />;
  return (
    <span className="jini-secret">
      {/* spellCheck off: once revealed as type="text", enhanced spellcheck would send the secret out. */}
      <input spellCheck={false} {...inputProps} ref={ref} type={reveal.inputType} />
      <button
        type="button"
        className="jini-secret-toggle"
        aria-label={reveal.toggleLabel}
        aria-pressed={reveal.revealed}
        title={reveal.toggleLabel}
        disabled={inputProps.disabled}
        onClick={reveal.toggle}
        {...toggleAttrs}
      >
        <SecretEyeIcon revealed={reveal.revealed} />
      </button>
    </span>
  );
});

/** Eye while hidden (press to show), struck-through eye while shown (press to hide). */
function SecretEyeIcon({ revealed }: { revealed: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {revealed ? <path d="M4 4l16 16" /> : null}
    </svg>
  );
}
