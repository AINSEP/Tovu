# Tovu bugs2 handoff

Base: dispatch-supplied `codex/tv-bugs1` `e4cb906a3f` on `codex/tv-bugs2`.
The sheets' merge-10 base is `0973a5fdc8`; T-DISK-PINS requires the bugs1 parent.
No commits, staging, pushes, tests, builds, installs, type-checks, linters, or mutations were run.
Tests were identified or written before each production edit. RED/GREEN below describes expected behavior, not an executed result.
The absent clone bootstrap and architecture chapters use the dispatch waiver. The explicitly requested programmer skill was read.

## T-VENDOR — done (combine verification owed)

- Base: `e4cb906a3f` (sheet source anchors: `0973a5fdc8`).
- Files: `apps/website/src/features/agent-plugins/__tests__/unit/overlay-guidance-single-copy.unit.test.ts`; `apps/website/src/features/agent-plugins/__tests__/unit/soon-lock.unit.test.ts`.
- Tests: existing `apps/website/src/features/api-connections/__tests__/vendor-neutrality.test.ts`, “no generic seam file names the first provider”; scanner positive control preserved. No new case. The two old lines contain vocabulary that the generic-seam assertion rejects. The five-member host list is nonempty.
- Mutation owed to combine: restore both old lines; require the generic-seam assertion to fail. Confirm no additional hits trigger the sheet's STOP.
- API-baseline delta: none. Production, scanner scope, and exact allowlist unchanged.
- Look owed: none.
- Diff re-read deletions: no out-of-scope work to delete; the required inline inventory was replaced by the host list and the historical provider phrase was replaced.

## T-SEED-LOG — done (combine verification owed)

- Base: `e4cb906a3f` (sheet source anchors: `0973a5fdc8`).
- Files: `apps/website/src/server/runtime/boot/__tests__/fatal-boot-failure.unit.test.ts`; `apps/website/src/server/runtime/boot/process-error-guards.ts`.
- Tests: updated only the default-sink case before editing production. It requires one console call, the existing prefix, the seed-failure phrase, and no synthetic password canary. The old class/code projection loses that phrase. Installed-listener and uninstall assertions remain intact.
- Mutation owed to combine: restore the class/code-only logger path; require the diagnostic-phrase assertion to fail.
- Reuse: the default sink uses `formatErrorForLog` with `TOVU_ERROR_REDACTION_OPTIONS`, as in `apps/website/src/server/inbound/shared/admin-failure.ts`. No process entry-point edits or signature changes.
- API-baseline delta: none. Existing injected sink and listener lifecycle retained.
- Look owed: none.
- Diff re-read deletions: no out-of-scope work to delete; removed the named unused `consoleLogger` declaration and replaced its primitives import as required. It had no other use in the file.

## T-I18N — done (combine verification owed)

- Base: `e4cb906a3f` (sheet source anchors: `0973a5fdc8`).
- Files: `development/scripts/__tests__/hygiene-audit-translation-entry.test.mjs` (new); `development/scripts/hygiene-audit.mjs`.
- Tests: one CLI fixture case written before production. English/French have Save and Cancel; Spanish has object-form Save and lacks Cancel. Assertions require Spanish Cancel and forbid Spanish Save in the TSV. The old positional-only parser emits the false Spanish Save row; Cancel is the positive control.
- Fixture: its Git initialization/indexing runs only when combine executes the test, inside its disposable directory. Only the sample app source is indexed. A node_modules symlink lets the unchanged CLI resolve its already-installed dependencies from the fixture; no dependency or manifest edit.
- Mutation owed to combine: restore positional-only spread parsing and require the Spanish Save assertion to fail.
- Source: retained `blockKeys` and callers; extracted only the four named private functions. Ordinary property parsing, same-file identifier resolution, depth cap, unresolved counting, positional entries, and trim-to-empty semantics retained.
- API-baseline delta: none; no new exports. New private declarations have the specified required-object and `_optional = {}` shape.
- File-size note: `hygiene-audit.mjs` already exceeds 500 lines; continued per owner correction.
- Look owed: none.
- Diff re-read deletions: no out-of-scope work to delete; inlined parsing statements were relocated into the named declarations. The initial object-property loop in the draft was replaced with direct property lookups to keep the new reader small; no additional case or abstraction retained.

## T-DISK-PINS — done (combine verification owed)

- Base: `e4cb906a3f`, the sheet's required bugs1 parent.
- Files: `apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/import-errors.test.ts`.
- Tests: updated only the two named ID assertions, copying the exact regex from `apps/website/src/server/inbound/shared/__tests__/unexpected-admin-escape-paths.unit.test.ts:45`. Old UUID regexes reject the standard ERR IDs the current shared source mints. Status, code, message, and response-shape assertions preserved.
- Source inspection: `adminFailureResponse` still mints and returns an incident ID for typed 507s; the policy STOP does not apply.
- Mutation owed to combine: restore pre-branch UUID minting for the shared response; require both new ID assertions to fail.
- API-baseline delta: none; no production edits.
- Look owed: none.
- Diff re-read deletions: no out-of-scope work to delete; only the two old UUID regex assertions were replaced.

## Static review and verification limits

- Architecture audit: static scope review found no new boundary, dependency, exported API, manifest, or ledger changes. Existing argument pads and signatures on surviving declarations are unchanged; no casts or suppression directives added.
- Function review: the changed guard is 12 lines. The named parser declarations are each under 50 lines; manual decision-path review is within the sheet's complexity cap, including the unchanged property-loop expression. Tool-measured complexity and test/coverage evidence remain owed to combine under the machine rule.
- Assessment units: `installUnhandledRejectionGuard`, `blockKeys`, `literalLocaleArgument`, `readLocaleObject`, `readLocaleSpread`, `readTranslationEntrySpread`: INCONCLUSIVE pending combine execution; no static blocking finding identified. The parser retains its existing in-place output accumulation and depth behavior. Time/space remain linear in visited locale syntax and recorded keys; the default sink uses the existing formatter's diagnostic work.
- Second static pass checked names, unsupported shapes, positional behavior, spread ordering, depth limits, redaction wiring, unchanged pads, assertion messages, and scope. No speculative code, additional tests, or new comments remain. This does not establish runtime correctness.
- Self-validation: not run; explicitly forbidden by the dispatch. Combine owns fresh RED/GREEN, the named mutations, and metric checks. REFRESH.md records the outstanding items.
