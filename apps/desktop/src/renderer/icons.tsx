/**
 * One glyph per nav section, keyed by `RunnerSectionId`. Inline rather than from an
 * icon package: twelve shapes is not worth a dependency, and drawing them here keeps
 * the stroke weight and optical size consistent, which a mixed-provenance icon set
 * never quite is.
 */
import type { JSX } from 'react';
import type { RunnerSectionId } from '../contracts/sections.js';

const paths: Record<RunnerSectionId, JSX.Element> = {
  // Roof, walls, and a door. The previous version was a single closed outline with no door,
  // which at 16px read as a plain pentagon rather than a house.
  home: (
    <>
      <path d="M2.6 9.1 10 3.2l7.4 5.9" />
      <path d="M4.4 8.1V16a1 1 0 0 0 1 1h9.2a1 1 0 0 0 1-1V8.1" />
      <path d="M8 17v-4.1a2 2 0 0 1 4 0V17" />
    </>
  ),
  // A 2×2 grid: the fleet, several things held at once.
  projects: (
    <>
      <rect x="3" y="3" width="6" height="6" rx="1.5" />
      <rect x="11" y="3" width="6" height="6" rx="1.5" />
      <rect x="3" y="11" width="6" height="6" rx="1.5" />
      <rect x="11" y="11" width="6" height="6" rx="1.5" />
    </>
  ),
  // One rectangle copied off another — instantiation, not a document.
  templates: (
    <>
      <rect x="3" y="3" width="10" height="10" rx="1.5" />
      <path d="M7 17h9a1 1 0 0 0 1-1V7" />
    </>
  ),
  tasks: (
    <>
      <path d="M3 5.5 4.5 7 7.5 4" />
      <path d="M3 13.5 4.5 15 7.5 12" />
      <path d="M10.5 5.5H17M10.5 13.5H17" />
    </>
  ),
  // A video camera. The id is still `generation` (a public contract — see sections.ts), but the
  // section is labelled "Media", and a sparkle read as "AI magic" rather than "images and video".
  generation: (
    <>
      <rect x="2.4" y="5.6" width="10.2" height="8.8" rx="1.6" />
      <path d="M12.6 9 17.6 6.2v7.6L12.6 11z" />
    </>
  ),
  activity: <path d="M2.5 10h3.2l2-5 3.2 10 2-5h4.6" />,
  updates: (
    <>
      <path d="M16.5 10a6.5 6.5 0 1 1-2-4.7" />
      <path d="M17 2.5V6h-3.5" />
    </>
  ),
  deploy: (
    <>
      <path d="M10 13V3.5" />
      <path d="M6.5 7 10 3.5 13.5 7" />
      <path d="M3.5 13v3a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-3" />
    </>
  ),
  diagnostics: (
    <>
      <path d="M8 2.5v5L4 15a1.5 1.5 0 0 0 1.3 2.3h9.4A1.5 1.5 0 0 0 16 15l-4-7.5v-5" />
      <path d="M6.5 2.5h7" />
    </>
  ),
  'api-keys': (
    <>
      <circle cx="7" cy="7" r="3.5" />
      <path d="M9.5 9.5 17 17M13.5 14l-1.5 1.5M15.5 16l-1.5 1.5" />
    </>
  ),
  // Sliders, not a gear: settings you set, rather than machinery.
  settings: (
    <>
      <path d="M3 6h14M3 14h14" />
      <circle cx="8" cy="6" r="2" />
      <circle cx="13" cy="14" r="2" />
    </>
  ),
  account: (
    <>
      <circle cx="10" cy="7" r="3.2" />
      <path d="M3.8 17a6.2 6.2 0 0 1 12.4 0" />
    </>
  ),
};

export function SectionIcon({ id }: { id: RunnerSectionId }) {
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
      {paths[id]}
    </svg>
  );
}

const GEAR_TOOTH_ANGLES = [0, 60, 120, 180, 240, 300];

/** Not keyed by `RunnerSectionId` — this is chrome for the appearance dropdown, not a nav
 *  destination, so it does not belong in `paths` above. A ring with six solid teeth, not a
 *  sun (radiating lines read as "light/theme", not "settings" — the earlier version of this
 *  icon made exactly that mistake). */
export function GearIcon() {
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
      {/* Teeth first, so the stroked body circle paints over where they meet it — the seam
          between a filled tooth and a stroked arc is what makes a cog read as loose dots
          (a sun) instead of one solid part. Each tooth's inner edge sits INSIDE the body
          radius (4.8) so they are attached, not floating. */}
      {GEAR_TOOTH_ANGLES.map((angle) => (
        <rect
          key={angle}
          x="8.9"
          y="2.1"
          width="2.2"
          height="3.6"
          rx="0.7"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="0.8"
          transform={`rotate(${angle} 10 10)`}
        />
      ))}
      <circle cx="10" cy="10" r="4.8" fill="var(--bg, #fff)" />
      <circle cx="10" cy="10" r="1.9" />
    </svg>
  );
}
