import { createFocusedEditorChain } from "../../PostEditor.hooks";
import { FONT_FAMILY_OPTIONS, FONT_SIZE_OPTIONS, LINE_HEIGHT_OPTIONS } from "../../rules";
import type { ToolbarGroupProps } from "./toolbar-group-props";

function FontFamilySelect({ editor, state: s, t }: ToolbarGroupProps) {
  const chain = createFocusedEditorChain({ editor });
  return (
    <span className="tb-select-group">
      <span className="tb-select-label" aria-hidden="true">{t("Font")}</span>
      <select
        className="tb-select"
        title={t("Font family")}
        aria-label={t("Font family")}
        value={s.fontFamily}
        onChange={(e) => (e.target.value ? chain().setFontFamily(e.target.value).run() : chain().unsetFontFamily().run())}
      >
        {FONT_FAMILY_OPTIONS.map((opt) => (
          <option key={opt.label} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </span>
  );
}

function FontSizeSelect({ editor, state: s, t }: ToolbarGroupProps) {
  const chain = createFocusedEditorChain({ editor });
  return (
    <span className="tb-select-group">
      <span className="tb-select-label" aria-hidden="true">{t("Size")}</span>
      <select
        className="tb-select"
        title={t("Font size")}
        aria-label={t("Font size")}
        value={s.fontSize}
        onChange={(e) => (e.target.value ? chain().setFontSize(e.target.value).run() : chain().unsetFontSize().run())}
      >
        {FONT_SIZE_OPTIONS.map((opt) => (
          <option key={opt.label} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </span>
  );
}

function LineHeightSelect({ editor, state: s, t }: ToolbarGroupProps) {
  const chain = createFocusedEditorChain({ editor });
  return (
    <span className="tb-select-group">
      <span className="tb-select-label" aria-hidden="true">{t("Line")}</span>
      <select
        className="tb-select"
        title={t("Line height")}
        aria-label={t("Line height")}
        value={s.lineHeight}
        onChange={(e) => (e.target.value ? chain().setLineHeight(e.target.value).run() : chain().unsetLineHeight().run())}
      >
        {LINE_HEIGHT_OPTIONS.map((opt) => (
          <option key={opt.label} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </span>
  );
}

/* Font family/size, line height (owner, 2026-08-11: "anything and everything"; made
    self-describing 2026-08-11 toolbar-polish pass) — closed preset `<select>`s (`rules.ts`'s
    `FONT_FAMILY_OPTIONS`/`FONT_SIZE_OPTIONS`/`LINE_HEIGHT_OPTIONS`), not free-text inputs:
    every value they can produce already passes `render.ts`'s own allowlist by construction.
    `""` (the leading option every list starts with — see `rules.ts`'s own comment for exactly
    how its LABEL was derived from a live measurement) unsets the attribute entirely rather
    than setting it to an empty string.

    Each select is now paired with a short visible `.tb-select-label` (owner: three controls
    that all read "Default" gave no clue which was font/size/line-height without hovering for
    the `title`). The label is `aria-hidden` — the select's own `aria-label` below already
    carries the accessible name, so a screen reader is not told the same thing twice. */
export function ToolbarTypographyGroup(props: ToolbarGroupProps) {
  return (
    <div className="grp">
      <FontFamilySelect {...props} />
      <FontSizeSelect {...props} />
      <LineHeightSelect {...props} />
    </div>
  );
}
