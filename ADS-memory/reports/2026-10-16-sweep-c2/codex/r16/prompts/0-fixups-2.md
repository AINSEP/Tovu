# Tovu: new coverage tests fail in one file; fix the tests (last coverage round wrote them)

Repos: Tovu (/Users/la/Programming/Tovu, cwd). Jini (/Users/la/Programming/Jini) is READ-ONLY.
Persona: load /Users/la/Programming/Tovu/AI-Dev-Shop/agents/tdd/skills.md.

RULES: do NOT run tests, typecheck, builds or any package scripts. Do NOT commit or touch git state.
Edit code only, then report `CHANGED FILES:` (absolute paths) + `NOT DONE:` + `VERDICT:` (test bug | real product bug, file:line).
REUSE before you write. Smallest change. Never weaken an assertion to make it pass.
Edit only apps/website/src/features/settings/__tests__/publish-content.round-trip.test.ts.

## Failure (node --test, 2026-10-17): 7 tests the last round added, all the same error; older tests in the file pass
```
✖ share-image references carry only UUID media identities, and other settings never add references
  TypeError [Error]: source.db.close is not a function
      at TestContext.<anonymous> (.../publish-content.round-trip.test.ts:366:29)
✖ a share image targeting this computer is refused again at apply without writing a value or revision   (:379:29)
✖ allowlisted settings still refuse ineligible definitions: {"secret":true} / {"scopes":4} / {"status":"deprecated"}   (:395:31)
✖ an allowlisted setting with no destination definition is refused   (:416:29)
✖ an omitted incoming setting value is written as null through the revision ledger   (:427:29)
```
Find how the older tests in this file (and sibling settings tests) close the handle their fixture returns
(e.g. `db.$client.close()`, a returned `close()`, or `t.after` from the fixture itself) and do the same.
Goal for apps/website/src/features/settings/publish-content.ts: 100% lines/branches (these tests target it).
