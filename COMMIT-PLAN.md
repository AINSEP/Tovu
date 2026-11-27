# Commit plan — r62t-ttq-t1

Base: `c9e471a7ca` (`codex/tv-w62-ttqf-1`, same as `origin/codex/m27u`). Stage only the paths under each commit below. Keep this plan uncommitted.

## 1. ci: gate the lane S/U schema pins

- `apps/website/src/__tests__/lane-su-pins/p6-p7-table-and-kind-shapes.typecheck.ts`
- `tsconfig.lane-su-pins.json`
- `.github/workflows/jini-published-typecheck.yml`

**F7.3 — `LaneSuTableShapes`.** Remove `actor_kind` from generated `ChangeSetsTable` while leaving the pin unchanged. The independent column union no longer matches, so the dedicated blocking CI step fails. The root check excludes the pin. All 58 pinned table key sets match the generated declarations by static comparison on the unmodified schema.

## 2. test(admin): pin media loading, refresh, paging and UI behavior

- `apps/admin/src/features/media/__tests__/use-media.hooks.unit.test.tsx`
- `apps/admin/src/features/media/__tests__/media-grid-cursor.unit.test.tsx`
- `apps/admin/src/features/media/__tests__/media-grid-fit.unit.test.tsx`
- `apps/admin/src/features/media/__tests__/media-screen-states.unit.test.tsx`
- `apps/admin/src/features/media/__tests__/upload-size-copy.unit.test.tsx`

| Test | Entry | Mutation and failure signal |
|---|---|---|
| Does not resolve media while the port call is pending | F5.2 | In `useGridPages`, replace the first-page fetch callback with `() => new Promise<MediaGridPage>(() => {})`. The test fails on the missing grid-port call, even though media stays null. Returning rows without waiting or dropping the settled rows also differs from the two-phase expectation. |
| Stops re-reading once unmounted | F5.2 | Change `return subscribeToContentRefresh(...)` to `void subscribeToContentRefresh(...)` in the real subscription effect. A second publish calls the observed invalidator after unmount. |
| Changing tabs during load more | F4.3 | Hard-code `tab: "all"` in the first-page port call, leaving the query key unchanged. The third request fails the Videos view assertion. Showing the initial All counts or applying late All counts fails the Videos count checks before or after the delayed settlement. |
| Tooltip bubbles on hover and keyboard focus | F3.1 | Set `tabIndex={-1}` on Upload or Import from URL. Bounded Tab traversal cannot reach that trigger even if its hover behavior is intact. |
| Media Trash displays each supplied countdown | F1.3 | Make every card use the first trashed asset's `trashDaysRemaining` at the grid-to-card binding. At least one named card fails its own countdown assertion. |
| Ordinary oversize copy is translated | F4.3 | In `fileSizeRefusal`, replace `t(FILE_TOO_LARGE_COPY)` with `FILE_TOO_LARGE_COPY`. The Spanish result no longer matches its literal. |

## 3. test(admin): exercise live embed lookup and editor theme refresh

- `apps/admin/src/features/pages/hooks/__tests__/live-preview-embed-ids.unit.test.ts`
- `apps/admin/src/features/pages/__tests__/PageEditor.preview-youtube.unit.test.tsx`

| Test | Entry | Mutation and failure signal |
|---|---|---|
| Live binding waits for its debounced lookup | F2.3 | Replace `useLivePreviewEmbedIds` with `() => []`. No POST occurs and the hook never exposes the seeded ID. |
| Theme refresh rechecks links without changing sandbox | F2.4 | Replace `previewRevision: fresh.revision` with `previewRevision: 0` in Jini's editor preview. Publishing `r2` on the mounted editor no longer replaces the first YouTube link. The expected sandbox is also pinned independently before checking it stays unchanged. |

## 4. test: pin folder zipper bindings and Portuguese fallback copy

- `apps/admin/src/features/plugins/__tests__/folder-zip-port.unit.test.ts`
- `apps/desktop/src/desktop-i18n.boundaries.test.ts`

