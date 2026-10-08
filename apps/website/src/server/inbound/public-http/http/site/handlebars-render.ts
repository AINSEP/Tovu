import Handlebars from "handlebars";

import type { JsonObject } from "@jini-ai/core/primitives";
import { lintHandlebarsTemplate } from "#src/features/theme/handlebars-allowlist";
import { buildTemplateRenderData, renderBlockSeam, type SiteRenderContext } from "./render.js";
import type { HandlebarsWorkerInput, HandlebarsWorkerResult } from "./handlebars-sandbox.js";

/**
 * @file The Handlebars environment and the render logic `handlebars-worker.ts` runs (ADR-020
 * Tier 2, Handlebars tier). Split out of the worker entry so the logic is importable: the entry
 * only checks it is inside a `worker_threads` Worker, drops the package's `require.extensions`
 * hooks (hardening 4, a process-global side effect that belongs to the worker thread alone) and
 * posts this module's result back; the worker thread's own V8 coverage is suppressed by design
 * (`worker-sandbox.test.ts`). Only ever loaded on the main thread by tests; production loads it
 * inside the isolated worker via `handlebars-worker.ts`. The counterpart of `liquid-render.ts`.
 *
 * Purpose:
 * Owns the Handlebars environment construction, the `render_block` helper (the
 * seam back into Tovu's trusted component registry, shared with the Liquid tier
 * via `render.ts`'s `renderBlockSeam`), and the render-time data shaping (also
 * shared, via `buildTemplateRenderData`). Runs a second, defensive allowlist
 * check (`lintHandlebarsTemplate`) immediately before compiling, in case a
 * template changed on disk after `loadTheme()` validated it.
 *
 * The four hardening decisions this file makes, and why each is here rather
 * than assumed:
 *
 * 1. `Handlebars.create()`, not the default export's shared environment.
 *    `Handlebars.registerHelper` on the module singleton mutates process-global
 *    state that every other consumer of the module sees. An isolated
 *    environment means the helper set this tier exposes is exactly what is
 *    registered below and cannot be widened from anywhere else — which is what
 *    lets `handlebars-allowlist.ts` state a *closed* helper allowlist rather
 *    than a "currently registered" one.
 *
 * 2. No theme-facing `registerHelper`/`registerPartial` surface at all, and the
 *    built-in `log` and `lookup` helpers removed. `log` performs console I/O
 *    from template text; `lookup` reads a property by a runtime-computed key,
 *    defeating static review of what a template can reach. Both are refused by
 *    the allowlist at load time; removing them here is the second layer that
 *    holds even if the lint were bypassed.
 *
 * 3. Partials locked to a throwing proxy. Handlebars has no filesystem-reading
 *    tag — its analogue of Liquid's `include`/`render` (and therefore of
 *    `liquid-render.ts`'s `NO_ACCESS_FS`) is the partial registry, which in a
 *    conventional Handlebars deployment IS backed by files. Tovu registers no
 *    partials, so any partial resolution at all is by definition unauthorized,
 *    and the proxy makes that fail loudly rather than silently rendering empty.
 *
 * 4. The module's `require.extensions` hooks removed (done by `handlebars-worker.ts`). Verified by reading
 *    `handlebars/lib/index.js`: importing the package installs Node
 *    `require.extensions['.hbs'] / ['.handlebars']` handlers that read a file
 *    off disk with `fs.readFileSync` and precompile it. Nothing in template
 *    text can reach them, so this is not a hole being plugged — it is the
 *    honest completion of the same "this thread holds no filesystem capability
 *    it does not need" posture `NO_ACCESS_FS` states for the Liquid worker.
 *
 * Escaping: templates are compiled with `noEscape` at its default `false` — the
 * direct counterpart of the Liquid engine's `outputEscape: "escape"`. Every
 * `{{expression}}` is HTML-escaped; `{{{triple-stash}}}` is refused by the
 * allowlist for every path except `post.content`, which is server-rendered,
 * pre-sanitized HTML (see `handlebars-allowlist.ts`'s own reasoning).
 */

/** Hardening 1: an environment private to this worker thread. */
const env = Handlebars.create();

// Hardening 2: strip the two built-ins the allowlist refuses, so the running
// engine's helper set matches the reviewed one even if the lint never ran.
env.unregisterHelper("log");
env.unregisterHelper("lookup");

/**
 * Hardening 3: reports every partial name as unavailable, loudly. Every read
 * goes through this and fails closed — the Handlebars analogue of
 * `liquid-render.ts`'s `NO_ACCESS_FS`.
 */
