/**
 * @file `collectPageStructure` — the function that runs INSIDE the page, serialized across to
 * Chromium by `page.evaluate` in `playwright-browser.ts`.
 *
 * ---------------------------------------------------------------------------
 * Read this before editing: this function has no scope
 * ---------------------------------------------------------------------------
 * Playwright serializes the function source and evaluates it in the browser. It therefore CANNOT
 * reference anything outside its own body — no import, no module-level constant, no helper declared
 * beside it in this file. Every helper it uses is nested inside it. That is not a style choice and
 * a "cleanup" that hoists a helper out will fail at runtime, in the browser, with a
 * `ReferenceError` no typechecker can see.
 *
 * Its return value crosses a structured-clone boundary, so it may only contain JSON-ish values:
 * no DOM nodes, no functions, no `undefined` in object positions.
 *
 * ---------------------------------------------------------------------------
 * What it does and does not read
 * ---------------------------------------------------------------------------
 * It reads structure: landmarks, heading levels, image alt text, how form controls are labelled,
 * and colour pairs. It never reads a form control's `.value`, and it never reads
 * `document.cookie` — cookies come from the browser context's own jar in the adapter, where the
 * value can be dropped rather than copied.
 *
 * The contrast numbers are SAMPLES over a bounded set of text-bearing elements, not a full-page
 * audit. `AccessibilityEvidence.truncated` names every category that hit its cap so a report can
 * never read a sample as a census.
 */
import type { AccessibilityEvidence } from "./browser-port.js";

export interface PageStructureLimits {
  readonly maxTextExcerptChars: number;
  readonly maxNodesPerCategory: number;
  readonly maxContrastSamples: number;
  readonly collectAccessibility: boolean;
}

export interface PageStructureCapture {
  readonly title: string;
  readonly lang: string | null;
  readonly textExcerpt: string;
  readonly textTruncated: boolean;
  readonly accessibility: AccessibilityEvidence;
}

/**
 * Walks the rendered document and returns the structural evidence the compliance skill cites.
 *
 * Runs in the browser. See this file's header for the constraints that implies.
 *
 * @param limits - Per-category caps, passed in rather than hardcoded so the collector's single
 * `SITE_EVIDENCE_LIMITS` constant is the only place any bound is defined.
 * @complexity O(n) in rendered element count, with every output list capped by `limits`.
 */
