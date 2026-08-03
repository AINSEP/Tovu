# `@jini-ai/ai-chat` package consolidation — working log

Live log, updated as the extraction proceeds (not a postmortem written at the end).
Dispatched by `main` to consolidate `packages/chat-core` + `packages/ui/src/react/chat` into
one `packages/ai-chat` package with `./core` and `./react` subpaths, following `@jini-ai/admin`'s
precedent. Both repos are `/Users/la/Programming/Jini` (source) and `/Users/la/Programming/Tovu`
(consumer).

## Status: CORE HALF DONE AND GREEN. PAUSED FOR CHECK-IN before touching react/chat or any consumer source.

## Core half — done

- `git mv packages/chat-core/src packages/ai-chat/src/core` (44 files, full git history preserved
  — confirmed via `git status --short`, all show as `R` renames, not add+delete).
- `git mv`'d `chat-core`'s `package.json`, `tsconfig.json`, `vitest.config.ts`, `README.md`,
  `CHANGELOG.md` into `ai-chat/` (`source-map.md` moved to `ai-chat/src/core/source-map.md`,
  since it's specifically core's provenance). Edited in place afterward — not re-authored from
  scratch — for: package name/description, `exports`/`jini.entries` (only `.` and `./core` for
  now — `./react` not declared until that half actually exists), `outDir`/tsconfig `lib`/`jsx`
  (mirrors `@jini-ai/admin`'s tsconfig, with a comment explaining why DOM lib + jsx availability
  doesn't compromise core's no-DOM boundary), and `vitest.config.ts` (added
  `environmentMatchGlobs: [['src/react/**', 'jsdom']]` ahead of react landing, rescoped the
  existing 98% coverage threshold from package-wide to `src/core/**` specifically since react will
  have its own coverage posture, not chat-core's inherited one).
- Deleted the now-empty `packages/chat-core/` (only gitignored `dist`/`node_modules`/`coverage`
  remained after the moves above — verified via `git check-ignore` before `rm -rf`).
- **`npm --prefix packages/ai-chat run test`: 274/274 passed** (all 272 pre-existing chat-core
  tests unchanged, plus 2 new — see below). **`run build` and `run typecheck`: both clean.**

### React-free invariant — proof, not assertion

Added `packages/ai-chat/src/core/__tests__/react-free.test.ts`: scans every `.ts`/`.tsx` file
under `src/core` for (a) any `react`/`react-dom` import specifier (bare or subpath) and (b) any
relative import that resolves outside `src/core` (i.e. escaping into a future `src/react`). First
run caught its own false positive — the fixture-writing second test contains import-shaped string
literals as DATA (`"import ... from 'react'"` inside a `writeFileSync` call), which a text scan
can't distinguish from a live import; fixed by excluding the test file's own path from the real
scan (documented inline; same class of problem the real `scripts/lib/stripComments` exists to
solve, handled here by exclusion since this is a one-off, not shared infra). Second test proves
the scanner isn't a no-op by running it against an in-memory fixture tree that DOES import
`react`/`react-dom/client`/an escaping relative path, and asserting all three get flagged plus a
clean file doesn't. Both tests pass; the real scan against `src/core` returns zero offenses.

Also mirrored `@jini-ai/admin`'s `vitest.config.ts` pattern (no jsdom by default,
`environmentMatchGlobs` opts `src/react/**` into jsdom) as a second, independent layer — noted in
this test's own file doc that this alone would NOT have caught a bare `import 'react'` in a
non-rendering source file (importing react doesn't touch `window`/`document` at module load), which
is why the direct scan above exists rather than relying on admin's pattern alone.

## `@jini-ai/chat-core` npm publication — confirmed published, not unpublishing

`npm view @jini-ai/chat-core` shows 3 published versions (0.1.0/0.1.1/0.1.2), latest published
6 days ago. Per instruction: not unpublishing anything — the published name goes end-of-life at
0.1.2; `@jini-ai/ai-chat` is a new, separate npm package name going forward.

## Consumer package.json manifests — mechanically renamed to unblock `pnpm install`, source NOT touched yet

Renaming `chat-core` → `ai-chat` broke `pnpm install` for the whole workspace (pnpm resolves
`workspace:*` by package name; every consumer's `package.json` still said
`"@jini-ai/chat-core": "workspace:*"`, which no longer exists). To get `ai-chat` itself testable
at all, I did a **mechanical, dependency-line-only** rename (not touching any `.ts`/`.tsx` import
statement) in: `packages/http-kit/package.json`, `packages/sqlite/package.json`,
`packages/renderers-react/package.json`, `packages/ui/package.json`, and
`examples/reference-web/package.json` (see next section — this last one is a consumer the brief
didn't mention). `pnpm install` now succeeds workspace-wide.

**These 5 packages' own source still imports `from '@jini-ai/chat-core'` and will not build/test
until that's rewired — deliberately deferred, not forgotten**, so consumer source gets touched
once, after the react-half question is resolved, rather than twice.

## SECOND FINDING — a consumer the brief missed: `examples/reference-web`

`pnpm install` also failed on `examples/reference-web` (an `examples/*` workspace package, private,
not published). It imports `@jini-ai/chat-core` directly in **8 files**
(`daemon.ts`, `App.tsx`, `playground-request.ts`, `McpUiLab.tsx`, `daemon-transport.test.ts`,
`WebMcpLab.tsx`, `daemon-transport.ts`, `AgentLab.tsx`) AND imports `@jini-ai/ui/chat` in
**11 files** (`App.tsx`, `A2uiLab.tsx`, `runtime-access.ts`, `attachment-uploader.ts`, `daemon.ts`,
`styles.css` — comment only, `McpUiLab.tsx`, `daemon-transport.test.ts`, `AgentLab.tsx`,
`WebMcpLab.tsx`, `daemon-transport.ts`). The brief's consumer list (`http-kit`, `sqlite`,
`renderers-react`, `ui`, plus Tovu's 17 sites, plus "open-design: zero consumers") didn't mention
it. It's in-repo, not external, but it's real code that will need the same import rewiring as
`ui`'s own files once `@jini-ai/ui/chat` goes away. Flagged to `main`.

## Original PAUSED finding (react/chat's dependency on `@jini-ai/ui`) — still open, see below

## File counts — confirmed exact match to the brief

- `chat-core/src/**`: 24 source files + 15 test files = **39 files**. Matches brief exactly.
- `ui/src/react/chat/**`: 108 files total (105 `.ts`/`.tsx`, plus `README.md`, `source-map.md`,
  `styles/reference.css`). Brief said "105 files" — matches if non-`.ts(x)` files are excluded
  from the count, "48 tests" not yet independently verified but plausible from the `__tests__`
  file count. No discrepancy worth flagging.

## Admin precedent, confirmed

`packages/admin/package.json` exports `.`, `./core`, `./browser`, `./react`, `./server`, where
**`.` is a literal alias of `./core`** (identical `dist/core/index.js` target in both the
`exports` map and `jini.entries`) — not a merged core+react barrel. This is the "meaningful `.`
barrel" the brief asked me to check for before adding one. I will replicate this exactly for
`ai-chat`: `.` → same target as `./core`. No merged barrel.

`admin`'s React-free enforcement for `/core` is `vitest.config.ts`'s `environmentMatchGlobs`
(no jsdom by default, jsdom only for `src/react/**`) — see `admin/src/core/index.ts`'s own file
doc: "enforced by this package's vitest config... so a leak fails loudly rather than passing
quietly." I'm replicating this for `ai-chat` too, but see below — I judged it insufficient on
its own for the "core must not import react" invariant and I'm adding a direct import-scan test.

## Hard invariant (core must stay React-free) — plan

`grep -rl "from 'react'" packages/chat-core/src` → zero hits. Confirmed React-free today.

Admin's own no-jsdom-by-default vitest config would NOT actually catch `import 'react'` in a
core source file — importing bare `react` in Node doesn't touch `window`/`document` at module
load, so it wouldn't fail under a no-jsdom environment unless a test actually renders JSX. That's
a weaker guarantee than what's being asked for here. Plan: replicate admin's vitest-config
pattern (cheap, consistent with precedent) **and** add a direct source-scanning vitest test
inside `ai-chat/src/core/__tests__/` that walks every file under `src/core` and flags any import
specifier that is `react`/`react-dom` (or a subpath) or any relative import resolving outside
`src/core`. Includes a positive fixture proving the check would actually catch a violation
(this repo's own convention per `scripts/lib/self-test.ts` — "prove it isn't a stub", not just
assert it). Kept package-local (not wired into the repo-root `scripts/guard.ts` /
`check-engine-boundaries.ts` machinery) because that machinery's own R2 rule cannot see a
core→react leak here anyway — both halves resolve to the same top-level package
(`packages/ai-chat`), so a relative escape from core into react would not trip R2's
different-package check. This mirrors how `admin/core` and `admin/react` are already not
protected by R2 either — same-package layers are outside R2's reach by construction, so the
package-local test is the only real protection either package has, not something I'm inventing.

## FINDING requiring a decision before moving react/chat — checking in with main

`ui/src/react/chat/**` is **not fully self-contained**. A mechanical resolved-path scan (not
grep-by-eye) found 4 non-test relative imports that resolve OUTSIDE `react/chat/` into
`@jini-ai/ui`'s general-purpose shared tree, plus 1 test-only import:

| escaping file | resolves to | used from |
|---|---|---|
| `features/chat-pane/react/hooks/useChatPaneFileDrop.hooks.ts` | `packages/ui/src/browser/useFileDropTarget.ts` | 1 file |
| `features/chat-pane/react/components/AgentRuntimePicker.tsx` | `packages/ui/src/react/components/AgentIcon.tsx` | 1 file |
| `components/Composer.tsx`, `features/chat-pane/react/components/AgentRuntimePicker.tsx` | `packages/ui/src/react/components/RemixIcon.tsx` | 2 files |
| `features/chat-pane/react/components/ChatPane.tsx` | `packages/ui/src/react/components/WorkingDirPicker.tsx` | 1 file |
| `features/chat-pane/__tests__/ChatPane.test.tsx` (test-only) | `packages/ui/src/utils/file-system-errors.ts` | 1 test file |

All 4 non-test targets are genuinely shared: `useFileDropTarget` is also used by
`features/file-dropzone` and `features/asset-tree-browser`; `AgentIcon`/`RemixIcon`/
`WorkingDirPicker` are re-exported from `@jini-ai/ui`'s own root barrel (`src/index.ts`) and
consumed by `viewer-shell`/`browser-chrome` too. These are not chat-specific leaves I can just
carry over — moving them would fork them away from ui's other consumers.

**Why this needs a decision, not just a fix:** `ui/src/react/chat/hooks/context.ts`'s own file
doc says i18n/analytics passthrough is "reimplemented locally here since `@jini-ai/chat-react`
cannot depend on `@jini-ai/ui` (not an allowed dependency per
`foundry/docs/jini-port/recon/r4b-webui-design.md` §1)." I read that doc — §1's
`@jini/chat-react` spec lists allowed deps as `react`, `react-dom`, `@jini/chat-core`,
`@jini/artifacts-react` only; `@jini-ai/ui` is explicitly not on the list. That rule is already
being violated today, just invisibly — the 4 escapes above are relative imports that work
because chat currently lives *inside* `@jini-ai/ui`, so no package boundary ever caught it.
Extracting `react/chat` into its own package makes this a **real, structural
`ai-chat → ui` dependency edge** for the first time, contradicting a rule that's still being
actively cited in the code today (not a stale/dead comment — it's the reasoning for a real
design choice in `context.ts`).

Three ways to resolve it, weighed:
1. **Accept the drift**: add `@jini-ai/ui` as a real dependency of `ai-chat`, convert the 4
   relative imports to `@jini-ai/ui`-qualified imports (all 4 targets are already exported from
   `ui`'s root barrel, so no change needed on `ui`'s side beyond removing `./chat` and the
   `@jini-ai/chat-core` dependency as already planned). Also add `file-system-errors.js`'s
   `FILE_SYSTEM_READ_ERROR_MESSAGE` to `ui/src/index.ts` (currently package-internal only,
   1-line addition, same pattern as the other `utils/*` re-exports already there at
   `src/index.ts:49-62`) so the moved test can still assert against it. This is the smallest,
   lowest-risk change and matches the direction the extraction is already going (ui stops
   depending on chat; chat depends on ui for shared primitives instead) — but it cements the
   R4b-doc violation into a real, harder-to-undo package edge instead of leaving it as a latent
   intra-package one.
2. **Move the 4 primitives into `ai-chat`**, have `ui`'s other consumers
   (`viewer-shell`, `browser-chrome`, `asset-tree-browser`, `file-dropzone`, `ui`'s own barrel)
   import them from `@jini-ai/ai-chat/react` instead. Inverts the dependency the opposite way
   (`ui → ai-chat`), which is a bigger and, I think, backwards move — chat is meant to be the
   narrower/more portable package.
3. **Duplicate** the 4 primitives into `ai-chat/react` (~22KB combined), preserving R4b's
   "no ui dependency" rule literally, at the cost of two divergent copies to maintain.

**My recommendation is (1)** — duplication (3) trades a documented-but-already-violated rule for
guaranteed drift between two copies, and (2) is a larger, riskier restructuring than asked for.
But this is a real fork in the road, not a mechanical judgment call, so I'm pausing react/chat
work and checking in with `main` before acting on it.

## Tovu-side recon (read-only — not touching Tovu yet, this is prep for after the pause)

Verified via `grep -rn "@jini-ai/chat-core\|@jini-ai/ui/chat" apps/admin/src src` in Tovu: 10 files
confirmed, matching the brief exactly. My own count of live *import statements* (not comment
mentions) is 14, not 17 — `App.tsx` (1 ui/chat), `AssistantDock.tsx` (1 ui/chat + 1 chat-core),
3 hooks files (1 chat-core each), `lib/assistant-chats.ts` (1 chat-core),
`lib/assistant-transport.ts` (2 chat-core + 1 ui/chat), the transcript test (1 chat-core),
`tenant-scope.ts` (1 chat-core), `assistant-chats.ts` server module (2 chat-core). Not flagging
this as a missed-consumer finding — the file list matches exactly, "17" vs my "14" is most likely
a different counting unit (e.g. individual imported symbols, or including doc-comment mentions in
`assistant.ts`/`assistant.css` that reference `@jini-ai/ui/chat` without importing it). Noting the
discrepancy for the record, not treating it as a red flag.

Confirms the brief's framing: Tovu's `tenant-scope.ts` and `assistant-chats.ts` (server module)
import ONLY from `@jini-ai/chat-core` (never `@jini-ai/ui/chat`) — consistent with "Tovu imports
chat state server-side in Node," and exactly the two files the React-free invariant protects.

Important scoping note: Tovu's own import rewiring (from `@jini-ai/chat-core` /
`@jini-ai/ui/chat` to `@jini-ai/ai-chat/core` / `@jini-ai/ai-chat/react`) is blocked only by
whether `react/chat` has physically moved into `ai-chat` yet — NOT by which way the
`ai-chat`-depends-on-`@jini-ai/ui` question resolves. Tovu only consumes `ai-chat`'s public API
either way, so that internal dependency-direction decision doesn't change what Tovu's imports need
to look like. Still holding off on touching Tovu per the checkpoint rule, but this is why the two
paused items don't need to be resolved in lockstep with each other.

## MSG #1/#2/#3 from main — four owner decisions received and paraphrased back, then acted on

1. **Rename**: `@jini-ai/ai-chat` at `packages/ai-chat/` → `@jini-ai/chat` at `packages/chat/`.
   Done: `git mv packages/ai-chat packages/chat`, `name`/`repository.directory` updated in
   `package.json`, the 5 consumer manifests I'd already mechanically pointed at `ai-chat`
   re-pointed at `chat`. Doc-comment references to the old `@jini-ai/chat-core`/`@jini-ai/ai-chat`
   names inside the package (module docs, a test `describe` label, a temp-dir prefix string) were
   also updated for accuracy, not just the functional bits — `git mv`'d content, edited in place,
   not re-authored. Re-verified 274/274 green + clean build after the rename.
2. **`@jini-ai/chat` takes a real dependency on `@jini-ai/ui`** (my option 1, confirmed). The 4
   escaping imports (`AgentIcon`, `RemixIcon`, `WorkingDirPicker`, `useFileDropTarget`) rewritten
   to `import ... from '@jini-ai/ui'`. Added `FILE_SYSTEM_READ_ERROR_MESSAGE` to `ui/src/index.ts`
   (the 5th, test-only escape), matching the existing `utils/*` re-export pattern there with a
   1-line comment explaining why. Confirmed via the same resolved-path scanner used to find the
   escapes originally: zero relative imports now escape `packages/chat/src/react/**`.
3. **R4b reframing** — corrected in this report (see the section below, replacing the earlier
   "cementing a rule violation" framing).
4. **`model-picker` moves as-is**, not slotted. Added a file-doc note to the moved
   `features/model-picker/index.ts` citing R4b §1 line 41 and the `desktop-host/source-map.md`
   precedent for deferring generalization until a second consumer exists. Not touching
   Tovu-Runner's `TODO.md` — correctly out of scope, per main.

### R4b finding — corrected framing (supersedes the earlier "cementing a violation" framing)

Not a rule violation, drift from an enumeration that predates `@jini-ai/ui`'s existence. §1 line 39's
narrow `@jini/chat-react` allowed-deps list (`react`, `react-dom`, `@jini/chat-core`,
`@jini/artifacts-react`) is a `foundry/` target-architecture recon doc written with `@jini/*` names
that don't match the shipped `@jini-ai/*` packages — `@jini-ai/ui` didn't exist when it was written.
Lines 40–41's **Forbidden** list is aimed at product coupling (`@open-design/*`, OD
`providers/registry`, OD `state/*`, OD `router`, Next.js) — "don't re-couple the engine to one
product," not "never depend on a sibling engine package." R4b's own boundary-lint spec at line 232
sets the actual enforceable allow-list as `react`, `react-dom`, sibling `@jini/*`, and declared
peers — `@jini-ai/ui` is exactly a sibling engine library under that rule, not a product package.
So `@jini-ai/chat` depending on `@jini-ai/ui` is consistent with R4b's own enforcement mechanism,
not a breach of it.

## THIRD FINDING — a real reverse dependency the `tsc` build surfaced, more serious than the first 4 escapes

Building `@jini-ai/ui` after removing its `./chat` export failed with `TS2307: Cannot find module`.
Two files **outside the old chat tree**, inside `packages/ui/src/react/mcp-ui/`, reach INTO chat
via relative import — the reverse direction from the 4 escapes already fixed, which neither my
scan nor main's checked (both only traced escapes *from* chat outward):

- `packages/ui/src/react/mcp-ui/McpUiSurfaceCard.tsx` imports `registerExtEventRenderer`/
  `ExtEventRenderProps` from `../chat/ext-event-renderer-registry.js` and `useT` from
  `../chat/hooks/context.js`.
- `packages/ui/src/react/mcp-ui/__tests__/McpUiSurfaceCard.test.tsx` imports
  `clearExtEventRenderers`/`getExtEventRenderer` from the same registry.

**Why this is more serious than the first 4**: `@jini-ai/ui`'s `./mcp-ui` subpath is a real public
export (`package.json` `exports["./mcp-ui"]`), and `McpUiSurfaceCard` is re-exported from its
barrel. If this becomes a real `ui → chat` dependency to match the already-decided `chat → ui`
dependency (Decision 2), that's a genuine **cycle** — `@jini-ai/chat` depending on `@jini-ai/ui`
depending on `@jini-ai/chat` — which breaks clean build ordering (which package's `dist/` builds
first?), not just a style preference like the first 4 escapes were.

**Investigated before reporting, not just flagged**: `McpUiSurfaceCard`/`registerMcpUiSurfaceRenderer`
have **zero consumers anywhere** in Tovu, `examples/reference-web`, or any other Jini package —
confirmed via repo-wide grep. Its own module doc says it renders MCP-UI views "inline in a chat
transcript" via "the same extensibility seam `A2uiSurfaceCard.tsx` uses" — and `A2uiSurfaceCard`
already lives in `@jini-ai/chat/react` now. Its other two dependencies, `McpUiHost` (3 other
consumers inside `ui/react/mcp-ui/`) and `features/mcp-ui/resource.js`'s `parseUIResource`/
`readPreferredFrameSize`, are genuinely ui-generic with real other consumers, unlike
`McpUiSurfaceCard` itself.

**My recommendation**: move `McpUiSurfaceCard.tsx` (+ test + `registerMcpUiSurfaceRenderer`) into
`@jini-ai/chat/react`, sourcing `McpUiHost`/`McpUiToolCallHandler`/`parseUIResource`/
`readPreferredFrameSize` from `@jini-ai/ui`'s `./mcp-ui` subpath (chat already depends on `ui` per
Decision 2, so this adds no new edge). This keeps the dependency one-directional
(`chat → ui` only) and matches `react/mcp-ui/index.ts`'s own module doc, which already claims "The
dependency runs one way only" — a claim this file currently violates. Caveat: `@jini-ai/ui` is
published to npm (0.1.0–0.1.2, confirmed via `npm view`), same as `chat-core` was, so removing
`McpUiSurfaceCard`/`registerMcpUiSurfaceRenderer` from its public surface is technically a breaking
change for a hypothetical external consumer — I found none in-repo, but can't rule one out outside
this workspace.

