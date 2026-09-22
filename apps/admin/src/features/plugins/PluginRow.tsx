import { agentHandle } from "@jini-ai/agentic";
import { useId, type ReactNode } from "react";

import type { AdminPlugin } from "@/lib/api";
import { PluginChevronIcon, PluginPackageIcon } from "./plugins-visuals";
import { EyeIcon } from "./agent-plugins-visuals";
import { PluginMetadataLabel } from "@/components/status-labels";
import type { Translate } from "@/lib/dictionary-translator";

/**
 * @file One `.tovu-plugin` plugin, as a ROW — the shared shell both the Installed and Downloaded
 * tabs render through. Structurally mirrors `AgentPluginRow.tsx` (icon, name + version chip, a
 * one-line subline, an expander, then right-aligned controls), the sibling screen's own
 * plain-table-to-row redesign from the same night, but is not byte-for-byte identical and imports
 * nothing from that file: `AdminPlugin` has no free-text description (its subline is
 * `source · tier · status` instead, via `pluginSubline`) and a `.tovu-plugin` row exposes exactly
 * ONE tab-specific control at a time (after the eye button every row carries, 2026-09-13) — the
 * Enabled toggle on Installed, or Remove on Downloaded —
 * never both, since that split is what replaced the single unified table `Plugins.tsx` used to
 * render (see that file's own header for the tab-by-tab rationale).
 *
 * The action area itself is a caller-supplied slot (`action`) rather than a `tab` enum branching
 * inside this component: `Plugins.tsx` already knows which tab it is rendering and builds the
 * right control (a plain toggle button, or the Remove icon button) itself, so this file's only job
 * stays the row's shell — identity, expansion, and the quarantine/errors detail panel — the same
 * single-responsibility split `AgentPluginListPanel`'s own slot props establish for its sibling.
 *
 * Accessibility decisions carried over verbatim from `AgentPluginRow`'s own header (not
 * re-litigated here):
 *  - The expander is the row's own summary button (`aria-expanded`/`aria-controls`), not a separate
 *    chevron competing with the action control for a hit target.
 *  - The detail panel is ALWAYS rendered and hidden via the `hidden` attribute, so `aria-controls`
 *    always resolves; `styles.css` carries the matching `[hidden] { display: none; }` guard.
 *  - The summary's accessible name is the heading text alone (`aria-labelledby`), not the whole
 *    button's content — the row's built-in-plugin note or long error list must not become part of
 *    the expander's own announced name.
 */

export interface PluginRowProps {
  readonly plugin: AdminPlugin;
  readonly t: Translate;
  readonly expanded: boolean;
  readonly onToggleExpanded: () => void;
  readonly agentHandleBase: string;
  /** The tab-specific right-aligned control — the Enabled toggle button (Installed) or the Remove
   *  icon button (Downloaded). Rendered as-is; this component makes no decision about which one it
   *  is. */
  readonly action: ReactNode;
  /** Opens the read-only package-files viewer for this plugin (`PluginPackageFilesModal`). */
  readonly onInspect: () => void;
}

/** Quarantine + per-plugin `errors[]` — genuine operational signal, moved here from the pre-split
 *  table's own always-visible columns (`Plugins.tsx`'s prior `quarantine`/`errors` `DataTable`
 *  columns). Rendered only when the plugin actually has one or the other, same "don't assert a
 *  question was asked and answered none" rule `AgentPluginRow`'s own `DetailChips` documents. */
function PluginRowDetail({ plugin, t }: { plugin: AdminPlugin; t: Translate }) {
  if (!plugin.quarantine && plugin.errors.length === 0) return null;
  return (
    <>
      {plugin.quarantine ? (
        <div className="plugin-errors">
          <span className="save-error">
            {t("Quarantined after")} {plugin.quarantine.consecutiveFailures} {t("consecutive failures")}
          </span>
          <div>{plugin.quarantine.reason}</div>
        </div>
      ) : null}
      {plugin.errors.length > 0 ? (
        <ul className="plugin-errors">
          {plugin.errors.map((e) => (
            <li key={`${e.code}:${e.file ?? ""}:${e.message}`}>
              <span className="save-error">{e.code}</span> <span>{e.message}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

export function PluginRow({ plugin, t, expanded, onToggleExpanded, agentHandleBase, action, onInspect }: PluginRowProps) {
  const detailId = useId();
  const headingId = useId();

  return (
    <li className="plugin-row" data-enabled={plugin.enabled} aria-label={plugin.name}>
      <div className="plugin-row-main">
        <button
          type="button"
          className="plugin-row-summary"
          aria-expanded={expanded}
          aria-controls={detailId}
          aria-labelledby={headingId}
          onClick={onToggleExpanded}
          {...agentHandle(`${agentHandleBase}-details`, { role: "button", label: `Show or hide the "${plugin.name}" plugin's details` })}
        >
          <span className="plugin-row-glyph">
            <PluginPackageIcon size={18} />
          </span>
          <span className="plugin-row-text">
            <span className="plugin-row-heading" id={headingId}>
              <span className="plugin-row-name">{plugin.name}</span>
              {/* The explicit `{" "}` is load-bearing, not formatting — same reasoning
                  `AgentPluginRow`'s own identical comment gives: this heading IS the summary
                  button's accessible name, and accessible-name computation concatenates adjacent
                  inline elements with no separator, which the flex `gap` cannot supply. */}
              {" "}
              <span className="plugin-row-version">v{plugin.version}</span>
            </span>
            <span className="plugin-row-subline"><PluginMetadataLabel values={[plugin.source, plugin.tier, plugin.status]} /></span>
          </span>
          <span className="plugin-row-chevron">
            <PluginChevronIcon />
          </span>
        </button>
        <div className="plugin-row-actions">
          <button
            type="button"
            className="plugin-icon-btn"
            onClick={onInspect}
            // Same accessible name as `AgentPluginRow`'s eye button: the label reads identically on
            // every row, so the plugin's own name has to be part of it.
            aria-label={`${t("Inspect package files")} — ${plugin.name}`}
            {...agentHandle(`${agentHandleBase}-inspect`, { role: "button", label: `Inspect the "${plugin.name}" package files` })}
          >
            <EyeIcon />
          </button>
          {action}
        </div>
      </div>
      <div className="plugin-row-detail" id={detailId} hidden={!expanded}>
        <PluginRowDetail plugin={plugin} t={t} />
      </div>
    </li>
  );
}
