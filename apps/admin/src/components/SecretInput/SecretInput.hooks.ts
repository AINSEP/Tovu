import { useState } from "react";
import { interpolate } from "@jini-ai/ui/panel-kit";
import { t } from "../shared-components-i18n";

/**
 * @file Show/hide state for {@link SecretInput}: every password, token and key field in the admin
 * shares this one behaviour instead of hand-rolling its own toggle per form.
 */

export interface SecretRevealState {
  readonly revealed: boolean;
  readonly inputType: "text" | "password";
  /** "Show <label>" / "Hide <label>", translated; the toggle's accessible name. */
  readonly toggleLabel: string;
  readonly toggle: () => void;
}

/**
 * Starts hidden and re-hides whenever the value is cleared — every secret form here empties its
 * field after a successful save, so a revealed secret never stays readable past its submit.
 *
 * @param required.label - The field's visible label, already translated by the caller.
 * @param required.value - The controlled value; `undefined` for an uncontrolled input.
 * @param optional.locale - The admin locale; defaults to `<html lang>`, which the admin shell keeps
 *   on `core.language` (`useAdminDocumentLocale`). Read, not fetched, so this leaf field needs no
 *   query provider.
 * @complexity O(1).
 */
export function useSecretReveal(required: { label: string; value: unknown }, optional: { locale?: string } = {}): SecretRevealState {
  const locale = optional.locale ?? (typeof document === "undefined" ? "en" : document.documentElement.lang || "en");
  const [revealed, setRevealed] = useState(false);
  const [lastValue, setLastValue] = useState(required.value);
  // Re-hide on the transition to empty only (an empty field may be revealed before typing), and
  // during render rather than in an effect, so the cleared field never paints unmasked.
  if (required.value !== lastValue) {
    setLastValue(required.value);
    if (required.value === "") setRevealed(false);
  }
  const template = t({ locale, key: revealed ? "Hide {label}" : "Show {label}" });
  return {
    revealed,
    inputType: revealed ? "text" : "password",
    toggleLabel: interpolate({ template, vars: { label: required.label } }),
    toggle: () => setRevealed((shown) => !shown),
  };
}
