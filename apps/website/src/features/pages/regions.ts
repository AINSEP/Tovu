import { maskNonRenderableRegions } from "../../contracts/core/embeds/marker.js";

/**
 * @file Locating and replacing ONE `data-agent-element` region inside a Page's `body_html`.
 *
 * ## Why this is a stack walk and not another regex
 *
 * `core/embeds/marker.ts` matches a marker's element with a backreferenced close tag
 * (`<([a-z]+)...>([\s\S]*?)<\/\1>`) and documents the assumption that makes it safe: no marker has a
 * same-named descendant. That assumption is true for embed markers and FALSE for regions. A region
 * is a top-level `<section>` holding a page's whole hero or body, and a hero that contains a nested
 * `<section>` is ordinary markup, not an edge case. A non-greedy backreference would stop at the
 * FIRST inner `</section>` and splice new content into the middle of the region, leaving the
 * region's own tail orphaned outside it — silently, on a tool whose entire purpose is "everything
 * outside the target survives byte-identically". So this module tracks open elements on a stack and
 * finds each region's real matching close.
 *
 * Tolerant of implicit closes the way a browser is: a close tag pops the nearest matching open
 * element on the stack and treats everything above it as implicitly closed (`<p>a<p>b</section>`),
 * and a close tag matching nothing on the stack is ignored rather than throwing. This is not a
 * conformant HTML5 tree builder and does not try to be — it is an offset finder over markup the
 * assistant itself just wrote, and a document malformed badly enough to defeat it is reported as a
 * located problem, never spliced on a guess.
 *
 * ## Why comments and `<style>` are masked
 *
 * Through {@link maskNonRenderableRegions}, the same offset-preserving mask
 * `core/embeds/marker.ts` runs its own scan against, imported rather than re-implemented. A page's
 * `<style>` block routinely contains `>` and quote characters that would otherwise be read as
 * markup, and a `data-agent-element` written inside an authoring comment is not an addressable
 * region. Masking preserves every offset, so an offset found in the masked copy indexes the
 * ORIGINAL string unchanged.
 *
 * ## Architectural role
 *
 * PURE. No I/O, no store, no permission check — it answers "where is this region" and "what does
 * the document look like with this region's contents replaced". `tool-registrations.ts` owns the
 * read-modify-write and the version guard.
 */

/**
 * HTML elements that never have inner content or a close tag. A `data-agent-element` on one of these
 * is a region with nothing to replace, which {@link locateRegion} reports rather than splices.
 */
const VOID_ELEMENTS: ReadonlySet<string> = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr",
]);

/**
 * Top-level elements exempt from the "every top-level section carries a handle" rule.
 *
 * A `<style>` block is the expected way to style a bespoke page (`PAGE_HTML_CONTRACT` says so
 * explicitly), and it is not content anyone edits by region — demanding a handle on it would force
 * the model to invent a meaningless address for a stylesheet. The rest are metadata elements the
 * contract already forbids at page level; they are listed so the tagging check never becomes the
 * error a caller sees first for a violation another rule states better.
 */
const UNTAGGABLE_TOP_LEVEL_ELEMENTS: ReadonlySet<string> = new Set([
  "style", "script", "template", "link", "meta", "base", "title",
]);

/** Matches `data-agent-element="handle"` (or single-quoted) inside one element's attribute text. */
const HANDLE_ATTRIBUTE_PATTERN = /(?:^|\s)data-agent-element\s*=\s*(?:"([^"]*)"|'([^']*)')/;

/** One element carrying `data-agent-element`, with every offset a splice needs. */
export interface PageRegion {
  /** The `data-agent-element` value — the address the model targets. */
  readonly handle: string;
  /** Lowercased tag name of the region element itself. */
  readonly tag: string;
  /** Offset of the region element's own `<`. */
  readonly start: number;
  /** Offset just past the region element's `>` — where its inner content begins. */
  readonly innerStart: number;
  /** Offset of the `<` of its matching close tag — where its inner content ends. */
  readonly innerEnd: number;
  /** Offset just past its `</tag>`. */
  readonly end: number;
  /** How many OTHER regions enclose this one. `0` means it is not nested inside another region. */
  readonly depth: number;
  /**
   * `true` when the element is void, or was closed implicitly by an ancestor's close tag rather than
   * by its own — i.e. the document does not actually delimit this region, so there is no inner span
   * to replace. {@link locateRegion} refuses such a target instead of splicing at a guessed offset.
   */
  readonly unclosed: boolean;
}

/** A top-level element, and whether it carries a handle — the input to the tagging check. */
export interface TopLevelElement {
  readonly tag: string;
  readonly handle: string | undefined;
  readonly innerStart: number;
  readonly innerEnd: number;
}

