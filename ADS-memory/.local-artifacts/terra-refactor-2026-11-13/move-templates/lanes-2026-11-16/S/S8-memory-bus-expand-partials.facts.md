# S8-memory-bus-expand-partials — machine-verified facts (generated; do not hand-edit)

Source: Tovu tree at `LANE_ROOT` (committed copy: `origin/integ/merge-a-2026-11-16`) @ `e801e9aee`. Regenerate: `LANE_ROOT=<tovu clone> python3 scripts/inv.py && LANE_ROOT=<tovu clone> python3 scripts/rep.py && LANE_ROOT=<tovu clone> python3 scripts/facts.py [<out dir>]`. Blobs are `git hash-object` of that tree; a sheet executor re-checks every blob (COMMON STOP-on-mismatch).

Files: 8, 946 lines (tests not counted).

## Files
| path (under apps/website/src) | lines | blob | CLASSIFY label | audit row | existing sheet/design mention | prod importers | test importers |
|---|---|---|---|---|---|---|---|
| contracts/core/entry-refs/extractor.ts | 412 | 36fa39f0449d9b07172a0425a646196d88eec723 | MOVE | - | w1-sheets-d:move-entry-refs.md | 5 | 9 |
| contracts/core/entry-refs/ports.ts | 40 | 6f2bc9231f7d09b85a539a7bac24991a290989ae | DEDUPE | - | w1-sheets-d:move-entry-refs.md | 8 | 1 |
| contracts/core/entry-refs/repo.memory.ts | 50 | d430739f820bad0f5cef6dd3004cb7e375f0e338 | DEDUPE-UNVERIFIED | - | w1-sheets-d:move-entry-refs.md | 4 | 31 |
| contracts/core/entry-refs/types.ts | 58 | 41043733f2d6113d867de10955949bb34dddf671 | DEDUPE | - | w1-sheets-d:move-entry-refs.md | 5 | 3 |
| platform/db/repos/entry-refs-repo.ts | 126 | 42001fded69c60c6d0d548147d20829cc447120a | MOVE-AFTER | - | w1-sheets-d:move-entry-refs.md | 2 | 2 |
| platform/db/sqlite/entry-refs-repo.sqlite.ts | 15 | 7184294695524a0f298d6a0c6de3701997f6df1b | - | - | - | 4 | 5 |
| contracts/core/events/memory-bus.ts | 161 | 9e173257d7680a4b162b7b419cc4bd310d41d980 | MOVE | - | - | 1 | 9 |
| contracts/core/expand-partials.ts | 84 | 762d3e5ebc1a47944107922cd97ff75186f826e9 | MOVE-AFTER | - | - | 4 | 2 |

## Per file: exports, tables, lock keys, imports that leave the folder, importers

### contracts/core/entry-refs/extractor.ts (412 lines)
- exports (3): ExtractEntryRefsInput, extractEntryRefs, extractHtmlEntryRefs
- tables touched: -
- lock keys: -
- flags: console
- npm/@jini-ai imports: @jini-ai/cms/widgets/markers, @jini-ai/core/primitives, @jini-ai/core/records
- same-folder imports: contracts/core/entry-refs/types.ts
- imports leaving the folder: -
- prod importers (5): features/pages/html-document-store.memory.ts, features/pages/html-document-store.ts, features/publish-content/content-references.ts, features/widgets/deps.ts, development/scripts/migrate-page-embed-markers.ts
- test importers (9): contracts/core/entry-refs/__tests__/extractor-l079.test.ts, contracts/core/entry-refs/__tests__/extractor-marker.canary.test.ts, contracts/core/entry-refs/__tests__/form-reference-chain.unit.test.ts, contracts/core/entry-refs/__tests__/integration/extractor.integration.test.ts, contracts/core/entry-refs/__tests__/integration/html-entry-refs-consistency.integration.test.ts, features/media/__tests__/mediawidget-where-used.test.ts, features/widgets/__tests__/integration/gallery-widget.integration.test.ts, features/widgets/__tests__/integration/gallery.integration.test.ts, features/widgets/__tests__/integration/mediawidget.integration.test.ts

