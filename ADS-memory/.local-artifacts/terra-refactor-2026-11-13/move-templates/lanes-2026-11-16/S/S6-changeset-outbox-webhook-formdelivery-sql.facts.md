# S6-changeset-outbox-webhook-formdelivery-sql — machine-verified facts (generated; do not hand-edit)

Source: Tovu tree at `LANE_ROOT` (ref `integ/merge-final-2026-11-16`) @ `232764af5`. Regenerate: `LANE_ROOT=<tovu clone> python3 scripts/inv-su.py && LANE_ROOT=<tovu clone> python3 scripts/rep.py && LANE_ROOT=<tovu clone> python3 scripts/facts.py [<out dir>]`. Blobs are `git hash-object` of that tree; a sheet executor re-checks every blob (COMMON STOP-on-mismatch).

Files: 13, 1364 lines (tests not counted).

## Files
| path (under apps/website/src) | lines | blob | CLASSIFY label | audit row | existing sheet/design mention | prod importers | test importers |
|---|---|---|---|---|---|---|---|
| platform/db/repos/change-set-repo.ts | 178 | d1f992280830d26e764281c2f55120e4ad9c6414 | MOVE-AFTER | - | w1-sheets-d:repoint-commands.gen.md;w1-sheets-d:repoint-commands.md | 1 | 2 |
| platform/db/sqlite/change-set-repo.sqlite.ts | 15 | f9bc1957d64d0ab38fcf1c4d9f01432cd406e9e3 | - | - | - | 2 | 6 |
| platform/db/repos/outbox-repo.ts | 156 | 57373f897e939a0bcd792196ce0d57f431572f0a | MOVE-AFTER | - | w1-sheets-d:move-events.md;w1-sheets-f:move-events.md | 7 | 20 |
| platform/db/sqlite/outbox-repo.sqlite.ts | 19 | c0aa30b8ec4813809bd5b68e9e37a2e2c21433bc | - | - | - | 1 | 5 |
| platform/db/repos/webhook-repo.ts | 394 | 0eef21339b8cf625ad57178f6ce30f9dff12ed27 | MOVE | - | - | 1 | 3 |
| platform/db/sqlite/webhook-repo.sqlite.ts | 26 | 72824dd17979deb59f43677f3daed1846ff92ad9 | - | - | - | 1 | 3 |
| platform/db/repos/form-delivery-repo.ts | 266 | 285b2b03f98eec4859f6838e718cababd72e67b2 | MOVE-AFTER | - | - | 2 | 5 |
| platform/db/repos/form-submission-receipt-repo.ts | 24 | 267550bbb495d548f4458ca76d01efc9d2a30a75 | MOVE-AFTER | - | - | 1 | 1 |
| contracts/core/events/enqueue-only-outbox.ts | 33 | 9b9e7628789f9aa07ab9a88b9fb92ceb3118c90c | DELETE | - | - | 1 | 1 |
| contracts/core/events/jini-outbox-adapter.ts | 59 | 359687296c280639299ad793f1b5fa8cfff69014 | - | - | error-system-design-2026-11-16:CODEX-JUDGE.md | 3 | 0 |
| contracts/core/events/outbox-drainer.ts | 73 | af13c2ac9de71cbbdf17d1a6e978344c40288624 | - | - | - | 1 | 2 |
| contracts/core/events/outbox-retry-policies.ts | 23 | a87d1093ccb0ce35f9e0bab0f1529a1c3fdcb231 | - | - | - | 2 | 2 |
| contracts/core/events/outbox-worker.ts | 98 | 76b50a288129bd712bedca18a5d2235d4c28acbd | DELETE | - | - | 2 | 5 |

## Per file: exports, tables, lock keys, imports that leave the folder, importers

### platform/db/repos/change-set-repo.ts (178 lines)
- exports (1): SqlChangeSetRepo
- tables touched: change_set_items, change_sets, outbox_events
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/core/contracts/events, kysely
- same-folder imports: platform/db/repos/outbox-repo.ts
- imports leaving the folder: platform/db/content-database.generated.ts, platform/db/content-kernel.ts
- prod importers (1): platform/db/sqlite/change-set-repo.sqlite.ts
- test importers (2): contracts/core/commands/__tests__/repo.contract.test.ts, platform/db/repos/__tests__/change-set-repo.test.ts

