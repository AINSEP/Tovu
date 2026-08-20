# Refactor Proposal: extract shared worker-sandbox machinery from `liquid-sandbox.ts` / `handlebars-sandbox.ts`

- **Type:** Duplication (near-identical code across two files)
- **Priority:** Medium — not urgent (no bug forcing it), but both files carry a genuine drift risk documented in §4
- **Author:** Refactor agent, PROPOSE-ONLY mode
- **Affected files (read, not modified):**
  - `src/server/http/site/liquid-sandbox.ts` (206 lines)
  - `src/server/http/site/handlebars-sandbox.ts` (196 lines)
  - `src/server/http/site/liquid-worker.ts`, `src/server/http/site/handlebars-worker.ts` (import types only, read for impact)
  - `src/server/http/site/render.ts` (the two call sites)
  - `src/server/http/site/__tests__/liquid-sandbox.test.ts`, `handlebars-sandbox.test.ts`, `sandbox-timeout-resolution.test.ts`

No files were created, edited, moved, or deleted. This report is the only file written.

---

## 1. Exactly what is duplicated

Read both files in full (`liquid-sandbox.ts:1-206`, `handlebars-sandbox.ts:1-196`). Line-level inventory:

| Region | Liquid lines | Handlebars lines | Verdict |
|---|---|---|---|
| Imports + `createRequire` shim + its comment | 1-11 | 1-11 | **Byte-identical** |
| `@file` header doc comment | 13-35 | 14-45 | Genuinely different content (Liquid vs Handlebars threat model); Handlebars' is longer (extra "why not skipped for Handlebars" section, 19-37) because it was written second and had to justify itself against the "Handlebars needs less isolation" objection. Correctly per-engine, not duplication. |
| `*WorkerInput` interface | `LiquidWorkerInput` 37-45 | `HandlebarsWorkerInput` 47-51 | **Near-identical.** Shared shape `{ source: string; ctx: SiteRenderContext }`. Liquid's has one extra field, `skipLiquidAllowlist?: boolean` (line 44), that Handlebars does not have. This is a real, load-bearing difference — see §3. |
| `*WorkerResult` type | `LiquidWorkerResult` 48 | `HandlebarsWorkerResult` 54 | **Byte-identical shape**, `{ ok: true; html: string } \| { ok: false; error: string }`, different name only. |
| `*SandboxOptions` interface | `LiquidSandboxOptions` 50-55 | `HandlebarsSandboxOptions` 56-61 | **Byte-identical shape**, `{ timeoutMs?: number; resourceLimits?: ResourceLimits }`, different name only. |
| `DEFAULT_RENDER_TIMEOUT_MS`, `MAX_RENDER_TIMEOUT_MS` | 57-58 | 63-64 | **Byte-identical values** (`5000`, `300_000`). |
| `resolveDefaultTimeoutMs()` incl. doc comment | 60-97 | 66-103 | **Byte-identical logic AND byte-identical prose**, including the incident writeup. See §4 — this identity is exactly the problem, because part of that identical prose is factually wrong in one of the two files. |
| `DEFAULT_RESOURCE_LIMITS` | 98-102 | 104-108 | **Byte-identical values** (`maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16, codeRangeSizeMb: 16`). |
| `spawn*Worker()` function body | `spawnLiquidWorker` 129-138 | `spawnHandlebarsWorker` 119-128 | **Structurally identical**, differs only in: function name, input-type name, and the two literal strings `"liquid-worker.js"/"liquid-worker.ts"` vs `"handlebars-worker.js"/"handlebars-worker.ts"`. The `tsx`-bootstrap `eval: true` trick (the genuinely gnarly part) is copied verbatim. |
| `spawn*Worker()` doc comment | 104-128 (full empirical derivation) | 110-118 (pointer: "identical to `liquid-sandbox.ts`'s `spawnLiquidWorker`... see that function's doc comment") | Handlebars' own comment **states the duplication outright** — this is the one place the code already admits it, which is what the dispatch brief quoted. |
| `render*InSandbox()` doc comment | 140-160 | 130-150 | Per-engine content in the `@throws` clause (Liquid: "disallowed tag/filter"; Handlebars: "disallowed helper/partial/raw-output") — correctly different, not duplication. |
| `render*InSandbox()` function body | `renderLiquidInSandbox` 161-206 | `renderHandlebarsInSandbox` 151-196 | **Structurally identical**: same `timeoutMs`/`resourceLimits` resolution, same `Promise` wrapper, same `settled`/`finish` guard, same `setTimeout` + `worker.terminate()`, same `once("message"/"error"/"exit")` wiring. Differs only in: function name, input/options/message type names, the `spawn*Worker` call, and two literal strings (`"Liquid render exceeded..."`/`"Liquid render worker exited..."` vs `"Handlebars render exceeded..."`/`"Handlebars render worker exited..."`). |

