# Mini-barrels (`assistant/tools/index.ts`) — proposal REJECTED, with the cheaper alternative

**Date:** 2026-08-20 · **Status:** decided against, alternative proposed, NOT implemented
**Method:** independent peer review (Sonnet 5, full repo read access), every decisive claim
re-verified by the coordinator directly against the repo before acceptance.

---

## The proposal

Add `src/assistant/tools/index.ts` — a "mini-barrel" re-exporting the 12 `tool-*` files at
`src/assistant/`'s root — so callers needing tool functionality import `assistant/tools` and drag 12
files instead of the whole assistant module. Motivation: `bidirectional hub count` penalizes fat
barrels while `module API surface (files exposed)` rewards routing through them, and the build has
**no bundler** (`"build": "tsc -p …"`, `type: module`), so **there is no tree-shaking** — importing
one symbol from a barrel evaluates every value-exporting module behind it.

## Verdict: reject. Three independent reasons, all verified.

### 1. It is illegal under this repo's own gate, and would make the BLOCKING metric worse

Both enforcement points match the module-root `index.ts` by **exact string**, not "any `index.ts`":

```js
// .dependency-cruiser.cjs:422
const internals = `^src/${mod}/(?!index\\.ts$).+`;

// development/scripts/check-architecture.ts  (deepImports)
if (to === `src/${toModule}/index.ts`) continue;
```

`moduleOf()` maps anything under `src/assistant/**` to module `"assistant"`, so a nested
`tools/index.ts` is **not** `src/assistant/index.ts` and gets no exemption. Every redirected edge
would trip `no-deep-imports:assistant` AND count toward `moduleApiSurfaceFiles` — the metric that
blocks the build.

Not theoretical: the repo already hit this for `resolvers/index.ts` —
`ADS-memory/reports/architecture/2026-08-13-api-surface-trace-B.md:112-118`.

`assistant` is in `GUARDED_MODULES` but not yet in `PROMOTED_NO_DEEP_IMPORTS`, so the rule is
currently `warn` — but that set has a steady warn→error promotion history (12 modules already).
"Only a warning" is a shrinking margin, not a real one.

### 2. This experiment was ALREADY RUN and rejected — it is documented in the file's own header

`src/assistant/index.ts`'s header (verified by direct read, not taken on trust):

> A "six narrow doors" split (one file per section below) was also measured and rejected: **11.79%
> propagation / 7 exposed files** — worse on both axes than reverting just these 3 lines, because
> `routes/types.ts` alone needs symbols spanning **4 of the 6 sections regardless of door width**.

Full writeup: `ADS-memory/reports/architecture/2026-08-13-propagation-cost-barrel-attribution.md`.
Narrower doors did not help, because the highest-fan-in caller walks through most of them anyway.

The same header also records that `index.ts` is a **curated** door — only symbols with a confirmed
real external caller are re-exported — so the "naive fat barrel" framing that motivated the proposal
was already false.

### 3. The 12 `tool-*` files are not a cluster — they are a shared filename prefix

Tracing local imports gives 3–4 disjoint chains:

```
tool-contribution-registry.ts   → type-only import (erased by tsc)   [leaf — what the majority needs]
tool-executor-audit.ts          → nothing                            [leaf]
render-ui-tool.ts               → nothing                            [leaf]
tool-search-doc2query → tool-search-keywords → tool-catalog-query     [search chain]
demo-a2ui-tool, mcp-ui-tool-calls → demo-choices-tool → mcp-ui.js     [demo / mcp-ui]
mcp-ui-tool-calls → mcp-ui-tool-calls-route                           [route chain]
byok-tool-surface.ts → tool-catalog-query, tool-registrations         [pulls the whole subgraph]
```

A `tools/` barrel forces the majority caller to drag demo tools and MCP-UI routing it never touches.

## The decisive measurement: what callers actually take

Verified directly by the coordinator:

```
47  files import #src/assistant/index
25  of them (53%) import exactly ONE symbol: registerToolContributor
```

Those 25 span `comments`, `forms`, `identity`, `navigation`, `redirects`, `members`, `newsletter`,
`seo`, `webhooks`, `widgets`, `media`, and ~10 `features/*` domains — near-verbatim:

