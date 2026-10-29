/**
 * ADR-020: Tovu theme budgets and worker paths over @jini-ai/sandbox/node-worker.
 * A main-thread Promise.race cannot interrupt synchronous template work. A fresh Node
 * worker gives the parent a termination boundary and V8 heap limits without a native
 * sandbox dependency or vm2's known escape problems. Engine workers own template semantics;
 * the package owns result settlement, timeout cancellation and best-effort worker cleanup.
 */
import { fstatSync, mkdtempSync, openSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ResourceLimits } from "node:worker_threads";
import {
  createNodeWorkerFactory,
  createNodeWorkerScheduler,
  renderInWorkerSandbox as renderWithWorker,
  resolveDefaultTimeoutMs as resolveWorkerTimeout,
  type WorkerFactory,
} from "@jini-ai/sandbox/node-worker";
import type { SiteRenderContext } from "./render-context.js";
import { resolveProductRoot } from "#src/platform/site-dir/product-root";

export type { SandboxRenderResult } from "@jini-ai/sandbox/node-worker";

/** Plain structured-cloneable payload shared by the Liquid and Handlebars workers. */
export interface SandboxRenderInput {
  source: string;
  ctx: SiteRenderContext;
}

export interface SandboxOptions {
  timeoutMs?: number;
  resourceLimits?: ResourceLimits;
  /** Alternate worker effect port; Jini still owns settlement, budgets and cleanup. */
  workerFactory?: WorkerFactory;
  /** Product installation root for a relocated compiled host; otherwise resolved in the parent. */
  productRoot?: string;
}

// Share the in-flight build as well as its result: concurrent cold renders must not
// each spawn esbuild. A failed build remains rejected until this source process restarts.
let sourceWorkers: Promise<string> | undefined;

/**
 * Compile the two CMS theme entries before any bounded worker starts. Temp output has its own
 * ESM manifest and external-package lookup; it is removed on normal process exit or build failure.
 * @param required.productRoot Parent-resolved installation owning source and dependencies.
 * @returns Directory containing executable JS workers; rejects on filesystem/build errors.
 * @complexity One O(g) build for the fixed two entries' import graph g per process.
 */