**Bottom line:** of the ~200 lines in each file, roughly 140-150 are either byte-identical or identical-modulo-name-substitution. The genuinely per-engine content is: the two `@file` header comments, the `@throws` prose in `render*InSandbox`'s doc comment, and the one extra field on `LiquidWorkerInput`.

## 2. Proposed seam

New sibling module, same directory (rationale for location in §6):

**`src/server/http/site/worker-sandbox.ts`**

```ts
// Exported — the truly shared surface
export interface SandboxRenderInput {
  source: string;
  ctx: SiteRenderContext;
}
export type SandboxRenderResult = { ok: true; html: string } | { ok: false; error: string };
export interface SandboxOptions {
  timeoutMs?: number;
  resourceLimits?: ResourceLimits;
}

export function resolveDefaultTimeoutMs(): number { /* moved verbatim, ONE copy, ONE comment */ }

// Internal — not exported, callers never construct a Worker directly
const DEFAULT_RESOURCE_LIMITS: ResourceLimits = { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16, codeRangeSizeMb: 16 };
function spawnSandboxWorker(workerBasename: string, workerData: unknown, resourceLimits: ResourceLimits): Worker { /* moved verbatim, basename parameterized */ }

// The extracted run loop. `errorLabel` supplies the two engine-specific words
// in the existing error strings ("Liquid render exceeded..." / "Handlebars
// render exceeded...") so callers' thrown-error text is unchanged byte-for-byte.
export function renderInWorkerSandbox(
  workerBasename: string,
  errorLabel: string,
  input: SandboxRenderInput,
  options: SandboxOptions = {}
): Promise<string> { /* moved verbatim run loop */ }
```

Both callers become thin wrappers that keep their own public names, types, and doc comments — **nothing importing `liquid-sandbox.ts` or `handlebars-sandbox.ts` today has to change**:

```ts
// liquid-sandbox.ts, post-extraction
export interface LiquidWorkerInput extends SandboxRenderInput {
  skipLiquidAllowlist?: boolean;
}
export type LiquidWorkerResult = SandboxRenderResult;
export type LiquidSandboxOptions = SandboxOptions;
export { resolveDefaultTimeoutMs } from "./worker-sandbox.js";

export function renderLiquidInSandbox(input: LiquidWorkerInput, options: LiquidSandboxOptions = {}): Promise<string> {
  return renderInWorkerSandbox("liquid-worker", "Liquid", input, options);
}
```

```ts
// handlebars-sandbox.ts, post-extraction
export interface HandlebarsWorkerInput extends SandboxRenderInput {}
export type HandlebarsWorkerResult = SandboxRenderResult;
export type HandlebarsSandboxOptions = SandboxOptions;
export { resolveDefaultTimeoutMs } from "./worker-sandbox.js";

export function renderHandlebarsInSandbox(input: HandlebarsWorkerInput, options: HandlebarsSandboxOptions = {}): Promise<string> {
  return renderInWorkerSandbox("handlebars-worker", "Handlebars", input, options);
}
```

Each file keeps its own `@file` header (the genuinely per-engine threat-model prose) and its own `render*InSandbox` doc comment (the genuinely per-engine `@throws` clause) — only the mechanical body moves out.

## 3. Differences that must survive