export interface PageMarkupScan {
  /** Every region in the document, in document order (an outer region precedes the ones inside it). */
  readonly regions: readonly PageRegion[];
  /** Every element opened at depth 0, in document order. */
  readonly topLevel: readonly TopLevelElement[];
}

/** One element pushed on the open-element stack while scanning. */
interface OpenElement {
  tag: string;
  handle: string | undefined;
  start: number;
  innerStart: number;
  /** Regions open above this one at the moment it was pushed. */
  regionDepth: number;
}

/** Sentinel for a top-level element whose close tag has not been reached yet. */
const INNER_END_PENDING = -1;

/** The parsed head of an open tag starting at `lt`, or `null` if that `<` does not begin one. */
interface ParsedOpenTag {
  tag: string;
  handle: string | undefined;
  innerStart: number;
  selfClosing: boolean;
}

/**
 * Parse the open tag beginning at `masked[lt]`, walking to its `>` while respecting quoted attribute
 * values so a `>` inside `alt="a > b"` does not end the tag early.
 *
 * @returns The tag's name, its `data-agent-element` value if any, and where its inner content
 * begins; `null` if this `<` is not an open tag, or if the tag is never terminated.
 * @complexity O(k) in the open tag's own length.
 */
function parseOpenTag(masked: string, lt: number): ParsedOpenTag | null {
  const name = /^<([a-zA-Z][a-zA-Z0-9:-]*)/.exec(masked.slice(lt, lt + 64));
  if (!name) return null;

  let cursor = lt + name[0].length;
  let quote: string | null = null;
  while (cursor < masked.length) {
    const ch = masked[cursor];
    if (quote !== null) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ">") {
      const attrs = masked.slice(lt + name[0].length, cursor);
      const handle = HANDLE_ATTRIBUTE_PATTERN.exec(attrs);
      return {
        tag: (name[1] as string).toLowerCase(),
        handle: handle ? ((handle[1] ?? handle[2]) as string) : undefined,
        innerStart: cursor + 1,
        selfClosing: masked[cursor - 1] === "/",
      };
    }
    cursor += 1;
  }
  return null;
}

/**
 * Record one open element as a finished region, if it carried a handle.
 *
 * `innerEnd === end` marks an element the document never closed on its own — see
 * {@link PageRegion.unclosed}.
 */
function finishElement(open: OpenElement, innerEnd: number, end: number, out: PageRegion[]): void {
  if (open.handle === undefined) return;
  out.push({
    handle: open.handle,
    tag: open.tag,
    start: open.start,
    innerStart: open.innerStart,
    innerEnd,
    end,
    depth: open.regionDepth,
    unclosed: innerEnd === end,
  });
}

/**
 * Apply the close tag at `masked[lt]` to the stack: pop the nearest matching open element, treating
 * everything above it as implicitly closed at this same offset.
 *
 * A close tag matching nothing on the stack is a stray and is skipped — a browser ignores it too,
 * and throwing here would turn ordinary sloppy markup into a refused edit of a region the stray tag
 * has nothing to do with.
 *
 * @returns The offset to continue scanning from.
 * @complexity O(d) in the current stack depth, amortized O(1) per element across a whole scan.
 */
function applyCloseTag(masked: string, lt: number, stack: OpenElement[], out: PageRegion[]): number {
  const close = /^<\/([a-zA-Z][a-zA-Z0-9:-]*)\s*>/.exec(masked.slice(lt, lt + 64));
  if (!close) return lt + 2;

  const tag = (close[1] as string).toLowerCase();
  const end = lt + close[0].length;
  for (let depth = stack.length - 1; depth >= 0; depth -= 1) {
    if ((stack[depth] as OpenElement).tag !== tag) continue;
    for (let above = stack.length - 1; above > depth; above -= 1) {
      finishElement(stack[above] as OpenElement, lt, lt, out);
    }
    finishElement(stack[depth] as OpenElement, lt, end, out);
    stack.length = depth;
    return end;
  }
  return end;
}

/** Skip a `<!doctype …>` / `<![CDATA[…]]>` style construct. Comments are already masked away. */
function skipBogusComment(masked: string, lt: number): number {
  const gt = masked.indexOf(">", lt);
  return gt < 0 ? masked.length : gt + 1;
}

/**
 * Every `data-agent-element` region in `html`, plus its top-level elements.
 *
 * Offsets index the ORIGINAL `html`, not the masked copy — {@link maskNonRenderableRegions}
 * preserves length exactly so the two are interchangeable as indices.
 *
 * @param html - A Page's `body_html`, or any fragment of it.
 * @returns Regions in document order (outer before inner), and every depth-0 element.
 * @complexity O(n) in `html`'s length — one masking pass plus one single-pass scan.
 */
