Code Inspection Agent(Review): Personas used: code-inspection, security, TDD.

Sampled tests across nine Jini packages at `review/cov-J1`. Static review only; no tests, builds, installs, or branch switches performed.

| Sev | repo:file:line | Problem | Concrete fix |
|---|---|---|---|
| MEDIUM | `jini-int:packages/agent-runtime/src/skills/web-clone/scripts/__tests__/fakes-wc2.mjs:175` | The fake awaits asynchronous event listeners. The network-capture test also awaits each response emission at `network-capture.unit.test.mjs:62`, guaranteeing body processing completes before navigation returns. Real Playwright events provide no such guarantee, so the test hides incomplete manifests caused by pending response handlers. **F3.2** | Make emission nonblocking. Add a deferred response body and verify capture waits for its processing before closing the browser and writing the manifest. |
| MEDIUM | `jini-int:packages/admin/src/security/react/__tests__/security-editor.test.tsx:52` | The test submits token, URL, username, and additional hosts but checks only label/category and secret absence. Dropping the connection metadata or sending an incorrect nonempty token still passes. The memory backend deliberately discards credential material, so its summary cannot verify token delivery. **F1.2** | Assert the exact `api.custom.create` request, including the token, and check saved URL, username, and additional hosts. Keep the secret-absence assertion. |

**Rules check** — scoped to sampled test changes; product hunks remain with the other shard.

- Plugin imports: OK — no cross-plugin imports found.
- Generic ownership: OK — reviewed additions reside in Jini.
- API signatures: OK — no new production API assessed.
- Injected ports: OK — no verified violation.
- React data through props: OK — no production component changes assessed.
- Cyclomatic complexity ≤10: unverified; no metrics executed.
- Existing “why” comments: OK — no deletion found in reviewed test changes.
- ADR-066 migrations: OK — no schema changes in test scope.
- No data loss: OK in test operations; incomplete-manifest verification is flagged above.
- `TEMP: replaced by shared helper`: OK — none added in test scope.

**Verdict: MERGEABLE AFTER FIXES** — correct the two false-green cases before treating this coverage wave as reliable verification.
