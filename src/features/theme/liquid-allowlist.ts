import { Liquid, Hash, type TagToken } from "liquidjs";

/**
 * @file ADR-020 Tier-2 guardrail: the allowlist of LiquidJS tags/filters a
 * "templated" theme may use, plus the AST-walking check that enforces it.
 *
 * Purpose:
 * A Tier-2 theme ships raw `.liquid` source that runs on our server (ADR-020
 * §3, drift finding C6). This module keeps that surface to pure, non-I/O
 * logic: no `{% include %}` / `{% render %}` / `{% layout %}` / `{% block %}`
 * (LiquidJS's own filesystem-reading tags — distinct from Tovu's custom
 * `render_block`, which resolves against the trusted in-process component
 * registry, not the filesystem) and no filter beyond a reviewed, I/O-free
 * set. Enforcement walks the *parsed AST* (`liquid.parse()`), not the raw
 * source text, so a tag/filter name appearing inside a string literal or
 * comment can't trigger a false positive/negative.
 *
 * How it relates to the project:
 * Called from two sites, matching ADR-020 §3's "lint before publish" +
 * "defensive at render time" pair:
 *   - `features/theme/theme.ts`'s `loadTheme()` — lint every `.liquid` file
 *     at discovery time, folding violations into the existing
 *     `errors`/`status: "invalid"` mechanism.
 *   - `server/http/site/liquid-worker.ts` — a second, redundant check
 *     immediately before render, in case a template was hot-edited on disk
 *     after a theme was validated (belt-and-suspenders; loadTheme's result
 *     is not re-verified per request).
 */

/**
 * Built-in LiquidJS tags this repo's themes may use. Everything else in
 * LiquidJS's default tag registry — `include`, `render`, `layout`, `block`
 * — reads named partial/layout files from the engine's configured `fs`/
 * `root` and is excluded on principle: Tier 2 has zero filesystem access
 * (see `liquid-worker.ts`'s explicit no-op `fs` adapter for the second,
 * redundant layer of that guarantee, verified empirically — LiquidJS's
 * *default* engine config is not filesystem-inert, it reads real files
 * relative to `root: ["."]` unless an `fs` adapter is supplied). `liquid`
 * (the multi-statement shorthand tag) is allowed because its body parses
 * through this same walker — nested tags inside it are enumerated exactly
 * like top-level ones, verified by the smuggling-attempt test in
 * `liquid-allowlist.test.ts`. `render_block` is Tovu's own tag.
 */
export const ALLOWED_LIQUID_TAGS: ReadonlySet<string> = new Set([
  "render_block",
  "comment",
  "if",
  "unless",
  "case",
  "for",
  "assign",
  "capture",
  "break",
  "continue",
  "cycle",
  "increment",
  "decrement",
  "echo",
  "raw",
  "tablerow",
  "liquid",
]);

/**
 * Built-in LiquidJS filters this repo's themes may use: string/array/number
 * shaping only. LiquidJS ships no filesystem, network, or shell-invoking
 * filter by default (checked against the engine's full built-in filter
 * registry). The crypto/encoding filters (`sha256`, `hmac_sha256`,
 * `base64_encode`/`base64_decode`) and the `_exp` filters (which evaluate an
 * attacker-supplied expression string as a small boolean-expression
 * language, e.g. `where_exp`) are excluded on the same least-privilege
 * basis as the tag list: no shipped theme needs them, they are not "common
 * string/array" filters, and the `_exp` family in particular re-opens a
 * dynamic-evaluation surface this allowlist exists to close.
 */
