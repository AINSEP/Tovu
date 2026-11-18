# SC-3a refresh

Status: refreshed and implemented in the working tree. No unresolved substantive
mismatch remains under the owner/coordinator decision in this dispatch.
Cloud verification is pending; no runtime-green claim is made.

## Grounding and authorization

- Spec: supplied SC-3a and COMMON-LO revision 3, amended by the binding decision
  authorizing the existing gate test import change and reuse of its assertion.
- HEAD: `2d82735a6767fb8572e6a10bf3be6ee2eb07b8f4`.
- `git merge-base --is-ancestor 232764af5 HEAD` exited 0.
- Initial status: only the prior untracked `REFRESH.md`; no source/test edits.
- All five prior refreshed hashes below matched before editing.
- SC-3a has no separate prerequisite, decision gate, Jini edit, manifest edit,
  or supplied numeric blob guard. Its missing sidecar is replaced by the
  section-derived file list below, as instructed.
- `AI-Dev-Shop/` is absent as expected. The requested programmer and guardrail
  files were read at the supplied absolute paths. The dispatch overrides broader
  bootstrap, discovery, approval, test execution and git-write workflows.

## Mismatches and corrected facts

| Item | Class | Corrected guard/path/fact |
| --- | --- | --- |
| Sheet/common artifact locations | BENIGN | The prior refresh found `left-out-areas/sheets/SC-source-control.md`, `left-out-areas/sheets/SC.md` and `left-out-areas/COMMON-LO.md` absent at those candidate paths. The complete dispatch text supplies the spec; no repo-wide search is needed. |
| Missing `SC-3a.files.tsv` | BENIGN, expected | Derive scope from SC-3a and the binding decision. Use the matching pre-edit hashes below. |
| Tool import line and unrelated edits | BENIGN | The combined map/validator import was at line 37, rather than 38. Map uses were at lines 132 and 159. `RepositoryTargetValidator` stays a type import from `provider-module.js`; only the map moves. |
| Composition reader import drift | BENIGN | Map import remained line 2 and uses lines 18/23. Other credential imports use domain `index` entries instead of `store`; those imports stay unchanged. |
| No test imports the map / three-reader list | Previously SUBSTANTIVE; RESOLVED by binding decision | `gates.characterization.unit.test.ts:23` also imported the map. Owner explicitly authorizes repointing it to `../saved-key-bindings.js`; `SourceControlProviderKit` remains a type import from `../provider-module.js`. Under the amended spec this is benign importer-list drift. |
| Add a single-entry unit test | Previously SUBSTANTIVE; RESOLVED by binding decision | The existing test at pre-edit lines 336-338 already asserts exactly `[["github", "github"]]`. Owner requires keeping that assertion and avoiding a duplicate test. Only its import was changed, before production edits. |
| Provider file documentation | BENIGN | The header described saved-key labels as being “below”. It now names `saved-key-bindings.ts`; the map's own policy comment moved verbatim. |
| Prior-run artifact inventory | BENIGN | Dispatch mentioned an existing `COMMIT-PLAN.md`, but it was absent. Created it for the single completed implementation unit. |

The prior substantive stop concerned edit authorization and duplicate testing,
not a changed map contract. The dispatch supplies that missing decision; no new
owner decision is needed.

## Section-derived scope and pre-edit read guards

Paths are relative to this repo. Hashes were freshly read with `git hash-object`
and exactly matched the previous refresh. Counts below describe pre-edit files.

| Existing path | Lines | Blob |
| --- | ---: | --- |
| `apps/website/src/features/source-control/provider-module.ts` | 228 | `6eaea9f9f2ed573604f116e1fe3e84ebbc85d6aa` |
| `apps/website/src/features/source-control/tool-registrations.ts` | 511 | `f9d21751c939ec5c44b098559b38edb420f6e68e` |
| `apps/website/src/server/runtime/composition/source-control-key-binding.ts` | 44 | `9a8040da7c79e889448e4a31cfe3f87af8176c40` |
| `apps/website/src/cli/commands/owner-store-mapping.ts` | 19 | `8910ff20ee69dbce4c65f2a4ca112bce9d2bbcf7` |
| `apps/website/src/features/source-control/__tests__/gates.characterization.unit.test.ts` | 489 | `ec838182ca56af31e3ec0017ac70433c78573c79` |

New production file: `apps/website/src/features/source-control/saved-key-bindings.ts`
(absent before editing). Required root artifacts: this report and `COMMIT-PLAN.md`.
No new test file is needed under the binding decision.

## Execution and static evidence

- Test seam first: repointed the existing characterization import; the exact-entry
  assertion is unchanged. Mutation: remove `github` or change its saved-key label;
  `assert.deepEqual([...sourceControlSavedApiKeyLabels], [["github", "github"]])`
  would fail. No mutation or test was executed locally.
- Moved the typed map and its two-line policy comment verbatim. Repointed all
  three named production readers. No forwarding export or new function added.
- Reuse: the existing map remains the sole policy owner. Scoped symbol searches
  inspected `features/source-control`, `server/runtime/composition` and
  `cli/commands`; the existing gate test supplies the exact requested assertion.
- End check `rg -n "^export (const|function|class|let|enum)"` on
  `provider-module.ts` printed nothing. The file contains only types/interfaces
  and a type import.
- Scoped map census in the three areas above finds the sole declaration in
  `saved-key-bindings.ts` and four importers using it. No map import remains from
  `provider-module`. No repo-wide importer-completeness claim is made.
- `git diff --check` exited 0 with no output. Reviewed the complete scoped diff
  and the new file; only the specified move, imports and header correction changed.
- Architecture review: host credential-label policy stays in Tovu; provider ABI
  types remain unchanged. No new logic-bearing functions, effects, ports,
  dependencies, suppressions, schema edits or credential writes were introduced.
- No tests, mutation runs, builds, installs, typechecks, linters, ratchets,
  graph tools, repo-wide searches, subagents or git writes were performed.
  V0-V4 and executable S-LIM checks: not run, local machine rule.
- Working-tree implementation is complete; runtime verification belongs to the
  next cloud run. No commit or push was attempted; `.git` remained read-only.