1. **`skipLiquidAllowlist` on `LiquidWorkerInput` only** (`liquid-sandbox.ts:44`). Handlebars has no opt-out — `handlebars-worker.ts:159` says so explicitly ("Deliberately unconditional — unlike the Liquid tier, this one has no `skipLiquidAllowlist`-style opt-out to honor"). The seam above preserves this by keeping `LiquidWorkerInput`/`HandlebarsWorkerInput` as **separate exported types**, each `extends`-ing the shared `SandboxRenderInput` base rather than flattening both into one shape. `renderInWorkerSandbox`'s parameter is typed as the base `SandboxRenderInput`, which is structurally satisfied by either subtype — the extra field just rides along in `workerData` since Workers pass the whole object through.
2. **Per-engine error message text.** `"Liquid render exceeded ${timeoutMs}ms timeout"` vs `"Handlebars render exceeded ${timeoutMs}ms timeout"`, and the two `"... worker exited with code ${code}"` variants. Neither test file asserts the exit-code message text today (see §5), but `liquid-sandbox.test.ts:78` and `handlebars-sandbox.test.ts:116` both assert the timeout message via regex (`/exceeded 500ms timeout/`), which does not distinguish "Liquid"/"Handlebars" — so this could theoretically be flattened without failing today's tests. The proposal preserves it anyway via the `errorLabel` parameter, because collapsing engine identity out of a thrown error string is a silent behavior narrowing an operator reading logs would notice, even though no current assertion catches it.
3. **Doc-comment verbosity on the worker-spawn logic.** Handlebars' `spawnHandlebarsWorker` comment already just points at Liquid's for the full derivation (`handlebars-sandbox.ts:112-118`). Post-extraction, the full derivation moves to `worker-sandbox.ts`'s `spawnSandboxWorker`, and neither `liquid-sandbox.ts` nor `handlebars-sandbox.ts` needs to carry it at all — this actually improves on the current state, where Liquid carries the canonical copy and Handlebars carries a pointer to it.
4. **The `@throws` prose difference** in `render*InSandbox`'s doc comment ("disallowed tag/filter" vs "disallowed helper/partial/raw-output") stays put on each thin wrapper — it documents real per-engine behavior in `liquid-worker.ts`/`handlebars-worker.ts` and has no shared counterpart to extract into.
5. **Type re-exports for the workers.** `liquid-worker.ts:12` imports `LiquidWorkerInput, LiquidWorkerResult` from `./liquid-sandbox.js`; `handlebars-worker.ts:7` imports `HandlebarsWorkerInput, HandlebarsWorkerResult` from `./handlebars-sandbox.js`. The seam keeps both type names defined (as `extends`/aliases) in their original files specifically so these two import lines need zero changes.

## 4. Env-var and timeout semantics — DRIFT FOUND (documentation, not behavior)

Compared both `resolveDefaultTimeoutMs()` implementations character-by-character: the digits-only regex (`/^\d+$/`), `Number.isSafeInteger` check, `<= 0`/`> MAX_RENDER_TIMEOUT_MS` bounds, and the two constants (`DEFAULT_RENDER_TIMEOUT_MS = 5000`, `MAX_RENDER_TIMEOUT_MS = 300_000`) are **identical in both files** (`liquid-sandbox.ts:81-97`, `handlebars-sandbox.ts:87-103`). No behavioral drift — a value like `"5e3"` resolves to the same safe fallback in both engines today.

The drift is in the **doc comment**, and it's real: `liquid-sandbox.ts:68-74`'s comment — attached to the *Liquid* file's `resolveDefaultTimeoutMs` — reads:

> "...test runs, where a saturated CI box made this fire spuriously. On 2026-08-19 a 7-agent run drove an 8-core machine to load average 135 and `render-handlebars.test.ts` failed with 'Handlebars render exceeded 5000ms timeout' on a template that renders in ~50ms idle..."

