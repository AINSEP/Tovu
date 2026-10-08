import { Liquid, Hash, type TagToken, type Context, type FS } from "liquidjs";

import type { JsonObject } from "@jini-ai/core/primitives";
import { lintLiquidTemplate } from "#src/features/theme/liquid-allowlist";
import {
  buildTemplateRenderData,
  renderBlockSeam,
  RENDER_CTX_KEY,
  type SiteRenderContext,
} from "./render.js";
import type { LiquidWorkerInput, LiquidWorkerResult } from "./liquid-sandbox.js";

/**
 * @file The Liquid engine and the render logic `liquid-worker.ts` runs (ADR-020 Tier 2). Split out
 * of the worker entry so the logic is importable: the entry only checks it is inside a
 * `worker_threads` Worker and posts this module's result back, while the V8 coverage of the worker
 * thread itself is suppressed by design (`worker-sandbox.test.ts`). Only ever loaded on the main
 * thread by tests; production loads it inside the isolated worker via `liquid-worker.ts`.
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

/** Reports every path as absent; every LiquidJS `fs` read goes through this and fails closed. */
export const NO_ACCESS_FS: FS = {
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
    const siteCtx = ctx.getSync([RENDER_CTX_KEY]) as SiteRenderContext | undefined;
    if (!siteCtx) return `<!-- render_block: no site context -->`;

    // SPEC-043/ADR-047 §2a W-004: `{% render_block region: "footer" %}` — a theme-declared widget
    // region, resolved over the SAME seam as `component:` (ADR-047 §2a: "no new Liquid capability
    // required" — a region is a `render_block` call over a resolved, ordered widget list instead of
    // a single component). `renderBlockSeam` (render.ts) owns that resolution and is shared with the
    // Handlebars tier's own `render_block` helper.
    return renderBlockSeam(siteCtx, props);
  },
});

/** The shared cross-tier data contract (`render.ts`'s `buildTemplateRenderData`) plus the private
 * context handle the `render_block` tag reads back out of the render scope. */
function buildLiquidData(ctx: SiteRenderContext): Record<string, unknown> {
  return { ...buildTemplateRenderData(ctx), [RENDER_CTX_KEY]: ctx };
}

function isLiquidWorkerInput(value: unknown): value is LiquidWorkerInput {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { source?: unknown }).source === "string" &&
    typeof (value as { ctx?: unknown }).ctx === "object"
  );
}

/**
 * Run one sandboxed Liquid render from the worker's `workerData`. Pure apart from the module-level
 * engine: never touches `parentPort`, so `liquid-worker.ts` stays a thin message shim and this
 * logic is importable (and measurable) in-process.
 * @param input.workerData The structured-clone payload the sandbox sent; validated here, not trusted.
 * @returns The reply the worker posts back: rendered HTML, or a controlled error message.
 * @complexity O(n) in template size plus the render itself (bounded by the engine's DoS limits).
 */
export function runLiquidRender({ workerData }: { workerData: unknown }): LiquidWorkerResult {
  if (!isLiquidWorkerInput(workerData)) {
    return { ok: false, error: "liquid-worker received malformed workerData" };
  }
  const { source, ctx } = workerData;

  // Defensive re-check (belt-and-suspenders): `loadTheme()` already linted
  // this source at discovery time; re-lint unconditionally here in case the
  // file changed on disk since. No worker payload may bypass this boundary.
  const violations = lintLiquidTemplate(source);
  if (violations.length > 0) {
    return { ok: false, error: `disallowed Liquid usage: ${violations.join("; ")}` };
  }

  try {
    const html = liquid.parseAndRenderSync(source, buildLiquidData(ctx));
    return { ok: true, html };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
