Code Inspection(Peer Review): Personas used: code-inspection, security, tdd.

| Sev | repo:file:line | Problem | Concrete fix |
|---|---|---|---|
| MEDIUM | `jini:packages/chat/src/react/hooks/__tests__/assistant-chats.writes.cov-j2.test.ts:173` | The retry test fails `other/u1`, then writes `new-chat/u1`. Deduplication is conversation-scoped, so deleting `written.delete(key)` from `persistUserTurn` would still leave this test green. It does not verify recovery of the failed turn (TDD F4.3). | Fail and retry `u1` in the same active conversation; assert two writes to that conversation. |
| MEDIUM | `jini:packages/cms/scripts/check-packaging.mjs:63` | New exported helpers violate the explicit two-object API rule: `bareImportSpecifiers(src)`, `isCheckedSource(path)` (49), and `packageNameOf(spec)` (80) take scalars; several other exports omit the optional object. | Use signatures such as `bareImportSpecifiers({ src }, _options = {})`; update callers and apply the convention to the other new exports. |

**Rules check — changed code**

- Plugins never import each other: **OK**; no new cross-plugin production import found.
- Generic code lives in Jini: **OK**.
- Two-object API signatures: **violated** — `check-packaging.mjs:49,63,80,85,98,115,126`.
- Dependencies injected as ports: **OK**.
- React components receive data through props: **OK**.
- Cyclomatic complexity ≤10: **OK by inspection**; metrics were not independently run.
- Existing “why” comments preserved: **OK**, including the moved ChatPane explanation.
- Schema changes use ADR-066 TypeScript migrations: **OK**; no schema changes.
- No data loss: **OK**; no newly introduced data-loss path identified.
- Unflagged `// TEMP: replaced by shared helper`: **OK**; none added.

**Verdict: MERGEABLE AFTER FIXES** — correct the ineffective retry test and the new API signatures.

Static review only; no tests, builds, or installs ran, and reported coverage figures remain unverified.