| Test | Entry | Mutation and failure signal |
|---|---|---|
| Shows an empty-folder refusal | F2.4 | Bind either `AgentPlugins` or `useWiredPlugins` to a different folder-zip port with the wrong refusal class. Its production-bound port fails the identity assertion. The original empty pick still drives the real zipper and refusal handler. |
| `pt-PT` falls back to `pt-BR` | F4.1 | In `desktop-i18n.ts`, replace the `COPY["pt-BR"]` row with the Spanish row. The two Portuguese locales still agree, but the independent Portuguese literals fail. |

## 5. test(website): drive real embed rendering, disabling and catalog context

- `apps/website/src/features/agent-plugins/__tests__/unit/plugin-embed-render.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/soon-lock.unit.test.ts`
- `apps/website/src/assistant/__tests__/tool-catalog-query.entries.test.ts`

| Test | Entry | Mutation and failure signal |
|---|---|---|
| Legacy HTML is byte-identical with the optional plugin port | F4.3 | At the start of the resolver loop, add `if (type === "media" && deps.pluginExports) continue;`. The baseline still renders the seeded MP4, but the plugin-port render differs. |
| Soon enable refusals write nothing and off always works | F4.5 | Return an `enabled: false` success for the off call before persisting activation. The seeded `notes` plugin remains active on the independent read. |
| HTTP describe of `content_read.content_region` | F2.4 | Make the alias return `null` in the host catalog. The authenticated handler returns NOT_FOUND instead of an actionable descriptor or pointer to `content_read.widget_region`. |
| HTTP describe of `content_read.form` | F2.4 | Make the alias return `null` in the host catalog. The authenticated handler returns NOT_FOUND instead of an actionable descriptor or pointer to `content_read.form_definition`. |

## 6. test(admin): verify MCP credential removal reaches the controller

- `apps/admin/src/features/security/hooks/__tests__/use-other-credentials.unit.test.tsx`

**F4.1 — `external-mcp: deleteExternalMcpServer(itemId)`.** Remove the successful `operations.refetchOne` call in `removeNow`. The exact delete still reaches the port, but the controller still lists `s1` and `s2` instead of only `s2`.

## 7. test(admin): fix both merge-27 failures

- `apps/admin/src/lib/__tests__/api-request-shapes.samples.json`
- `apps/admin/src/lib/__tests__/__snapshots__/api-request-shapes.characterization.test.ts.snap`
- `apps/admin/src/features/trash/__tests__/use-trash.unit.test.tsx`

| Test | Mutation and failure signal |
|---|---|
| Request-shape table covers every client member | Omit the `applyMediaProviderChanges` sample. The real client-member enumeration no longer matches the table. |
| `applyMediaProviderChanges` request-shape row | Drop `removes` from the client's `JSON.stringify({ removes, patches })`. The new PATCH snapshot differs. The kit's real client supplies the workspace-relative URL and the bound request supplies headers and signal. |
| Ignores Trash selection and batch actions before page one | Remove the `chosen.length === 0` guard from either batch action. The deferred page is still pending and the fake records an invalid empty batch. The cloud failure itself was a test race: the real TanStack observer can notify after the promise-resolving `act` returns. Waiting for the published items keeps the full result assertion intact. |

## Author Checklist and diff audit

Reviewed each changed case against the named mutation and the Author Checklist. Positive controls establish the request, subscription, focus, fixture or persisted state before checking absence or transition. Literal expectations and distinct fixtures isolate the intended behaviors. Real hooks, routes and stores stay in place, with fakes only at their existing I/O seams or for the named call-through observation. Pending work is gated or observed with bounded waits. Globals and the call-through spy are restored. Additional cases outside the review were not added.

Replaced the stale `listMedia` negative-verification comment and unused spy and fixed delay, programmatic focus, the hook-only theme refresh setup, the redundant sandbox constant import, and the mock-response echo. Updated the existing type-pin comment to identify its new gate. No valid assertion was removed to obtain a pass. No production files changed and no extra scaffolding remained after diff review.

All 15 review rows and both cloud fixes are implemented. No sheets rejected or stopped. Tests, mutation execution, builds, installs, linters and typechecks were not run, per dispatch. Opus owns execution and confirmation.