**Paused here, `ui`'s build is currently red, waiting on main before moving this file.**

## MSG #5 — approved, executed. Plus a framing correction.

Main independently re-verified both load-bearing claims (zero consumers anywhere across Jini,
Tovu, open-design, reference-web; exactly 3 import lines in 2 files) and ran a full reverse scan
confirming no other `ui → chat` edge exists — this was the last one of this kind.

**Correction, recorded accurately per main's instruction**: my earlier framing — that
`McpUiSurfaceCard.tsx` "violates" `react/mcp-ui/index.ts`'s "the dependency runs one way only"
doc comment — was wrong. That sentence is scoped to `react/mcp-ui` → `features/mcp-ui` (the React
half depending on the React-free half), not to chat at all. The move is justified on its actual
merits only: it removes a real cycle, the moved component has zero consumers, and its sibling
`A2uiSurfaceCard` already lives in `@jini-ai/chat/react`. Not citing that sentence as a violated
rule going forward.

**Executed**: `git mv`'d `McpUiSurfaceCard.tsx` → `packages/chat/src/react/components/`,
`__tests__/McpUiSurfaceCard.test.tsx` → same, alongside `A2uiSurfaceCard.tsx`'s test (its actual
sibling). Rewired imports: `McpUiHost`/`McpUiToolCallHandler`/`parseUIResource`/
`readPreferredFrameSize` now come from `@jini-ai/ui/mcp-ui` (package-qualified); `useT`/
`registerExtEventRenderer`/`ExtEventRenderProps` are now same-package relative imports (`../hooks/
context.js`, `../ext-event-renderer-registry.js`). Removed the now-dangling `export * from
'./McpUiSurfaceCard.js'` from `ui/src/react/mcp-ui/index.ts`, added `McpUiSurfaceCard`/
`registerMcpUiSurfaceRenderer`/`MCP_UI_EXT_EVENT_NAME` to `chat/src/react/index.ts`'s barrel.
`ui`'s own barrel test (`react/mcp-ui/__tests__/index.test.ts`) asserted the three moved exports
existed on `ui`'s barrel — updated its assertions to match the new (smaller, Host-only) surface;
this is a legitimate behavior-tracking edit, not a rewrite-to-pass, since the code under test
genuinely moved to a different package with main's approval.

