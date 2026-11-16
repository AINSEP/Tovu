import { createFocusedEditorChain } from "../../PostEditor.hooks";
import { hexOrDefault } from "../../rules";
import type { ToolbarGroupProps } from "./toolbar-group-props";

/* Text/background color (owner, 2026-08-11: "anything and everything"; consolidated to fewer
    controls 2026-08-11 toolbar-polish pass) — native `<input type="color">` swatches, no
    color-picker dependency, same "no icon dependency" spirit the align-icon SVGs above
    follow. A native color input only ever emits a strict 6-digit hex, so
    `chain().setColor()`/`setBackgroundColor()` never receive anything `safeCssColor`
    (render.ts) would reject — the allowlist there is defense-in-depth against `bodyJson`
    written some OTHER way (a direct API call, pasted content), not something this UI can
    trigger on its own. `hexOrDefault` only affects what the swatch DISPLAYS when nothing is
    selected or the current mark's color isn't a plain hex string (e.g. inherited from pasted
    `rgb(...)`/keyword content) — it never touches what gets applied on change.

    The "×" clear button used to be unconditional — a swatch AND a separate always-visible ×
    for each of text/background, four controls for two concepts, and an ambiguous glyph on
    top of that (owner: this reads as "four buttons" when it's really two ideas). Each × now
    renders ONLY while that color is actually set (`s.color !== null` / `s.backgroundColor !==
    null`, the same live cursor-state `hexOrDefault` already reads) — with nothing set, this
    row is exactly the two swatches; the clear affordance appears exactly when there is
    something to clear. Accessible names are unchanged (`aria-label`s below are verbatim what
    they were before this pass) since an existing e2e suite selects by them. */
export function ToolbarColorGroup({ editor, state: s, t }: ToolbarGroupProps) {
  const chain = createFocusedEditorChain({ editor });
  return (
    <div className="grp">
      <label className="tb-color" title={t("Text color")}>
        <input
          type="color"
          aria-label={t("Text color")}
          value={hexOrDefault({ value: s.color, fallback: "#000000" })}
          onChange={(e) => chain().setColor(e.target.value).run()}
        />
      </label>
      {s.color !== null ? (
        <button className="tb-btn" title={t("Clear text color")} aria-label={t("Clear text color")} onClick={() => chain().unsetColor().run()}>×</button>
      ) : null}
      <label className="tb-color" title={t("Background color")}>
        <input
          type="color"
          aria-label={t("Background color")}
          value={hexOrDefault({ value: s.backgroundColor, fallback: "#ffffff" })}
          onChange={(e) => chain().setBackgroundColor(e.target.value).run()}
        />
      </label>
      {s.backgroundColor !== null ? (
        <button className="tb-btn" title={t("Clear background color")} aria-label={t("Clear background color")} onClick={() => chain().unsetBackgroundColor().run()}>×</button>
      ) : null}
    </div>
  );
}