async function compileSourceWorkers({ productRoot }: { productRoot: string }): Promise<string> {
  // Detached hosts may close stdin. Reserve fd 0 before esbuild opens a pipe there:
  // libuv refuses to close a pipe whose descriptor is in the stdio range.
  // `bigint: true` keeps fd 0's mode out of Node's shared Float64 stat buffer: realpathSync reads
  // that buffer for cached path parts, so a piped stdin's FIFO mode made later CJS requires stop
  // following symlinks (pnpm-linked argon2 then could not find `@phc/format`).
  try { fstatSync(0, { bigint: true }); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EBADF") throw error;
    openSync("/dev/null", "r");
  }
  const outdir = mkdtempSync(path.join(tmpdir(), "tovu-theme-workers-"));
  try {
    writeFileSync(path.join(outdir, "package.json"), '{"type":"module"}');
    symlinkSync(path.join(productRoot, "node_modules"), path.join(outdir, "node_modules"), "dir");
    // Not a literal specifier on purpose: only a `.ts` source host reaches this function (see
    // `isTsSource` below), and the desktop payload ships no esbuild. A literal `import("esbuild")`
    // made the packaging check (apps/desktop/src/dist-import-check.ts) refuse the compiled server,
    // which never runs this line.
    const esbuildSpecifier = "esbuild";
    const { build }: typeof import("esbuild") = await import(esbuildSpecifier);
    await build({
      entryPoints: ["handlebars-worker.ts", "liquid-worker.ts"].map((file) => path.join(import.meta.dirname, file)),
      outdir, bundle: true, platform: "node", format: "esm", packages: "external",
      plugins: [{ name: "tovu-source-imports", setup(build) {
        build.onResolve({ filter: /^#src\// }, (args) => ({ path: path.join(productRoot, "apps/website/src", `${args.path.slice(5)}.ts`) }));
      } }],
    });
    process.once("exit", () => rmSync(outdir, { recursive: true, force: true }));
    return outdir;
  } catch (error) {
    rmSync(outdir, { recursive: true, force: true });
    throw error;
  }
}
/**
 * A visitor must not wait beyond 5s for a runaway theme; load-scaled defaults would
 * weaken that guard exactly when the server is busiest. TOVU_THEME_RENDER_TIMEOUT_MS is
 * an explicit opt-in for slow VPS hosts and saturated CI, not a higher shared default.
 * The original CI incident ran seven agents on eight cores at load 135: a roughly 50ms
 * idle template falsely exceeded 5000ms, yet its test file passed alone. Explicit test
 * budgets (500ms termination, 15000ms memory failure) avoid depending on this default.
 */
const DEFAULT_RENDER_TIMEOUT_MS = 5_000;
// Five minutes exceeds legitimate slow-VPS rendering but stays finite; an absurd timeout
// defeats the runaway-theme guard as surely as a zero one.
const MAX_RENDER_TIMEOUT_MS = 300_000;
const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
  maxOldGenerationSizeMb: 64,
  maxYoungGenerationSizeMb: 16,
  codeRangeSizeMb: 16,
};

/**
 * Resolve Tovu's live timeout configuration without freezing the environment at module load.
 * @returns A positive render budget, falling back to 5s for invalid values or values above 5min.
 * @complexity O(n) for n characters in the configured value.
 */
export function resolveDefaultTimeoutMs(): number {
  return resolveWorkerTimeout({
    rawValue: process.env.TOVU_THEME_RENDER_TIMEOUT_MS,
    defaultTimeoutMs: DEFAULT_RENDER_TIMEOUT_MS,
    maxTimeoutMs: MAX_RENDER_TIMEOUT_MS,
  });
}

/**
 * Liquid and Handlebars share this lifecycle machinery to prevent duplicated timeout
 * policy from drifting between engines. Their workers still own their template semantics.
 * Input must already be plain structured-cloneable site data. A rejected render is handled
 * by renderSite with a minimal built-in body (SPEC-004 REQ-10): a hostile theme must not 500
 * the site. ADR-020 bounds both CPU time and worker heap use.
 *
 * Render with Tovu's sibling worker entry and heap budgets, retaining engine caller contracts.
 * Source entries are compiled once in the parent; every render starts plain JS without tsx.
 * Bundled source workers suppress coverage because their image differs from the parent's source.
 * @param workerBasename Worker path relative to this module, without an extension.
 * @param errorLabel Engine name used in controlled render errors.
 * @param input Structured-cloneable template and site context.
 * @param options Per-render budgets, worker port and relocated-host product root override.
 * @returns Rendered HTML.
 * @throws On timeout, worker failure, invalid reply or rejected template; renderSite handles fallback.
 * @complexity O(e) environment copying for e variables, plus one cold source build; excludes rendering.
 */
export async function renderInWorkerSandbox(
  workerBasename: string,
  errorLabel: string,
  input: SandboxRenderInput,
  options: SandboxOptions = {},
): Promise<string> {
  const isTsSource = import.meta.filename.endsWith(".ts");
  const productRoot = options.productRoot ?? resolveProductRoot();
  const isThemeWorker = workerBasename === "handlebars-worker" || workerBasename === "liquid-worker";
  let workerDir = import.meta.dirname;
  if (isTsSource && isThemeWorker) {
    sourceWorkers ??= compileSourceWorkers({ productRoot });
    workerDir = await sourceWorkers;
  }
  const env = { ...process.env };
  if (isTsSource) delete env.NODE_V8_COVERAGE;
  const workerFactory = options.workerFactory ?? createNodeWorkerFactory({ env });
  return renderWithWorker({
    workerEntry: path.join(workerDir, `${workerBasename}.js`),
    // Static imports in a relocated worker resolve stock content during module evaluation,
    // before its entry can run. Pass the root as workerData rather than walking from temp JS.
    input: { ...input, productRoot },
    errorLabel,
    defaultTimeoutMs: resolveDefaultTimeoutMs(),
    defaultResourceLimits: DEFAULT_RESOURCE_LIMITS,
    workerFactory,
    scheduler: createNodeWorkerScheduler({}),
  }, options);
}