### contracts/core/entry-refs/ports.ts (40 lines)
- exports (1): EntryRefsRepoPort
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/core/primitives
- same-folder imports: contracts/core/entry-refs/types.ts
- imports leaving the folder: -
- prod importers (8): contracts/core/entry-refs/repo.memory.ts, features/media/where-used.ts, features/pages/html-document-store.memory.ts, features/pages/html-document-store.ts, features/publish-content/type-registry.ts, features/widgets/deps.ts, platform/db/repos/entry-refs-repo.ts, server/routes/types.ts
- test importers (1): contracts/core/entry-refs/__tests__/repo.contract.test.ts

### contracts/core/entry-refs/repo.memory.ts (50 lines)
- exports (1): InMemoryEntryRefsRepo
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/core/primitives
- same-folder imports: contracts/core/entry-refs/ports.ts, contracts/core/entry-refs/types.ts
- imports leaving the folder: -
- prod importers (4): server/runtime/composition/memory-deps/slices/form-attachment-purge.ts, server/runtime/composition/memory-deps/slices/memory-trash.ts, server/runtime/composition/memory-deps/slices/nav-form-content-repos.ts, server/runtime/composition/memory-deps/slices/trash-adapters-forms-widgets.ts
- test importers (31): assistant/__tests__/mcp-ui-tool-calls-route.delete-confirmation-family.integration.test.ts, assistant/__tests__/merged-readers-batch.test.ts, assistant/__tests__/tool-registrations.widgets-authorization.test.ts, assistant/__tests__/tool-registrations.widgets-contracts.test.ts, contracts/core/entry-refs/__tests__/form-reference-chain.unit.test.ts, contracts/core/entry-refs/__tests__/repo.contract.test.ts, contracts/core/events/__tests__/outbox-workspace-id.integration.test.ts, features/forms/__tests__/common-fields.test.ts, features/media/__tests__/mediawidget-where-used.test.ts, features/pages/__tests__/html-document-store.memory.test.ts, features/pages/__tests__/html-document-store.noop-save.test.ts, features/pages/__tests__/html-document-store.sqlite.test.ts, features/widgets/__tests__/agent-tools.trash-confirmation.test.ts, features/widgets/__tests__/integration/embed-service.integration.test.ts, features/widgets/__tests__/integration/embed-service.post-host.integration.test.ts, features/widgets/__tests__/integration/region-area-service.integration.test.ts, features/widgets/__tests__/integration/tool-registrations.delegated-error-status.test.ts, features/widgets/__tests__/integration/tool-registrations.handler-gaps.test.ts, features/widgets/__tests__/integration/tool-registrations.input-validation-status.test.ts, features/widgets/__tests__/integration/tool-registrations.plugin-hook-failed.test.ts, features/widgets/__tests__/integration/tool-registrations.region-gaps.test.ts, features/widgets/__tests__/integration/tool-registrations.shape-rejection.test.ts, features/widgets/__tests__/integration/write-service.integration.test.ts, features/widgets/__tests__/unit/publish-content.test.ts, server/__tests__/b07-admin-read-gaps.test.ts, server/__tests__/b07-widget-create-gaps.test.ts, server/__tests__/widgets-error-code-parity.test.ts, server/inbound/admin-http/routes/widgets/__tests__/unit/library.unit.test.ts, server/inbound/admin-http/routes/widgets/__tests__/unit/region-bind.unit.test.ts, server/inbound/admin-http/routes/widgets/__tests__/unit/route-guards.unit.test.ts, server/inbound/admin-http/routes/widgets/__tests__/unit/update.unit.test.ts

### contracts/core/entry-refs/types.ts (58 lines)
- exports (3): EntryRefSourceKind, EntryRefTargetKind, EntryRefRow
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/core/primitives
- same-folder imports: -
- imports leaving the folder: -
- prod importers (5): contracts/core/entry-refs/extractor.ts, contracts/core/entry-refs/ports.ts, contracts/core/entry-refs/repo.memory.ts, features/media/where-used.ts, platform/db/repos/entry-refs-repo.ts
- test importers (3): contracts/core/entry-refs/__tests__/integration/extractor.integration.test.ts, contracts/core/entry-refs/__tests__/repo.contract.test.ts, platform/db/repos/__tests__/entry-refs-repo.dialects.test.ts

