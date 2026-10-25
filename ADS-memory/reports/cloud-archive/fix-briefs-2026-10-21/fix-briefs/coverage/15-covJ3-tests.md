Code Inspection(Peer Review): Personas used: code-inspection + security + tdd.

Reviewed test changes at `review/cov-J3` (`86856370`), sampling across packages. No tests, builds, or other execution checks were run.

| Sev | repo:file:line | Problem | Concrete fix |
|---|---|---|---|
| MEDIUM | jini:packages/ui/src/features/panel-kit/hooks/__tests__/use-standing-draft-autosave.hooks.test.tsx:94 | The cancellation test asserts `result.current` after unmount, when it remains the last rendered snapshot. Removing the source’s `cancelled = true` cleanup still passes both assertions. The test therefore does not protect against an old entry’s response overwriting the current entry’s recovery draft (F6.1). Checked the sibling recovery tests and `admin-lifecycles.test.tsx`; neither covers that transition. | Keep the hook mounted and switch `entryId` while the first read is pending. Resolve the new entry’s read, then the old read; assert the new draft remains. Cover rejection with an old-entry local backup too. |

**Rules check** — inspected test changes only:

- Plugins never import each other: OK.
- Generic code in Jini; site-specific code in Tovu: OK.
- Public APIs use `(requiredObj, optionalObj = {})`: OK; no public API changes in this shard.
- Dependencies injected as ports: OK.
- React components receive data through props: OK.
- Cyclomatic complexity ≤10: unverified; measurement was prohibited.
- Existing “why” comments preserved: OK.
- Schema changes use ADR-066 TypeScript migrations: OK; no production schema changes reviewed.
- No data loss: OK; no destructive test behavior found.
- `TEMP: replaced by shared helper`: OK; none found in branch-tip test files.

**Verdict: MERGEABLE AFTER FIXES** — replace the ineffective cancellation assertions with a mounted entry-switch regression test. Product changes and reported coverage results remain outside this verdict.
