# Terra job dedupe-11: Tovu adopts the new Jini exports (after the Jini release)

READY ONLY AFTER GATE R1 (2026-11-13). Self-contained. Background and the reason for every decision: `development/refactor-patterns/dedupe/PLAN.md` ("Coordinator gates"). Repo: the Tovu clone you are given (Tovu only; paths are relative to the Tovu repo root).

## Precondition (check first, stop if it fails)
Gate R1 means: Jini jobs 05-09 are reviewed, merged, released to npm with a version bump, and this Tovu clone's `@jini-ai/*` minimum versions and lockfile are updated to that release. Check that the new names exist in the INSTALLED packages before editing anything:
```bash
node --input-type=module -e "const c=await import('@jini-ai/core/primitives'); const p=await import('@jini-ai/ui/panel-kit'); const missing=['toMsClock'].filter(n=>!(n in c)).concat(['useEscapeCancelFocusTrap','useOptimisticStoredValue','useBoundedStatusPoll'].filter(n=>!(n in p))); if (missing.length) { console.error('R1 not done, missing: '+missing.join(', ')); process.exit(1); }"
```
Run it from `apps/admin` (panel-kit) and from `apps/website` (core) if the root does not resolve them. For X15 also confirm the installed cms has the framework-neutral type: `grep -rln "FormSubmissionRedirectResult" node_modules/@jini-ai/cms/dist/forms/ | grep -v express` prints at least one file. If anything is missing, report `BLOCKED R1: <names>` and stop.

## Rules for every group in this job (read before editing)
- HARD: stop before ~250k tokens of context. If you get close: commit what is done (by explicit paths), list the groups you did not finish under "REMAINING" in your report, and stop.
- Do exactly the recipe. If a recipe's "before" text is not in the file (code moved or changed), search the same file for the same code by content; if it is gone or differs in behavior, SKIP that group and report it as `STALE <id>: <what you saw>`. Never improvise a different design.
- No `eslint-disable`, no `as any`, no non-null `!`, no `@ts-ignore`. New functions take `(required: {...}, optional: {...} = {})`; functions stay at or under 50 lines and cyclomatic/cognitive complexity 10.
- "Why" comments are never deleted: when code moves, its comment moves with it to the survivor; when two copies carry different why-comments, the survivor keeps both.
- Do not change response text, status codes, error messages, defaults or ordering unless the recipe says so. Where a recipe says "behavior differs", write the failing test first (run it, see it RED), then make the change, then see it GREEN.
- Tests: run ONLY the single files the recipe lists (and any test file you edit), one at a time. No suites, no full `tsc`, no watch modes; vitest always `--maxWorkers=2`; Tovu node tests always `--test-concurrency=1`. Leave no process running.
- Tovu single-file test command: `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-concurrency=1 --experimental-test-module-mocks <file>`.
- Commit once per group, by explicit paths: `git add -- <paths> && git commit -F msg -- <paths>`. Never `git add -A`, never stash/checkout/reset, never push.
- Report: per group `DONE | STALE | SKIPPED` + lines removed (from `git diff --stat`), tests run with pass/fail counts, anything that looked like a bug (do not fix bugs that are not in the recipe; list them).

## Groups in this job
| id | what | gate | owner decision |
|---|---|---|---|
| TR04 phase 1 | 4 Tovu files use `toMsClock` from `@jini-ai/core/primitives` | R1 | — |
| TR04 phase 2 | 16 always-wrap sites | R1 | O5 (skip unless the dispatch says "O5 approved") |
| X15 | form redirect result type from `@jini-ai/cms/forms` | R1 | — |
| T16 hooks | 3 confirm-dialog hooks use `useEscapeCancelFocusTrap` | R1 | — |
| T18 | 3 AssistantDock hooks become wrappers over `useOptimisticStoredValue` | R1 | — |
| T23 | export + publish hooks use `useBoundedStatusPoll` | R1 | — |
| T11 | 3 modal hooks use Jini `useNativeModalDialog` | R1 + job 10 T11 landed | O3 (skip unless "O3 approved") |

