# Jini unowned-work inventory — 2026-09-05

Read-only investigation of uncommitted/untracked work in `/Users/la/Programming/Jini` (branch
`general-work`) that two prior sessions disclaimed. No edits, commits, `git add`, stash, or
installs were made in Jini. All test commands below are scoped `vitest run <path>` invocations
from inside the relevant package directory, using each package's own `vitest` (`node_modules/.bin`
resolved locally, no install run).

**Out of scope, per instruction — not investigated or touched:**
`packages/admin/src/react/components/Sidebar.tsx`(+test), `packages/chat/src/react/features/chat-pane/**`
(incl. `ChatPane.tsx`/test, `types.ts`, `useChatPaneComposerPlaceholder.*`, `packages/chat/package.json`),
`packages/server/src/create-local-node-daemon.ts`(+test) — another session is actively editing these.
`packages/tokens/` and `pnpm-lock.yaml` were already accounted for (an earlier session's lockfile fix).

## Summary table

| Cluster | Coherent/finished? | Tests | Written | Danger |
|---|---|---|---|---|
| CMS content-types: `relation`+`json` field kinds | Yes, finished | 189/189 pass | 2026-09-05 13:09–13:20 | Widens a public/security-critical enum — see below |
| Admin core: generic `AdminEntityPort` | Yes, finished | 146/146 pass | 2026-09-05 12:42–14:13 | Additive only, low risk |
| `packages/ui` RemixIcon stylesheet fallback | Yes, finished | 10/10 pass | 2026-09-05 12:12–12:17 | Additive + behavior fix, low risk |
| `packages/vibecoding` `./react` subpath | Yes, finished | 43/43 pass | 2026-09-05 10:35–10:54 | New public export surface, additive |
| `tovu-learnings.md` correction | Yes, finished (docs only) | n/a | 2026-09-05 12:13 | None — corrects a prior false claim |
| `packages/core/devops/http-kit/mcp` version bumps | Version-only, **no accompanying diff** | n/a | 2026-09-02 14:54–15:22 | Unexplained — see below |
| `.rebuild.lock`, `cache/` | Stale tool droppings | n/a | `.rebuild.lock` 2026-08-31; `cache/` 2026-08-18 | Should be gitignored, not committed |

All scoped test runs are exit 0. Nothing in this report was fixed — every finding below is
recorded as found.

## 1. CMS content-types — `relation` and `json` field kinds

**What it is.** Adds two field kinds to `@jini-ai/cms`'s content-type system:
- `relation` — a foreign-entity id, stored and CAST exactly like `text` (`"TEXT"` was already in
  the CAST table twice; this adds a KEY, not a new VALUE, to the DDL alphabet).
- `json` — storage-only, never indexed. Validated by a new bounded recursive checker
  (`isBoundedJsonValue`, depth-capped at 32, node-capped at 10,000) that rejects anything
  `JSON.stringify` would silently mangle or crash on (functions, symbols, `NaN`/`Infinity`,
  circular refs, non-plain objects like `Map`/`Date`).

Files touched: `types.ts` (splits `ContentTypeFieldKind` into `IndexableFieldKind` ∪
`StorageOnlyFieldKind`, both compiler-enforced via `Record<IndexableFieldKind, string>` in
`index-provisioning.ts`), `index-provisioning.ts`, `errors.ts` (new
`StorageOnlyFieldNotQueryableError`, deliberately subclassing `InvalidFieldKindError` rather than
sibling so existing HTTP boundary `instanceof` mapping doesn't regress to 500s), `write-service.ts`
(new guard 4b: storage-only + `queryable: true` rejected before the queryable cap), `agent-tools.ts`
(schema description update), `field-validation.ts` (the bounded JSON checker), `README.md`.

**Coherent and finished.** Every code path is covered by a test; the module's own header comments
state the security invariant precisely (a CAST value can only ever be one of the compile-time
literals in `KIND_TO_CAST_LITERAL` — never the caller's `kind` argument, echoed or templated) and
name the "degrade to unavailable, never to injectable" failure mode if every runtime guard were
deleted. This reads as complete, reviewed-quality work, not a mid-flight sketch.

**Tests: pass.**
```
cd packages/cms && ../../node_modules/.bin/vitest run src/content-types/__tests__/ src/entries/__tests__/
Test Files  23 passed (23)
     Tests  189 passed (189)
```
Includes the two new files (`field-kind-widening.test.ts`, 17 tests; `field-validation.json-kind.test.ts`,
36 tests) and the modified `index-provisioning.ddl-safety.test.ts` (11 tests, unchanged pass count).

**Notable trap, not a defect:** `index-provisioning.ddl-safety.test.ts` contains one literal embedded
NUL byte inside an adversarial test string (`"\x00text"`, a null-byte-injection payload alongside the
SQL-injection payloads in that file). `file` reports this file as `data`, not text, and a recursive
`grep` (this repo's own documented trap) silently skips it. Confirmed with `python3` byte inspection;
this is deliberate test data, not corruption — flagging only because it will silently defeat any
future grep-based audit of this file.

**Danger: yes, worth flagging explicitly.** This widens `ContentTypeFieldKind`, a public/exported
enum in a module whose own docs call it "THE HIGHEST-SECURITY-SEVERITY MODULE in the 5-package
pipeline." The widening itself is safe by the exhaustiveness design (adding a table KEY with an
already-present VALUE is not a DDL-alphabet change, and this is stated and tested). The real
surprise-risk for a consumer: any downstream code with an **exhaustive switch over
`ContentTypeFieldKind` and no `default` arm** (the same "migration hazard" pattern independently
documented in the admin/core cluster below, for a different enum) will fail to compile the moment
this lands. `conformsToKind`'s own new comment names this precisely: "a kind added ... without an
arm here does not fail the build, it produces a field that can be DECLARED but whose every value is
rejected on write" for one function, vs. a hard compile break for an exhaustive-switch consumer
elsewhere. Recommend: before this lands, grep consumers of `ContentTypeFieldKind` for exhaustive
switches without a `default`.

## 2. Admin core — generic `AdminEntityPort`

**What it is.** A new, generic CRUD port (`packages/admin/src/core/ports/entities.ts`, 328 lines)
letting one admin screen render *any* application-defined entity (fields declared as a descriptor,
row type derived via mapped/conditional types) with no per-entity code — plus its runtime half
(`entities/rules.ts`, 426 lines: registry construction, descriptor validation, type-erasure for a
screen generic over all entities). Re-exported from `core/index.ts`, `core/ports/index.ts`, and
(for the unrelated but co-committed `DataTable` sort types — see below) `react/index.ts`.

**Coherent and finished.** Extensive header documentation explaining every deliberate omission
(no `workspaceId`, no response envelope, no `expectedVersion`, no publication lifecycle, no
per-operation auth) with reasoning for each. Two new test files:
`__tests__/entities.test.ts` (412 lines: descriptor validation, lookup safety, erasure, erasure
conformance, mismatch description — 63 tests) and `__tests__/menu-target-narrowing.test.ts`
(65 lines, 3 tests, unrelated to entities — see below).

**Also in this commit-worthy diff, unrelated to entities but real:** `react/index.ts` now re-exports
`DataTableColumnSort`/`DataTableSortDirection`/`DataTableSortState` from `DataTable.tsx`.
`DataTable.tsx` itself is **not modified** — the sort feature it exposes was already fully built and
committed; only the barrel re-export was missing. This is the repo's own dominant defect pattern
("correct primitive, unwired call site") — here it's being *fixed*, not introduced.

**`ports/menus.ts`: doc-only, no functional diff.** Adds two long comment blocks: (a) a "migration
hazard" note that any host's own exhaustive switch over `AdminMenuTarget` with no `default` arm
will fail to compile against this port (confirmed by the comment against a real host function,
`MenuEditor.tsx`'s `targetForKind` — that file is out of my scope, untouched here), and (b) a
re-evaluation of a previously-deferred decision (whether `AdminMenuCustomTarget` needs a fifth named
`kind`), concluding "not fired" with four cited findings. No exported type or runtime code changed.

**Tests: pass.**
```
cd packages/admin && ../../node_modules/.bin/vitest run src/core/__tests__/
Test Files  8 passed (8)
     Tests  146 passed (146)
```

**Danger: low.** Purely additive new export surface; nothing existing is renamed, narrowed, or
removed.

## 3. `packages/ui` — RemixIcon stylesheet fallback

**What it is.** `RemixIcon.tsx`'s default stylesheet auto-injection previously assumed
`new URL('./remixicon-font/remixicon.css', import.meta.url)` "always resolves correctly" — the
comment explicitly retracts that claim, citing three confirmed live bundler failure modes (Vite
dev pre-bundling, `iife`/`umd` inlining to a `data:` URL whose relative `@font-face` can never
resolve, production ESM asset-copying that drops the font alongside the CSS). Adds: a new exported
`installRemixIconStylesheet({ href })` opt-in for a bundled host, detection of the `data:`/`blob:`
failure mode before ever injecting it, a `<link error>` handler that removes a 404'd stylesheet
(rather than leaving a dead marker blocking any later override) and warns once via `console.warn`.
Also exports `REMIXICON_STYLESHEET_MARKER` (was a private `const`) since four separate copies of
that literal string already existed across two host products.

**Coherent and finished.** New test file `RemixIcon.stylesheet.test.tsx`, 10 tests, covering the
marker export, the opt-in installer, the `data:`-URL rejection, and the 404 cleanup path.

**Tests: pass.**
```
cd packages/ui && ../../node_modules/.bin/vitest run src/react/__tests__/components/RemixIcon.stylesheet.test.tsx
Test Files  1 passed (1)
     Tests  10 passed (10)
```

**Danger: low-moderate.** This is a real behavior change (a stylesheet that previously loaded, even
if pointing at a broken `data:` URL, is now suppressed with a warning instead), but it is a bug fix
correcting a documented-false prior claim, not a scope expansion, and is exactly what the
`packages/ui` `0.3.3 -> 0.3.4` patch bump matches 1:1.

## 4. `packages/vibecoding` — `./react` subpath

**What it is.** Adds the `./react` entry (`VibecodingSession`, tool set, `DocumentPreview`/
`PartsViewer`/`VibecodingWorkbench` components) that the package's own README already described as
planned ("the chat/preview surface behind ./react"). `package.json` gains the subpath export,
React/React-DOM as optional peers, and matching devDependencies; `tsconfig.json` adds
`DOM`/`DOM.Iterable`/`react-jsx`; `vitest.config.ts` routes `src/react/**` to jsdom via
`environmentMatchGlobs` (mirroring `@jini-ai/chat`'s own config, by explicit comment) while keeping
`src/core/**`/`src/html/**` DOM-free by default.

**Coherent and finished.** 7 new source files + 6 new test files, written in one tight ~16-minute
window (10:38–10:54, file mtimes). `vitest.setup.ts` (new) wires `@testing-library/jest-dom`.

**Tests: pass.**
```
cd packages/vibecoding && ../../node_modules/.bin/vitest run src/react/
Test Files  6 passed (6)
     Tests  43 passed (43)
```

**Danger: low.** New subpath, additive; nothing existing changes shape.

## 5. `tovu-learnings.md` correction

Docs-only. Corrects a previously-recorded claim ("`chat-react` ships zero CSS and zero documented
DOM structure") that a prior session apparently took at face value and which misled two later
sessions into styling from scratch against CSS that already existed. States precisely what is true
(direct-composition users get zero CSS) vs. false (`<ChatPane>` injects a 1,473-line themed
stylesheet driven by 16 `--jini-chat-*` custom properties) vs. partially addressed (`reference.css`
now ships and is exported, contra its own stale header comment). Cites `@jini-ai/chat@0.3.3`,
which matches that package's own uncommitted version bump — this correction is evidence for, not
independent of, the chat-pane work another session owns and I did not otherwise investigate.
**No danger** — corrects the record, touches no code.

## 6. Version-only bumps: `core`, `devops`, `http-kit`, `mcp`

`packages/core/package.json` (0.3.0→0.3.1), `packages/devops/package.json` (0.3.0→0.3.1),
`packages/http-kit/package.json` (0.3.0→0.3.2), `packages/mcp/package.json` (0.3.0→0.3.1). **No
other file under any of these four packages appears in `git status`** — no source, no test, no
README change accompanies any of them.

mtimes cluster tightly: core 14:54:55, http-kit 14:57:09, mcp 15:06:12, devops 15:22:09 — all
2026-09-02, a single ~30-minute window, and well before any of the feature clusters above (which
start 2026-09-05 10:35). This reads as a batch operation (a version-bump script, or a
partially-run/aborted publish flow — `packages/*/scripts/publish-all.ts` exists in this repo)
rather than four independent decisions. I did not run that script or query the npm registry to
confirm what, if anything, actually shipped at these version numbers — that would need a network
call or execution I was not asked to make.

**Unexplained, not obviously dangerous, but flag before acting on it.** A version bump with no
content change is not itself harmful, but leaving it uncommitted next to genuinely new, unrelated
feature work risks it getting silently swept into an unrelated commit, or a real publish going out
under a version number nobody can point to a changelog for. Recommend asking whoever ran
`publish-all.ts` (or whatever produced this) directly, rather than guessing further.

`packages/ui` (0.3.3→0.3.4) and `packages/cms` (0.3.1→0.3.4) bumps DO correlate with real diffs in
this report (RemixIcon; the field-kind work) — `cms` jumped three patch versions, which is outside
what I could account for with only the current diff (may reflect earlier, already-released patches
this session's diff doesn't show). `packages/chat` (0.3.2→0.3.3) is out of my scope (see above) but
is referenced and explained by the `tovu-learnings.md` correction (§5).

## 7. `.rebuild.lock` and `cache/`

- **`.rebuild.lock`** (repo root, untracked): 5 bytes, contents `77459` (looks like a bare PID).
  mtime 2026-08-31 16:34 — nearly a week stale relative to every other cluster here. No script under
  `scripts/`, no `package.json` in the repo, references `.rebuild.lock`, `REBUILD_LOCK`, or
  `rebuildLock` by name (checked `scripts/`, root and per-package `package.json`). Origin unknown;
  reads like an abandoned lock from some external file-watcher/rebuild process, not from anything
  this repo's own tooling writes.
- **`cache/ast/v0.8.50/`** (repo root, untracked): 97 MB, ~1,050 JSON files, oldest/newest mtimes
  both 2026-08-18. Content inspection shows these are **AST/knowledge-graph node dumps that index
  Tovu's own files** — e.g. one file's nodes cite
  `AI-Dev-Shop/harness-engineering/agent-evals/code-review-evals/.../test_billing_reconciliation.py`,
  which is a **Tovu** path, not a Jini one. This is almost certainly a code-graph/understanding
  tool's cache, written to `cache/` relative to whatever the tool's cwd was on 2026-08-18 (Jini's
  root), while it was actually analyzing Tovu. It has nothing to do with any of the six work
  clusters above and predates all of them by over two weeks.

**Should these be gitignored? Yes, both — not added, per instruction.** `.gitignore` currently has
no entry for `cache/` or `.rebuild.lock` (checked; it does list `.tmp/`, `coverage/`,
`dist-tarballs/`, etc., so this is a real gap, not an oversight already covered by a broader
pattern). Recommend adding `cache/` and `.rebuild.lock` to `.gitignore`. I did not add them — this
report only recommends.

## What I'd prioritize, if asked

1. Land the CMS `relation`/`json` field-kind work and the admin `AdminEntityPort` — both are
   finished, tested, and the highest-value work here. Before landing the CMS change, grep for any
   exhaustive `switch (kind: ContentTypeFieldKind)` with no `default` in consumers.
2. Land the RemixIcon fix and the vibecoding `./react` subpath — both finished, tested, lower risk.
3. Ask about the four bare version bumps (core/devops/http-kit/mcp) before they ride along with
   anything else — get an answer, don't guess further.
4. Add `cache/` and `.rebuild.lock` to `.gitignore`; the 97 MB `cache/` in particular should never
   reach a commit.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YZF3fbtWCk22yiC2eFnorh