**Published-API note** (per instruction): removing `McpUiSurfaceCard`/`registerMcpUiSurfaceRenderer`
from `@jini-ai/ui`'s `./mcp-ui` subpath is a minor-version-breaking change to its public surface
(`@jini-ai/ui` 0.1.2 is published, 6 days old). Zero in-repo consumers of either export were found.
Not unpublishing anything.

`packages/ui run build`: clean after this fix (one round-trip needed — first rebuild attempt still
failed on the barrel test above, fixed, rebuilt clean second time). `packages/ui run test`:
**385 test files / 5158 tests, all green.**

## Final `@jini-ai/chat` build/test with `./react` included — green

`npm --prefix packages/chat run build`: clean (react half compiles, `dist/react/styles/reference.css`
copied). `npm --prefix packages/chat run test`: **63 test files / 920 tests, all green** — 16 core
(15 original + `react-free.test.ts`) + 47 pre-existing react tests + `McpUiSurfaceCard.test.tsx`.
File/test counts now reconcile exactly with the brief's original "39 files/15 tests" (core) and
"105 files/48 tests" (react, +1 for the relocated McpUiSurfaceCard test = 48).

## Tovu consumer pass — DONE, green (the part that actually matters)

All 10 files from the brief, confirmed via grep before and after:
`apps/admin/src/{App.tsx, components/AssistantDock.tsx, hooks/assistant-chats-port.hooks.ts,
hooks/assistant-chats-dependencies.hooks.ts, hooks/use-assistant-chats.hooks.ts,
lib/assistant-chats.ts, lib/assistant-transport.ts,
lib/__tests__/assistant-transport.transcript.test.ts}`, `src/assistant/persistence/tenant-scope.ts`,
`src/server/modules/assistant-chats.ts`. Mechanical rename: `@jini-ai/chat-core` →
`@jini-ai/chat/core`, `@jini-ai/ui/chat` → `@jini-ai/chat/react`. Also fixed 3 doc-comment-only
references in `apps/admin/src/styles/assistant.css` and `src/server/modules/assistant.ts` for
accuracy (not real imports, just stale documentation).