export function collectPageStructure(limits: PageStructureLimits): PageStructureCapture {
  const truncated: string[] = [];

  /** A short, re-checkable CSS path for one element. Prefers an `id` (stable and readable), then a
   *  bounded `nth-of-type` chain. The path is a CITATION — a human must be able to paste it into
   *  devtools and land on the same element — so readability beats theoretical uniqueness. */
  function selectorFor(element: Element): string {
    if (element.id) return `#${CSS.escape(element.id)}`;

    const parts: string[] = [];
    let current: Element | null = element;
    let depth = 0;
    while (current && current.nodeType === 1 && depth < 5) {
      const tag = current.tagName.toLowerCase();
      if (tag === "html" || tag === "body") {
        parts.unshift(tag);
        break;
      }
      if (current.id) {
        parts.unshift(`#${CSS.escape(current.id)}`);
        break;
      }
      const parent: Element | null = current.parentElement;
      if (!parent) {
        parts.unshift(tag);
        break;
      }
      const self: Element = current;
      const siblings = Array.from(parent.children).filter((child) => child.tagName === self.tagName);
      parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(self) + 1})` : tag);
      current = parent;
      depth += 1;
    }
    return parts.join(" > ");
  }

  function textOf(element: Element, max: number): string {
    const raw = (element.textContent ?? "").replace(/\s+/g, " ").trim();
    return raw.length > max ? `${raw.slice(0, max)}…` : raw;
  }

  function accessibleNameOf(element: Element): { name: string | null; source: string } {
    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel?.trim()) return { name: ariaLabel.trim(), source: "aria-label" };

    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy) {
      const names = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id))
        .filter((node): node is HTMLElement => node !== null)
        .map((node) => textOf(node, 120))
        .filter((value) => value.length > 0);
      if (names.length > 0) return { name: names.join(" "), source: "aria-labelledby" };
    }

    if (element.id) {
      const forLabel = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
      if (forLabel) {
        const value = textOf(forLabel, 120);
        if (value) return { name: value, source: "label-for" };
      }
    }

    const wrapping = element.closest("label");
    if (wrapping) {
      const value = textOf(wrapping, 120);
      if (value) return { name: value, source: "label-wrap" };
    }

    const title = element.getAttribute("title");
    if (title?.trim()) return { name: title.trim(), source: "title" };

    return { name: null, source: "none" };
  }

  function capped<T>(items: T[], category: string): T[] {
    if (items.length > limits.maxNodesPerCategory) {
      truncated.push(category);
      return items.slice(0, limits.maxNodesPerCategory);
    }
    return items;
  }

  // --- landmarks -----------------------------------------------------------
  const LANDMARK_SELECTOR = "header,nav,main,aside,footer,form,section,[role]";
  const IMPLICIT_ROLES: Record<string, string> = {
    HEADER: "banner",
    NAV: "navigation",
    MAIN: "main",
    ASIDE: "complementary",
    FOOTER: "contentinfo",
    FORM: "form",
    SECTION: "region",
  };

  function collectLandmarks() {
    const out: { role: string; selector: string; accessibleName: string | null }[] = [];
    for (const element of Array.from(document.querySelectorAll(LANDMARK_SELECTOR))) {
      const explicit = element.getAttribute("role");
      const role = explicit?.trim() ? explicit.trim() : (IMPLICIT_ROLES[element.tagName] ?? "");
      if (!role) continue;
      out.push({ role, selector: selectorFor(element), accessibleName: accessibleNameOf(element).name });
    }
    return capped(out, "landmarks");
  }

  // --- headings ------------------------------------------------------------
  function collectHeadings() {
    const out: { level: number; selector: string; text: string }[] = [];
    for (const element of Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6,[role='heading']"))) {
      const tagLevel = /^H([1-6])$/.exec(element.tagName);
      const ariaLevel = element.getAttribute("aria-level");
      const level = tagLevel ? Number(tagLevel[1]) : ariaLevel ? Number(ariaLevel) : 0;
      if (!Number.isFinite(level) || level === 0) continue;
      out.push({ level, selector: selectorFor(element), text: textOf(element, 160) });
    }
    return capped(out, "headings");
  }

  // --- images --------------------------------------------------------------
  function collectImages() {
    const out: { selector: string; src: string; alt: string | null; ariaHidden: boolean }[] = [];
    for (const element of Array.from(document.querySelectorAll("img"))) {
      const image = element as HTMLImageElement;
      out.push({
        selector: selectorFor(image),
        // `getAttribute` rather than `.src`: the authored value is what a reviewer will look for in
        // the template, and `.src` would resolve it against the document, changing the citation.
        src: image.getAttribute("src") ?? "",
        alt: image.hasAttribute("alt") ? image.getAttribute("alt") : null,
        ariaHidden: image.getAttribute("aria-hidden") === "true",
      });
    }
    return capped(out, "images");
  }

  // --- form controls -------------------------------------------------------
  function collectFormControls() {
    const out: {
      selector: string;
      tag: string;
      type: string | null;
      name: string | null;
      accessibleName: string | null;
      labelSource: string;
      required: boolean;
    }[] = [];
    for (const element of Array.from(document.querySelectorAll("input,select,textarea"))) {
      const type = element.getAttribute("type");
      // A hidden input has no rendered presence and no labelling obligation; including it would pad
      // every finding list with noise a reviewer then has to filter out by hand.
      if (element.tagName === "INPUT" && type === "hidden") continue;
      const { name, source } = accessibleNameOf(element);
      out.push({
        selector: selectorFor(element),
        tag: element.tagName.toLowerCase(),
        type,
        name: element.getAttribute("name"),
        accessibleName: name,
        labelSource: source,
        required: element.hasAttribute("required") || element.getAttribute("aria-required") === "true",
      });
    }
    return capped(out, "formControls");
  }

  // --- contrast ------------------------------------------------------------
  function parseColor(value: string): [number, number, number, number] | null {
    const match = /^rgba?\(([^)]+)\)$/.exec(value.trim());
    if (!match) return null;
    const parts = (match[1] as string).split(/[,\s/]+/).filter((part) => part.length > 0).map(Number);
    const [r, g, b] = parts;
    if (r === undefined || g === undefined || b === undefined) return null;
    const alpha = parts.length > 3 ? (parts[3] as number) : 1;
    return [r, g, b, alpha];
  }

  function relativeLuminance([r, g, b]: [number, number, number, number]): number {
    const channel = (raw: number): number => {
      const c = raw / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  }

  /** Walks ancestors for the first non-transparent background, mirroring what a viewer actually
   *  sees. Falls back to white — stated in the sample rather than silently assumed, because a page
   *  whose real background comes from an image or gradient will produce a ratio computed against a
   *  colour that is not really there. */
  function effectiveBackground(element: Element): string {
    let current: Element | null = element;
    while (current) {
      const background = getComputedStyle(current).backgroundColor;
      const parsed = parseColor(background);
      if (parsed && parsed[3] > 0) return background;
      current = current.parentElement;
    }
    return "rgb(255, 255, 255)";
  }

  function collectContrastSamples() {
    const out: {
      selector: string;
      foreground: string;
      background: string;
      ratio: number;
      fontSizePx: number;
      fontWeight: number;
    }[] = [];

    const candidates = Array.from(document.querySelectorAll("p,li,a,button,h1,h2,h3,h4,h5,h6,label,span,td,th"));
    for (const element of candidates) {
      if (out.length >= limits.maxContrastSamples) {
        truncated.push("contrastSamples");
        break;
      }
      const text = (element.textContent ?? "").trim();
      if (text.length === 0) continue;
      // Only leaf-ish text: a wrapper repeats its children's colours and would crowd the sample set
      // with duplicates of the same real pair.
      if (element.querySelector("p,li,a,button,h1,h2,h3,h4,h5,h6,label,span,td,th")) continue;

      const style = getComputedStyle(element);
      if (style.visibility === "hidden" || style.display === "none") continue;

      const foreground = style.color;
      const background = effectiveBackground(element);
      const fg = parseColor(foreground);
      const bg = parseColor(background);
      if (!fg || !bg) continue;

      const l1 = relativeLuminance(fg);
      const l2 = relativeLuminance(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

      out.push({
        selector: selectorFor(element),
        foreground,
        background,
        ratio: Math.round(ratio * 100) / 100,
        fontSizePx: Math.round(parseFloat(style.fontSize) * 10) / 10,
        fontWeight: Number(style.fontWeight) || 400,
      });
    }
    return out;
  }

  // --- document ------------------------------------------------------------
  const bodyText = (document.body?.innerText ?? "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const textTruncated = bodyText.length > limits.maxTextExcerptChars;

  const accessibility: AccessibilityEvidence = limits.collectAccessibility
    ? {
        landmarks: collectLandmarks(),
        headings: collectHeadings(),
        images: collectImages(),
        formControls: collectFormControls(),
        contrastSamples: collectContrastSamples(),
        truncated: Array.from(new Set(truncated)),
      }
    : { landmarks: [], headings: [], images: [], formControls: [], contrastSamples: [], truncated: ["not-collected"] };

  return {
    title: document.title,
    lang: document.documentElement.getAttribute("lang"),
    textExcerpt: textTruncated ? bodyText.slice(0, limits.maxTextExcerptChars) : bodyText,
    textTruncated,
    accessibility,
  };
}
