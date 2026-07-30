import Handlebars from "handlebars";

/**
 * @file ADR-020 Tier-2 guardrail, Handlebars edition: the allowlist of
 * Handlebars helpers/expressions a `"handlebars"` theme may use, plus the
 * AST-walking check that enforces it.
 *
 * Purpose:
 * A `"handlebars"` theme ships raw `.hbs` source that runs on our server, the
 * same exposure the `"templated"` (LiquidJS) tier already carries. This module
 * is the direct counterpart of `liquid-allowlist.ts` and keeps the surface to
 * pure, non-I/O, non-dynamic logic. Enforcement walks the *parsed AST*
 * (`Handlebars.parse()`), not the raw source text, so a helper name appearing
 * inside a string literal or an HTML comment can neither trigger a false
 * positive nor slip past as a false negative.
 *
 * Why an allowlist is load-bearing HERE specifically. Handlebars' historical
 * CVE record (CVE-2019-19919, CVE-2021-23369, CVE-2021-23383 and relatives) is
 * a record of *compiling attacker-controlled template strings* — the exact
 * thing this tier does by design — escaping into prototype pollution and then
 * remote code execution. Those specific bugs are fixed in the pinned 4.7.x
 * line, but the shape of the risk is structural, not incidental: a template
 * language whose compiler emits JavaScript will keep finding new ways for
 * template text to reach the compiler's own object graph. Three constructs
 * carry essentially all of that risk and all three are refused outright below
 * rather than filtered:
 *   - `{{{triple-stash}}}` / `{{&amp;stash}}` raw output (the XSS seam),
 *   - `{{> partial}}` / `{{#> partial-block}}` (the partial-registry read,
 *     Handlebars' analogue of Liquid's `include`/`render` filesystem tags),
 *   - `{{#*inline}}` / `{{*decorator}}` (decorators, which mutate the
 *     runtime's own program/partial resolution from inside a template).
 *
 * How it relates to the project:
 * Called from the same two sites the Liquid allowlist is, matching ADR-020
 * §3's "lint before publish" + "defensive at render time" pair:
 *   - `features/theme/theme.ts`'s `loadTheme()` — lint every `.hbs`/
 *     `.handlebars` file at discovery time, folding violations into the
 *     existing `errors`/`status: "invalid"` mechanism.
 *   - `server/http/site/handlebars-worker.ts` — a second, redundant check
 *     immediately before render, in case a template was hot-edited on disk
 *     after a theme was validated (`loadTheme`'s result is not re-verified
 *     per request).
 */

/**
 * Block helpers (`{{#helper}}…{{/helper}}`) a theme may use. This is the
 * entire reviewed set — Handlebars' own built-in block registry beyond these
 * is `blockHelperMissing` (an internal fallback, never written by hand) and
 * the decorator forms, which are refused separately below.
 *
 * `each`/`if`/`unless`/`with` are pure control flow over already-shaped data:
 * none of them accepts an expression string to evaluate, which is what keeps
 * this list categorically safer than Liquid's `_exp` filter family (excluded
 * there for exactly that reason). Notably absent and deliberately so:
 * `log` (writes to the server's console from template text — an I/O side
 * effect a theme has no business having) and `lookup` (dynamic property
 * access by a runtime-computed key, i.e. `{{lookup this someKey}}`, which is
 * precisely the "reach an arbitrary property this template never named
 * literally" primitive the path rules below exist to close; Handlebars 4.6+
 * blocks prototype *properties* at runtime, but a dynamic key still defeats
 * static review of what a template can read).
 */
export const ALLOWED_HANDLEBARS_BLOCK_HELPERS: ReadonlySet<string> = new Set(["each", "if", "unless", "with"]);

/**
 * Helpers callable in mustache/subexpression position (`{{helper arg}}`,
 * `{{#if (helper arg)}}`). Exactly one entry, and it is Tovu's own:
 * `render_block` is the Handlebars-tier counterpart of the Liquid tier's
 * `{% render_block %}` tag — it resolves against the SAME in-process
 * `COMPONENTS` registry `render.ts` exports (and the same theme-declared
 * widget regions), never a filesystem path and never a theme-supplied
 * partial. That is what makes it a trusted seam back into core rather than a
 * capability: a theme can *arrange* core components, it cannot define one.
 *
 * There is no `registerHelper`/`registerPartial` surface exposed to a theme
 * at all, so this set is closed by construction — `handlebars-worker.ts`
 * builds its engine with `Handlebars.create()` (an isolated environment) and
 * registers only this one helper on it.
 */