## TR04 phase 1 (same semantics)
- `apps/website/src/features/comments/settings.ts` and `apps/website/src/features/seo/settings.ts`: delete `jiniClock` and its comment ("Tovu's ISO-clock adapter; the shared clock contract/rationale lives in Jini core/primitives" now lives on core's doc), replace `jiniClock(x)` with `toMsClock({ clock: x })`, and type the clock in the two deps types as `ClockPort | IsoClock`.
- `apps/website/src/features/comments/provider-selection.ts` (2 inline sites), `apps/website/src/features/identity/wiring.ts:186`, `apps/website/src/features/identity/tool-registrations.ts:209`: `'nowMs' in c ? c : { nowMs: () => Date.parse(c.nowIso()) }` -> `toMsClock({ clock: c })`.
- Import `toMsClock` and `type IsoClock` from `@jini-ai/core/primitives`.
- Tests: `apps/website/src/features/comments/__tests__/settings.test.ts`, `apps/website/src/features/comments/__tests__/provider-selection.test.ts`, `apps/website/src/features/seo/__tests__/settings.test.ts`, `apps/website/src/features/identity/__tests__/wiring.test.ts` (one at a time, Tovu command above).

## TR04 phase 2 (ONLY if "O5 approved")
Behavior differs for a clock carrying BOTH `nowMs` and `nowIso` (only test fakes do): `toMsClock` uses `nowMs` instead of parsing `nowIso`. Sites: the `{ nowMs: () => Date.parse(X.nowIso()) }` wraps in webhooks, newsletter, publish-trust, dev-auth, api-keys/users/settings deps, serving-app, agent-plugin-service-ports, smtp.nodemailer and import-media-entity (16 total; list them with `grep -rn "Date.parse(" apps/website/src | grep "nowIso()"` and report the list). Each becomes `toMsClock({ clock: X })`. Run each touched file's beside-test.

## X15 form redirect result type
`apps/website/src/server/inbound/public-http/http/site/form-render.ts` (the `export type FormSubmissionRedirectResult = … | { kind: "error"; slug: string };` block, ~line 280): replace the union with `export type { FormSubmissionRedirectResult } from "@jini-ai/cms/forms";` and, because the file uses the type itself, add `import type { FormSubmissionRedirectResult } from "@jini-ai/cms/forms";`. Diff the union against Jini's first (5 members); if they differ, STALE X15. Importers stay unchanged (`routes/site/pages.ts`, `http/site/render.ts`, `http/site/__tests__/render.test.ts`). Type-only import, so nothing loads at runtime. Test: `apps/website/src/server/inbound/public-http/http/site/__tests__/render.test.ts` and the `form-render` test beside it.

## T16 hooks: `useEscapeCancelFocusTrap`
In `apps/admin/src/features/plugins/hooks/use-plugin-remove-confirm.hooks.ts`, `apps/admin/src/features/plugins/hooks/use-agent-plugin-disable-confirm.hooks.ts` and `apps/admin/src/features/settings/hooks/use-external-mcp-remove-confirm.hooks.ts`: replace the `dialogRef` creation, the `useFocusTrap(dialogRef)` call and the Escape `keydown` effect with `const dialogRef = useEscapeCancelFocusTrap({ onCancel: props.onCancel });` (use the hook's existing name for the cancel callback), imported from `@jini-ai/ui/panel-kit`. Keep the copy builders and every comment that is not about those three lines (move a comment about Escape or the trap to just above the new call). Tests: each hook's existing unit test and each dialog's test (`grep -rln "use-plugin-remove-confirm\|use-agent-plugin-disable-confirm\|use-external-mcp-remove-confirm" apps/admin/src --include=*.test.tsx --include=*.test.ts`), one at a time, `cd apps/admin && npx vitest run --maxWorkers=2 <file>`.

## T18 AssistantDock stored preferences -> `useOptimisticStoredValue`
1. FIRST write `apps/admin/src/components/AssistantDock/__tests__/stored-preference-wrappers.characterization.unit.test.tsx` and run it GREEN against the CURRENT hooks. For each of `useChatDisplayPreferences(port)`, `useChatAgentPlugins({ port })`, `useAssistantRuntimePreferences({ port })` (wrap in the same query provider their existing unit tests use):
   - rerender with a NEW port object: the old port's unsubscribe runs once, the new port's subscribe (`subscribeToSettingsRefresh` for display) runs once, and the new port's listener triggers a reload through the new port's `load`;
   - two quick updates: the second `save` receives the first save's `next` as `previous`;
   - a rejected save sets `saveFailed` and keeps the shown value.
2. Rewrite each hook body as a wrapper (exported names, port and controller types unchanged; module-level `QUERY_KEY` stays):
   - `use-assistant-runtime-preferences.hooks.ts`: module-level `const SAME = ({ a, b }: { a: AssistantRuntimePreferences; b: AssistantRuntimePreferences }) => sameRuntimePreferences(a, b);` then `const { value, update, saveFailed } = useOptimisticStoredValue({ queryKey: QUERY_KEY, port, fallback: DEFAULT_ASSISTANT_RUNTIME_PREFERENCES, same: SAME });` and return `{ preferences: value, update: (patch) => update((previous) => ({ ...previous, ...patch })), saveFailed }`. The port is passed as is: its `load(input?, options?)`/`save({ next, previous }, options?)`/`subscribe({ listener }, options?)` already fit `StoredValuePort`, and the production port (`assistant-runtime-preferences.adapter.ts`) defaults both optional arguments, so `load()` equals today's `load({}, {})`.
   - `use-chat-agent-plugins.hooks.ts`: module-level `const SAME = ({ a, b }: { a: ChatAgentPlugins; b: ChatAgentPlugins }) => a === b;`, `fallback: DEFAULT_CHAT_AGENT_PLUGINS`, port passed as is (production port in `chat-agent-plugin-preferences.adapter.ts` defaults its arguments too); return `{ mode: value, update: (mode) => update(() => mode), saveFailed }`.
   - `use-chat-display-preferences.hooks.ts`: its port has a different shape, so adapt it, memoized on the port (the Jini hook's subscription follows the port object's identity):
     ```ts
     const stored = useMemo<StoredValuePort<ChatDisplayPreferences>>(() => ({
       load: () => port.load(),
       save: ({ next, previous }) => port.save(next, previous),
       subscribe: ({ listener }) => port.subscribeToSettingsRefresh(listener),
     }), [port]);
     ```
     then `useOptimisticStoredValue({ queryKey: QUERY_KEY, port: stored, fallback: DEFAULT_CHAT_DISPLAY, same: SAME })` with module-level `const SAME = ({ a, b }: { a: ChatDisplayPreferences; b: ChatDisplayPreferences }) => sameChatDisplay({ a, b });`, returning `{ preferences: value, update: (patch) => update((previous) => ({ ...previous, ...patch })), saveFailed }`.
   - The "A reversal must undo the last requested write…" comment now lives on the Jini hook; delete the three Tovu copies of THAT sentence only, and keep any other sentence.
3. Re-run the characterization test (GREEN, unchanged) and the existing `use-assistant-runtime-preferences.hooks.unit.test.ts`, `use-chat-display-preferences.hooks.unit.test.ts`, `chat-agent-plugin-preferences.unit.test.ts`, one at a time.

## T23 deployment polls -> `useBoundedStatusPoll`
1. `apps/admin/src/features/deployment/hooks/use-static-export.hooks.ts`: delete `pollFailuresRef`, `pollInputs` and the poll effect, then:
```ts
const { resetFailures } = useBoundedStatusPoll({
  active: isRunning,
  intervalMs: EXPORT_POLL_INTERVAL_MS,
  failureLimit: POLL_FAILURE_LIMIT,
  fetchStatus: () => port.getSiteExportStatus(),
  onStatus: ({ status }) => setRun(status),
  shouldContinue: ({ status }) => status.status === "running",
  onGiveUp: ({ error }) => setPollError(exportPollErrorMessage(locale, describeApiError(error, "unknown error"))),
});
```
   `pollFailuresRef.current = 0` elsewhere in the file becomes `resetFailures()`. The comments "Counts CONSECUTIVE poll failures…", "Poll loop: re-armed only when…" and the C2 "Bounded" comment already live on the Jini hook; keep a one-line pointer: `// Poll lifecycle and its failure bound: @jini-ai/ui/panel-kit useBoundedStatusPoll.` Keep every other comment.
2. `use-static-publish.hooks.ts`: the same, with `PUBLISH_POLL_INTERVAL_MS`, `PUBLISH_POLL_FAILURE_LIMIT`, `port.getPublishStatus()`, `publishPollErrorMessage` and `UNKNOWN_ERROR` (match today's `onGiveUp` text exactly). Its `pollFailuresRef.current = 0` (~line 330) becomes `resetFailures()`.
3. Tests: the export and publish hook unit tests (`ls apps/admin/src/features/deployment/hooks/__tests__ apps/admin/src/features/deployment/__tests__`), one at a time.

## T11 modal hooks -> Jini `useNativeModalDialog` (ONLY if "O3 approved" and job 10 T11 is in the release)
In the three components (`MessageOverflowModal`, the ThemePagesTab modal and the Media/ImagePreview modal; find them with `grep -rln "useMessageOverflowModal\|openLightboxDialog" apps/admin/src --include=*.tsx --include=*.ts`): import `useNativeModalDialog` from `@jini-ai/ui/admin-widgets`; `useModal?: typeof useX` -> `useModal?: typeof useNativeModalDialog`; default `useModal = useNativeModalDialog`; call `useModal({ open, onClose })`. Delete the three Tovu hook bodies; move each deleted file's `@file` notes (single-instance notes for ThemePagesTab and Media, ImagePreviewModal lineage) to a comment above the component's `useModal` default. Retarget their tests to the injected seam. Tests: `cd apps/admin && npx vitest run --maxWorkers=2` on each touched test file.