export function scanPageMarkup(html: string): PageMarkupScan {
  const masked = maskNonRenderableRegions(html);
  const stack: OpenElement[] = [];
  const regions: PageRegion[] = [];
  const topLevel: TopLevelElement[] = [];
  let cursor = 0;

  while (cursor < masked.length) {
    const lt = masked.indexOf("<", cursor);
    if (lt < 0) break;
    if (masked.startsWith("<!", lt)) {
      cursor = skipBogusComment(masked, lt);
      continue;
    }
    if (masked.startsWith("</", lt)) {
      cursor = applyCloseTag(masked, lt, stack, regions);
      sealTopLevel(stack.length, topLevel, lt);
      continue;
    }
    const open = parseOpenTag(masked, lt);
    if (!open) {
      cursor = lt + 1;
      continue;
    }
    openElement(open, lt, stack, regions, topLevel);
    cursor = open.innerStart;
  }

  // Whatever is still open at EOF was never closed. Report it (so its handle is still discoverable)
  // and mark it unclosed, rather than dropping the region silently.
  for (let depth = stack.length - 1; depth >= 0; depth -= 1) {
    finishElement(stack[depth] as OpenElement, masked.length, masked.length, regions);
  }
  sealTopLevel(0, topLevel, masked.length);
  regions.sort((a, b) => a.start - b.start);
  return { regions, topLevel };
}

/**
 * Push a newly-opened element onto the stack, or — for a void/self-closing element — record it
 * immediately, since it has no inner span and no close tag to wait for. A depth-0 element is also
 * recorded as top level, with its `innerEnd` left {@link INNER_END_PENDING} until it closes.
 */
function openElement(
  open: ParsedOpenTag,
  lt: number,
  stack: OpenElement[],
  regions: PageRegion[],
  topLevel: TopLevelElement[]
): void {
  const empty = open.selfClosing || VOID_ELEMENTS.has(open.tag);
  if (stack.length === 0) {
    topLevel.push({
      tag: open.tag,
      handle: open.handle,
      innerStart: open.innerStart,
      innerEnd: empty ? open.innerStart : INNER_END_PENDING,
    });
  }
  const element: OpenElement = {
    tag: open.tag,
    handle: open.handle,
    start: lt,
    innerStart: open.innerStart,
    regionDepth: stack.filter((entry) => entry.handle !== undefined).length,
  };
  if (empty) {
    finishElement(element, open.innerStart, open.innerStart, regions);
    return;
  }
  stack.push(element);
}

/**
 * Fill in the pending `innerEnd` of the most recent top-level element, once the stack has drained
 * back to depth 0 (or the document ended).
 */
function sealTopLevel(stackDepth: number, topLevel: TopLevelElement[], closedAt: number): void {
  if (stackDepth !== 0) return;
  const last = topLevel[topLevel.length - 1];
  if (last && last.innerEnd === INNER_END_PENDING) {
    topLevel[topLevel.length - 1] = { ...last, innerEnd: closedAt };
  }
}

/** Why {@link locateRegion} could not resolve a handle to exactly one replaceable span. */
export type RegionLookupProblem =
  | { readonly kind: "absent"; readonly available: readonly string[] }
  | { readonly kind: "ambiguous"; readonly count: number }
  | { readonly kind: "not-replaceable"; readonly tag: string };

export type RegionLookup = { readonly region: PageRegion } | { readonly problem: RegionLookupProblem };

/**
 * Resolve one handle to the single region element it addresses.
 *
 * **Absent** and **ambiguous** are both refusals, never a best guess. A handle is an ADDRESS: the
 * whole value of region editing is that the model can say "change the hero" and be certain the CTA
 * did not move. Silently taking the first of two elements sharing a handle would land an edit
 * somewhere the model did not mean, in a document where it cannot see the result — the exact class
 * of quiet, off-target write a full rewrite at least makes visible.
 *
 * **Nesting is allowed.** A region inside another region is a legitimate finer-grained address, and
 * refusing it would make a page's own structure decide what is editable. The consequence is
 * disclosed to the caller instead: writing an OUTER region replaces everything inside it, nested
 * handles included, so the writer reports the document's surviving handles after every write.
 *
 * @param html - The page body to search.
 * @param handle - The `data-agent-element` value to resolve.
 * @returns The single matching region, or the reason no single replaceable span matched.
 * @complexity O(n) in `html`'s length (one {@link scanPageMarkup} pass).
 */