### platform/db/repos/entry-refs-repo.ts (126 lines)
- exports (2): SqlEntryRefsRepo, entryRefsRepoFor
- tables touched: entry_refs
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/core/primitives, kysely
- same-folder imports: -
- imports leaving the folder: contracts/core/entry-refs/ports.ts, contracts/core/entry-refs/types.ts, platform/db/content-database.generated.ts, platform/db/content-kernel.ts
- prod importers (2): platform/db/sqlite/entry-refs-repo.sqlite.ts, scripts/forms-maintenance.ts
- test importers (2): features/forms/__tests__/form-file-maintenance.test.ts, platform/db/repos/__tests__/entry-refs-repo.dialects.test.ts

### platform/db/sqlite/entry-refs-repo.sqlite.ts (15 lines)
- exports (1): SqliteEntryRefsRepo
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: -
- same-folder imports: platform/db/sqlite/content-db.ts
- imports leaving the folder: platform/db/content-kernel.ts, platform/db/repos/entry-refs-repo.ts
- prod importers (4): server/runtime/composition/deps.ts, server/runtime/composition/peer-site-reads.ts, development/scripts/convert-legacy-doc-pages-to-html.ts, development/scripts/migrate-page-embed-markers.ts
- test importers (5): contracts/core/entry-refs/__tests__/repo.contract.test.ts, features/publish-content/__tests__/new-types-sqlite-round-trip.test.ts, features/trash/__tests__/widget-trash-flow.test.ts, features/widgets/__tests__/integration/embed-service.integration.test.ts, server/runtime/composition/__tests__/publish-content-manifest.test.ts

### contracts/core/events/memory-bus.ts (161 lines)
- exports (2): InMemoryEventBus, InMemoryOutbox
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/core/contracts/events
- same-folder imports: contracts/core/events/outbox-worker.ts
- imports leaving the folder: -
- prod importers (1): contracts/core/events/index.ts
- test importers (9): contracts/core/events/__tests__/enqueue-only-outbox.payload.test.ts, contracts/core/events/__tests__/outbox-drainer.scheduling.test.ts, contracts/core/events/__tests__/outbox-repo.contract.test.ts, contracts/core/events/__tests__/outbox-retry-policies.unit.test.ts, features/plugin-runtime/__tests__/fixtures/plugins-tool-harness.ts, features/post/__tests__/post.schedule-events.test.ts, server/__tests__/integration/create-app-event-subscriptions-once.integration.test.ts, server/runtime/composition/__tests__/create-app-lifecycle.pin.test.ts, server/runtime/composition/__tests__/sqlite-create-site-app-module-identity.integration.test.ts

### contracts/core/expand-partials.ts (84 lines)
- exports (1): expandPartials
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/cms/widgets/markers
- same-folder imports: contracts/core/theme-slots.ts
- imports leaving the folder: -
- prod importers (4): features/plugin-runtime/widget-partials.ts, features/theme/static-render.ts, server/inbound/public-http/routes/site/pages/static-tier.ts, server/inbound/public-http/routes/site/pages/template-render.ts
- test importers (2): features/theme/__tests__/static-render-expand-partials.test.ts, features/theme/__tests__/static-theme-migrated-asset-paths.test.ts

