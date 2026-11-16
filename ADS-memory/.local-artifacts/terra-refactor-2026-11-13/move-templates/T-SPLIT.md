# T-SPLIT: MIXED file — the generic half moves to Jini, Tovu keeps the product half and binds ports

Template for kind SPLIT (KINDS.md §6). Worked example: `../sonnet-extract-pilot/E02-provider-revision-watch.md`. Executor: Sonnet 5.5 high. Sheet: Sonnet for ≤ 2 files / ≤ 600 lines / ≤ 3 ports; Sonnet draft + Opus review when the survey note maps every function; Opus otherwise.

## Sheet (filled per slice)
```
id: {ID}                                   # SP-<feature-slug>-<n>
feature: {FEATURE}
tovu_files:
  - {path} | {blob sha | "text-guarded (shared/hot file)"}
split:                                     # every top-level declaration of each file, none omitted
  - {name} | MOVE -> {jini file} | STAY-PRODUCT | STAY-WIRING | DELETE
ports:                                     # what the moved code needs from Tovu; smallest set that works
  - {portName}: {TS signature, object args} | Tovu binds {expression} in {file}
      why: {the Tovu fact it hides: SQL table, key format, env name, product rule}
shape_changes:                             # positional -> (required, optional = {}); every caller listed
  - {name}: {old signature} -> {new signature} | callers: [{path:line}, …]
jini_code: |
  {full content of the new/extended Jini file: moved bodies verbatim apart from port calls and shape changes;
   neutral header; why-comments carried}
jini_index: {subpath index.ts: after "{exact line}" insert "{export line}"}
tovu_reduced: |
  {per Tovu file: exact deletions (from "{first line}" through "{last line}") and the pointer comment appended,
   e.g. "// The <thing> lives in `@jini-ai/pkg/sub` (`name`); Tovu binds <port> here."}
binding_edits:                             # composition/deps edits, exact old -> new (multi-line OK), each must occur once
  - {path}: |
      OLD: {…}
      NEW: {…}
tests_split:                               # each Tovu test goes where what it exercises lives
  - {test path}:{test name or line range} -> {jini new test file | stays in Tovu, edits: …}
changeset: {pkg}: minor | "{sentence}"
census: {cmd} | allowed: [...]
jini_msg: "{feat(pkg): … with an injected <port>}" | tovu_msg: "{refactor(area): <thing> from @jini-ai/…}" | body "{what Tovu keeps}"
extra_stops: {e.g. "if providerPluginOf is already imported in deps.ts, STOP"}
```

## Steps
0. Branch rule; blobs for non-hot files; for hot files (composition `deps.ts`, `app.ts`, `index.ts`, anything an arg lane touches) every OLD text must occur exactly once. Jini guards: new file absent; `rg` for every moved name prints nothing in the target package.
### Jini (commit 1)
1. Create `jini_code` exactly; add `jini_index`.
2. Moved tests: create the Jini test file from `tests_split` (vitest import, relative import to the leaf file, fakes for every port).
3. Changeset; rule checks (COMMON 2–9; in particular: no SQL strings, no Tovu key formats, no env names in Jini); eslint; commit.
### Tovu (commit 2)
4. Census; then `tovu_reduced`, `shape_changes` at every listed caller, `binding_edits`.
5. Tests: delete the moved cases, repoint the rest per `tests_split`.
6. eslint all touched files; commit every Tovu path.

## STOP specific to SPLIT
- A declaration exists that `split` does not list (the file changed since the sheet): SKIP.
- A moved body needs a Tovu import that is not a listed port.
- More ports would be needed than listed, or a port would carry a Tovu type (types it uses must be declared in Jini or `@jini-ai/core/contracts`).
- A moved function would exceed 50 lines / complexity 10 after adding port calls and the sheet gives no split.
- A hot-file OLD text occurs 0 or 2+ times (an arg lane moved it): SKIP; never re-derive it.