export function locateRegion(html: string, handle: string): RegionLookup {
  const { regions } = scanPageMarkup(html);
  const matches = regions.filter((region) => region.handle === handle);
  if (matches.length === 0) {
    return { problem: { kind: "absent", available: regions.map((region) => region.handle) } };
  }
  if (matches.length > 1) return { problem: { kind: "ambiguous", count: matches.length } };

  const region = matches[0] as PageRegion;
  if (region.unclosed) return { problem: { kind: "not-replaceable", tag: region.tag } };
  return { region };
}

/**
 * The document with `region`'s INNER content replaced by `fragment`, and every other byte unchanged.
 *
 * **Inner content, not the whole element — and this is the load-bearing decision of the module.**
 * The handle lives on the region element's own open tag. If a write replaced the whole element, the
 * model would have to re-emit `data-agent-element="<handle>"` byte-correctly on every edit, and a
 * single slip would delete the address it was writing to — making the page permanently unaddressable
 * in exactly the way a churning handle is worse than no handle at all. Inner-only makes that
 * unreachable: the tag, the handle, the `class`, and any `aria-*` the theme styles against all
 * survive a region write by construction, not by the model remembering to reproduce them.
 *
 * `core/embeds/marker.ts` is the cautionary precedent. Its `substituteMarkers` replaces the WHOLE
 * element and every inner-content consumer has to remember to wrap its output in `withInnerContent`
 * — the two behaviors are one call apart and look identical at the call site. That ambiguity is
 * affordable there (two consumers, both in this repo, both tested). It is not affordable in a tool
 * description, where the only reader is a model that cannot see the implementation. So the choice is
 * made once, here, and stated flatly in the tool's own description.
 *
 * @complexity O(n) in `html`'s length — two slices and one concatenation.
 */
export function replaceRegionInner(html: string, region: PageRegion, fragment: string): string {
  return html.slice(0, region.innerStart) + fragment + html.slice(region.innerEnd);
}

/** A top-level element the contract requires a handle on, and the handle it should probably carry. */
export interface UntaggedSection {
  readonly tag: string;
  readonly suggestedHandle: string | undefined;
}

/** The first heading's text content inside a fragment, tags stripped — the anchor a handle derives from. */
const HEADING_PATTERN = /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i;

/**
 * A handle derived from `inner`'s own first heading — never from its position in the document.
 *
 * Positional handles (`section-1`, `section-2`) are the failure this rule exists to prevent: they
 * churn the moment a section is inserted or moved, so a model that read the handle list one turn ago
 * confidently addresses a DIFFERENT section on the next one. A heading-derived handle moves with the
 * content it names. A section with no heading gets no suggestion at all rather than a positional
 * fallback — "you pick one" is strictly better advice than an address that will go stale.
 *
 * @param inner - The section's inner HTML.
 * @param taken - Handles already present in the document; a collision yields no suggestion, since
 * re-deriving an existing handle would produce the ambiguity {@link locateRegion} refuses.
 * @complexity O(k) in the section's own length.
 */
export function suggestRegionHandle(inner: string, taken: ReadonlySet<string>): string | undefined {
  const heading = HEADING_PATTERN.exec(inner);
  if (!heading) return undefined;
  const slug = (heading[1] as string)
    .replace(/<[^>]*>/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  if (slug === "" || taken.has(slug)) return undefined;
  return slug;
}

/**
 * Every top-level element that must carry `data-agent-element` and does not.
 *
 * This is the check the write seam refuses on. It is deliberately about TOP-LEVEL elements only,
 * matching `PAGE_HTML_CONTRACT`'s own wording ("each top-level section"): demanding a handle on
 * every nested `<div>` would be a different, much stricter contract than the one the model is
 * handed, and enforcing a rule nobody was told about is how a tool becomes unusable.
 *
 * @param html - The complete page body about to be written.
 * @returns One entry per offending element, in document order. Empty means the markup complies.
 * @complexity O(n) in `html`'s length.
 */
export function untaggedTopLevelSections(html: string): readonly UntaggedSection[] {
  const { regions, topLevel } = scanPageMarkup(html);
  const taken = new Set(regions.map((region) => region.handle));
  const offenders: UntaggedSection[] = [];
  for (const element of topLevel) {
    if (element.handle !== undefined) continue;
    if (UNTAGGABLE_TOP_LEVEL_ELEMENTS.has(element.tag)) continue;
    const inner = element.innerEnd > element.innerStart ? html.slice(element.innerStart, element.innerEnd) : "";
    const suggestion = suggestRegionHandle(inner, taken);
    if (suggestion !== undefined) taken.add(suggestion);
    offenders.push({ tag: element.tag, suggestedHandle: suggestion });
  }
  return offenders;
}

/** Every region handle present in `html`, in document order — the list a read hands back to the model. */
export function regionHandlesIn(html: string): string[] {
  return scanPageMarkup(html).regions.map((region) => region.handle);
}
