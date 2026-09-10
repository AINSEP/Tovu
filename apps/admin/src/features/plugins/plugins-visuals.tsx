/**
 * @file The `.tovu-plugin` Plugins screen's own icon set — inline SVGs, no icon dependency. Same
 * rationale `agent-plugins-visuals.tsx` (this directory's sibling screen's own icon set) gives for
 * its own, independently maintained set, and the same one `database-visuals.tsx`/
 * `source-control-visuals.tsx`/`deployment-visuals.tsx` give theirs: this app ships no icon
 * component library to `features/`, and importing a glyph across a feature boundary — or across
 * this ONE feature's two sibling screens, each owned by a different agent tonight — would tie this
 * screen's rendering to a file another agent is actively editing. Deliberately not a re-export of
 * `agent-plugins-visuals.tsx`'s own `ChevronIcon`/`TrashIcon`/`PackageIcon`, even though the shapes
 * are visually close, for exactly that reason.
 *
 * One glyph family here, not several: `AdminPlugin` carries no keywords/skills vocabulary the way
 * `AdminAgentPlugin` does for `agentPluginGlyphKind()`'s tiered classification, so every row uses
 * the same generic package glyph rather than a guessed category with no evidence behind it.
 */

/** Shared attributes for a decorative line icon — the same 24px grid, 1.5 stroke, and round joins
 *  `agent-plugins-visuals.tsx`'s own `LINE_ICON` uses, so this screen's icons read as the same
 *  family as the rest of this admin without importing the constant itself. */
const LINE_ICON = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

export interface IconProps {
  size?: number;
}

/* ------------------------------------------------------------------ tab icons */

/** Installed — a package with a check: what this workspace has actually turned on. */
export function InstalledTabIcon({ size = 16 }: IconProps) {
  return (
    <svg {...LINE_ICON} width={size} height={size}>
      <path d="M20.5 8.2v5.1L12 17.9l-8.5-4.6V8.2" />
      <path d="M3.5 8.2 12 3.6l8.5 4.6L12 12.8z" />
      <path d="M15.6 19.4l1.9 1.9 3.4-3.9" />
    </svg>
  );
}

/** Downloaded — a tray receiving a package: what's on disk for this workspace, regardless of
 *  whether it's turned on. Deliberately a different pictogram from Installed's check-mark package
 *  — the two tabs answer different questions and should not share a glyph that implies they don't. */
export function DownloadedTabIcon({ size = 16 }: IconProps) {
  return (
    <svg {...LINE_ICON} width={size} height={size}>
      <path d="M12 3.5v10.2M8.2 10.1l3.8 3.8 3.8-3.8" />
      <path d="M4 15.5v3.2a1.3 1.3 0 0 0 1.3 1.3h13.4A1.3 1.3 0 0 0 20 18.7v-3.2" />
    </svg>
  );
}

/** Marketplace — a shopfront awning over an open door. Deliberately not a shopping cart: nothing
 *  here can be bought or added to anything yet, and a cart would promise a transaction. Same
 *  pictogram concept as `agent-plugins-visuals.tsx`'s own `MarketplaceIcon` (both marketplaces are
 *  equally not-yet-real), redrawn independently rather than imported — see this file's own header. */
export function MarketplaceTabIcon({ size = 16 }: IconProps) {
  return (
    <svg {...LINE_ICON} width={size} height={size}>
      <path d="M3.5 8.5h17l-1.2-4H4.7z" />
      <path d="M5 8.5v11h14v-11" />
      <path d="M9.75 19.5v-5.5h4.5v5.5" />
    </svg>
  );
}

/* --------------------------------------------------------------- per-row glyph */

/** The one glyph every row uses — see this file's header for why there is no per-plugin
 *  classification here. A plain package, generic on purpose. */
export function PluginPackageIcon({ size = 18 }: IconProps) {
  return (
    <svg {...LINE_ICON} width={size} height={size}>
      <path d="M3.5 8.2 12 3.6l8.5 4.6v7.6L12 20.4l-8.5-4.6z" />
      <path d="M3.5 8.2 12 12.8l8.5-4.6M12 12.8v7.6" />
    </svg>
  );
}

/* ------------------------------------------------------------ control icons */

/** Remove. Live for a `"site"` plugin (Downloaded tab), honestly disabled for a `"built-in"` one —
 *  see `PluginRow`'s own call site. */
export function PluginTrashIcon({ size = 16 }: IconProps) {
  return (
    <svg {...LINE_ICON} width={size} height={size}>
      <path d="M4.5 7h15M9.5 7V4.6h5V7" />
      <path d="M6.6 7l.9 12.4h9l.9-12.4" />
      <path d="M10.4 10.5v6M13.6 10.5v6" />
    </svg>
  );
}

/** The row's own expand/collapse indicator. Rotated by CSS on the expanded row rather than swapped
 *  for a second glyph, so the transition is one continuous motion. */
export function PluginChevronIcon({ size = 14 }: IconProps) {
  return (
    <svg {...LINE_ICON} width={size} height={size} className="plugin-chevron-glyph">
      <path d="M9 5.5 15.5 12 9 18.5" />
    </svg>
  );
}
