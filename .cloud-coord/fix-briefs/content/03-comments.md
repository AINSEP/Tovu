Code Inspection(Review Mode): Personas used: code-inspection, security, tdd.

Findings verified against the requested branch tips. No tests, builds, or mechanical checks were run.

| Sev | repo:file:line | Problem | Concrete fix |
|---|---|---|---|
| HIGH | `Tovu:apps/website/src/features/settings/site-title-write.ts:59` | Provider protection covers `set` only. `DELETE …/settings/value` with `{namespace:"core.comments",key:"provider",scope:"workspace"}` requires only `settings.workspace.write`. Clearing a disabled selection restores built-in comments through `provider-selection.ts:28`, bypassing `comments.configure` and confirmation. | Protect canonical provider settings across clear/reset and tool paths. Add a regression proving a settings-only principal cannot reactivate comments. |
| HIGH | `Jini:packages/agent-plugins/src/lifecycle/update.ts:101` | Rollback directories use only the digest and survive until restart. Same-version replacements permit A→B→A→C: the last update encounters the retained rollback/A directory. Rollback then renames that directory over the still-existing live A at line 141, failing again. The plugin remains disabled; critical boot recovery repeats the failure. | Use transaction-specific rollback locations and handle an already-restored live revision idempotently. Test repeated same-version replacements without restarting. |
| MEDIUM | `Tovu:apps/website/src/features/agent-plugins/install-upload.ts:185` | Every exposed update fails with `UPDATE_SETTINGS_OWNER_UNBOUND`: `snapshotAgentPluginSettings` is declared and forwarded, but neither composition root supplies it. | Bind the actual settings snapshot owner into HTTP and tool dependencies before exposing Update. |
| MEDIUM | `Tovu:apps/website/src/server/inbound/admin-http/routes/system/__tests__/site-backups.integration.test.ts:4` | The new test imports `../site-backups.js`, which is absent from the branch. Collection cannot load this test. | Remove the orphan test or include the implemented route it exercises. |
| MEDIUM | `Tovu:apps/website/src/features/agent-plugins/update-effects.ts:2` | The new feature value-imports an assistant implementation directly. The existing boundary test explicitly rejects this edge; this file has no exemption. | Inject the roster notification callback from composition, following `apply-tool-renames.ts`’s existing port. |
| MEDIUM | `Tovu:apps/website/src/contracts/core/tool-metadata/agent-plugins.ts:19` | `agent_plugins_update` adds search/approval metadata, but the reviewed baseline omits it. Exact comparisons in `tool-metadata-projections.test.ts:24` and line 26 therefore disagree. | Review and update the corresponding baseline entries while retaining the exact assertions. |
| MEDIUM | `Jini:packages/capability-providers/src/comments/registry.ts:10` | New public registry methods omit the required optional object; `list()` accepts neither object. The new provider ports have the same contract violation. | Apply `(requiredObj, optionalObj = {})` consistently to declarations and implementations, including empty objects where needed. |
| MEDIUM | `Tovu:apps/admin/src/features/plugins/AgentPluginUpdateControl.tsx:14` | The component constructs its upload controller internally instead of receiving its data/controller through props, violating the supplied props-only rule. | Compose the controller in the wired owner and pass its state and callbacks into the component. |
| MEDIUM | `Jini:packages/agent-plugins/src/lifecycle/update-store.ts:32` | `parseJournal` exceeds the explicit complexity ceiling: manual counting gives 13, including short-circuit decisions and excluding the nested callback. | Extract coherent validation predicates while preserving fail-closed journal validation. |

**Rules check**

- Plugins never import each other: **OK** — no new cross-plugin import found.
- Generic code in Jini; site-specific code in Tovu: **OK**.
- Two-object public API signatures: **violated** — `Jini:packages/capability-providers/src/comments/registry.ts:10`.
- Dependencies injected as ports: **OK** for the new service seams; the prohibited assistant import is separately identified above.
- React data through props only: **violated** — `Tovu:apps/admin/src/features/plugins/AgentPluginUpdateControl.tsx:14`.
- Cyclomatic complexity ≤10: **violated** — `Jini:packages/agent-plugins/src/lifecycle/update-store.ts:32`, manual count 13.
- Existing “why” comments preserved: **OK** — inspected revisions retain their rationale.
- Schema changes only through ADR-066 TypeScript migrations: **OK** — no schema changes added.
- No data loss: **OK** in inspected persistence paths; the rollback finding concerns availability and recovery.
- No unflagged `// TEMP: replaced by shared helper`: **OK** — no matches found.

**Verdict: MERGEABLE AFTER FIXES** — the provider authorization bypass, update recovery failure, unwired update flow, and broken validation surfaces require correction before merging.