### platform/db/sqlite/change-set-repo.sqlite.ts (15 lines)
- exports (1): SqliteChangeSetRepo
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: -
- same-folder imports: platform/db/sqlite/content-db.ts
- imports leaving the folder: platform/db/content-kernel.ts, platform/db/repos/change-set-repo.ts
- prod importers (2): server/runtime/composition/deps.ts, server/runtime/composition/peer-site-reads.ts
- test importers (6): contracts/core/commands/__tests__/change-sets-restart.integration.test.ts, contracts/core/commands/__tests__/idempotency-race.integration.test.ts, contracts/core/commands/__tests__/repo.contract.test.ts, contracts/core/events/__tests__/outbox-restart.integration.test.ts, platform/db/sqlite/__tests__/change-set-repo.sqlite.test.ts, platform/db/sqlite/__tests__/repo-transactions.sqlite.test.ts

### platform/db/repos/outbox-repo.ts (156 lines)
- exports (2): outboxEventValues, SqlOutboxAdapter
- tables touched: outbox_events
- lock keys: 20: * `lockKey("outbox_events:claim")` (ADR-046's "claim rows atomically"): two concurrent claims can | 103: await this.kernel.lockKey("outbox_events:claim");
- flags: -
- npm/@jini-ai imports: @jini-ai/core/contracts/events, @jini-ai/core/primitives, kysely
- same-folder imports: -
- imports leaving the folder: contracts/core/events/index.ts, platform/db/content-database.generated.ts, platform/db/content-kernel.ts
- prod importers (7): features/identity/user-purge.ts, features/trash/adapters/user.ts, platform/db/repos/change-set-repo.ts, platform/db/repos/form-delivery-repo.ts, platform/db/sqlite/outbox-repo.sqlite.ts, server/runtime/composition/deps.ts, scripts/forms-maintenance.ts
- test importers (20): contracts/core/events/__tests__/forms-notification-restart.integration.test.ts, contracts/core/events/__tests__/jini-outbox-parity.test.ts, contracts/core/events/__tests__/outbox-repo.contract.test.ts, features/forms/__tests__/form-file-maintenance.test.ts, features/forms/__tests__/form-file-renditions.test.ts, features/forms/__tests__/repo.dialects.test.ts, features/identity/__tests__/delete-user-service.test.ts, features/identity/__tests__/user-purge.test.ts, features/trash/__tests__/account-protections.test.ts, features/trash/__tests__/user-adapter.dialects.test.ts, features/trash/__tests__/user-adapter.test.ts, platform/db/__tests__/parity/parity-harness.ts, platform/db/repos/__tests__/form-delivery-repo.dialects.test.ts, platform/db/repos/__tests__/form-delivery-repo.postgres.test.ts, platform/db/sqlite/__tests__/repo-transactions.sqlite.test.ts, server/inbound/admin-http/routes/users/__tests__/delete.test.ts, server/inbound/public-http/routes/site/__tests__/commerce-strip-parity.test.ts, server/runtime/composition/__tests__/account-purge-protections.test.ts, server/runtime/composition/__tests__/form-delivery.security.test.ts, server/runtime/composition/__tests__/trash-user-tool-port.test.ts

### platform/db/sqlite/outbox-repo.sqlite.ts (19 lines)
- exports (1): SqliteOutboxAdapter
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: -
- same-folder imports: platform/db/sqlite/content-db.ts
- imports leaving the folder: platform/db/content-kernel.ts, platform/db/repos/outbox-repo.ts
- prod importers (1): server/runtime/composition/deps.ts
- test importers (5): contracts/core/events/__tests__/jini-outbox-parity.test.ts, contracts/core/events/__tests__/outbox-repo.contract.test.ts, contracts/core/events/__tests__/outbox-restart.integration.test.ts, contracts/core/events/__tests__/outbox-workspace-id.integration.test.ts, platform/db/sqlite/__tests__/repo-transactions.sqlite.test.ts

### platform/db/repos/webhook-repo.ts (394 lines)
- exports (2): SqlWebhookSubscriptionRepo, SqlWebhookDeliveryRepo
- tables touched: webhook_deliveries, webhook_subscriptions
- lock keys: 42: * `lockKey("webhook_deliveries:claim")`, so two claimers never take the same row on any dialect. | 242: await this.kernel.lockKey("webhook_deliveries:claim");
- flags: -
- npm/@jini-ai imports: @jini-ai/core/optimistic-concurrency, kysely
- same-folder imports: -
- imports leaving the folder: features/webhooks/index.ts, platform/db/content-database.generated.ts, platform/db/content-kernel.ts
- prod importers (1): platform/db/sqlite/webhook-repo.sqlite.ts
- test importers (3): features/webhooks/__tests__/subscription-repo.lost-update.test.ts, platform/db/sqlite/__tests__/webhook-delivery-repo.sqlite.test.ts, platform/db/sqlite/__tests__/webhook-subscription-repo.sqlite.test.ts

### platform/db/sqlite/webhook-repo.sqlite.ts (26 lines)
- exports (2): SqliteWebhookSubscriptionRepo, SqliteWebhookDeliveryRepo
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: -
- same-folder imports: platform/db/sqlite/content-db.ts
- imports leaving the folder: platform/db/content-kernel.ts, platform/db/repos/webhook-repo.ts
- prod importers (1): server/runtime/composition/deps.ts
- test importers (3): platform/db/sqlite/__tests__/webhook-delivery-repo.sqlite.test.ts, platform/db/sqlite/__tests__/webhook-subscription-repo.sqlite.test.ts, server/runtime/composition/__tests__/webhook-delivery-worker.shutdown.test.ts

### platform/db/repos/form-delivery-repo.ts (266 lines)
- exports (2): SqlFormDeliveryRepo, SqlFormPullLeaseRepo
- tables touched: form_delivery_jobs, form_delivery_plans, form_receiver_pulls, outbox_events
- lock keys: 103: await kernel.lockKey(JSON.stringify(["form-delivery-plan", workspaceId, submissionId])); | 247: await kernel.lockKey(JSON.stringify(["form-receiver-pull", workspaceId, receiverKey]));
- flags: tovu-text
- npm/@jini-ai imports: @jini-ai/cms/forms, @jini-ai/core/contracts/events, kysely
- same-folder imports: platform/db/repos/outbox-repo.ts
- imports leaving the folder: contracts/headless/index.ts, platform/db/content-database.generated.ts, platform/db/content-kernel.ts
- prod importers (2): server/runtime/composition/deps.ts, server/runtime/composition/peer-site-reads.ts
- test importers (5): platform/db/repos/__tests__/form-delivery-repo.dialects.test.ts, platform/db/repos/__tests__/form-delivery-repo.postgres.test.ts, server/runtime/composition/__tests__/form-delivery.security.test.ts, server/runtime/composition/__tests__/form-submissions.test.ts, server/runtime/composition/__tests__/peer-site-reads.test.ts

### platform/db/repos/form-submission-receipt-repo.ts (24 lines)
- exports (1): SqlFormSubmissionReceiptRepo
- tables touched: form_submission_remote_receipts
- lock keys: -
- flags: -
- npm/@jini-ai imports: -
- same-folder imports: -
- imports leaving the folder: features/forms/index.ts, platform/db/content-kernel.ts
- prod importers (1): server/runtime/composition/deps.ts
- test importers (1): platform/db/repos/__tests__/form-submission-receipt-repo.dialects.test.ts

### contracts/core/events/enqueue-only-outbox.ts (33 lines)
- exports (1): toEnqueueOnlyOutbox
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/core/contracts/events, @jini-ai/infra/events/outbox
- same-folder imports: contracts/core/events/jini-outbox-adapter.ts
- imports leaving the folder: -
- prod importers (1): contracts/core/events/index.ts
- test importers (1): contracts/core/events/__tests__/enqueue-only-outbox.payload.test.ts

### contracts/core/events/jini-outbox-adapter.ts (59 lines)
- exports (3): toJiniOutbox, toCmsOutbox, outboxWorkerArgs
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/core/contracts/events, @jini-ai/core/primitives, @jini-ai/infra/events/outbox
- same-folder imports: -
- imports leaving the folder: -
- prod importers (3): contracts/core/events/enqueue-only-outbox.ts, contracts/core/events/outbox-drainer.ts, contracts/core/events/outbox-worker.ts
- test importers (0): -

### contracts/core/events/outbox-drainer.ts (73 lines)
- exports (1): startOutboxDrainer
- re-exports: {DEFAULT_OUTBOX_DRAIN_INTERVAL_MS} from @jini-ai/infra/events/outbox; {OutboxDrainer} from @jini-ai/infra/events/outbox
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/core/contracts/events, @jini-ai/core/primitives, @jini-ai/diagnostics/observability, @jini-ai/infra/events/outbox
- same-folder imports: contracts/core/events/jini-outbox-adapter.ts, contracts/core/events/outbox-retry-policies.ts
- imports leaving the folder: -
- prod importers (1): contracts/core/events/index.ts
- test importers (2): contracts/core/events/__tests__/outbox-drainer.scheduling.test.ts, contracts/core/events/__tests__/outbox-retry-policies.unit.test.ts

### contracts/core/events/outbox-retry-policies.ts (23 lines)
- exports (1): outboxRetryPolicyForEvent
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/cms/forms, @jini-ai/infra/events/outbox, @jini-ai/integrations/webhooks
- same-folder imports: -
- imports leaving the folder: -
- prod importers (2): contracts/core/events/outbox-drainer.ts, contracts/core/events/outbox-worker.ts
- test importers (2): contracts/core/events/__tests__/forms-notification-retry.test.ts, contracts/core/events/__tests__/outbox-retry-policies.unit.test.ts

### contracts/core/events/outbox-worker.ts (98 lines)
- exports (2): computeOutboxBackoffMs, processOutbox
- re-exports: {MAX_OUTBOX_ATTEMPTS} from @jini-ai/infra/events/outbox; {DEFAULT_OUTBOX_CLAIM_LEASE_MS} from @jini-ai/infra/events/outbox; {DEFAULT_OUTBOX_DELIVERY_TIMEOUT_MS} from @jini-ai/infra/events/outbox
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/core/contracts/events, @jini-ai/core/primitives, @jini-ai/infra/events/outbox
- same-folder imports: contracts/core/events/jini-outbox-adapter.ts, contracts/core/events/outbox-retry-policies.ts
- imports leaving the folder: -
- prod importers (2): contracts/core/events/index.ts, contracts/core/events/memory-bus.ts
- test importers (5): contracts/core/events/__tests__/enqueue-only-outbox.payload.test.ts, contracts/core/events/__tests__/outbox-repo.contract.test.ts, contracts/core/events/__tests__/outbox-retry-policies.unit.test.ts, contracts/core/events/__tests__/outbox-worker.test.ts, server/__tests__/integration/create-app-event-subscriptions-once.integration.test.ts

## Test files that import a file of this sheet (blob-guard each before editing)
| test | lines | blob |
|---|---|---|
| contracts/core/commands/__tests__/repo.contract.test.ts | 172 | 6025e9260f201cd867af0f9db5e1fa672f4136c3 |
| platform/db/repos/__tests__/change-set-repo.test.ts | 218 | add5cb4352044a319c89f3acf5bcd934df96aec4 |
| contracts/core/commands/__tests__/change-sets-restart.integration.test.ts | 74 | bf4e8e7fe5204105bbdd5753cf21541e30898902 |
| contracts/core/commands/__tests__/idempotency-race.integration.test.ts | 102 | 2572adb1bfbedeb3ddad839cc66918ce23b7ce49 |
| contracts/core/events/__tests__/outbox-restart.integration.test.ts | 135 | 3a47d3b6c79894d5c266ba7ec918a7bec0b71d62 |
| platform/db/sqlite/__tests__/change-set-repo.sqlite.test.ts | 177 | e43887596cf8ab13fb1437bd6971ff01dce6812b |
| platform/db/sqlite/__tests__/repo-transactions.sqlite.test.ts | 164 | 8f569ac0dc98f915d9928cf0356c605308067c2b |
| contracts/core/events/__tests__/forms-notification-restart.integration.test.ts | 155 | f41166784344f82254f7e5910f95a5783910ef12 |
| contracts/core/events/__tests__/jini-outbox-parity.test.ts | 187 | e0ec7f59bee12f308e5453dbd301dddab95e6e76 |
| contracts/core/events/__tests__/outbox-repo.contract.test.ts | 250 | 69aabc59c0201258d83be051c0dfb2b9ae71704d |
| features/forms/__tests__/form-file-maintenance.test.ts | 213 | 401a60240bf56c4eefd161d36086f3a20752361b |
| features/forms/__tests__/form-file-renditions.test.ts | 147 | 3410d179eca09653f9caec8bde506876fff51547 |
| features/forms/__tests__/repo.dialects.test.ts | 150 | 05b5ae3db084b6bedc5b33ade19a5ad759da5acf |
| features/identity/__tests__/delete-user-service.test.ts | 641 | 9837eaa9de771bd4327307d151e13e5e91819657 |
| features/identity/__tests__/user-purge.test.ts | 226 | 87120e92a1482de7e7a99d4544754f4fbf33579d |
| features/trash/__tests__/account-protections.test.ts | 48 | e20289fe76ff479b39936eb2f7fe6f2f31888ba7 |
| features/trash/__tests__/user-adapter.dialects.test.ts | 159 | 1e0a44cf78630b894463e2ee8ed54d352bbaa4b7 |
| features/trash/__tests__/user-adapter.test.ts | 439 | ff290189d5ea5e12890242da7a4a48bb100f3c7c |
| platform/db/__tests__/parity/parity-harness.ts | 621 | ab7d9fe4a362fa971ea62dd66fe563260aeb5736 |
| platform/db/repos/__tests__/form-delivery-repo.dialects.test.ts | 263 | b617163a5316776087bf72c851ebec260355fbd4 |
| platform/db/repos/__tests__/form-delivery-repo.postgres.test.ts | 104 | f0c3f85795c91ff9f0e1460ba54da57d845827f9 |
| server/inbound/admin-http/routes/users/__tests__/delete.test.ts | 361 | 3ab5068096405a66d4198f16fedbc00ddcb25764 |
| server/inbound/public-http/routes/site/__tests__/commerce-strip-parity.test.ts | 262 | 17653b0d2fb31b7dce2eff9f68b83e80a40ddaad |
| server/runtime/composition/__tests__/account-purge-protections.test.ts | 209 | 5881d5bbc50d1dfeb23d2b2a5b042685d971a889 |
| server/runtime/composition/__tests__/form-delivery.security.test.ts | 200 | 6b8dd68848caeadce3a7cb0fcbb01f0ee297c6e8 |
| server/runtime/composition/__tests__/trash-user-tool-port.test.ts | 199 | f4bde8114ef43fc0b3c694e48ae3630fffca05e4 |
| contracts/core/events/__tests__/outbox-workspace-id.integration.test.ts | 429 | 70b28131ea1569d83780ce32b530335863c8ea95 |
| features/webhooks/__tests__/subscription-repo.lost-update.test.ts | 33 | 972aaa89d1dfc9239e4253801cb7920db813106d |
| platform/db/sqlite/__tests__/webhook-delivery-repo.sqlite.test.ts | 422 | ae17a68472eb6f0760be9736268bb9f72e4470ed |
| platform/db/sqlite/__tests__/webhook-subscription-repo.sqlite.test.ts | 131 | 664c297d7757a38c48585ee6ce5038b7c06ef025 |
| server/runtime/composition/__tests__/webhook-delivery-worker.shutdown.test.ts | 168 | 636f62571b2d2272dfdbd2b74b1ca71ffceac13a |
| server/runtime/composition/__tests__/form-submissions.test.ts | 368 | dcd93e201c7f7b6ccc19b0d8b9eb9845898b1d79 |
| server/runtime/composition/__tests__/peer-site-reads.test.ts | 367 | 9333c5e1a88c86dac043b0d0cc9add3f891606fd |
| platform/db/repos/__tests__/form-submission-receipt-repo.dialects.test.ts | 34 | 94ed82bd80cf51a422b68fa9b183ac5f8be03107 |
| contracts/core/events/__tests__/enqueue-only-outbox.payload.test.ts | 56 | 82d6bda6e8ce00f642bf69b0d5d7e93e21583417 |
| contracts/core/events/__tests__/outbox-drainer.scheduling.test.ts | 63 | 42cba2f44d91596bc361510a24f879955cd5811a |
| contracts/core/events/__tests__/outbox-retry-policies.unit.test.ts | 98 | f4959c89499eb445cc9deefe8e140d3950244e7b |
| contracts/core/events/__tests__/forms-notification-retry.test.ts | 32 | b93624db2e160f83919db373571590030f26df54 |
| contracts/core/events/__tests__/outbox-worker.test.ts | 586 | 336f11001fbc3d3864dbf1e3837c773a6e377f4c |
| server/__tests__/integration/create-app-event-subscriptions-once.integration.test.ts | 161 | f59f62a54445d0b4f9f793fd1a56b2fed98f0dd3 |

## vi.mock / vi.doMock / importActual sites that name a file of this sheet (lesson 2: mock factories are consumers)
- none found by pattern (re-check with the census at execution)

## Path-keyed baselines / configs that name a file of this sheet (lesson 10: debt does not follow moved code silently)
- development/scripts/write-path-inventory.baseline.json: `src/contracts/core/events/outbox-worker.ts` at lines 175, 184, 193, 202 (4 hits)

## Census command (run from the Tovu clone root; every hit must be listed above)
```
rg -n --no-heading -e 'change\-set\-repo|change\-set\-repo\.sqlite|enqueue\-only\-outbox|form\-delivery\-repo|form\-submission\-receipt\-repo|jini\-outbox\-adapter|outbox\-drainer|outbox\-repo|outbox\-repo\.sqlite|outbox\-retry\-policies|outbox\-worker|webhook\-repo|webhook\-repo\.sqlite' apps development scripts --glob '!**/node_modules/**' -g '*.ts' -g '*.tsx' -g '*.json' -g '*.mjs' -g '*.cjs' | rg 'events|repos|sqlite'
```
