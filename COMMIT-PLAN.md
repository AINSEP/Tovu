# y5p-set — Tovu working-tree delivery

Do not commit this file. The coordinator commits the ordered units below.
Scope: Tovu only; no subagents; git metadata is read-only. No tests, mutations,
installs, builds, typechecks or linters may run in this job.

Inputs: checked sheets in the dispatch; Tovu HEAD c84b1cba0e934e0ade9bb3183b40275b1b30e342;
Jini origin/codex/y5p-setj e041d2b9da45f53d5beca9879a0eeaf46040b01e;
the supplied y5p-setj report and its uncommitted COMMIT-PLAN.md.
The clone omits AI-Dev-Shop and the architecture chapters; the external
programmer persona and bootstrap were read. The dispatch governs this limited move.

## 1. adm-shell-lib — completed assigned Tovu binding

Prerequisite tests already written in Jini before its implementation:
packages/admin/src/core/__tests__/y5-settings-tabs.test.ts.
Named mutation DEFER_WITHDRAWAL_UNTIL_WRITE: move live denial after the first
durable metrics write. The failing-first-write assertion must lose its denial.
Not executed here; Opus owns execution.

Files touched:
- apps/admin/src/lib/settings-tabs.ts
- plans/count-1125/y5-adm-keeps.md

Commit body: settings-tabs.ts is 88 LOC. Residual: host namespace/default/catalog
data, backward-compatible type exports, one createPrivacyConsentBrowserAdapter
call, one createSettingsTabs call, and expression-only browser/event adapters.
All existing exported names and save signatures are retained. The browser getter
defers window/storage access; consent storage keys, events, step strings and
silent observer policy retain the existing bytes and behavior.

## 2. adm-other — completed the two assigned Tovu settings bindings

Prerequisite tests already written in Jini before its implementation:
- packages/admin/src/screens/__tests__/y5-admin-surfaces.test.tsx
- packages/mcp/src/react/external-mcp/__tests__/y5-external-mcp.test.tsx

Named mutations, not executed here:
- SETTINGS_ACCEPT_LEGACY_TAB: remove SettingsUiShell's tab-membership gate;
  the legacy/fallback assertions must fail.
- EXTERNAL_MCP_PROBE_BEFORE_TOOLS: mount the picker while Tools is closed;
  the initial no-probe assertion must fail.
- EXTERNAL_MCP_LOST_UPDATE: drop expectedVersion from the saved-source update;
  the inherited version-conflict assertion must fail.

Files touched:
- apps/admin/src/features/settings/ExternalMcpSettingsPanel.tsx
- apps/admin/src/features/settings/SettingsUi.tsx
- apps/admin/src/features/settings/__tests__/ExternalMcpSettingsPanel.unit.test.tsx
- apps/admin/src/features/settings/__tests__/SettingsUi.bound-tabs-and-legacy-links.unit.test.tsx
- apps/admin/src/features/settings/__tests__/SettingsUi.unit.test.tsx
- apps/admin/src/features/settings/__tests__/built-in-mcp.unit.test.tsx
- apps/admin/src/features/settings/__tests__/external-mcp-agent-drive.unit.test.tsx
- apps/admin/src/features/settings/__tests__/external-mcp-missing-launcher-recovery.unit.test.tsx
- apps/admin/src/hooks/__tests__/tovu-execution-entry-points.integration.test.tsx
- apps/admin/src/lib/__tests__/fixtures/admin-literal-copy.baseline.json
- plans/count-1125/y5-adm-keeps.md

Raw tests were repointed before replacing the production views. The existing
assertions are retained; no Tovu test cases, fixtures or test files were added.
The screens expose the named hooks/kit/deps injection tables for these existing
fixtures, so raw tests explicitly pass the required hooks and the real host kit.
The missing-launcher fixture retains the host admissions hook with its fake port.
The bound-tabs fixture composes the real host tables with its existing fake hooks.

Commit body: ExternalMcpSettingsPanel.tsx is 152 LOC, with imports and three
injection tables plus one bindExternalMcpSettingsPanel call. SettingsUi.tsx is
213 LOC, with imports, three injection tables, host version/copy, expression-only
JSX adapters (including the existing About slot), and one bindSettingsUi call.
Neither file calls a hook or contains controller logic. The clock arrow defers
Date.now lookup to its original render position. CSS imports and product URLs,
copy, attribute names, execution policy and locale bindings remain host-owned.

The named route imports already target these files directly, and the Settings
index already has no SettingsUi forwarding export; no route/index change needed.
The listed Providers/OAuth consumers contain no stale raw panel-type imports.
No touched target is deleted, so there are no deleted-path probes to repoint.

## Closeout

- All 27 supplied anchors matched the original HEAD: settings-tabs 16,
  SettingsUi 5, ExternalMcpSettingsPanel 6. No implementation sheet stopped.
- Read the Jini factory contracts, split implementation seams, prerequisite tests
  and public manifest entries from the pinned branch. No Jini files changed.
- Re-read all three final bindings against G3 before appending their exact
  anchored regex rules inside the existing Keep rules text fence. Prior rules
  and status notes are untouched.
- Folder-scanner review: neither moved view had direct input/Input/SecretInput
  nodes or raw dictionary lookup declarations. The shared-components scanner
  reads other directories. No scanner assertion was lost for this slice.
- Architecture audit: PASS by static inspection of the scoped bindings and
  named callers. No new dependency edge, forwarding shell, hook call, host
  controller, loop, switch, try, SQL, class, or moved logic hidden in another
  Tovu production file. Expression adapters remain within the function limits;
  the three production files remain below 500 lines.
- Documentation: existing host-specific rationale retained; no new comments
  added. Binding tables and expression adapters are intentionally undocumented
  beyond their imported contracts under the owner's no-new-comments rule.
- Function assessment: the three binding units are INCONCLUSIVE for runtime
  evidence, which is explicitly reserved for Opus. Static review found no new
  logic-bearing unit. Tests/coverage/mutations/self-validation were not run as
  directed. No green-test or mutation-proof claim.
- Fresh evidence: anchor comparison, scoped caller/source reads, manifest reads,
  git diff --check (clean), git diff/status scope review. Assertions were not
  removed or weakened. Only the assigned production targets and their named
  test/ledger consumers changed.

## Counter stopped — missing prerequisite

Attempted the prescribed count-files-left.sh command with the four named keep
files and the `keep` directory argument. It exited 1: this clone has no `keep/`
directory. Diagnosis confirmed all four named keep files exist; expand-keeps
cannot stat the missing directory. Per the dispatch, stopped this step rather
than substituting another keep set. Scratch output: /tmp/y5p-set-counter-before/.
No before/after global count or numeric counter reduction is claimed. The three
exact rules are present; the coordinator must rerun with the intended keep set.

## Final diff removals and remaining work

No tracked file deleted. Removed the three replaced local implementations and
their obsolete imports/types; removed exactly four relocated literal-copy
baseline rows. The version label is retained as host copy injected through the
existing About slot. No extra helper, fallback, option, comment, assertion or
unrelated change survived the final review.

No assigned production file remains unfinished. All other sheets are outside
this dispatch. Opus still owns tests, mutations, semantic checks and the counter
with its missing prerequisite restored. Jini MCP uses dist exports, so the
coordinator's authorized package build must provide that leaf before execution.
All changes remain in the working tree; .git was not written, committed or pushed.
