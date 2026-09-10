/**
 * @file The Agent Plugins screen's own icon set — inline SVGs, no icon dependency. Same rationale
 * `features/database/database-visuals.tsx`, `source-control-visuals.tsx`, and
 * `deployment/deployment-visuals.tsx` give for theirs: this app ships no icon component library to
 * `features/`, and importing a glyph across a feature boundary would tie this screen's rendering to
 * a sibling feature another agent owns. (`lucide-react` appears only inside the vendored skill DOCS
 * under `bundled/ui-ux-design/` — it is not a dependency of this app.)
 *
 * Two families here, and they follow opposite accessibility rules:
 *
 *   - Tab and per-plugin icons are `aria-hidden`: each sits directly beside the label that already
 *     says the same thing, so announcing it again is noise, not information.
 *   - Control icons (eye, trash) are `aria-hidden` too, but their BUTTONS carry a real `aria-label`
 *     naming the plugin — an icon-only control with no visible text has no accessible name of its
 *     own. See `AgentPluginRow`'s own call sites.
 */

/** Shared attributes for a decorative line icon — the same 24px grid, 1.5 stroke, and round joins
 *  every other `*-visuals.tsx` set in this admin uses, so every icon row reads as one family. */
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

/** Installed — a package with a check: bytes that are here and catalogued. */
export function InstalledIcon({ size = 16 }: IconProps) {
  return (
    <svg {...LINE_ICON} width={size} height={size}>
      <path d="M20.5 8.2v5.1L12 17.9l-8.5-4.6V8.2" />
      <path d="M3.5 8.2 12 3.6l8.5 4.6L12 12.8z" />
      <path d="M15.6 19.4l1.9 1.9 3.4-3.9" />
    </svg>
  );
}

/** Marketplace — a shopfront awning over an open door. Deliberately not a shopping cart: nothing
 *  here can be bought or added to anything yet, and a cart would promise a transaction. */
export function MarketplaceIcon({ size = 16 }: IconProps) {
  return (
    <svg {...LINE_ICON} width={size} height={size}>
      <path d="M3.5 8.5h17l-1.2-4H4.7z" />
      <path d="M5 8.5v11h14v-11" />
      <path d="M9.75 19.5v-5.5h4.5v5.5" />
    </svg>
  );
}

/* --------------------------------------------------------- per-plugin glyphs */

/** Compliance / privacy / security — a shield with a check. */
export function ShieldCheckIcon({ size = 18 }: IconProps) {
  return (
    <svg {...LINE_ICON} width={size} height={size}>
      <path d="M12 3.2 19 5.9v5.6c0 4.2-2.8 7.4-7 9.3-4.2-1.9-7-5.1-7-9.3V5.9z" />
      <path d="M8.9 11.8 11.3 14.3 15.4 9.9" />
    </svg>
  );
}

/** Deploy / hosting / release — a rocket leaving. */
export function RocketIcon({ size = 18 }: IconProps) {
  return (
    <svg {...LINE_ICON} width={size} height={size}>
      <path d="M13.6 3.4c3.4-.6 6.4 2.4 5.8 5.8-.5 2.9-2.4 5.2-4.6 7l-3.4 2.7-4.9-4.9 2.7-3.4c1.8-2.2 4.1-4.1 7-4.6z" />
      <circle cx="14.6" cy="8.9" r="1.6" />
      <path d="M8.5 15.5 5 19M4.6 14.2 3.2 20.3l6.1-1.4" />
    </svg>
  );
}

/** Design / UI / UX — a painter's palette. */
export function PaletteIcon({ size = 18 }: IconProps) {
  return (
    <svg {...LINE_ICON} width={size} height={size}>
      <path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.3 0 2-.9 2-1.9s-.7-1.9-.7-2.7c0-.9.7-1.6 1.6-1.6h1.6a4 4 0 0 0 4-4c0-3.7-3.8-6.8-8.5-6.8z" />
      <circle cx="8.4" cy="10.2" r="1.1" />
      <circle cx="12" cy="7.6" r="1.1" />
      <circle cx="15.6" cy="10.2" r="1.1" />
    </svg>
  );
}

/** MCP servers / integrations / connectors — a plug. */
export function PlugIcon({ size = 18 }: IconProps) {
  return (
    <svg {...LINE_ICON} width={size} height={size}>
      <path d="M9 3.5v4M15 3.5v4" />
      <path d="M6.5 7.5h11v3.2a5.5 5.5 0 0 1-11 0z" />
      <path d="M12 16.2v4.3" />
    </svg>
  );
}

/** Docs / content / writing — a page with lines. */
export function DocumentIcon({ size = 18 }: IconProps) {
  return (
    <svg {...LINE_ICON} width={size} height={size}>
      <path d="M6.5 3.5h7.6l3.9 3.9v13.1H6.5z" />
      <path d="M14 3.5v4h4" />
      <path d="M9.3 12.2h5.4M9.3 15.6h5.4" />
    </svg>
  );
}

/** The fallback glyph for a plugin whose vocabulary matches no family — a plain package. Generic on
 *  purpose: an invented themed glyph for an unrecognized package would assert a category Tovu has
 *  no evidence for. */
export function PackageIcon({ size = 18 }: IconProps) {
  return (
    <svg {...LINE_ICON} width={size} height={size}>
      <path d="M3.5 8.2 12 3.6l8.5 4.6v7.6L12 20.4l-8.5-4.6z" />
      <path d="M3.5 8.2 12 12.8l8.5-4.6M12 12.8v7.6" />
    </svg>
  );
}

/* ------------------------------------------------------------ control icons */

/** Open the read-only package inspector. */
export function EyeIcon({ size = 16 }: IconProps) {
  return (
    <svg {...LINE_ICON} width={size} height={size}>
      <path d="M2.8 12c2.6-4.1 5.7-6.2 9.2-6.2s6.6 2.1 9.2 6.2c-2.6 4.1-5.7 6.2-9.2 6.2S5.4 16.1 2.8 12z" />
      <circle cx="12" cy="12" r="2.9" />
    </svg>
  );
}

/** Uninstall. Rendered only in a disabled control on this screen — see `AgentPluginRow`. */
export function TrashIcon({ size = 16 }: IconProps) {
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
export function ChevronIcon({ size = 14 }: IconProps) {
  return (
    <svg {...LINE_ICON} width={size} height={size} className="agent-plugin-chevron-glyph">
      <path d="M9 5.5 15.5 12 9 18.5" />
    </svg>
  );
}

/** One glyph per {@link AgentPluginGlyphKind}, so the row renders a lookup rather than a chain of
 *  conditionals. Kinds come from `rules.ts`'s `agentPluginGlyphKind()`. */
export const AGENT_PLUGIN_GLYPHS = {
  compliance: ShieldCheckIcon,
  deploy: RocketIcon,
  design: PaletteIcon,
  integration: PlugIcon,
  content: DocumentIcon,
  package: PackageIcon,
} as const;

export type AgentPluginGlyphKind = keyof typeof AGENT_PLUGIN_GLYPHS;
