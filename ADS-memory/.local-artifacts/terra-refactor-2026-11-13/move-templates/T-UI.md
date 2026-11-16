# T-UI: React component/hook moves to `@jini-ai/ui` or a domain `*/react` subpath

Template for kind UI (KINDS.md §7). Worked example: `../sonnet-extract-pilot/E04-code-view-wrap.md`. Executor: Sonnet 5.5 high (cap 6 files / 1.2k lines; ~10 Tovu files touched is the upper bound the pilot tests). A Claude-in-Chrome look is owed after landing (owner rule "UI fix = look at it").

## Sheet (filled per slice)
```
id: {ID}                                   # UI-<feature-slug>-<n>
feature: {FEATURE}
tovu_files:
  - {path} | blob {sha} | {delete | keep-reduced}
jini_target: {pkg} {subpath} {files}       # pkg ui/ui-kit: may import @jini-ai/ui; any other pkg: kit injected (COMMON rule 6)
kit_injection: {- | the props/slots/KitProvider components the host passes, e.g. "Select via props.components.Select"}
components:
  - {Tovu name} -> {Jini name} | props {old -> new; i18n via `t: Translate` from the host}
jini_code: |
  {full content of each new/changed Jini file}
jini_index: {after "{exact line}" insert: …}
class_renames:                             # every class the moved JSX renders that Tovu CSS/tests/e2e select
  - "{old}" -> "jini-{new}" | files+counts: [{path}: {n}, …]   # do each replacement ONCE; new text contains old
agent_handles: {handle ids the moved JSX emits: unchanged (wire contract) | renamed with the list of e2e/agent references}
i18n: {keys the Jini component asks for via t(); Tovu dictionaries keep the strings: unchanged | added keys}
jini_tests: {new/extended test cases, code}
tovu_imports:                              # exact old -> new; merge into an existing @jini-ai/<pkg> named import if one exists
  - {path}: "{old}" -> "{new}"
jsx_edits:
  - {path}: "{old}" -> "{new}"
comment_edits: {Tovu CSS/test comments that name the old file: old -> new}
changeset: {pkg}: minor | "{sentence}"
census: {cmd} | allowed: [...]
look: {the screens/states to check in Chrome after landing}
jini_msg / tovu_msg: {…}
```

## Steps
0. Branch rule; blobs; Jini guards (new names absent: `rg -n "{names}" packages/{pkg}/src` prints nothing). If `jini_target` pkg is not `ui`/`ui-kit` and `kit_injection` is `-` while the code renders a kit component: STOP.
### Jini (commit 1)
1. Write `jini_code`; `jini_index`; `jini_tests`; changeset. New classes: `jini-` prefix only.
2. Rule checks (COMMON 2–9 + rule 6); `rg -n "className=\"(?!jini-|code-viewer|gutter|lines)" <new files>` lists only classes the sheet keeps on purpose; eslint; commit.
### Tovu (commit 2)
3. Census; `tovu_imports`; `jsx_edits`.
4. `class_renames` in exactly the listed files with exactly the listed counts (CSS, unit tests, e2e journeys/pins); `comment_edits`. Leave history docs (`development/*backlog*.md`) alone.
5. `git rm -q` deleted files; re-census: every selector hit carries `jini-`; eslint `.ts/.tsx`; commit.
6. Report the `look` list as owed.

## STOP specific to UI
- A rename count differs from the sheet.
- The moved component reads Tovu state (router, api client, auth context, settings store) that the sheet does not turn into a prop or port.
- An admin function would exceed complexity 9/9 after the edit.
- `agent_handles` would change and the sheet does not list every reference.