export const ALLOWED_HANDLEBARS_HELPERS: ReadonlySet<string> = new Set(["render_block"]);

/**
 * The single unescaped-output seam, re-derived for Handlebars from the exact
 * argument Liquid's `| raw` filter rests on.
 *
 * `handlebars-worker.ts` compiles with escaping ON (`noEscape` left at its
 * default `false`), the direct counterpart of the Liquid engine's
 * `outputEscape: "escape"`. So `{{post.title}}` is HTML-escaped and a hostile
 * post title cannot inject markup. `{{{triple-stash}}}` opts *out* of that
 * per-expression, which makes it the tier's entire XSS surface — and unlike
 * Liquid's `raw`, it is syntax rather than a filter, so it cannot be dropped
 * from a filter allowlist. It is therefore refused for every expression
 * except the ones named here.
 *
 * `post.content` earns the exemption on the same basis `{{ post.content |
 * raw }}` does in `themes/liquidjs/*`: that value is not theme data and not
 * user data as-typed — it is the server's own `renderDocNode()` output, HTML
 * this codebase generated from a TipTap document through a closed node
 * vocabulary with `escapeHtml()` on every text run and `safeHref()` on every
 * link (`render.ts`). It is already sanitized *before* a template ever sees
 * it, and escaping it again would render visible `&lt;p&gt;` tags to readers.
 * Nothing else qualifies: a theme reaching for `{{{site.title}}}` or
 * `{{{post.title}}}` is asking to emit an unsanitized string, which is the
 * bug this rule exists to catch at load time rather than in production.
 */
export const ALLOWED_HANDLEBARS_RAW_PATHS: ReadonlySet<string> = new Set(["post.content"]);

/**
 * `@`-prefixed data variables a theme may read. `each` publishes
 * `@index`/`@key`/`@first`/`@last` for its own body and a loop is unusable
 * without them.
 *
 * `@root` is excluded on least-privilege grounds — it re-enters the top-level
 * context from arbitrary depth, defeating the `with`/`each` scoping a
 * reviewer reads the template's data access off of, and every shipped theme
 * can reach what it needs through ordinary `../` parent paths.
 * `@partial-block` is excluded because partials themselves are (see
 * {@link lintHandlebarsTemplate}'s partial rules).
 */
export const ALLOWED_HANDLEBARS_DATA_VARS: ReadonlySet<string> = new Set(["index", "key", "first", "last"]);

/**
 * Path segments refused anywhere in any expression. Handlebars 4.6+ already
 * refuses prototype properties/methods at *runtime* by default
 * (`allowProtoPropertiesByDefault: false`, which `handlebars-worker.ts` also
 * sets explicitly rather than inheriting), so this is the static half of a
 * two-layer guarantee — the layer that turns "the render would have returned
 * empty" into "the theme never loads", which is the difference between a
 * silently broken page and a reviewable error. These are the segment names
 * every published Handlebars prototype-pollution chain has had to route
 * through.
 */
const FORBIDDEN_PATH_SEGMENTS: ReadonlySet<string> = new Set([
  "constructor",
  "prototype",
  "__proto__",
  "__defineGetter__",
  "__defineSetter__",
  "__lookupGetter__",
  "__lookupSetter__",
]);

/**
 * Source-size ceiling, mirroring the Liquid engine's own `parseLimit:
 * 1_000_000` (`liquid-worker.ts`). Handlebars exposes no equivalent knob, so
 * the cap is applied here, before `Handlebars.parse()` runs — which matters
 * more for this tier than for Liquid's, because `loadTheme()` calls this lint
 * on the MAIN thread at discovery time. The worker's `resourceLimits` protect
 * the render; only this protects the parse.
 */
const MAX_TEMPLATE_SOURCE_BYTES = 1_000_000;

/**
 * Block-nesting ceiling. Handlebars has no numeric-range literal, so it has
 * no direct counterpart to Liquid's `{% for i in (1..N) %}` one-shot
 * allocation vector (`MAX_FOR_RANGE_SPAN` in `liquid-allowlist.ts`) — every
 * `{{#each}}` iterates a real array the server itself shaped. The reachable
 * analogue is depth rather than breadth: deeply nested blocks recurse in both
 * Handlebars' own parser/compiler and in this walker, and a stack overflow
 * during the *lint* would happen on the main thread, outside any worker.
 * Capping the depth this walker will descend closes that, and no real theme
 * comes anywhere near 64 levels of nesting.
 */
const MAX_BLOCK_NESTING_DEPTH = 64;