## Test files that import a file of this sheet (blob-guard each before editing)
| test | lines | blob |
|---|---|---|
| contracts/core/entry-refs/__tests__/extractor-l079.test.ts | 39 | 7b4d1fb4ac05588f4af769759906ad4078ae67dd |
| contracts/core/entry-refs/__tests__/extractor-marker.canary.test.ts | 154 | 2358d73cbef7ecab7c9e47cde91c892eac99db29 |
| contracts/core/entry-refs/__tests__/form-reference-chain.unit.test.ts | 27 | b408528e650f8a28c7625fc74c3ccd8fb26fa7b9 |
| contracts/core/entry-refs/__tests__/integration/extractor.integration.test.ts | 295 | 06604f10fc05e79af5bdcc6f46af777a48fa0d20 |
| contracts/core/entry-refs/__tests__/integration/html-entry-refs-consistency.integration.test.ts | 136 | 8f8ac4c57a779c7d47bffaaaf04f03d7cdf422b0 |
| features/media/__tests__/mediawidget-where-used.test.ts | 100 | 49cdc064c13da9379d1820b72438d2944c62c619 |
| features/widgets/__tests__/integration/gallery-widget.integration.test.ts | 54 | 247fa278245ba283ae799fe31be1e0319939f8e7 |
| features/widgets/__tests__/integration/gallery.integration.test.ts | 71 | dacf78e54c2a05f96351c2d2a1c9914b23839d11 |
| features/widgets/__tests__/integration/mediawidget.integration.test.ts | 178 | 004eeb0028ae27e0fd8b4f8d587db4bb578caffa |
| contracts/core/entry-refs/__tests__/repo.contract.test.ts | 141 | dc0401fcb1e1e0acce9862b72873c36b44aa3e6b |
| assistant/__tests__/mcp-ui-tool-calls-route.delete-confirmation-family.integration.test.ts | 479 | 0f256b6c262d17c84124f66acfa9e21e58f90754 |
| assistant/__tests__/merged-readers-batch.test.ts | 323 | 7c93e12c311b630a3d777c449a5ac7b785066ebf |
| assistant/__tests__/tool-registrations.widgets-authorization.test.ts | 290 | ede53b04e0bb4abd44a018a6d1605bec3a51263b |
| assistant/__tests__/tool-registrations.widgets-contracts.test.ts | 432 | 1af885320af5d83729601664bf4b3545677cb86d |
| contracts/core/events/__tests__/outbox-workspace-id.integration.test.ts | 429 | 70b28131ea1569d83780ce32b530335863c8ea95 |
| features/forms/__tests__/common-fields.test.ts | 127 | 7bf1240a2b9a7a4096b3895734045b0cc7b0c1a5 |
| features/pages/__tests__/html-document-store.memory.test.ts | 339 | c2242992450782956acf87331199d38e7cf17858 |
| features/pages/__tests__/html-document-store.noop-save.test.ts | 135 | 896a1ee5e347b99d9221ef3b7fa062686c5f2eb1 |
| features/pages/__tests__/html-document-store.sqlite.test.ts | 473 | d07d85afc15a67eb6812a3fe6ccf35c8f7c0e3c3 |
| features/widgets/__tests__/agent-tools.trash-confirmation.test.ts | 140 | 0ae8c893d6329b51a69bb87f61c9100d01b1e754 |
| features/widgets/__tests__/integration/embed-service.integration.test.ts | 616 | c5f7cd16c8044cc8ba62004c3eae4e10744bf027 |
| features/widgets/__tests__/integration/embed-service.post-host.integration.test.ts | 450 | a3a82d3c4a2211ce183beeab7e173d176274777c |
| features/widgets/__tests__/integration/region-area-service.integration.test.ts | 92 | 91efe6fcc4a0da672038545d9141efffa0ccac30 |
| features/widgets/__tests__/integration/tool-registrations.delegated-error-status.test.ts | 326 | 554ec9e5ec18668342193cedca80e9126882e712 |
| features/widgets/__tests__/integration/tool-registrations.handler-gaps.test.ts | 122 | bcf42f8d771c98bf3087cb81c3dd852860497b61 |
| features/widgets/__tests__/integration/tool-registrations.input-validation-status.test.ts | 100 | e2da22b2eebecbde146ad49ab263cc7750e8b5a9 |
| features/widgets/__tests__/integration/tool-registrations.plugin-hook-failed.test.ts | 161 | 1727d50a40a4d0be8db1f201c3120d401c4354f0 |
| features/widgets/__tests__/integration/tool-registrations.region-gaps.test.ts | 414 | a3df1cee14ba20e968981241be6a9b68be71fee3 |
| features/widgets/__tests__/integration/tool-registrations.shape-rejection.test.ts | 165 | 924d0af20f45de71a950159dc26f8759cf55dc67 |
| features/widgets/__tests__/integration/write-service.integration.test.ts | 97 | cb1d02937360d585d4e611fa8a2f30510d3fc8bb |
| features/widgets/__tests__/unit/publish-content.test.ts | 225 | 938686c20b35470dbf62f38aa07c9fbf4d0cb0f5 |
| server/__tests__/b07-admin-read-gaps.test.ts | 234 | d543a01a8b8d504f6ab7a64c8c6807eafe202996 |
| server/__tests__/b07-widget-create-gaps.test.ts | 83 | 5903f5036edc28c452a2b7fb4e65851d839488c7 |
| server/__tests__/widgets-error-code-parity.test.ts | 154 | 3898c6b24b9afb68b52de25d28d802b21e55a8a6 |
| server/inbound/admin-http/routes/widgets/__tests__/unit/library.unit.test.ts | 248 | 99d9a9cdc66ca77146b4e35c142920e360e3fc0c |
| server/inbound/admin-http/routes/widgets/__tests__/unit/region-bind.unit.test.ts | 149 | 6d8d054cb2c3b97cc25c4c9eca22bfb8602f54a6 |
| server/inbound/admin-http/routes/widgets/__tests__/unit/route-guards.unit.test.ts | 283 | f30ebf8816b5a5d9065a4e7a907534a5ae9d77cc |
| server/inbound/admin-http/routes/widgets/__tests__/unit/update.unit.test.ts | 182 | 7133f49a66fc7cc375e2799c6481e85b81343d40 |
| platform/db/repos/__tests__/entry-refs-repo.dialects.test.ts | 113 | 4f2f4a73f395a5d6b42968ae83cf5e5092205c5c |
| features/forms/__tests__/form-file-maintenance.test.ts | 213 | 401a60240bf56c4eefd161d36086f3a20752361b |
| features/publish-content/__tests__/new-types-sqlite-round-trip.test.ts | 203 | 55e3c1dac8c943810eda4d9244d3048777e061c7 |
| features/trash/__tests__/widget-trash-flow.test.ts | 364 | 4df3687c01af0b972af3239ff81714f3e716be3b |
| server/runtime/composition/__tests__/publish-content-manifest.test.ts | 479 | 4d37a06fa7f566702d73b529b17705f440d82cfb |
| contracts/core/events/__tests__/enqueue-only-outbox.payload.test.ts | 56 | 82d6bda6e8ce00f642bf69b0d5d7e93e21583417 |
| contracts/core/events/__tests__/outbox-drainer.scheduling.test.ts | 63 | 42cba2f44d91596bc361510a24f879955cd5811a |
| contracts/core/events/__tests__/outbox-repo.contract.test.ts | 250 | 69aabc59c0201258d83be051c0dfb2b9ae71704d |
| contracts/core/events/__tests__/outbox-retry-policies.unit.test.ts | 98 | f4959c89499eb445cc9deefe8e140d3950244e7b |
| features/plugin-runtime/__tests__/fixtures/plugins-tool-harness.ts | 185 | ebcb030471dae6b70b0965b759d4bb9f11ab1ee6 |
| features/post/__tests__/post.schedule-events.test.ts | 224 | 6365ac698cd619d87370ff3ebf44588ac1d34d14 |
| server/__tests__/integration/create-app-event-subscriptions-once.integration.test.ts | 161 | f59f62a54445d0b4f9f793fd1a56b2fed98f0dd3 |
| server/runtime/composition/__tests__/create-app-lifecycle.pin.test.ts | 167 | 181d0849ed923b53af24b6de9ddd2077a12e6cec |
| server/runtime/composition/__tests__/sqlite-create-site-app-module-identity.integration.test.ts | 283 | 71f7f7fa9d4eb0d585f988a0c2d9cf2538ad7d78 |
| features/theme/__tests__/static-render-expand-partials.test.ts | 114 | 0a14a7bf8c6c1382c237a651f53057058aedd18b |
| features/theme/__tests__/static-theme-migrated-asset-paths.test.ts | 97 | 8198ec2d136924a6132a140f315ad0cf4a911c85 |

## vi.mock / vi.doMock / importActual sites that name a file of this sheet (lesson 2: mock factories are consumers)
- none found by pattern (re-check with the census at execution)

## Path-keyed baselines / configs that name a file of this sheet (lesson 10: debt does not follow moved code silently)
- development/scripts/write-path-inventory.baseline.json: `src/contracts/core/events/memory-bus.ts` at lines 166, 175, 184 (3 hits)

## Census command (run from the Tovu clone root; every hit must be listed above)
```
rg -n --no-heading -e 'entry\-refs\-repo|entry\-refs\-repo\.sqlite|expand\-partials|extractor|memory\-bus|ports|repo\.memory|types' apps development scripts --glob '!**/node_modules/**' -g '*.ts' -g '*.tsx' -g '*.json' -g '*.mjs' -g '*.cjs' | rg 'core|entry-refs|events|repos|sqlite'
```
