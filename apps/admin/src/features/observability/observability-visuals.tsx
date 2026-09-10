/**
 * @file The Observability screen's own icon set — inline SVGs, no icon dependency. Same rationale
 * `features/plugins/agent-plugins-visuals.tsx`, `database/database-visuals.tsx`, and
 * `source-control/source-control-visuals.tsx` give for theirs: this app ships no icon component
 * library to `features/`, and importing a glyph across a feature boundary would tie this screen's
 * rendering to a sibling feature another agent owns.
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

/** Overview tab — a waveform, the shape of a trace being recorded. */
export function PulseIcon({ size = 16 }: IconProps) {
  return (
    <svg {...LINE_ICON} width={size} height={size}>
      <path d="M3 13h3.4l1.9-6 2.4 11.5 2.2-9 1.3 3.5h4.8" />
    </svg>
  );
}

/** Providers tab — a gauge with no needle reading, the honest shape of "nothing measured yet". */
export function GaugeIcon({ size = 16 }: IconProps) {
  return (
    <svg {...LINE_ICON} width={size} height={size}>
      <path d="M4.5 16.5a7.5 7.5 0 0 1 15 0" />
      <path d="M12 16.5 15.2 10.8" />
      <circle cx="12" cy="16.5" r="1.2" />
    </svg>
  );
}
