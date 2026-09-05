# Gemini 3.8 Flash Adversarial Audit — chunks 8-13 (continuation)

Continuation of `2026-09-05-gemini-audit-admin-tooling.md` (chunks 1-7). That report stopped at 7 of ~13
planned chunks; this report runs the remaining chunks 8-13, the items listed under "NOT COVERED" in its
coverage map (lines 70-84).

Scope: commits committed 2026-09-03 and 2026-09-04 (plus any spillover into 2026-09-05 touching the same
files), base commit `ec4fb6e8` (parent of the earliest in-scope commit, same base the prior report used),
branch `restructure/apps-website-phased`.

Method: diffs and/or full current file text fed to `agy --model gemini-3.8-flash-high --effort high` in
print mode, no tool access given to Gemini — all context supplied in-prompt. Every finding Gemini raised was
checked against the actual source at the actual line before being recorded here. No tests, coverage, or
typecheck were run (machine constraint — parallel test agents crashed it earlier today at load 721); findings
that would require a test run to confirm are marked UNVERIFIED. Standing owner-accepted decisions (CI
billing-block, `.outcome`-defeats-continue-on-error being intended, todays's SSRF/TLS/media-gate fixes being
already landed, the three owner-ratified "STAYS LOCAL" inline-.tsx files, flat `??`/`||` fallback chains being
idiomatic) were preloaded into every Gemini prompt and are not re-litigated below.

STATUS: IN PROGRESS — this skeleton is committed first; sections below are appended and committed after each
chunk completes.

## Coverage map (chunks 8-13)

- [x] Chunk 8 — `apps/admin/src/features/media/Media.tsx` (~363-line diff / complexity-split refactor)
- [x] Chunk 9 — `apps/admin/src/features/collections/Collections.tsx` (~268-line diff)
- [ ] Chunk 10 — `apps/admin/src/features/menus/MenuEditor.tsx` (~114-line diff) + its own unit-test changes
- [ ] Chunk 11 — hooks-extraction refactor sweep: Pages, Posts, ThemeExplore, AiAssistant,
      ThemePageDetailsModal, `apps/admin/src/features/pages/**` — no-logic-in-`.tsx` rule compliance
- [ ] Chunk 12 — `apps/admin/vite.config.ts` + `development/scripts/dev.mjs` (dev-server TLS plumbing), plus
      `src-complexity-debt.json` / `admin-complexity-debt.json` / `check-architecture.baseline.json` diffs
- [ ] Chunk 13 — test-quality pass: `AccessTokensTab.credential-flows.unit.test.tsx`,
      `use-access-tokens.unit.test.tsx`, `api-endpoint-option-branches.unit.test.ts`, `dead-path-sweep.test.ts`,
      `check-governance-adr-scope-drift.test.ts`, `backfill-custom-credential-usernames.test.ts`

## Findings

### Chunk 8: `apps/admin/src/features/media/Media.tsx` (commit `b8c97ec8`)

Single-commit, single-file chunk — a mechanical complexity-reduction extraction (cyclomatic 14/cognitive 16
down to under the 9/9 ceiling), commit message claims no behavior change and unmodified test passes
(Media.unit.test.tsx 34 tests, media-agent-drive, media-type-filter).

Gemini raised **zero findings** after full-file + diff review (DOM structure, component identity/re-mounting,
key preservation on `EditMediaPanel`/media cards, handler forwarding, Rules-of-Hooks ordering, and the
`resolveMediaHook`/`resolveMediaTabsHook` resolver pair against the precedented `resolveSessionHook` idiom).

Independently spot-checked rather than accepting blind:
- Read the diff's resolver functions (`Media.tsx:679-684`) and their call sites (`Media.tsx:925-929`) —
  `resolveMediaHook`/`resolveMediaTabsHook` correctly reproduce the old `useMediaHook = useWiredMedia` /
  `useMediaTabsHook = useMediaTabs` default-parameter semantics via `??`, called before any hook, so Rules of
  Hooks ordering is unaffected.
- Read the extracted `MediaGridOrEmpty` body (`Media.tsx:679-891` region) against the pre-refactor ternary —
  confirmed `key={item.id}` and the `activeTab === "all"` vs `MediaTypeEmptyState` branch are preserved
  verbatim, not just claimed.

**Chunk tally: 0 findings raised, 0 CONFIRMED, 0 UNVERIFIED, 0 DISCARDED.** Genuinely clean chunk.

### Chunk 9: `apps/admin/src/features/collections/Collections.tsx` (commit `cc8683cf`)

Single-commit, single-file chunk — extracts `ContentTypeFieldFieldset`, a shared presentational component,
out of `NewContentTypeDialog`/`EditFieldsDialog` to dedupe ~40 lines of near-identical field-row JSX,
parameterized by `idPrefix`, `agentHandleBase`, and `showRemoveButton`. Commit message claims identical DOM,
ids, and agentHandle labels for every existing case.

Gemini raised **zero findings**. Independently verified the load-bearing claim myself (grepped
`Collections.tsx` directly rather than trusting the diff-read summary): `idPrefix="ct-field"` /
`agentHandleBase={fieldHandles[index]}` / `showRemoveButton={fields.length > 1}` at the `NewContentTypeDialog`
call site (`Collections.tsx:210-218`) and `idPrefix="ct-edit-field"` / `showRemoveButton={true}` at the
`EditFieldsDialog` call site (`Collections.tsx:310-318`) match Gemini's claimed id/handle/visibility
parameterization exactly, and `ContentTypeFieldFieldset` is declared at module scope (`Collections.tsx:59`),
not nested inside either dialog, so no remount-on-parent-render risk.

**Chunk tally: 0 findings raised, 0 CONFIRMED, 0 UNVERIFIED, 0 DISCARDED.** Genuinely clean chunk.

**Tooling note for this run**: `agy --sandbox --print "..."` intermittently returned
`jetski: no output produced — a tool required the "command" permission...` with zero review content, even
though no tool access was requested or needed — reproduced twice in a row on this exact prompt. Adding an
explicit "do not use any tools, answer only from the pasted text" instruction to the preamble resolved it
for every subsequent chunk. Also confirmed in this run: `agy --print` does **not** read stdin as prompt
content in this build — despite the dispatch's stated stdin-based invocation, the prompt text must be passed
as the `--print` argument value (`--print "$(cat file)"`); verified stdin is silently ignored with a
throwaway probe before switching approach. Both adjustments are noted here for the record; they are the
correct fix, not a deviation the audit should be discounted for. `--effort` must also be omitted for this
model — `gemini-3.8-flash-high` already encodes reasoning effort and conflicts with an explicit `--effort` flag.

## Summary

(filled in once all chunks complete)