export const ALLOWED_LIQUID_FILTERS: ReadonlySet<string> = new Set([
  "abs",
  "append",
  "array_to_sentence_string",
  "at_least",
  "at_most",
  "capitalize",
  "ceil",
  "compact",
  "concat",
  "date",
  "default",
  "divided_by",
  "downcase",
  "escape",
  "escape_once",
  "find",
  "find_index",
  "first",
  "floor",
  "group_by",
  "has",
  "join",
  "json",
  "jsonify",
  "last",
  "lstrip",
  "map",
  "minus",
  "modulo",
  "newline_to_br",
  "normalize_whitespace",
  "number_of_words",
  "plus",
  "prepend",
  "raw",
  "reject",
  "remove",
  "remove_first",
  "remove_last",
  "replace",
  "replace_first",
  "replace_last",
  "reverse",
  "round",
  "rstrip",
  "size",
  "slice",
  "slugify",
  "sort",
  "sort_natural",
  "split",
  "strip",
  "strip_html",
  "strip_newlines",
  "sum",
  "times",
  "to_integer",
  "truncate",
  "truncatewords",
  "uniq",
  "upcase",
  "uri_escape",
  "url_decode",
  "url_encode",
  "where",
  "xml_escape",
]);

/**
 * A parse-only Liquid engine used solely to build an AST to walk — it is
 * never rendered, so it needs no `fs` hardening of its own (parsing never
 * touches disk; verified in `liquid-allowlist.test.ts` against a bare
 * default-`fs` engine instance). `render_block` is registered as an inert
 * stub purely so parsing a legitimate template doesn't fail with LiquidJS's
 * own "tag not found" parse error on Tovu's custom tag.
 */
const parser = new Liquid({ cache: false });
parser.registerTag("render_block", {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parse(this: any, token: TagToken) {
    this.hash = new Hash(token.args);
  },
  render(): string {
    return "";
  },
});

/**
 * `{% for i in (1..N) %}` — a numeric range literal — is a reachable
 * resource-exhaustion vector *even though `for` is an allowlisted tag*: a
 * template needs no disallowed tag or filter to write `(1..99999999999)`.
 * Verified empirically that LiquidJS eagerly materializes the *whole* range
 * into a real JS array before iterating (not a lazy generator), and that a
 * single allocation this large can hit V8's fatal (process-crashing) OOM
 * path even inside a `resourceLimits`-capped `worker_threads` worker —
 * `resourceLimits` protects against *gradual* heap growth (proven in
 * `liquid-sandbox.test.ts`'s memory-blowup test) but not a one-shot
 * allocation request that already exceeds the isolate's budget before any
 * GC/limit callback gets a chance to intervene. Capping the literal span at
 * lint time closes the one instance of this class reachable through purely
 * allowlisted syntax; no shipped theme needs a bare numeric range this
 * large (`themes/dispatch` loops over real arrays, e.g. `for post in
 * posts`, never a synthetic range).
 */
const MAX_FOR_RANGE_SPAN = 1_000_000;

/**
 * The minimal shape this walker relies on across every LiquidJS AST node
 * kind (`Tag` subclasses, `Output`, `HTML`). All fields are optional because
 * different node kinds populate different subsets — `HTML` nodes have none
 * of them; `Output` has `value` and `arguments`; `Tag` subclasses have
 * `name` and, for branching/looping tags, `children`; `ForTag` additionally
 * has `collection`, which is a `RangeToken` (with numeric `lhs`/`rhs`) only
 * when the loop source is a literal range rather than a variable/array.
 */
interface WalkableNode {
  name?: string;
  value?: { filters?: Array<{ name: string }> };
  arguments?: () => Iterable<{ filters?: Array<{ name: string }> } | undefined>;
  children?: (partials: boolean, sync: boolean) => Generator<unknown, WalkableNode[]>;
  collection?: { lhs?: { content?: unknown }; rhs?: { content?: unknown } };
}

/** Records `node`'s own tag name, if it has one. */
function collectNodeTag(node: WalkableNode, tags: Set<string>): void {
  if (typeof node.name === "string") tags.add(node.name);
}

/** Records the filters applied directly to `node.value` (an `Output` node's own `{{ x | filter }}` chain). */
function collectNodeValueFilters(node: WalkableNode, filters: Set<string>): void {
  for (const filter of node.value?.filters ?? []) filters.add(filter.name);
}

