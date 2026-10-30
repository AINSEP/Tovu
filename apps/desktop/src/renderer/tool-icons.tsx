/**
 * The Websites toolbar's icon buttons and the memory pill. Same 20-unit frame and stroke as the nav
 * glyphs in `icons.tsx`, but a module of its own whose JSX runs only at render: `SharedKeys`,
 * `SitesFolders` and `ResourcesPanel` import it statically, and their tests publish the classic-JSX
 * `React` global only after imports, which `icons.tsx`'s module-level glyph tables cannot wait for.
 */
import type { JSX } from 'react';

export type ToolIconKind = 'rescan' | 'keys' | 'import' | 'sliders' | 'memory';

function toolPath(kind: ToolIconKind): JSX.Element {
  return {
    // Two arrows chasing round a circle: "look again". The single circular arrow is already Updates
    // (nav) and Reload (tab toolbar), so Rescan must not borrow it.
    rescan: (
      <>
        <path d="M17.7 4.4v4.2h-4.2" />
        <path d="M2.3 15.6v-4.2h4.2" />
        <path d="M4.06 7.9a6.3 6.3 0 0 1 10.4-2.35L17.7 8.6" />
        <path d="M2.3 11.4l3.25 3.05A6.3 6.3 0 0 0 15.94 12.1" />
      </>
    ),
    // The hidden API keys section's key: the visible nav has no key, so it cannot be confused.
    keys: (
      <>
        <circle cx="7" cy="7" r="3.5" />
        <path d="M9.5 9.5 17 17M13.5 14l-1.5 1.5M15.5 16l-1.5 1.5" />
      </>
    ),
    // Deploy's upload arrow turned round: into the tray, not out of it.
    import: (
      <>
        <path d="M10 3.5V13" />
        <path d="M6.5 9.5 10 13l3.5-3.5" />
        <path d="M3.5 13v3a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-3" />
      </>
    ),
    // The hidden Settings section's sliders, so "Sites settings" is not a second gear beside the app's.
    sliders: (
      <>
        <path d="M3 6h14M3 14h14" />
        <circle cx="8" cy="6" r="2" />
        <circle cx="13" cy="14" r="2" />
      </>
    ),
    // A chip with pins on every side.
    memory: (
      <>
        <rect x="5" y="5" width="10" height="10" rx="1.5" />
        <path d="M8 2.5V5M12 2.5V5M8 15v2.5M12 15v2.5M2.5 8H5M2.5 12H5M15 8h2.5M15 12h2.5" />
      </>
    ),
  }[kind];
}

export function ToolIcon({ kind }: { kind: ToolIconKind }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {toolPath(kind)}
    </svg>
  );
}
