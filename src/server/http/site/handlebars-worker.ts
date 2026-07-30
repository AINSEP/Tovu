import { parentPort, workerData } from "node:worker_threads";
import Handlebars from "handlebars";

import type { JsonObject } from "../../../core/ports";
import { lintHandlebarsTemplate } from "../../../features/theme";
import { buildTemplateRenderData, renderBlockSeam, type SiteRenderContext } from "./render";
import type { HandlebarsWorkerInput, HandlebarsWorkerResult } from "./handlebars-sandbox";

/**
 * @file `worker_threads` entry point that actually compiles and runs Handlebars
 * (ADR-020 Tier 2, Handlebars tier). Never imported statically —
 * `handlebars-sandbox.ts` spawns it by file path via `new Worker(...)`, so this
 * module only ever executes inside an isolated worker thread, bounded by the
 * caller's timeout and `resourceLimits`. The counterpart of `liquid-worker.ts`.
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
 *    `liquid-worker.ts`'s `NO_ACCESS_FS`) is the partial registry, which in a
 *    conventional Handlebars deployment IS backed by files. Tovu registers no
 *    partials, so any partial resolution at all is by definition unauthorized,
 *    and the proxy makes that fail loudly rather than silently rendering empty.
 *
 * 4. The module's `require.extensions` hooks removed. Verified by reading
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

if (!parentPort) {
  throw new Error("handlebars-worker.ts must run inside a worker_threads Worker");
}

// Hardening 4 (see file header): drop the package's own `.hbs`/`.handlebars`
// `require()` hooks, which are the only `fs` touch anywhere in the Handlebars
// runtime. Guarded because `require.extensions` is absent under a pure-ESM
// entry point.
if (typeof require !== "undefined" && require.extensions) {
  delete require.extensions[".hbs"];
  delete require.extensions[".handlebars"];
}

/** Hardening 1: an environment private to this worker thread. */
const env = Handlebars.create();

// Hardening 2: strip the two built-ins the allowlist refuses, so the running
// engine's helper set matches the reviewed one even if the lint never ran.
env.unregisterHelper("log");
env.unregisterHelper("lookup");

/**
 * Hardening 3: reports every partial name as unavailable, loudly. Every read
 * goes through this and fails closed — the Handlebars analogue of
 * `liquid-worker.ts`'s `NO_ACCESS_FS`.
 */
const NO_ACCESS_PARTIALS = new Proxy(Object.create(null) as Record<string, unknown>, {
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

function reply(result: HandlebarsWorkerResult): void {
  parentPort!.postMessage(result);
}

function main(): void {
  if (!isHandlebarsWorkerInput(workerData)) {
    reply({ ok: false, error: "handlebars-worker received malformed workerData" });
    return;
  }
  const { source, ctx } = workerData;

  // Defensive re-check (belt-and-suspenders): `loadTheme()` already linted this
  // source at discovery time; re-lint here in case the file changed on disk
  // since. Deliberately unconditional — unlike the Liquid tier, this one has no
  // `skipLiquidAllowlist`-style opt-out to honor (see `ThemeManifest`).
  const violations = lintHandlebarsTemplate(source);
  if (violations.length > 0) {
    reply({ ok: false, error: `disallowed Handlebars usage: ${violations.join("; ")}` });
    return;
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
  env.registerHelper("render_block", function renderBlockHelper(options: { hash?: Record<string, unknown> }) {
    return new env.SafeString(renderBlockSeam(siteCtx, (options?.hash ?? {}) as JsonObject));
  });

  try {
    const template = env.compile(source, COMPILE_OPTIONS);
    const html = template(buildTemplateRenderData(siteCtx), RUNTIME_OPTIONS);
    reply({ ok: true, html });
  } catch (err) {
    reply({ ok: false, error: (err as Error).message });
  }
}

main();
