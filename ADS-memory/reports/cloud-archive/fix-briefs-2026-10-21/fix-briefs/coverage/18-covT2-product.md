Code Inspection(Review): Personas used: code-inspection + security + TDD.

Reviewed product hunks at `review/cov-T2` (`3a8656757`). No files changed; no tests, builds, or installs run.

| Sev | repo:file:line | Problem | Concrete fix |
|---|---|---|---|
| HIGH | tovu-int:apps/website/src/server/runtime/boot/parent-watchdog.ts:176; apps/desktop/src/renderer/dom-hook-harness.ts:22 | New modules place generic process supervision and React test tooling in Tovu, violating the explicit **Jini First** ownership rule. | Put reusable implementations in `@jini-ai/*`; retain Tovu environment names, messages, and wiring in thin adapters. |
| MEDIUM | tovu-int:apps/desktop/src/renderer/use-zoom.hooks.ts:208 | The default now evaluates `window.localStorage` during every render. If its getter throws because storage is denied, the entire app fails to render—even with no guest or zoom command. Previously acquisition was deferred. | Resolve storage through a guarded adapter; preserve session zoom when persistence is unavailable. |
| MEDIUM | tovu-int:apps/desktop/src/renderer/use-site-preview.hooks.ts:79; apps/website/src/assistant/admin-screen-link-tool.ts:233; apps/website/src/features/publish-content/destination-credential.ts:61 | Expanded APIs introduce three arguments and retain positional scalars, contrary to the required two-object boundary signature. | Use `({ id, previewVersion }, { getBridge })` and `({ deps, input }, { openSession })`; supply the admin builder’s environment through its existing composition contract. |

**Rules check**

- Plugins never import each other: **OK** in reviewed hunks.
- Generic code belongs in Jini: **violated** — `parent-watchdog.ts:176`, `dom-hook-harness.ts:22`.
- Two-object API signatures: **violated** — examples above.
- Dependencies injected as ports: **OK** for the introduced seams.
- React receives data through props only: **violated, pre-existing behavior retained** — `SiteGrid.tsx:193` still obtains preview data through a hook.
- Cyclomatic complexity ≤10: **UNVERIFIED**; no metrics executed, as instructed.
- Existing “why” comments preserved: **OK**; watchdog rationale moved with its implementation.
- Schema changes use ADR-066 TypeScript migrations: **OK**; no schema changes.
- No data loss: **OK**; no introduced loss path identified.
- Unflagged `// TEMP: replaced by shared helper`: **OK**; none found.

Test-file quality and reported coverage remain unverified under the product-only scope.

**Verdict: MERGEABLE AFTER FIXES** — address the render-time storage failure and explicit ownership/API violations.
