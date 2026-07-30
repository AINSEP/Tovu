import { parentPort, workerData } from "node:worker_threads";
import { Liquid, Hash, type TagToken, type Context, type FS } from "liquidjs";

import type { JsonObject } from "../../../core/ports";
import { lintLiquidTemplate } from "../../../features/theme";
import { COMPONENTS, escapeHtml, renderDocNode, renderWidgetRegion, type SiteRenderContext } from "./render";
import type { LiquidWorkerInput, LiquidWorkerResult } from "./liquid-sandbox";

/**
 * @file `worker_threads` entry point that actually runs LiquidJS
 * (ADR-020 Tier 2). Never imported statically — `liquid-sandbox.ts` spawns
 * it by file path via `new Worker(...)`, so this module only ever executes
 * inside an isolated worker thread, bounded by the caller's timeout and
 * `resourceLimits`.
 *
 * Purpose:
 * Owns the Liquid engine construction, the `render_block` custom tag (the
 * seam back into Tovu's trusted component registry — `COMPONENTS`, imported
 * from `render.ts`), and the render-time data shaping that used to live in
 * `render.ts`'s in-process `renderLiquidBody`. Runs a second, defensive
 * allowlist check (`lintLiquidTemplate`) immediately before rendering, in
 * case a template changed on disk after `loadTheme()` validated it.
 *
 * Filesystem hardening: LiquidJS's *default* engine config is not
 * filesystem-inert — verified empirically, `new Liquid()` with no explicit
 * `fs` option reads real files relative to `root: ["."]`. The tag allowlist
 * (`lintLiquidTemplate`) already blocks the only tags that can trigger a
 * file read (`include`/`render`/`layout`/`block`), but this engine is also
 * constructed with an explicit `fs` adapter whose every method reports "not
 * found" — a second, redundant guarantee that holds even if the allowlist
 * had a gap.
 */

if (!parentPort) {
  throw new Error("liquid-worker.ts must run inside a worker_threads Worker");
}

/** Reports every path as absent; every LiquidJS `fs` read goes through this and fails closed. */
const NO_ACCESS_FS: FS = {
  exists: async () => false,
  existsSync: () => false,
  readFile: async (filepath: string) => {
    throw new Error(`filesystem access disabled for theme templates: ${filepath}`);
  },
  readFileSync: (filepath: string) => {
    throw new Error(`filesystem access disabled for theme templates: ${filepath}`);
  },
  resolve: (_dir: string, file: string) => file,
  dirname: () => "",
  sep: "/",
};

/** Key under which the live render context is passed to the `render_block` tag. */
const CTX_KEY = "__siteCtx";

const liquid = new Liquid({
  outputEscape: "escape",
  strictVariables: false,
  strictFilters: false,
  jsTruthy: true,
  cache: false,
  fs: NO_ACCESS_FS,
  // AW-5a C6 hardening follow-up (2026-07-16 audit finding, Fable): LiquidJS's own DoS knobs
  // (`memoryLimit`/`renderLimit`/`parseLimit`) had no defaults set, so an unbounded numeric range
  // (e.g. `(1..999999999)`) could allocate a large array *within* the worker's V8 heap
  // (`resourceLimits.maxOldGenerationSizeMb: 64`) before that ceiling ever triggers — a low-severity
  // sandbox bypass the process-crash fix's `worker_threads` isolation already contained (a runaway
  // render only OOM-kills its own disposable worker), but this closes it at the LiquidJS layer too,
  // as defense-in-depth ahead of ever reaching the V8-level ceiling.
  memoryLimit: 5_000_000,
  renderLimit: 5_000,
  parseLimit: 1_000_000,
});

liquid.registerTag("render_block", {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parse(this: any, token: TagToken) {
    this.hash = new Hash(token.args);
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  *render(this: any, ctx: Context): Generator<unknown, string, unknown> {
    const props = (yield this.hash.render(ctx)) as JsonObject;
    const siteCtx = ctx.getSync([CTX_KEY]) as SiteRenderContext | undefined;
    if (!siteCtx) return `<!-- render_block: no site context -->`;

    // SPEC-043/ADR-047 §2a W-004: `{% render_block region: "footer" %}` — a theme-declared widget
    // region, resolved over the SAME seam as `component:` (ADR-047 §2a: "no new Liquid capability
    // required" — a region is a `render_block` call over a resolved, ordered widget list instead of
    // a single component). Checked first since `region`/`component` are mutually exclusive tag args.
    if (typeof props.region === "string") {
      return renderWidgetRegion({ ctx: siteCtx, regionKey: props.region });
    }

    const id = typeof props.component === "string" ? props.component : "";
    const { component: _component, ...rest } = props;
    void _component;
    const component = COMPONENTS[id];
    if (!component) return `<!-- unknown component: ${escapeHtml(id)} -->`;
    return component(siteCtx, rest);
  },
});

/** Shapes the plain Liquid render context from a `SiteRenderContext`, matching the pre-worker `renderLiquidBody`'s data contract exactly. */
function buildLiquidData(ctx: SiteRenderContext): Record<string, unknown> {
  return {
    site: { title: ctx.siteTitle },
    theme: { name: ctx.themeName },
    route: ctx.route,
    posts: ctx.posts.map((p) => ({ title: p.title, slug: p.slug, date: p.updatedAt })),
    // `content` is pre-sanitized HTML; templates emit it with `| raw`.
    post: ctx.post
      ? { title: ctx.post.title, slug: ctx.post.slug, date: ctx.post.updatedAt, content: renderDocNode(ctx.post.bodyJson, ctx.widgetInlineResolved) }
      : null,
    [CTX_KEY]: ctx,
  };
}

function isLiquidWorkerInput(value: unknown): value is LiquidWorkerInput {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { source?: unknown }).source === "string" &&
    typeof (value as { ctx?: unknown }).ctx === "object"
  );
}

function reply(result: LiquidWorkerResult): void {
  parentPort!.postMessage(result);
}

function main(): void {
  if (!isLiquidWorkerInput(workerData)) {
    reply({ ok: false, error: "liquid-worker received malformed workerData" });
    return;
  }
  const { source, ctx } = workerData;

  // Defensive re-check (belt-and-suspenders): `loadTheme()` already linted
  // this source at discovery time; re-lint here in case the file changed on
  // disk since.
  const violations = lintLiquidTemplate(source);
  if (violations.length > 0) {
    reply({ ok: false, error: `disallowed Liquid usage: ${violations.join("; ")}` });
    return;
  }

  try {
    const html = liquid.parseAndRenderSync(source, buildLiquidData(ctx));
    reply({ ok: true, html });
  } catch (err) {
    reply({ ok: false, error: (err as Error).message });
  }
}

main();