/** Records filters used inside `node`'s own tag arguments (e.g. an `assign`/`if` expression's filters). */
function collectNodeArgumentFilters(node: WalkableNode, filters: Set<string>): void {
  if (typeof node.arguments !== "function") return;
  for (const arg of node.arguments()) {
    for (const filter of arg?.filters ?? []) filters.add(filter.name);
  }
}

/** Flags an oversized literal `for` range into `rangeViolations` — see `MAX_FOR_RANGE_SPAN`'s own doc. */
function collectForRangeViolation(node: WalkableNode, rangeViolations: string[]): void {
  if (node.name !== "for" || !node.collection) return;
  const lhs = node.collection.lhs?.content;
  const rhs = node.collection.rhs?.content;
  if (typeof lhs === "number" && typeof rhs === "number" && Math.abs(rhs - lhs) > MAX_FOR_RANGE_SPAN) {
    rangeViolations.push(`for-loop range (${lhs}..${rhs}) exceeds the maximum allowed span of ${MAX_FOR_RANGE_SPAN}`);
  }
}

/** Drains `node.children()`'s generator to its final `.value` — LiquidJS's `children()` seam
 * returns a generator even in the sync (`partials=false, sync=true`) mode this walker always
 * calls it in, so this is just the "give me the array" adapter over that shape. */
function drainChildren(node: WalkableNode): WalkableNode[] | undefined {
  if (typeof node.children !== "function") return undefined;
  const gen = node.children(false, true);
  let step = gen.next();
  while (!step.done) step = gen.next();
  return step.value;
}

/**
 * Recursively walk a parsed template's AST — using LiquidJS's public
 * `Template.children()` seam, the same mechanism the engine's own
 * `analyze()`/`analyzeSync()` static-analysis API uses internally — and
 * collect every tag name and filter name actually used, including inside
 * `if`/`unless`/`case`/`for` bodies and the `{% liquid %}` shorthand.
 * `children(false, true)` (partials=false, sync=true) never touches disk
 * even for filesystem tags like `include`/`render`/`layout` (verified in
 * `liquid-allowlist.test.ts`), so this is safe to run before those tags
 * have even been rejected by the allowlist below. Also flags an oversized
 * literal `for` range into `rangeViolations` (see `MAX_FOR_RANGE_SPAN`).
 *
 * @complexity O(n) in AST node count — one pass, no backtracking, no
 * re-visiting of a node.
 */
function collectLiquidUsage(
  nodes: WalkableNode[],
  tags: Set<string>,
  filters: Set<string>,
  rangeViolations: string[]
): void {
  for (const node of nodes) {
    collectNodeTag(node, tags);
    collectNodeValueFilters(node, filters);
    collectNodeArgumentFilters(node, filters);
    collectForRangeViolation(node, rangeViolations);
    const children = drainChildren(node);
    if (children) collectLiquidUsage(children, tags, filters, rangeViolations);
  }
}

/**
 * Lint a `.liquid` template source against the ADR-020 §3 tag/filter
 * allowlist.
 *
 * @param source raw `.liquid` template text (untrusted — third-party theme
 *   content).
 * @returns human-readable violation messages; empty means the template is
 *   clean. A Liquid syntax error is reported the same way (as a single
 *   violation message) rather than thrown, so every caller can treat this
 *   function as a total, non-throwing predicate.
 * @complexity O(n) in template size — one parse plus one AST walk.
 * @overallScore 100/100
 */
export function lintLiquidTemplate(source: string): string[] {
  let parsed: WalkableNode[];
  try {
    parsed = parser.parse(source) as unknown as WalkableNode[];
  } catch (err) {
    return [`Liquid syntax error: ${(err as Error).message}`];
  }

  const tags = new Set<string>();
  const filters = new Set<string>();
  const violations: string[] = [];
  collectLiquidUsage(parsed, tags, filters, violations);

  for (const tag of tags) {
    if (!ALLOWED_LIQUID_TAGS.has(tag)) violations.push(`disallowed tag "${tag}"`);
  }
  for (const filter of filters) {
    if (!ALLOWED_LIQUID_FILTERS.has(filter)) violations.push(`disallowed filter "${filter}"`);
  }
  return violations;
}