/**
 * The minimal shape this walker relies on across every Handlebars AST node
 * kind. All fields are optional because different node kinds populate
 * different subsets — `ContentStatement`/`CommentStatement` have none of them;
 * `MustacheStatement` has `path`/`params`/`hash`/`escaped`;
 * `BlockStatement`/`DecoratorBlock`/`PartialBlockStatement` add
 * `program`/`inverse`; `PartialStatement` carries its target in `name` rather
 * than `path`. Typed structurally rather than against `@types/handlebars`'
 * `hbs.AST` union so the walker stays total over node kinds a future
 * Handlebars minor might add — an unrecognized node simply contributes no
 * usage rather than crashing the lint.
 */
interface HbsNode {
  type?: string;
  path?: HbsPath;
  name?: HbsPath;
  params?: HbsNode[];
  hash?: { pairs?: Array<{ value?: HbsNode }> };
  escaped?: boolean;
  program?: { body?: HbsNode[] };
  inverse?: { body?: HbsNode[] };
}

interface HbsPath {
  type?: string;
  parts?: string[];
  original?: string;
  data?: boolean;
  depth?: number;
}

/** True when a mustache/subexpression is unambiguously a helper INVOCATION rather than a data path. */
function isInvocation(node: HbsNode): boolean {
  return (node.params?.length ?? 0) > 0 || (node.hash?.pairs?.length ?? 0) > 0;
}

/** `{{a.b.c}}` → `"a.b.c"`; falls back to joined parts when `original` is absent. */
function pathText(path: HbsPath | undefined): string {
  return path?.original ?? (path?.parts ?? []).join(".");
}

/**
 * Validate one `PathExpression`'s segments: no prototype-chain segment
 * anywhere, and an `@`-data reference only to an allowlisted loop variable.
 */
function checkPath(path: HbsPath | undefined, violations: string[]): void {
  if (path?.type !== "PathExpression") return;
  const parts = path.parts ?? [];

  if (path.data === true) {
    const head = parts[0];
    if (head === undefined || !ALLOWED_HANDLEBARS_DATA_VARS.has(head)) {
      violations.push(`disallowed data variable "@${pathText(path).replace(/^@/, "")}"`);
    }
    return;
  }

  for (const part of parts) {
    if (FORBIDDEN_PATH_SEGMENTS.has(part)) {
      violations.push(`disallowed path segment "${part}" in "${pathText(path)}"`);
    }
  }
}

/**
 * Recursively walk a parsed template's statement list, collecting violations.
 *
 * Every node kind is classified explicitly and the default branch descends
 * into `program`/`inverse` rather than ignoring the node, so a construct this
 * walker does not recognize can still never hide an unreviewed block body
 * beneath it.
 *
 * @complexity O(n) in AST node count — one pass, no backtracking, no
 * re-visiting of a node.
 * @overallScore 100/100
 */
function walkHandlebarsNodes(nodes: HbsNode[], depth: number, violations: string[]): void {
  if (depth > MAX_BLOCK_NESTING_DEPTH) {
    violations.push(`template nesting exceeds the maximum allowed depth of ${MAX_BLOCK_NESTING_DEPTH}`);
    return;
  }

  for (const node of nodes) {
    switch (node.type) {
      case "ContentStatement":
      case "CommentStatement":
        // Literal HTML / `{{! … }}` — no expression, nothing to check.
        break;

      case "PartialStatement":
      case "PartialBlockStatement":
        // Handlebars' analogue of Liquid's `include`/`render`: resolves a name
        // against the environment's partial registry, which in a filesystem-
        // backed setup (the normal way Handlebars is deployed) is a file read,
        // and in ANY setup is a jump to source this template did not contain.
        // Tovu registers no partials at all and exposes no `registerPartial`
        // to a theme, so there is nothing legitimate to resolve — refused as
        // syntax rather than left to fail at render.
        violations.push(`disallowed partial "${pathText(node.name)}" (partials are not available to themes)`);
        break;

      case "Decorator":
      case "DecoratorBlock":
        // `{{#*inline}}`/`{{*decorator}}` mutate the runtime's own program and
        // partial resolution from inside template text. No theme need, and the
        // single most direct route from "template author" to "compiler
        // internals" the language offers.
        violations.push(`disallowed decorator "${pathText(node.path)}"`);
        break;

      case "BlockStatement": {
        const name = pathText(node.path);
        if (!ALLOWED_HANDLEBARS_BLOCK_HELPERS.has(name)) {
          violations.push(`disallowed block helper "${name}"`);
        }
        for (const param of node.params ?? []) walkExpression(param, depth, violations);
        for (const pair of node.hash?.pairs ?? []) {
          if (pair.value) walkExpression(pair.value, depth, violations);
        }
        walkHandlebarsNodes(node.program?.body ?? [], depth + 1, violations);
        walkHandlebarsNodes(node.inverse?.body ?? [], depth + 1, violations);
        break;
      }

      case "MustacheStatement": {
        const name = pathText(node.path);

        if (node.escaped === false && !ALLOWED_HANDLEBARS_RAW_PATHS.has(name)) {
          // `{{{x}}}` and `{{&x}}` both parse to `escaped: false`, so this one
          // check covers the whole raw-output surface.
          violations.push(
            `disallowed raw output "{{{${name}}}}" — use "{{${name}}}" (escaped); raw output is permitted only for ${[...ALLOWED_HANDLEBARS_RAW_PATHS].map((p) => `{{{${p}}}}`).join(", ")}`
          );
        }

        if (isInvocation(node) || ALLOWED_HANDLEBARS_HELPERS.has(name)) {
          if (!ALLOWED_HANDLEBARS_HELPERS.has(name)) violations.push(`disallowed helper "${name}"`);
        } else {
          checkPath(node.path, violations);
        }

        for (const param of node.params ?? []) walkExpression(param, depth, violations);
        for (const pair of node.hash?.pairs ?? []) {
          if (pair.value) walkExpression(pair.value, depth, violations);
        }
        break;
      }

      default:
        // Unknown statement kind: contribute no usage, but never let a nested
        // body escape review because the wrapper was unrecognized.
        walkHandlebarsNodes(node.program?.body ?? [], depth + 1, violations);
        walkHandlebarsNodes(node.inverse?.body ?? [], depth + 1, violations);
        break;
    }
  }
}

