# T-DEDUPE: Jini already has it; Tovu keeps only its binding

Template for kind DEDUPE (KINDS.md §4). Worked example: `../sonnet-extract-pilot/E03-site-chat-remixicon.md`. Executor: Sonnet 5.5 high (cap 6 files / 1.2k lines per job).

## Sheet (filled per slice)
```
id: {ID}                                   # DD-<feature-slug>-<n>
feature: {FEATURE}
tovu_files:
  - {path} | blob {sha} | {reduce-to-binding | delete-and-repoint | type-narrowing}
jini_survivor: {@jini-ai/pkg/subpath | @jini-ai/pkg (barrel)} {name} at {jini file:line} | blob {sha}   # "(barrel)": name exported only from the package root (Tovu may import barrels; COMMON rule 5 binds Jini-side imports only)
behaviour_diff:                            # filled by READING both bodies, never from the survey label alone
  - {aspect: args | return | errors+wording | side effects | ordering | filtering | defaults | DOM/CSS | bundle}: Tovu {x} / Jini {y} / {same | differs}
real_caller_check: {one Tovu caller path:line and what it relies on (return used? error caught by message?)}
binding: |
  {the new Tovu body: one call to the Jini name with Tovu's values; or "-" when deleted}
why_moves:
  - "{comment first words}" -> {stays in Tovu above the binding | moves to Jini declaration {file}}
jini_test_text: {neutralise Tovu paths/names in an existing Jini test: exact old -> new + count, or -}
failing_test: |
  {only if any behaviour_diff says "differs": the new Tovu test (file, describe block, code) that pins the NEW behaviour; else -}
importer_edits:                            # for delete-and-repoint
  - {path}: "{old}" -> "{new}"
census: {cmd} | allowed: [{path:line}, …]
bundle_check: {public bundle path + threshold, or -}
jini_msg: {"test(pkg): …" or -} | tovu_msg: "{refactor(area): … through @jini-ai/…}" | body "{behaviour line if any}"
```

## Steps
0. Branch rule; blobs; `rg -n "export (function|const|class|interface|type) {name}\b" {jini file}` prints exactly one line; for `(barrel)`, also `rg -n "{name}" {barrel file}` shows the re-export chain the sheet cites.
   - `type-narrowing` variant (type-only file, Jini type is a superset): `behaviour_diff` lists only type rows (`type: Tovu {narrow} / Jini {wide} / narrowed`); no `failing_test`; `binding` is the whole new Tovu file (Tovu interface `extends` the Jini one, overriding only the narrowed fields; aliases become indexed access such as `JiniType['field']`); importers change only if the sheet says so. Cloud typecheck is the check.
1. Re-read both bodies and confirm each `behaviour_diff` row as written. A row the sheet calls `same` that you find different: SKIP with the difference (the sheet must be redone; the case may be a HARDEN).
2. Jini (only if `jini_test_text` is set): apply it, eslint, commit (test-only: no changeset).
3. Tovu: if `failing_test` is set, add it FIRST (do not run it; report it as RED-expected).
4. Apply `binding` (keep the whole `@file` header and every why-comment; Tovu-specific why stays above the binding), or `importer_edits` + `git rm -q` for `delete-and-repoint`.
5. Census: only the listed importers; no hit names a deleted path.
6. eslint; commit with every Tovu path. Report the `bundle_check` as owed to the cloud run.

## STOP specific to DEDUPE
- Jini's version lacks something Tovu relies on (per `real_caller_check`): SKIP "needs HARDEN".
- The binding would import a Jini package the Tovu app does not already depend on in its `package.json`.
- A public bundle grows past `bundle_check` (cloud run reports it; revert and ask for a narrower Jini subpath).
