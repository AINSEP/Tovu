import type { Translate } from "@jini-ai/core/text";

import type { ToolbarOverflowController } from "../../hooks/use-post-editor-ui.hooks";

</div>
{/* Phone overflow (owner, 2026-10-15: the wrapped toolbar was "so messed up, janky"). At phone
    width only the `data-tb="primary"` controls show, in one row; this toggles the rest in
    below them. Hidden by CSS on wider panes, where every control already shows. Which ranked
export function ToolbarOverflowMenu({ overflow, t }: { overflow: ToolbarOverflowController; t: Translate }) {
  return (
        controls (`overflow.slot`) are primary is measured so this button never wraps (2026-10-15). */}
    <button
      className="tb-btn tb-more"
      title={t("More formatting")}
      aria-label={t("More formatting")}
      aria-expanded={overflow.open}
      onClick={overflow.toggle}
    >
      <svg viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">
        <circle cx="4" cy="9" r="1.4" /><circle cx="9" cy="9" r="1.4" /><circle cx="14" cy="9" r="1.4" />
      </svg>
  );
}
