Code Inspection(Review): Personas used: code-inspection, security, tdd.

| Sev | repo:file:line | Problem | Concrete fix |
|---|---|---|---|
| HIGH | Tovu:apps/website/src/features/agent-plugins/install-upload.ts:203 | Ordinary install/replacement bypasses the pending-update journal guard. After an incomplete rollback leaves the old package in rollback storage, installing C succeeds; boot recovery then restores A alongside C because it removes only the journal’s candidate digest. | Enforce the shared journal guard under the plugin lock for every install/replacement. Add a regression covering ordinary installation after incomplete rollback. |
| HIGH | Tovu:apps/website/src/server/runtime/composition/app.ts:11 | Imports `routes/system/site-backups`, which does not exist in the reviewed branch. Loading the application composition fails. | Include the real route implementation and its dependencies, or remove the dangling registration/import. |
| HIGH | Tovu:package.json:183; Tovu:package-lock.json:2755; Jini:packages/agent-plugins/package.json:3 | Dependency integration is incomplete: the added capability-providers dependency is absent from the lockfile, while agent-plugins remains pinned to the existing `0.4.7` artifact despite importing newly added exports. Tests using sibling-source resolver hooks bypass this installed-package contract. | Release the changed Jini packages under new versions, update Tovu’s dependencies and lockfile, and remove sibling-source resolution hooks. |
| MEDIUM | Tovu:apps/website/src/features/agent-plugins/install-upload.ts:141 | New generic plugin-name validation duplicates the grammar already owned by Jini’s lifecycle manifest parser, violating Jini First. | Expose the validator from Jini and call it from Tovu. |
| MEDIUM | Tovu:apps/website/src/features/agent-plugins/install-upload.ts:141; Tovu:apps/admin/src/features/plugins/rules.ts:567 | New public helpers use positional scalars rather than the required two-object API contract. | Change these exports and their callers to `(requiredObj, optionalObj = {})`; apply the same correction to the other new helpers. |
| MEDIUM | Tovu:apps/admin/src/features/plugins/AddAgentPluginPanel.tsx:15 | The changed component exceeds the owner’s complexity ceiling: its 12 conditional expressions alone establish cyclomatic complexity above 10. | Extract the upload status/actions into focused components and derive mode-specific labels in the controller. |

The earlier rollback-directory collision **is fixed** at Jini `packages/agent-plugins/src/lifecycle/update.ts:170`. Authorization checks and package-path containment were present in the inspected flows. No tests, builds, installs, or metrics were run.

**Rules check**

- Plugins never import each other: **OK** in reviewed changes.
- Generic code in Jini: **violated** — Tovu `install-upload.ts:141`.
- Two-object API signatures: **violated** — Tovu `rules.ts:567`.
- Dependencies injected through ports: **OK** — Jini `update.ts:74`.
- React data through props: **OK** for the plugin update flow — Tovu `AgentPlugins.tsx:146` supplies the row and transport.
- Cyclomatic complexity ≤10: **violated** — Tovu `AddAgentPluginPanel.tsx:15`.
- Existing “why” comments preserved: **OK** in reviewed changes.
- ADR-066 TypeScript migrations only: **OK** — no schema migrations added.
- No data loss: **violated** — pending-journal protection is incomplete at Tovu `install-upload.ts:203`; replacement can also remove bytes recovery still needs.
- No unflagged `// TEMP: replaced by shared helper`: **OK** — no matches.

**Verdict: NOT MERGEABLE** — the branch has application-loading and dependency-integration blockers, plus a verified recovery invariant violation.
