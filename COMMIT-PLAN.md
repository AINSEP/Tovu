# w3-ext-a Tovu host mounts

Do not commit this file. Coordinator owns commits; `.git` is read-only here.

Inputs: Tovu HEAD `1099eb856382c0d6c24ad380748e1cb021b8a977`;
Jini `origin/codex/adm-j` `ff4b06a1c956a1c592ca0631555b95f952761636`;
Jini builder report `../o-adm-j/adm-j.md`.

## Ordered commit units

1. T19 — Bind desktop facts and warning copy (implemented; verification reserved for Opus).
   First test: `apps/admin/src/features/settings/__tests__/ai-agent-presentation.scan-race.unit.test.tsx`,
   written before production edits, exercises the real host warning binding.
   Mutations (instructions only; not applied or run):
   - `M-older-scan-replaces-auth-state`: remove Jini's `scan === latestScan`
     publication guard. The older missing-auth scan must not replace the newer
     signed-in snapshot observed through the real bound warning.
   - `M-warn-when-auth-is-unknown`: in the host binding's argument to Jini,
     project `authStatus: 'unknown'` to `'missing'`. The unknown-auth witness
     must then show a warning and fail its null assertion.
   Files changed:
   - `apps/admin/src/features/settings/ai-agent-presentation.ts`
   - `apps/admin/src/features/settings/SettingsUi.tsx`
   - `apps/admin/src/features/ai-assistant/AiAssistant.tsx`
   - `apps/admin/src/features/settings/__tests__/ai-agent-presentation.unit.test.ts`
   - `apps/admin/src/features/settings/__tests__/ai-agent-card-presentation.unit.test.tsx`
   - `apps/admin/src/features/settings/__tests__/settings-execution-i18n.unit.test.ts`
   Created: `apps/admin/src/features/settings/__tests__/ai-agent-presentation.scan-race.unit.test.tsx`.
   Deleted: `apps/admin/src/features/settings/hooks/use-ai-agent-presentation.hooks.ts`.
   The fourth listed test, `components/AssistantDock/__tests__/use-selected-agent-auth-warning.hooks.unit.test.ts`,
   already imports the correct real host warning binding; no edit needed.

## Sheets skipped because the matching J sheet was not built

- T07 hook mounts: J07 stopped on File/HTMLInputElement contracts under the
  sheet's DOM-free constraint. Existing bound skills client remains untouched.
- T12: J12 stopped on the unspecified TipTap YouTube parser seam.
- T16: J16 stopped on the missing required injected-prop signature table.
- T15: J15 depends on J16 field helpers.

## Constraints and review

Approved T19/J19 design supplies the binding pattern; no new abstractions.
Desktop detection and scope keys remain host policy; Jini owns presentation
rules and scan lifecycle. Preserve the dock's Claude default and translator.
No manifests, linking, package intake, installs, tests, builds, typechecks or
linters. No mutation executed.

Static review completed: Jini leaves and package exports read from the named
remote-tracking tip; all named T19 consumers opened; scoped importer search
shows no remaining import of the deleted local hook. `git diff --check`
passed. Existing test assertions were preserved. No package version changes.
Architecture audit: PASS by static inspection for the T19 boundary; runtime,
type correctness, mutation sensitivity, and coverage remain unverified.
No new helpers, types, wrappers, options, comments, or abstraction layers.
The required real host warning binder and scope-key values are the only
host presentation exports added/changed; desktop detection is unchanged.

Reuse: J19 owns scan arbitration, description normalization, warning rules,
and the presentation hook. Inspected both new leaves on `origin/codex/adm-j`;
used those exports directly, keeping only the prescribed host copy binding.
Cost: same scan/rescan requests and latest snapshot per mounted hook; no new
polling, timer, listener, cache, or retained history. Existing live-ref teardown
and latest-scan arbitration stay in the Jini hook.

Function quality (static, no measurements):
| Unit | Disposition | Findings | Local fix |
| --- | --- | --- | --- |
| selectedAgentWarning host binder | NO_RECORDED_FINDINGS | none | binds existing translator |
| SettingsUi hook projection | NO_RECORDED_FINDINGS | none | injects current desktop/default/copy |
| AdminExecutionMode scope projection | NO_RECORDED_FINDINGS | none | injects unchanged scope keys |

Second-pass review checked argument names, default agent, translated output,
unknown-auth behavior, rescan ordering, unmounted-write protection, static
imports, scope ownership, and unchanged test assertions. No additional static
finding recorded; tests/typechecks are explicitly deferred, not claimed green.
Documentation: existing why-comments retained in the host or matching moved
Jini implementation; no new comments, per owner rule.

Deletions: former `features/settings/hooks/use-ai-agent-presentation.hooks.ts`
is required by T19; duplicated generic rules removed from the host binding.
Final diff reread: no unrelated additions found, so none deleted. Deleted
generic description/scan bodies and their comments already reside in the
J19 leaf; no forwarding export remains. No other sheet edited.
