# Commit plan — y5q-plugpub (Tovu half)

Working tree only; the coordinator commits. No git metadata writes or runtime checks.
Scope: the four dispatched files and their listed callers/source probes/keep ledger.
The supplied checked design and existing G3 bindings govern the implementation.
Jini reference: origin/codex/y5q-plugpubj, read from /Users/la/Programming/Jini.

## 1. adm-other — completed Tovu subset

Targets: AgentPlugins.tsx, Plugins.tsx and Providers.tsx under apps/admin/src/features/.
Tests first: adapt the existing named screen fixtures and provider source probe to the supplied Jini leaves before replacing production bodies.
Jini characterization tests were written first in the supplied branch, per its COMMIT-PLAN.md.
Named mutations awaiting Opus execution:
- DROP_UPDATE_DIGEST: omit expectedOldDigest from the update hook call.
- ALLOW_UNAVAILABLE_ADD: allow the Add tab without folder-install support.
- DROP_LOCALE_BOUNDARY: replace the injected provider locale with en.

Files changed, in this design commit:
- apps/admin/src/features/plugins/AgentPlugins.tsx
- apps/admin/src/features/plugins/Plugins.tsx
- apps/admin/src/features/plugins/__tests__/AgentPlugins.unit.test.tsx
- apps/admin/src/features/plugins/__tests__/AgentPluginsAddTab.unit.test.tsx
- apps/admin/src/features/plugins/__tests__/agent-plugin-update.unit.test.tsx
- apps/admin/src/features/plugins/__tests__/Plugins.unit.test.tsx
- apps/admin/src/features/plugins/__tests__/PluginsAddTab.unit.test.tsx
- apps/admin/src/features/plugins/__tests__/plugin-host-deps.ts
- apps/admin/src/features/providers/Providers.tsx
- apps/admin/src/features/providers/__tests__/Providers.unit.test.tsx
- apps/admin/src/features/providers/__tests__/providers-i18n.unit.test.ts
- plans/count-1125/y5-adm-keeps.md (three appended rules)

Final retained-file residuals, reviewed against G3:
- AgentPlugins.tsx: 58 LOC. Imports, one bindAgentPlugins call, host copy and required hooks/ports, and a one-expression details-modal kit adapter.
- Plugins.tsx: 41 LOC. Imports, one bindPlugins call, host copy/rules/hooks, and one-expression dialog, focus-hook and navigation adapters.
- Providers.tsx: 45 LOC. Imports, one bindProviders call, host locale/theme/MCP/integrations hooks, body mounts, restart copy and navigation.

Plugin view tests now import the raw Jini screens and Update slot; the existing dependency fixture supplies their required host inputs. Provider integration cases retain the bound mount; controller/boundary types come from Jini. The provider source probe follows Providers.tsx and ProvidersTabs.tsx in Jini, retaining its existing AlwaysAllowPanel probe.
panel-pages.ts already lazy-loads these three bindings directly. The plugin/provider index forwarders are already absent. panels.tsx already supplies the Agent Plugins hook overrides; those props remain accepted by the supplied Jini binder. No edits were needed to those callers.

## 2. adm-publish-content — completed Tovu hook subset

Target: apps/admin/src/features/publish-content/hooks/use-publish-content-confirm.hooks.ts.
Tests first: repoint existing raw hook/report-rule tests to Jini with the host policy injected.
Named mutation awaiting Opus execution: EXECUTE_BEFORE_CONFIRM permits execute from a planned phase without a confirmed token.

Files changed, in this design commit:
- apps/admin/src/features/publish-content/hooks/use-publish-content-confirm.hooks.ts
- apps/admin/src/features/publish-content/hooks/__tests__/use-publish-content-confirm.hooks.unit.test.ts
- apps/admin/src/features/publish-content/hooks/__tests__/use-publish-content-confirm-T4-03.characterization.unit.test.ts
- apps/admin/src/features/publish-content/hooks/__tests__/use-publish-content-confirm.guards.unit.test.ts
- apps/admin/src/features/publish-content/__tests__/publish-content-L057.characterization.unit.test.tsx
- apps/admin/src/features/publish-content/__tests__/PublishContentDialog.unit.test.tsx
- plans/count-1125/y5-adm-keeps.md (one appended rule)

use-publish-content-confirm.hooks.ts: 23 LOC. Imports and one bindPublishContentConfirm call capturing host policy/labels, scope functions, live port, locale hook, error formatter and monotonic clock. No ceremony logic or raw type/rule forwarding remains.
Existing hook/ceremony tests use the Jini binder with explicit host dependencies and their existing fake ports. Pure tooltip and mismatch imports point directly to Jini; live-gap tests inject the host plural-label policy. The bound dialog remains the live consumer. publish-request.store.ts already uses Jini types and needs no change.

## Validation and closeout

No tests, mutations, installs, builds, typechecks or linters were run, per dispatch. No new Tovu test cases were added; the existing named characterization cases and assertions were preserved while repointing their implementations. The Jini-side report records tests-first coverage and all four mutations; execution remains pending Opus.
The clone lacks ADS-memory architecture chapters 13/14 and project_memory.md; this complete dispatch supplies the design constraints.

Jini source reference inspected: origin/codex/y5q-plugpubj at 5fc04acd8a4a826f1de467aeeacc2022a0fedf71. No Jini files were edited. All four required leaves/binders are present; no sheet was stopped. Other sheets are outside this dispatch.

git diff --check passed. The counter-generated import graph shows only the three direct lazy routes, the provider bound integration test, and the bound publish dialog importing these host files; no removed raw export has a remaining importer in that graph. Named literal-copy/source scanners contain no additional target-path entries needing edits.

True counter (same four ledgers before and after appending the four rules):
- Before: planner=876 true=603 rules=305
- After: planner=876 true=599 rules=309
- All four target paths occur in kept-by-rules.txt and none in true-left.txt.
- Artifacts: /tmp/y5q-plugpub-counter-before and /tmp/y5q-plugpub-counter-after.
- The prompt's literal keep/ argument initially failed with ENOENT because that directory is absent. The script's documented KEEPDIR_OR_FILE arguments were then supplied as the four existing plans/count-1125/{k0-keeps,x4-keeps,merge25-g3-keeps,y5-adm-keeps}.md ledgers. The main Jini checkout was used read-only; its files affect only collision annotations, not the reported keep count.

Final diff review deletions: removed the four relocated host logic bodies and obsolete raw type/helper exports; removed their unused imports; consolidated duplicate imports introduced by test rewiring; removed an unnecessary ProvidersTabBody source-probe entry (it contains no direct t() calls). No test assertions were deleted or weakened, no new production helper/type/file was added, and no logic was shifted to another host file.

Only COMMIT-PLAN.md was created. All other listed files were changed in place. No files were deleted. Four bindings total 167 LOC; four exact anchored rules were appended inside the Keep rules text fence. All changes remain uncommitted for the coordinator.
