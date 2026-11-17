import type { ToolbarGroupProps } from "./toolbar-group-props";

/* CharacterCount (owner, 2026-08-11: "anything and everything") — a plain readout, not a
    button: nothing to click, just the live count `editor.storage.characterCount` already
    tracks. Right-aligned via `margin-left: auto` (styles.css) so it reads as status text
    trailing the row rather than one more control competing with the buttons before it. */
export function ToolbarCharacterCount({ state: s, t }: Pick<ToolbarGroupProps, "state" | "t">) {
  return (
    <span className="editor-toolbar-count" aria-live="polite">
      {s.characterCount} {s.characterCount === 1 ? t("character") : t("characters")}
    </span>
  );
}