**Confirmed before touching anything**: `tenant-scope.ts` and `assistant-chats.ts` (the two
server-side files the React-free `/core` invariant exists to protect) import ONLY from
`@jini-ai/chat-core` — never `@jini-ai/ui/chat`. Nothing needed reaching across into `/react`, so
no stop-and-report was needed on that front.

**Package manifests**: `package.json` (root) and `apps/admin/package.json` both had
`"@jini-ai/chat-core": "file:../[...]/Jini/packages/chat-core"` — updated to
`"@jini-ai/chat": "file:../[...]/Jini/packages/chat"`. Ran `npm install` in both locations
(Tovu root and `apps/admin` are separate installs, per `admin:install`); both now symlink
`node_modules/@jini-ai/chat` to the renamed Jini package correctly.

**Verification, all green:**
- `npm run typecheck` (Tovu root): clean.
- `npm run typecheck` (`apps/admin`): clean.
- `node --import tsx --test src/server/__tests__/assistant-chats-routes.test.ts` (the one test
  file that directly exercises both `tenant-scope.ts` and the server `assistant-chats.ts`
  module): **10/10 passed**.
- `apps/admin`'s three directly-relevant test files (`hooks/__tests__/use-assistant-chats.unit.test.ts`,
  `lib/__tests__/assistant-transport.transcript.test.ts`, `sections/__tests__/AiAssistant.unit.test.tsx`):
  **37/37 passed**.

