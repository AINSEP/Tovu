Code Inspection(Review): Personas used: code-inspection + security + tdd.

| Sev | repo:file:line | Problem | Concrete fix |
|---|---|---|---|
| MEDIUM | `jini-int:packages/db/src/testing/pg-fixture.ts:39`; `packages/db/src/testing/postgres-database.ts:57` | `os.userInfo()` now runs unconditionally during import. Previously, configured `PGUSER` bypassed it. Hosts with an unmapped UID now fail before connecting despite valid Postgres configuration. | Preserve lazy fallback at both sites: `username: process.env.PGUSER ?? os.userInfo().username`. |
| LOW | `jini-int:packages/platform/src/child-environment.ts:54`; `packages/db/src/testing/postgres-database.ts:23` | New exports `nodeLoginShellPorts` and `postgresUrlFor` omit required object parameters, rejecting the mandated two-object call shape in TypeScript. | Give both exports `(requiredObj, optionalObj = {})` signatures and update callers. |
| LOW | `jini-int:packages/ui/src/features/observability/stuck-run.ts:113` | The hunk removes the recorded reason for deliberately retaining the defensive guard against future refactors, replacing it with the opposite policy. This violates the explicit preservation rule; current unreachability is not itself a runtime bug. | Restore the guard and its rationale, or record an explicit owner-approved superseding decision. |

The transfer-plan guard is unreachable: core skips confirmation when `ask` is false (`packages/core/src/approval.ts:92`), and transfer tools request confirmation only alongside a taken plan. The rename check rejects missing targets before mutation. The asset-cache null-entry TypeError exists unchanged at `packages/platform/src/asset-cache.ts:141`; it is not a branch-introduced finding.

**Rules check**

- Plugin imports: **OK**—no new plugin-to-plugin imports found.
- Generic code in Jini: **OK**.
- Two-object APIs: **violated**—locations above.
- Dependencies injected as ports: **OK**—added ports retain native defaults.
- React data through props: **OK**—no new violation found.
- Cyclomatic complexity ≤10: **UNVERIFIED**—no metrics executed.
- Existing “why” comments preserved: **violated**—`stuck-run.ts:113`.
- ADR-066 migrations: **OK**—no schema migrations added.
- No data loss: **OK**—no introduced loss path identified.
- `// TEMP: replaced by shared helper`: **OK**—none found.

Product-source review only; tests, builds, and metric checks were not run. Test assertions and reported coverage remain unverified.

**Verdict: MERGEABLE AFTER FIXES**—restore the Postgres environment fallback and resolve the explicit owner-rule violations.
