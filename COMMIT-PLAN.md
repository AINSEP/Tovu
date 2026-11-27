# w3b-ext-a1 — Tovu working-tree handoff

Starting HEAD: 047e8de894c4867f383f43e375cd91b3e8900496, branch codex/tv-r2-ext-a1.
Coordinator commits this work; do not commit this file. No git mutations, tests, builds, installs, typechecks, or linters are authorized. Jini exports inspected read-only at codex/r2-ext-a1j.

## Completed commit groups (design order)

Paths below are relative to `apps/admin/src/`, except `development/` paths. Every production move uses the matching built Jini leaf; no Jini files changed.

1. **T21 — Bind the ledger to the saved execution slice.**
   - Change `components/AssistantDock/hooks/{execution-config.hooks.ts,byok-runtime.hooks.ts,local-cli-selection.hooks.ts}` into real bindings. Preserve override/default seams, namespace, default config, initial Claude selection, settings-only credential refresh, focus/visibility cleanup, and all three existing write failure messages.
   - Delete `components/AssistantDock/hooks/execution-config-ledger.hooks.ts`.
   - Change `components/__tests__/{AssistantDock.execution-refresh.unit.test.tsx,AssistantDock.unit.test.tsx}` and `hooks/{use-tovu-execution-adapters.hooks.ts,__tests__/use-tovu-execution-adapters.unit.test.tsx}` to take types/constant directly from Jini. Live hook imports stay bound.
   - Create `components/AssistantDock/__tests__/execution-config.binding.unit.test.tsx` before production edits.
   - Ext-a2 sheet 114 must re-anchor its rewritten execution-config/BYOK sources and deleted ledger source after this group.
2. **T23 — Keep discovery sources, limits and desktop bridge bound.**
   - Change `components/AssistantDock/hooks/{composer-discovery.hooks.ts,composer-files.hooks.ts}`. Keep authenticated installed source, bundled source, router/draft loader, skill event, visible/open polling and cleanup in Tovu; Jini owns discovery arbitration and refusal forwarding.
   - Existing live discovery/selection and size-copy tests retain their host import contracts. State's distinct Jini/host composer-files imports stay as they were.
3. **T27 — Bind widget catalog and native option ports.**
   - Change `components/WidgetConfigFields/WidgetConfigFields.tsx` to mount the CMS dispatcher with the existing media editor, hooks, collection filter, menu/form envelopes, rules and shared-components translator.
   - Create `components/WidgetConfigFields/widget-config-host-policy.ts`, moving WIDGET_TYPE_OPTIONS/defaultWidgetConfig unchanged.
   - Split policy imports in `components/WidgetConfigFields/__tests__/MediaContentEditor.unit.test.tsx`, `components/WidgetPickerDialog/{WidgetPickerDialog.hooks.tsx,WidgetPickerDialog.tsx}`, `components/__tests__/WidgetConfigFields.unit.test.tsx`, `integrations/jini-admin/{widgets-module.hooks.ts,__tests__/widgets-ports.unit.test.ts,__tests__/widgets-swap.unit.test.tsx}`, and `lib/widget-embed-extension.tsx`.
   - `WidgetsConfigFieldsSlot` still uses the bound dispatcher and its existing locale translator. The module factory/provider identity and memoization are unchanged. Handle-only tests keep the bound view.
4. **T29 — Mount the entry editor and preserve its lazy key.**
   - Create `features/collections/collection-entry-panel.tsx`; retain ext.site reader, current back href, TipTap fragment/agent handles, taxonomy mount, status-label binding and live/defaultable hooks. Body toolbar copy binds the existing collections translator and locale. Editor CSS remains in `main.tsx`.
   - Delete `features/collections/CollectionEntryEditor.tsx`; remove its forwarding export from `features/collections/index.ts`; point `panel-pages.ts` at the real mount. `panels.tsx` key/new-to-null behavior and panel-render assertions require no changes.
   - Change `__tests__/unit/admin-route-lazy-loading.unit.test.tsx` to mock the actual target. Repoint `features/collections/__tests__/{CollectionEntryEditor.dynamic-field.unit.test.tsx,CollectionEntryEditor.unit.test.tsx,collections-agent-drive.unit.test.tsx}` to the real mount; preserve all assertions and real agent-drive wiring.
   - Change `lib/__tests__/{admin-literal-copy.unit.test.ts,fixtures/admin-literal-copy.baseline.json}` so the existing entry-slug pin reads the linked CMS markup owner. Linked integration must provide `apps/admin/node_modules/@jini-ai/cms/src/react/collections/CollectionEntryEditor.tsx`; source is parsed as TSX, never emitted JS.
   - Remove exactly the two deleted-file entries in `development/hook-injection-debt.json` and the one deleted-file entry in `development/scripts/size-debt.json`. No gate script was run; no new violation claim is made.

## Witnesses and named mutations