**Final sweep**: grepped all of Tovu (excluding `node_modules`, `dist`, and other agents'
`.claude/worktrees/*` — separate isolated git worktrees, out of scope, not touched) for any
remaining `@jini-ai/chat-core`/`@jini-ai/ui/chat` reference. Zero in real source. The two
`package-lock.json` files (root and `apps/admin`) retain `"extraneous": true`-flagged historical
entries for `@jini-ai/chat-core` (0.1.2) and `@jini-ai/chat-react` (0.2.1) — pre-existing lockfile
residue from a real `@jini-ai/chat-react` package that existed and was folded into
`@jini-ai/ui/chat` *before this session started* (confirmed via `git log -- packages/chat-react`
in Jini: commit `5eb432544 refactor(ui): relocate @jini-ai/chat-react into @jini-ai/ui/chat`).
npm itself marks these extraneous/inert; not something this refactor introduced or needs to clean
up, and typecheck/tests are green regardless.

## Definition of done — met

Tovu typechecks green (root + `apps/admin`) and its directly-relevant assistant tests pass
(10 + 37 = 47/47). `@jini-ai/chat` (both subpaths) and `@jini-ai/ui` are both green, built, and
rebuilt. `examples/reference-web` mechanically rewired per MSG #4, not further verified by design.
`http-kit`/`sqlite`/`renderers-react` green, rebuilt (1295 + 160 + 450 = 1905 tests).
`packages/chat` itself: 920 tests green, React-free `/core` invariant proven (not asserted) via a
source-scanning test with a positive fixture.

