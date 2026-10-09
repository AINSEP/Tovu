import { maskNonRenderableRegions } from "@jini-ai/cms/widgets/markers";

/**
 * @file Finds page markup that is hidden until a script reveals it — and so is hidden for good on a
 * Tovu page.
 *
 * Why: markup copied from another site keeps the source's scroll-reveal start state (Webflow and
 * Framer write `style="opacity:0"`, AOS/SAL/WOW.js add attributes or classes, hand-rolled sites ship
 * `.reveal { opacity: 0 }`), but never the script that flips it, because page HTML runs no source
 * script. The result is invisible or washed-out content that looks like a styling bug (Luvira
 * import, 2026-10-08). The page tools still write the markup — a hidden element can be deliberate —
 * and return these findings as a warning so the model fixes them on its next turn.
 *
 * PURE: string in, findings out. A tolerant scan over markup the assistant just wrote, not an HTML
 * parser; comments and raw-text elements are masked first (the same mask `regions.ts` uses).
 */

/** Findings listed before the rest are summarised as a count. */
export const MAX_REVEAL_FINDINGS = 10;

const START_TAG = /<([a-z][a-z0-9-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
const ATTRIBUTE = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g;
/** Exactly zero opacity or `visibility: hidden` — `opacity: 0.5` is a design choice, not hidden. */
const HIDING_DECLARATION = /(?:^|;)\s*(opacity\s*:\s*0(?:\.0+)?%?|visibility\s*:\s*hidden)\s*(?:!important\s*)?(?=;|$)/i;
/** Attributes only scroll-reveal libraries write (AOS, SAL, ScrollReveal). */
const REVEAL_ATTRIBUTES: readonly string[] = ["data-aos", "data-sal", "data-sr-id"];
/** Classes only scroll-reveal libraries need (WOW.js hides `.wow` until it runs). */
const REVEAL_CLASSES: readonly string[] = ["wow"];
/** A hidden `<style>` rule is reported only for reveal-named selectors: a hover overlay at opacity 0 is ordinary. */
const REVEAL_SELECTOR = /reveal|fade|animate|aos|wow|in-?view|appear|scroll|sal-/i;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const STYLE_BLOCK = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;
const CSS_COMMENT = /\/\*[\s\S]*?\*\//g;
const KEYFRAMES_BLOCK = /@(?:-[a-z]+-)?keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/gi;
const CSS_RULE = /([^{}]+)\{([^{}]*)\}/g;

function readAttributes(raw: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const match of raw.matchAll(ATTRIBUTE)) attributes.set(match[1]!.toLowerCase(), match[2] ?? match[3] ?? match[4] ?? "");
  return attributes;
}

function hidingDeclaration(declarations: string): string | undefined {
  return HIDING_DECLARATION.exec(declarations.trim())?.[1];
}

/** The one reason this element is hidden until a script runs, or `undefined`. */
function elementReason(attributes: Map<string, string>): string | undefined {
  const inline = hidingDeclaration(attributes.get("style") ?? "");
  if (inline !== undefined) return `inline style ${inline}`;
  const attribute = REVEAL_ATTRIBUTES.find((name) => attributes.has(name));
  if (attribute !== undefined) return `${attribute} (a scroll-reveal library attribute)`;
  const classes = (attributes.get("class") ?? "").split(/\s+/);
  const revealClass = REVEAL_CLASSES.find((name) => classes.includes(name));
  return revealClass === undefined ? undefined : `class "${revealClass}" (a scroll-reveal library class)`;
}

function elementFindings(html: string): string[] {
  const findings: string[] = [];
  for (const match of maskNonRenderableRegions({ html }).matchAll(START_TAG)) {
    const attributes = readAttributes(match[2]!);
    const reason = elementReason(attributes);
    if (reason === undefined) continue;
    const className = attributes.get("class");
    findings.push(`<${match[1]!.toLowerCase()}${className ? ` class="${className}"` : ""}> has ${reason}`);
  }
  return findings;
}

function styleRuleFindings(html: string): string[] {
  const findings: string[] = [];
  for (const block of html.replace(HTML_COMMENT, "").matchAll(STYLE_BLOCK)) {
    const css = block[1]!.replace(CSS_COMMENT, "").replace(KEYFRAMES_BLOCK, "");
    for (const rule of css.matchAll(CSS_RULE)) {
      const selector = rule[1]!.trim().replace(/\s+/g, " ");
      const hidden = hidingDeclaration(rule[2]!);
      if (hidden !== undefined && !selector.startsWith("@") && REVEAL_SELECTOR.test(selector)) findings.push(`<style> rule "${selector}" sets ${hidden}`);
    }
  }
  return findings;
}

/**
 * Lists every element (and every reveal-named `<style>` rule) that stays hidden without the source
 * site's reveal script, element findings in document order, then style rules.
 * @param required.html - Page HTML or a region fragment.
 * @returns Human-readable findings, at most {@link MAX_REVEAL_FINDINGS} plus a trailing "...and N more."; empty when clean.
 * @complexity O(n) in the markup length.
 */
export function findScriptRevealedContent({ html }: { html: string }, _optional: {} = {}): readonly string[] {
  const findings = [...elementFindings(html), ...styleRuleFindings(html)];
  if (findings.length <= MAX_REVEAL_FINDINGS) return findings;
  return [...findings.slice(0, MAX_REVEAL_FINDINGS), `...and ${findings.length - MAX_REVEAL_FINDINGS} more.`];
}

/**
 * The model-facing warning for a write whose markup has findings, or `undefined` when it has none.
 * @complexity O(n) in the markup length.
 */
export function describeScriptRevealedContent({ html }: { html: string }, _optional: {} = {}): string | undefined {
  const findings = findScriptRevealedContent({ html });
  if (findings.length === 0) return undefined;
  return (
    "Written, but some of this markup stays invisible: it is hidden until a scroll-reveal script runs, and no " +
    "page script on this site reveals it. Remove the hiding style, attribute or class (or set the element's " +
    `visible state) and write it again: ${findings.join("; ")}`
  );
}