```ts
import { registerToolContributor } from "#src/assistant/index";
```

`tool-contribution-registry.ts` has **only a type-only import** (`AssistantToolRegistryDeps`, erased
by `tsc`) — zero runtime local dependencies. The remaining 22 importers take assorted symbols across
sections B–E; no other single symbol comes close.

Nothing outside `src/assistant/` currently deep-imports `tool-contribution-registry.ts`.

## Recommended alternative (NOT yet implemented — needs owner sign-off)

Add one entry to the allow-list that already exists, with live precedent at
`.dependency-cruiser.cjs:310`:

```js
assistant: [
  "^src/assistant/mcp-federation/(config|presets|ports|trust)\\.ts$",
  "^src/assistant/tool-contribution-registry\\.ts$",   // ← new
],
```

Callers then write:

```ts
import { registerToolContributor } from "#src/assistant/tool-contribution-registry.js";
```

**Cost comparison** — the mini-barrel is strictly dominated:

| option | `moduleApiSurfaceFiles` | extra modules evaluated for the 25 majority callers |
|---|---|---|
| status quo (fat barrel) | +0 | ~29 value-exporting modules |
| `tools/` mini-barrel | **+1** | 11 unnecessary |
| `EXTRA_TO_EXEMPT` one file | **+1** | **0** |

Same metric cost, zero unnecessary evaluation, no new concept the gate does not recognize.

## The convention for agents (Q2) — do not invent one, it exists

The mechanism is `EXTRA_TO_EXEMPT[mod]` feeding `noDeepImportRules()`'s
`to: { path: internals, pathNot: extraToExempt }`. It already lints and already has error text
(`.dependency-cruiser.cjs:168`).

One-sentence form for `CLAUDE.md`:

> Importing from a guarded module (`GUARDED_MODULES` in `.dependency-cruiser.cjs`)? Use its
> `index.ts` — unless the exact file you need is already listed in that module's `EXTRA_TO_EXEMPT`
> entry. If it isn't listed and you only need one thing, ask before deep-importing; don't invent a
> new barrel file.

**Honest failure modes:**

- `EXTRA_TO_EXEMPT` silences the dependency-cruiser lint only. It does **not** touch
  `check-architecture.ts`'s blocking ratchet — every addition still needs a deliberate,
  comment-justified baseline bump in the same commit, or CI blocks anyway.