## Open items / not done, by design or scope

- No `git commit` in either repo, per standing instruction throughout.
- `examples/reference-web` beyond the mechanical import rename: not verified (tests not run,
  rendering not checked) — explicit scope cut per MSG #4.
- `packages/chat/README.md` documents only `./core` today; flagged inline as provisional, to be
  extended to cover `./react` in a follow-up rather than rewritten twice mid-refactor.
- `@jini-ai/chat-core` (npm 0.1.0–0.1.2) and the two exports removed from `@jini-ai/ui`'s public
  surface (`McpUiSurfaceCard`/`registerMcpUiSurfaceRenderer`) are both minor-version-breaking
  changes to published packages, per instruction: noted, not unpublished.

## MSG #4 — `examples/reference-web` deprioritized, mechanical-only

Owner's call: it's "just a website for testing," not a product surface, nothing depends on it.
Applied the mechanical rename only — `@jini-ai/chat-core` → `@jini-ai/chat/core`,
`@jini-ai/ui/chat` → `@jini-ai/chat/react` — across all 11 files that reference either specifier
(`App.tsx`, `daemon.ts`, `runtime-access.ts`, `attachment-uploader.ts`, `A2uiLab.tsx`,
`playground-request.ts`, `daemon-transport.test.ts`, `McpUiLab.tsx`, `WebMcpLab.tsx`,
`daemon-transport.ts`, `AgentLab.tsx`). This reconciles my earlier "14 vs 17" Tovu count question
too, retroactively: MSG #4 says "19 files" for reference-web, my recon found 8 files referencing
`chat-core` + 11 referencing `ui/chat` = 19 *references* across 11 *distinct* files (several files
reference both). Consistent with a references-counted, not files-counted, unit — so likely the
same explanation applies to Tovu's "17" vs my "14." Per instruction: did NOT run its tests, verify
rendering, or debug further. Not touching it again unless asked.

