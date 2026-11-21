# Tovu V1–V4 / QV1–QV4

Branch: `codex/tv-dgc`. Base for every entry below: `2095ffdd47c1764d682ad0b28899fc6f62e89521`.
`W` means `apps/website/src`. Entries follow execution order. Done means edits written and diff reviewed; runtime verification belongs to combine.

No tests, builds, installs, type-checks, linters, mutations, or browser checks were run. No Git state was written. Each new behavioral witness was written before its production change. QV sheets use their existing witnesses and change only the named assertion messages. Red explanations below are source-based expectations, not observed test results.

## V1 — done; DEPENDS: Jini jx-dgc J1

- Base: `2095ffdd47` (`tv-c7a` present); linked J1 release required in combine.
- Files: `W/features/agent-plugins/tool-registrations.ts`; `W/features/agent-plugins/__tests__/integration/agent-plugin-search-tool.integration.test.ts`; same-argument test refresh in `W/assistant/__tests__/automatic-agent-plugins.integration.test.ts`.
- Test: one real installed-plugin search through `createToolRegistry` / `createToolExecutor`, denied and allowed principals, exact workspace/principal/permission log and no denied catalog output. Red before fix: the adapter never binds the injected permission check, so denial returns installed catalog data and the decision log stays empty. Existing three builder calls receive explicit allowed fixture authorizers.
- Mutation owed: replace the adapter's `requirePermission` callback with an allow-all callback; the denied witness must fail.
- API-baseline delta (Jini): `@jini-ai/agent-plugins/lifecycle/host-tools#buildAgentPluginSearchRegistrations` gains required `requirePermission`; combine owns paired API baseline, changeset, publish and linkage. No Jini edits here. The package is absent from this clone's `node_modules`; `origin/codex/jx-dgc` was not available in Jini's read-only objects. Implementation follows the supplied J1 contract; linked signature remains unverified.
- Look owed: none. Refresh: additional test caller recorded in `REFRESH.md`.
- Files over 500 lines: `W/assistant/__tests__/automatic-agent-plugins.integration.test.ts` (765); continued as directed.
- Diff re-read deletions: none.

## V2 — done

- Base: `2095ffdd47`; combine also includes `fix/cloud-bugs-1120`. Read that branch's four named production files with `git show`: the append and generated policies still permit this change.
- Files: `W/assistant/tool-registrations.ts`; `W/assistant/__tests__/tool-registrations.authorization.test.ts`.
- Tests: four table rows, each denied and allowed (eight cases), using the assembled registration and a counting delegating handler through the executor. Each expects one workspace `admin.assistant.use` decision and zero/one handler entries. Red before fix: the generated policy allows denial into the handler and never calls the authorizer, including on the allowed control.
- Mutation owed: restore each row's generated allow policy independently.
- API-baseline delta (Jini): none. Look owed: Chrome, one allowed admin-assistant call after combine.
- Refresh: none. Files over 500 lines: `W/assistant/tool-registrations.ts` (575); continued.
- Diff re-read deletions: none.

## V3 — STOPPED

- Base: `2095ffdd47`.
- Stop: unlisted production importer of `fetchImage` at `W/server/inbound/admin-http/routes/media/import-url.ts:7`, invoked at line 55. The sheet lists the media-import and asset-transfer consumers, but not this HTTP route. The hard importer rule stops this sheet even though the proposed signal option would be additive.
- Files touched: none. Tests added: none; stopped during the prerequisite importer lookup, before the witness or production edits.
- Mutations owed if redispatched: independently remove transport signal forwarding and the last pre-write abort check; implement the named held-download witness and successful post-write abort control first.
- API-baseline delta (Jini): none. Look owed: none. Refresh: scope expansion recorded in `REFRESH.md`.
- Diff re-read deletions: none; no V3 edits were made.

## V4 — done

- Base: `2095ffdd47`.
- Files: `W/server/runtime/composition/other-site-keys.ts`; `W/server/runtime/composition/__tests__/other-site-keys.integration.test.ts`.
- Test: capture site A's displayed key ID from B, insert 50 same-kind eligible records sorting earlier, then use the captured ID on B. Assert original ID/token, site B's grant, and byte-identical source vault after use. Red before fix: `find`/`adopt` search only the first 50 metadata rows, excluding the captured key.
- Mutation owed: restore the capped metadata lookup for both `find` and `adopt`.
- API-baseline delta (Jini): none. Look owed: Chrome, saved-key adoption flow after combine. Refresh: none.
- Diff re-read deletions: removed the newly added source-site no-grant lookup/assertion; the listed case requires the expected B grant and unchanged source vault only. No existing test was deleted or weakened.