That is word-for-word the same paragraph as `handlebars-sandbox.ts:74-80`, including the file name `render-handlebars.test.ts` and the quoted Handlebars error string — **inside the Liquid file**. This is a copy-paste artifact: whichever file was authored second (the header comments show Handlebars was written after Liquid, per `handlebars-sandbox.ts:14-17`'s "exact same architecture" framing) copied this incident writeup wholesale, and it was never adjusted for the file it landed in. Cited per the brief's evidence rule: I read both blocks directly (not inferred from either file's own claim) and confirm they are identical text in different files, one of which cites evidence that belongs to the other file.

This is not a live bug — both resolvers behave identically, so no render is mistimed. It is a documentation-accuracy problem: a future maintainer reading `liquid-sandbox.ts` in isolation would believe the CI incident that justified this env var was a Liquid-test failure, and would not be able to find `render-handlebars.test.ts` anywhere near Liquid code. Flagging prominently per the brief's instruction, with the caveat that "drift" here means *citation* drift, not *semantic* drift.

**This is also the strongest argument for doing the extraction at all**: once `resolveDefaultTimeoutMs` has exactly one implementation and one comment (in `worker-sandbox.ts`), this class of error becomes structurally impossible — there is nothing left to copy-paste out of sync, and the comment can cite `render-handlebars.test.ts` as one example among (potentially) both engines' test suites without implying it lives in a Liquid-only context.

## 5. Test impact

Three test files touch this code:

- **`__tests__/liquid-sandbox.test.ts`** (tests `renderLiquidInSandbox` only, imports from `../liquid-sandbox.js`) and **`__tests__/handlebars-sandbox.test.ts`** (tests `renderHandlebarsInSandbox` only, imports from `../handlebars-sandbox.js`) both test through the **public API** — function name, input shape, thrown-error regexes. The proposed seam keeps both public functions' names, signatures, and observable behavior (including exact error-message text, per §3.2) unchanged. **Neither file needs any change.** This is the intended outcome of a behavior-preserving refactor: these tests, unmodified, are exactly what would catch a regression if the extraction accidentally changed behavior.

- **`__tests__/sandbox-timeout-resolution.test.ts`** is the one file whose *premise* the extraction invalidates, not just its imports. Today it imports `resolveDefaultTimeoutMs` from both `../handlebars-sandbox.js` and `../liquid-sandbox.js` under aliases (lines 4-5) and runs the same 13-case table against both (lines 22-52), and its own doc comment states why: *"Both sandboxes carry an independent copy of the resolver, so both are asserted — a fix applied to only one would pass a single-engine test"* (lines 17-19). After extraction there is only **one** implementation; `LiquidSandbox`'s and `HandlebarsSandbox`'s `resolveDefaultTimeoutMs` become re-exports of the same function (§2). Running the identical table twice through two re-exports of one function is not a meaningfully stronger regression guard than running it once — it would pass or fail identically for both "engines" by construction, so the loop no longer catches the "a fix applied to only one" scenario its own comment describes, because there is no longer a second one to fall out of sync.
  - **My recommendation:** this test should be revised (not silently left as-is) to import `resolveDefaultTimeoutMs` once from `worker-sandbox.js` and drop the two-engine loop, updating the doc comment to explain that the resolver is now single-sourced and *why* that supersedes the old "assert both independently" rationale (pointing at this proposal / the extraction commit). This is a case where the repo's "move tests, don't re-author them" default doesn't cleanly apply — the *test data* (the 13-case table) moves verbatim, but the *test's own stated justification* is about to become false if left untouched, and leaving a comment asserting a now-false fact is exactly the kind of drift §4 just found. I'd flag this to Coordinator/Programmer as a required companion change to the extraction, not an optional cleanup.
  - Alternative that avoids touching this test at all: keep the two re-exports as real, independent bindings is impossible once there's one function — but the test could be left importing from both sandbox files unchanged, accepting that it becomes a (harmless, still-passing) redundant check rather than a meaningful one. I don't recommend this — a passing test that no longer tests what its comment says it tests is a worse outcome than a two-line edit.

No new test coverage is required for the extraction itself: `worker-sandbox.ts`'s `resolveDefaultTimeoutMs` and `renderInWorkerSandbox` are exercised indirectly by all of the above through both public wrappers, and the run-loop logic (timeout, message/error/exit wiring) is already covered end-to-end by the CPU-bound-timeout and memory-blowup cases in both sandbox test files.

## 6. Risk and blast radius

**Importers, confirmed by `grep -rn "liquid-sandbox\|handlebars-sandbox"` over `src/`:**

| File | What it imports | Impact |
|---|---|---|
| `render.ts:14-15` | `renderHandlebarsInSandbox`, `renderLiquidInSandbox` (call sites `render.ts:2048`, `render.ts:2065`) | None — signatures unchanged |
| `liquid-worker.ts:12` | types `LiquidWorkerInput`, `LiquidWorkerResult` | None — types still defined (as `extends`/alias) in `liquid-sandbox.ts` |
| `handlebars-worker.ts:7` | types `HandlebarsWorkerInput`, `HandlebarsWorkerResult` | None — same |
| `__tests__/liquid-sandbox.test.ts`, `__tests__/handlebars-sandbox.test.ts` | `render*InSandbox` | None, see §5 |
| `__tests__/sandbox-timeout-resolution.test.ts` | `resolveDefaultTimeoutMs` from both files | Needs the revision described in §5 |
| `features/theme/liquid-allowlist.ts:173` | comment-only reference to `liquid-sandbox.test.ts`, not an import | None |

No other file in `src/` references `spawnLiquidWorker`, `spawnHandlebarsWorker`, `DEFAULT_RESOURCE_LIMITS`, `DEFAULT_RENDER_TIMEOUT_MS`, or `MAX_RENDER_TIMEOUT_MS` — none of those symbols are currently exported, so nothing outside the two sandbox files could depend on their internals. Blast radius for accidental breakage is therefore limited to the two sandbox files, the two worker files (type-only), and the three test files above — all read and enumerated above, nothing missed.

**Why co-locate `worker-sandbox.ts` in `src/server/http/site/` rather than somewhere more neutral:** `spawnSandboxWorker` resolves the worker entry file via `path.join(import.meta.dirname, workerBasename + ext)` (`liquid-sandbox.ts:130-137` today). That relies on the sandbox module and its worker files living in the *same directory* — moving the shared module elsewhere without also changing this to an absolute/injected path would silently break worker resolution at runtime (not a compile error). Keeping `worker-sandbox.ts` beside `liquid-worker.ts`/`handlebars-worker.ts` preserves this invariant with zero path-resolution changes.

**On the anticipated third consumer (plugin-execution sandbox):** the dispatch brief names this as coming but not yet built, and per this agent's package-extensibility guardrail, a consumer that isn't yet a named, recorded caller is not a basis for designing generality into the seam now — doing so would be speculative. I did not shape `worker-sandbox.ts`'s API around it. The one thing worth flagging for whoever builds that sandbox later: if the plugin sandbox needs to live outside `src/server/http/site/` (likely, since plugin execution isn't a site-rendering concern), it cannot simply import `spawnSandboxWorker` as-is — the directory-relative worker-path resolution described above would need to become parameterized (e.g. an absolute path or an injected resolver) at that point. That is a change for whoever does that extraction, made easier by this one already having isolated the resolution logic into a single function (`spawnSandboxWorker`) rather than two copies.

**What could break if this lands wrong:**
- Getting the `errorLabel`/`workerBasename` parameters swapped between the two wrapper call sites would produce a Liquid render throwing "Handlebars render exceeded..." (or vice versa) — silent to the type system, only caught by the exact-string assertions already in both test files (`liquid-sandbox.test.ts:78`, `handlebars-sandbox.test.ts:116` for timeout; no current assertion covers the exit-code string, per §3.2 — a gap worth a one-line addition to each test file's assertions when this lands, since it's the one place the two engines' output could get crossed with no test noticing).
- Forgetting to keep `LiquidWorkerInput`/`HandlebarsWorkerInput` as distinct exported types (e.g. flattening both to the shared base) would compile-error `liquid-worker.ts:121`'s destructure of `skipLiquidAllowlist` — a fast, loud failure, low risk.

---

## Summary for Coordinator

- **Classification:** standard non-behavioral refactor (duplication), tests pre-exist and are green; no `ARCHITECTURE_REVIEW_REQUIRED` or `SPEC_REVISION_REVIEW_REQUIRED` escalation needed.
- **Tests required before refactoring:** none new — `liquid-sandbox.test.ts` and `handlebars-sandbox.test.ts` already cover the behavior being moved.
- **Companion change to route alongside implementation:** revision of `sandbox-timeout-resolution.test.ts` per §5 (its stated rationale becomes false otherwise) — this is not optional cleanup, it should ride in the same change.
- **Estimated blast radius:** 2 files rewritten (thinner), 1 file added (`worker-sandbox.ts`), 1 test file revised, 0 call sites elsewhere touched.