- If a real sub-barrel is ever warranted, **both** generators (the dependency-cruiser `internals`
  regex and `check-architecture.ts`'s exact-string check) must be widened **together**, or they
  disagree. Nothing enforces that pairing except human diligence.
- Scales to "one hot file per module, per ask" — not to a general pattern. **A module accumulating
  3–4 `EXTRA_TO_EXEMPT` entries is the signal that a real sub-barrel is earned.** Decide it then.

## Cost model (Q3) — real, but not where you'd look

- **Boot cost: negligible.** All 12 `tool-*` files were scanned for module-scope side effects
  (spawn/fetch/fs/env at top level) — none. Boot happens once per process. Extra parse+evaluate of
  ~11 small files is low-single-digit ms. Not worth engineering for without a contradicting
  measurement.
- **`tsc` check time: unaffected by barrel width.** `tsconfig.json` has no
  `composite`/`incremental`/`references` — it is a whole-program run over `src/**/*.ts` every build
  regardless of any caller's import shape.
- **The plausible real cost is the test loop.** `node --import tsx --test` runs uncached against
  `.ts` source. A test importing the full barrel for one symbol makes tsx strip-transform ~29 extra
  modules **every run**, compounded across however many of the 47 importers are test files.
- **To settle it:** wall-clock `assistant/__tests__/tool-registrations.*.test.ts` before/after
  switching one file's import off the barrel. The `dist/` import-time microbenchmark would likely
  show only noise.

## Status

Nothing implemented. No files changed. The `EXTRA_TO_EXEMPT` change above needs owner sign-off and
would ship with its own baseline bump in the same commit.

---

## Second peer: Codex `gpt-5.6-sol` (xhigh) — CONVERGES on reject, DIVERGES on the alternative

Dispatched the same packet, full repo access, no knowledge of the Sonnet answer. `turn.completed`,
zero error events, empty stderr.

### Where they agree (independently)

Reject the 12-file mini-barrel. Codex's reason is sharper than the "shared prefix" argument: **only
4 of the 12 files currently contribute runtime exports to the main barrel** (BYOK surface, MCP-UI
policy, MCP-UI route path, contribution registration). Exporting all twelve would *widen* the public
contract, not narrow it. And `byok-tool-surface.ts` reaches the catalog, Jini runtime, native
SQLite, and a 931-line doc-to-query table — grouping it with the contribution registry "would
preserve exactly the accidental loading the narrower API is meant to remove."

### Codex measured it — the numbers Sonnet said it would take to settle Q3

Fresh `tsx` processes, this checkout (source-mode, not compiled — the loader amplifies cost, but
this IS the repo's test/dev path):

| import | time (3 runs) | RSS |
|---|---:|---:|
| contribution registry only | **22–38 ms** | 78–81 MiB |
| all twelve proposed tool files | 499–665 ms | 121–122 MiB |
| current assistant barrel | **762–848 ms** | 123–130 MiB |

The 12-file figure used concurrent dynamic imports, so it approximates rather than benchmarks a
static mini-barrel. **Conclusion: most of the benefit comes from going all the way to a single
capability door, not from 40 files down to 12** — which is an independent argument against the
mini-barrel, from measurement rather than from gate mechanics.

### Where they diverge — the proposed fix

- **Sonnet:** add `tool-contribution-registry.ts` to `EXTRA_TO_EXEMPT.assistant`. Cheapest, reuses
  an existing mechanism, +1 to the blocking metric, zero new concepts.
- **Codex:** declare named **capability entrypoints** via `package.json` `imports` (not `exports` —
  this is a private app), e.g. `#assistant/tool-contributions` → `src/assistant/public/
  tool-contributions.ts`, then *remove* those symbols from `#assistant` so the compiler makes the
  narrow door the only door. Enforced by a new blocking `check-public-imports.ts` with prescriptive
  diagnostics (`ARCH-PUBLIC-001/002/003`). Notes `emit-dist-package-json.mjs:42` already rewrites
  `.ts` imports-map targets to `.js` for `dist`, so the aliases fit the existing build.

Codex's convention differs in one important way: **"sole door", not "narrowest door."** Its argument
is that asking a human or an agent to judge which of several doors is narrowest is the failure mode;
one canonical entrypoint per symbol is mechanically decidable.

### Codex's deeper finding — the narrow door may not be enough

`ToolContributor` references `AssistantToolRegistryDeps`, which is an **intersection of every
domain's dependency interface**. So a narrow *runtime* entrypoint still carries large *type-checking*
fan-out, and may remain an all-import hub regardless. Its proposed contract change: have registration
accept already-bound contribution closures at the composition root, so the global dependency-bag type
leaves the public seam.

**This is the same disease as `RouteDeps`** (see
`2026-08-20-hub-decomposition-hypotheses.md` §2) — a god-type inflating everything that touches it.

### ⚠️ Codex caught a factual error in the dispatch packet — corrected here

The packet (written by the coordinator) claimed **propagation cost is a hard-constraint metric**.
It is not. Verified at `development/scripts/check-architecture.ts:154-167`:

```
HARD_CONSTRAINT_METRICS = { module API surface (files exposed),
                            back-edges into composition root,
                            module cycles / SCC (runtime-only) }
RATCHET_METRICS         = { propagation cost (all-import),
                            propagation cost (runtime-only),
                            bidirectional hub count }
```

So the earlier claim that blind barrel-routing "fails the build on a metric that can actually block"
is **wrong** — doubling propagation cost only *warns*. The measured 11.62% → 24.38% regression is
still real and still an argument against barrel-routing on the merits; it just is not build-blocking.
Anyone citing that argument should cite it correctly.

Both peers' full outputs: the Codex JSONL is session-local and not committed; its extracted answer
was read in full and is summarized above without material omission.