## QV1 — done

- Base: `2095ffdd47`. File: `W/features/consent/__tests__/service.test.ts`.
- Tests: existing cases retained verbatim except 20 named assertion messages; no new cases. Before edit those 20 anchors lack diagnostic messages. Mutation owed: remove the message at line 377; the path's message-less count must increase by one against the fixed revision. Combine runs existing cases and the count comparison.
- API-baseline delta (Jini): none. Look owed: none. Refresh: none. Diff re-read deletions: none.

## QV2 — done

- Base: `2095ffdd47`. File: `W/server/inbound/assistant/__tests__/agent-daemon-scope.behavior.integration.test.ts`.
- Tests: existing cases retained verbatim except nine named assertion messages; no new cases. Before edit those nine anchors lack diagnostic messages. Mutation owed: remove the message at line 326; the path's message-less count must increase by one. Combine runs existing cases and the count comparison.
- API-baseline delta (Jini): none. Look owed: none. Refresh: none. Diff re-read deletions: none.

## QV3 — done

- Base: `2095ffdd47`. File: `W/features/web-screenshot/__tests__/playwright-page-capture.deadlines.characterization.test.ts`.
- Tests: existing cases retained verbatim except eight named assertion messages; no new cases. Before edit those eight anchors lack diagnostic messages. Mutation owed: remove the message at line 78; the path's message-less count must increase by one. Combine runs existing cases and the count comparison.
- API-baseline delta (Jini): none. Look owed: none. Refresh: none. Diff re-read deletions: none.

## QV4 — done

- Base: `2095ffdd47`. File: `W/features/web-screenshot/__tests__/playwright-page-capture.deadlines.unit.test.ts`.
- Tests: existing cases retained verbatim except eight named assertion messages; no new cases. Before edit those eight anchors lack diagnostic messages. Mutation owed: remove the message at line 145; the path's message-less count must increase by one. Combine runs existing cases and the count comparison.
- API-baseline delta (Jini): none. Look owed: none. Refresh: none. Diff re-read deletions: none.

## Scoped review / handoff

Architecture review: WARNING, pending linked J1 and combine execution. Reviewed all 11 changed source/test files using scoped `git diff`. Production edits stay at the named feature/assistant composition seams. No new runtime dependency, helper, wrapper, root wiring, export shell, cast, suppression, comment, or existing argument-pad change. The only named additions are the registration dependency type, four-ID set and private `rowId` option. Existing assertions and runtime copy contracts remain intact.

| Changed production unit | Function review | Direct witness / limits |
|---|---|---|
| Plugin search builder and contributor | INCONCLUSIVE: linked J1 unavailable | V1 denied/allowed executor case; 5/3 physical lines; existing loader/preflight input unchanged |
| `collectDomainRegistrations` and policy callback | INCONCLUSIVE: execution forbidden | V2 eight cases; 30/4 physical lines; manual branching review below 10 |
| Saved-key `find`, `adopt`, `readSource` / containing factories | INCONCLUSIVE: execution forbidden | V4 captured-ID case plus existing list cases; containing factory 48 lines, reader 19; manual branching review below 10 |

No complexity or coverage tooling ran. Manual review found no function above the hard limits in the changed units. ReadSource retains one bounded metadata query and read-only open per source; ID operations return at most one row, list remains capped at 50. Existing two-object API rules and every `_optional = {}` / `_options = {}` pad are preserved. Reuse: existing CMS permission adapters, assistant assembly dependency bag, Kysely `sql`, and saved-key fixtures only. Documentation classification: no new code comments, as required by the brief.

Pre-completion: reread all eight sheets and both scoped diffs; compared named anchors to source; no certified tests removed/weakened; removed the extra V4 assertion described above. Self-validation/coverage: not run because the machine rule forbids execution; no green or measured-coverage claim. Outstanding work is V3 redispatch, J1 linkage, all combine witnesses/mutations, and the two named Chrome looks.