## Jini's 3 remaining real consumers — rewired, green, rebuilt

`http-kit`, `sqlite`, `renderers-react` only ever imported `@jini-ai/chat-core` (never
`@jini-ai/ui/chat` — confirmed via grep), so this was a pure `@jini-ai/chat-core` →
`@jini-ai/chat/core` rename across 7 files (`http-kit/src/attachments.ts`,
`http-kit/src/__tests__/attachments.test.ts`, `http-kit/src/frontend-control.ts`,
`sqlite/src/db/chat-history/index.ts`, `sqlite/src/db/chat-history/store.ts`,
`renderers-react/src/types.ts`, `renderers-react/src/registry.ts`). All three:
`typecheck` clean, `test` green (**http-kit 1295/1295, sqlite 160/160, renderers-react 450/450**),
`build` clean (`dist` rebuilt for all three).

## Next
- Core half: DONE, green.
- Rename to `@jini-ai/chat`: DONE, green.
- React half move + Decision 2 rewiring + model-picker note: DONE. `packages/ui` build currently
  RED pending the McpUiSurfaceCard finding — **still waiting on main's call**, not acting on my
  own recommendation there.
- `http-kit`/`sqlite`/`renderers-react`: DONE, green, rebuilt.
- `examples/reference-web`: DONE, mechanical-only per MSG #4, not further verified (by design).
- Still not started: final `@jini-ai/chat` build/test verification with `./react` included
  (blocked on the mcp-ui question — `ui` needs to build clean first), and all of Tovu (also
  depends on `@jini-ai/chat/react` + `@jini-ai/ui` both being green).