export const NO_ACCESS_PARTIALS = new Proxy(Object.create(null) as Record<string, unknown>, {
  get(_target, name) {
    throw new Error(`partials are disabled for theme templates: ${String(name)}`);
  },
  has: () => false,
  ownKeys: () => [],
});
// `partials` is typed readonly by `@types/handlebars` (it is a plain, writable property at runtime —
// `registerPartial` assigns into it). Replacing the whole registry rather than emptying it is the
// point: an empty object would still resolve `partials["constructor"]` up the Object prototype.
(env as unknown as { partials: unknown }).partials = NO_ACCESS_PARTIALS;

/**
 * Compile options. `knownHelpersOnly` is the compiler-level twin of the
 * allowlist: any name NOT in `knownHelpers` compiles as a plain context-path
 * lookup instead of a helper invocation, so an unreviewed helper cannot be
 * called even if one were somehow registered. `log`/`lookup` are explicitly
 * switched off because Handlebars seeds `knownHelpers` with its own built-in
 * set and merges the caller's on top rather than replacing it.
 */
const COMPILE_OPTIONS = {
  noEscape: false,
  strict: false,
  knownHelpersOnly: true,
  knownHelpers: {
    each: true,
    if: true,
    unless: true,
    with: true,
    render_block: true,
    log: false,
    lookup: false,
  },
} as const;

/**
 * Runtime options. Both proto flags are Handlebars 4.6+ defaults; set
 * explicitly so a future default change (or a transitive version bump) cannot
 * silently re-open prototype access, which is the runtime half of the guarantee
 * `handlebars-allowlist.ts`'s `FORBIDDEN_PATH_SEGMENTS` makes statically.
 */
const RUNTIME_OPTIONS = {
  allowProtoPropertiesByDefault: false,
  allowProtoMethodsByDefault: false,
} as const;

function isHandlebarsWorkerInput(value: unknown): value is HandlebarsWorkerInput {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { source?: unknown }).source === "string" &&
    typeof (value as { ctx?: unknown }).ctx === "object"
  );
}

/**
 * Run one sandboxed Handlebars render from the worker's `workerData`. Never touches `parentPort`,
 * so `handlebars-worker.ts` stays a thin message shim and this logic is importable (and measurable)
 * in-process.
 * @param input.workerData The structured-clone payload the sandbox sent; validated here, not trusted.
 * @param options.lint The defensive re-lint; defaults to the real allowlist. A port so a test can
 *   switch it off and prove hardenings 1-3 hold on their own, as the file header claims.
 * @returns The reply the worker posts back: rendered HTML, or a controlled error message.
 * @complexity O(n) in template size plus the compiled template's own run time.
 */
export function runHandlebarsRender(
  { workerData }: { workerData: unknown },
  { lint = lintHandlebarsTemplate }: { lint?: (source: string) => string[] } = {},
): HandlebarsWorkerResult {
  if (!isHandlebarsWorkerInput(workerData)) {
    return { ok: false, error: "handlebars-worker received malformed workerData" };
  }
  const { source, ctx } = workerData;

  // Defensive re-check (belt-and-suspenders): `loadTheme()` already linted this
  // source at discovery time; re-lint here in case the file changed on disk
  // since. Unconditional in both template tiers: publisher flags must never
  // re-open the XSS/compiler-object seams this lint rejects.
  const violations = lint(source);
  if (violations.length > 0) {
    return { ok: false, error: `disallowed Handlebars usage: ${violations.join("; ")}` };
  }

  // The `render_block` seam is registered per render, closed over THIS render's
  // context. That is a deliberate divergence from the Liquid tier, which has to
  // smuggle the context through the render scope under a reserved key
  // (`RENDER_CTX_KEY`) because a LiquidJS tag can only reach it that way. A
  // Handlebars helper closure needs no such key, so the live `SiteRenderContext`
  // is never placed anywhere a template could name at all — strictly less
  // exposed than the Liquid tier, not merely equivalent. Safe because a worker
  // serves exactly one render and then exits.
  const siteCtx: SiteRenderContext = ctx;
  env.registerHelper("render_block", function renderBlockHelper(options: { hash: Record<string, unknown> }) {
    return new env.SafeString(renderBlockSeam(siteCtx, options.hash as JsonObject));
  });

  try {
    const template = env.compile(source, COMPILE_OPTIONS);
    const html = template(buildTemplateRenderData(siteCtx), RUNTIME_OPTIONS);
    return { ok: true, html };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