- T21: write `execution-config.binding.unit.test.tsx` before production edits. `M-bind-credential-load-to-config-loader` substitutes the config loader for credential presence; the witness requires the independent credential read and true presence. Inherited J21 witnesses: `execution-ledger.refresh-fences.unit.test.tsx`, `execution-config.presence-scope.unit.test.tsx`, `byok-runtime.discovery-generation.unit.test.tsx`, `local-cli-selection.normalization.unit.test.tsx`. Mutations: M-accept-pre-write-read, M-collapse-unread-key-to-false, M-use-stale-model-discovery, M-save-normalization-echo.
- T23: inherits J23 `composer-catalog.scope-and-force.unit.test.tsx` and `composer-upload-refusal.forwarding.unit.test.ts`; mutations M-show-prior-scope-catalog, M-drop-attachment-upload-options, M-skip-allowlisted-dispatch. Keep Tovu live integration witnesses on the binders.
- T27: inherits J27 `WidgetConfigFields.collection-field-contract.unit.test.tsx` and M-retain-invalid-sort-after-collection-change, including two catalogs.
- T29: inherits J29 `CollectionEntryEditor.body-slot-and-field-validity.unit.test.tsx` and M-render-terms-before-entry-exists / M-skip-json-validity.
- T35 STOPPED before witness/production edits; its planned external-mcp-panel-bindings witness and mutations remain for the corrected sheet.

No witnesses or mutations have been executed; Opus owns execution.

## STOPPED

- **T35 — lockfile anchor mismatch.** Root `package-lock.json` has only root/packages workspaces (`package.json` workspaces is `packages/*`); there is no `packages["apps/admin"]` block or other-workspace MCP dependency block to copy as prescribed. Root already has `@jini-ai/mcp: ^0.7.3-next.2` and its registry resolution. Admin instead has its own `apps/admin/package-lock.json`, whose manifest block and package resolutions contain no MCP. Updating that separate lock would be an unlisted replacement for the sheet's root/workspace-copy step. Per the STOP-on-mismatch rule, no T35 test, source, manifest or lock edits were made. Coordinator must specify the independent-admin-lock integration step before T35 resumes.

## LEFT

- T22: J22 stopped (missing rescan error-label/decoder contract).
- T24: J24 stopped (terminal-status dependency boundary).
- T25: NEEDS-OPUS, J25 literal collaborator/slot types absent.
- T26: J26 stopped (missing J17 HtmlAttributeRows prerequisite).
- T28: J28 stopped (outer-hook dependency contract).
- T30: J30 stopped (missing pixel parser/creator-label collaborators).
- T31: depends on stopped J30/J31.
- T32: J32 stopped (portable install/update/slot contracts).
- T33: J33 stopped (host translation key lacks copy seam).
- T34: J34 stopped (missing J09 webhook prerequisite).

## Final diff review and deletions

- Deleted the host ledger implementation after repointing both importers, as T21 requires.
- Deleted the old collection entry view and its barrel export after installing the real lazy mount, as T29 requires.
- Removed a leftover composer interface fragment, the temporary conditional parameter-type expression, and unnecessary empty factory parameters during review; they are not in the final diff.
- Kept the moved rich-text expression and its why-comment verbatim; no new source comments, guards, fallback behavior, wrappers or public contracts were added beyond the named bindings.
- Policy/default bodies are unchanged. No existing test cases/assertions were deleted or weakened. No CSS, themes, credentials, transport protocols or effective-mode policy were changed.

## Verification / handoff

**Architecture audit: WARNING — implementation only, untested.** Reviewed host ownership, Jini imports/required input delivery, settings/config credential separation, original log copy, subscription cleanup, filtered collection port, policy split, host TipTap/taxonomy ownership, lazy target/key and literal-copy ownership. No source changes under Jini; no dependency additions for stopped T35.

Fresh evidence: `git diff --check` passes; targeted importer searches show the removed ledger/view paths are replaced, and policy symbols import from their new host owner. Full changed-file diff and all three new files reviewed. No runtime, baseline, tests, mutation runs, builds, installs, typechecks or linters ran, per dispatch. Linked package build/output validation and behavioral parity remain Opus work.

Function review: execution binders/subscription, composer source/watch/selection/refusal bindings, widget list/dispatcher bindings, policy move and entry mount/slots assessed against the sheet boundaries. Existing decision bodies remain owned by Jini or the unchanged host policy. No new algorithm, recurring schedule or retained collection was introduced; original 60-second visible/open composer polling and cleanup remain. The new entry toolbar locale binding uses the existing scoped query cache. Runtime correctness/coverage is unverified until Opus runs the inherited witnesses and retained live suites.

Documentation classification: existing portable why-comments accompany the upstream moved bodies; host binding/policy comments stay with the named host code. No new explanatory source comments were added. Supplied sheets take precedence over broader skill defaults for test execution, commits, extra abstractions and documentation expansion.