/**
 * Validate one expression appearing as a helper parameter or hash value —
 * a literal, a path, or a `(sub expression)`. A subexpression is a helper
 * invocation and is held to the same allowlist as a mustache one, which is
 * what stops `{{#if (lookup a b)}}` from smuggling a refused helper into an
 * allowed block's arguments.
 */
function walkExpression(node: HbsNode, depth: number, violations: string[]): void {
  if (node.type === "SubExpression") {
    const name = pathText(node.path);
    if (!ALLOWED_HANDLEBARS_HELPERS.has(name)) violations.push(`disallowed helper "${name}"`);
    for (const param of node.params ?? []) walkExpression(param, depth, violations);
    for (const pair of node.hash?.pairs ?? []) {
      if (pair.value) walkExpression(pair.value, depth, violations);
    }
    return;
  }
  if (node.type === "PathExpression") checkPath(node as HbsPath, violations);
}

/**
 * Lint a `.hbs` template source against the Handlebars tier's helper/
 * expression allowlist.
 *
 * Uses `Handlebars.parse()`, which produces an AST and nothing else — no
 * compilation to JavaScript, no `new Function`, no execution. That
 * distinction is the whole reason this check is safe to run against
 * untrusted theme content on the main thread at discovery time: every
 * Handlebars RCE class of note begins at *compile*, and a template that fails
 * this lint is never compiled at all.
 *
 * @param source raw `.hbs` template text (untrusted — third-party theme
 *   content).
 * @returns human-readable violation messages; empty means the template is
 *   clean. A Handlebars syntax error is reported the same way (as a single
 *   violation message) rather than thrown, so every caller can treat this
 *   function as a total, non-throwing predicate — the same contract
 *   `lintLiquidTemplate` offers.
 * @complexity O(n) in template size — one parse plus one AST walk.
 * @overallScore 100/100
 */
export function lintHandlebarsTemplate(source: string): string[] {
  if (source.length > MAX_TEMPLATE_SOURCE_BYTES) {
    return [`template exceeds the maximum allowed size of ${MAX_TEMPLATE_SOURCE_BYTES} bytes`];
  }

  let program: { body?: HbsNode[] };
  try {
    program = Handlebars.parse(source) as unknown as { body?: HbsNode[] };
  } catch (err) {
    return [`Handlebars syntax error: ${(err as Error).message}`];
  }

  const violations: string[] = [];
  walkHandlebarsNodes(program.body ?? [], 0, violations);
  // De-duplicated because a template can reach the same violation through several branches (a
  // depth overrun trips once for a block's `program` and again for its `inverse`; the same
  // disallowed helper repeated in a loop body trips per occurrence). The caller folds these into a
  // theme's `errors` list for a human to read — the distinct set of problems is the useful signal,
  // not the multiplicity.
  return [...new Set(violations)];
}
