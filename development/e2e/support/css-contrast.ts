/** WCAG contrast for computed CSS colours, as Chrome serializes them (`rgb()`/`rgba()`, `oklch()`,
 * `color(srgb …)`), alpha included. Runs in Node on strings a journey read from the page, so it is
 * unit-testable. The alpha is the point: a transparent border (`rgba(0, 0, 0, 0)`) used to be read
 * as opaque black, so borderless controls "passed" without their edge ever being measured. */

/** Gamma-encoded sRGB channels in [0, 1] plus alpha. */
export type Rgba = readonly [r: number, g: number, b: number, a: number];

const encode = (linear: number) => (linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055);
const decode = (channel: number) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** Parses one computed colour; throws on a syntax it does not know rather than guessing. */
export function parseComputedColor(css: string): Rgba {
  const values = (css.match(/-?[\d.]+%?/g) ?? []).map(value => (value.endsWith("%") ? parseFloat(value) / 100 : Number(value)));
  const alpha = values[3] ?? 1;
  if (css.startsWith("rgb")) return [values[0]! / 255, values[1]! / 255, values[2]! / 255, alpha];
  if (css.startsWith("color(srgb ")) return [values[0]!, values[1]!, values[2]!, alpha];
  if (css.startsWith("oklch(")) {
    // OKLab to linear sRGB (Ottosson's matrices), then the sRGB curve, so it composites like rgb().
    const [L, C, H] = values as [number, number, number];
    const a = C * Math.cos(H * Math.PI / 180), b = C * Math.sin(H * Math.PI / 180);
    const l = (L + .3963377774 * a + .2158037573 * b) ** 3;
    const m = (L - .1055613458 * a - .0638541728 * b) ** 3;
    const s = (L - .0894841775 * a - 1.291485548 * b) ** 3;
    const linear = [4.0767416621 * l - 3.3077115913 * m + .2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s,
      -.0041960863 * l - .7034186147 * m + 1.707614701 * s];
    return [encode(clamp(linear[0]!)), encode(clamp(linear[1]!)), encode(clamp(linear[2]!)), alpha];
  }
  throw new Error(`unparsed color ${css}`);
}

/** Paints `top` over an opaque `bottom` (the browser's source-over, in gamma space). */
export function compositeOver(top: Rgba, bottom: Rgba): Rgba {
  const a = top[3];
  return [top[0] * a + bottom[0] * (1 - a), top[1] * a + bottom[1] * (1 - a), top[2] * a + bottom[2] * (1 - a), 1];
}

const luminance = ([r, g, b]: Rgba) => .2126 * decode(r) + .7152 * decode(g) + .0722 * decode(b);

/** WCAG 2.x contrast ratio of two opaque colours. */
export function contrastRatio(first: Rgba, second: Rgba): number {
  const [high, low] = [luminance(first), luminance(second)].sort((x, y) => y - x) as [number, number];
  return (high + .05) / (low + .05);
}

/** Contrast of a control's visible edge against an opaque surface: its border painted over its own
 * background over the surface. A transparent border leaves the control's fill as the edge. */
export function controlEdgeContrast({ surface, border, background }: { surface: string; border: string; background: string }): number {
  const base = parseComputedColor(surface);
  const fill = compositeOver(parseComputedColor(background), base);
  return contrastRatio(compositeOver(parseComputedColor(border), fill), base);
}
