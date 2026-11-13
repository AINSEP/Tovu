# PROM — floating / misused promises in Tovu `apps/website` (report only)

Run 2026-11-13, 01:03–01:08 UTC (well inside the 90-minute cap). Branch base: `cloud/quality-1111`. No source changed.

## Bottom line

- **531 hits** in **337 files** out of **2,165 linted files**: `no-misused-promises` **493**, `no-floating-promises` **38**.
- **All 9 shards DONE, 0 NOT RUN.** The whole website lints in ~1 minute of wall clock (classic `project` mode, 3 shards at a time). The last run's 60-minute/4.1 GB stall came from `projectService` over 2,165 files in one process; classic `project` mode builds the one root-tsconfig program once per process and is fast.
- **1 file could not be type-loaded** (`skipped.tsv`): it is explicitly excluded from the root `tsconfig.json`, so it has no type info.
- **0 hits were hidden by inline suppressions**: `noInlineConfig` ignored 39 `eslint-disable` comments, none of which name either promise rule (`other-messages.tsv`).
- 96% of hits (511/531) are in `server/`, 399 of them in `server/inbound/admin-http` and 66 in `server/inbound/public-http`. 479/531 are message M2 (a Promise-returning function passed as an argument where a void callback is expected).

## Tools (pinned, installed with `npm install --ignore-scripts` into `~/promtools`, outside the repo)

| tool | version |
|---|---|
| node | v24.22.3 |
| eslint | 9.39.1 |
| typescript-eslint | 8.46.4 |
| @typescript-eslint/parser | 8.46.4 |
| typescript | 5.9.3 |

Config: `scripts/promises.eslint.config.mjs` (copied unchanged from `cloud/quality-1111-sec`). Only `@typescript-eslint/no-floating-promises` + `@typescript-eslint/no-misused-promises`, default options, `noInlineConfig: true`, `SEC_PROJECT=tsconfig.json`, `SEC_ROOT=/home/user/Tovu` (classic `project`, not `projectService`). Runner: `scripts/run-shard.sh`; collation: `scripts/collate.py`, `scripts/write-results.py`. Root `npm ci` only (`raw/npm-ci.txt`, exit 0). The rules were sanity-checked on a 5-line scratch file outside the repo (3 expected errors reported).

File list (`raw/files-all.txt`, 2,165 files): `git ls-files 'apps/website/src/**.ts'` (5,307) minus `__tests__/__mocks__/__fixtures__/fixtures/mocks/test/tests/e2e/dist/build/vendor` dirs, `*.test|spec|stories|story|typecheck.ts` and `.d.ts` (same filters as `run-promises.sh`).

## Canary

Shard 0 (`cli/` 27 + `index.ts` + first 72 `contracts/` files = 100 files): **8 s wall, peak RSS 1,109 MB**, exit 0, no fatal parse errors. At that rate the full list needed only ~1–2 minutes, so the planned folder/feature sharding was kept as-is (no extra splitting needed). Peak RSS is sampled every 2 s from `VmHWM` of the eslint process.

## Shards

| shard | files | status | result | folders | hits |
|---|---|---|---|---|---|
| 0 | 100 | DONE | `exit=0 secs=8 peakRSS_MB=1109 end=01:05:10` | cli contracts index.ts | 0 |
| 1 | 68 | DONE | `exit=0 secs=10 peakRSS_MB=1062 end=01:05:48` | contracts | 0 |
| 2 | 137 | DONE | `exit=123 secs=12 peakRSS_MB=1321 end=01:05:50` | assistant | 5 |
| 3 | 218 | DONE | `exit=0 secs=16 peakRSS_MB=1647 end=01:05:54` | platform | 0 |
| 4 | 258 | DONE | `exit=123 secs=14 peakRSS_MB=1458 end=01:06:08` | features/agent-plugins … features/entries (16 subfolders) | 5 |
| 5 | 270 | DONE | `exit=123 secs=14 peakRSS_MB=1654 end=01:06:16` | features/external-mcp … features/plugin-runtime (21 subfolders) | 5 |
| 6 | 252 | DONE | `exit=123 secs=16 peakRSS_MB=1635 end=01:06:06` | features/plugins … features/site-inspection (16 subfolders) | 2 |
| 7 | 205 | DONE | `exit=123 secs=14 peakRSS_MB=1461 end=01:06:02` | features/site-search … features/workspace (15 subfolders) | 3 |
| 8 | 657 | DONE | `exit=123 secs=18 peakRSS_MB=2481 end=01:06:24` | server | 511 |

`exit=123` is xargs reporting eslint exit 1 (= lint errors found), not a crash. Order run: 0 (canary), then 1 2 3 7 6 4 5 8 with `xargs -P3` (biggest last); raw: `raw/promises-shard-<n>.json` + `.txt`, file lists `raw/shard-<n>.files.txt`.

## Totals per rule

| rule | hits | files |
|---|---|---|
| `no-misused-promises` | 493 | 317 |
| `no-floating-promises` | 38 | 26 |
| **total** | **531** | **337** |

Message legend (exact eslint messages):

| key | rule | message | hits |
|---|---|---|---|
| M1 | `no-floating-promises` | Promises must be awaited, end with a call to .catch, end with a call to .then with a rejection handler or be explicitly marked as ignored with the `void` operator. | 38 |
| M2 | `no-misused-promises` | Promise returned in function argument where a void return was expected. | 479 |
| M3 | `no-misused-promises` | Promise-returning function provided to property where a void return was expected. | 8 |
| M4 | `no-misused-promises` | Promise-returning function provided to variable where a void return was expected. | 4 |
| M5 | `no-misused-promises` | Promise-returning function provided to return value where a void return was expected. | 2 |

## Totals per top-level folder (`apps/website/src/…`)

| folder | linted files | misused | floating | total | files with hits |
|---|---|---|---|---|---|
| `features` | 985 | 4 | 11 | 15 | 13 |
| `server` | 657 | 486 | 25 | 511 | 320 |
| `platform` | 218 | 0 | 0 | 0 | 0 |
| `contracts` | 140 | 0 | 0 | 0 | 0 |
| `assistant` | 137 | 3 | 2 | 5 | 4 |
| `cli` | 27 | 0 | 0 | 0 | 0 |
| `index.ts` | 1 | 0 | 0 | 0 | 0 |

Second/third level:

| subfolder | misused | floating | total |
|---|---|---|---|
| `server/inbound/admin-http` | 390 | 9 | 399 |
| `server/inbound/public-http` | 66 | 0 | 66 |
| `server/runtime/composition` | 28 | 13 | 41 |
| `server/inbound/assistant` | 2 | 3 | 5 |
| `features/deployments` | 0 | 4 | 4 |
| `features/plugin-runtime` | 3 | 0 | 3 |
| `features/sites` | 0 | 2 | 2 |
| `assistant/site` | 2 | 0 | 2 |
| `features/media` | 0 | 1 | 1 |
| `assistant/mcp-ui-tool-calls-route.ts` | 1 | 0 | 1 |
| `features/agent-plugins` | 1 | 0 | 1 |
| `features/site-backup` | 0 | 1 | 1 |
| `assistant/agents.ts` | 0 | 1 | 1 |
| `assistant/persistence` | 0 | 1 | 1 |
| `features/theme` | 0 | 1 | 1 |
| `features/members` | 0 | 1 | 1 |
| `features/presentation` | 0 | 1 | 1 |

## Skipped (could not be type-loaded)

| file | error |
|---|---|
| `apps/website/src/features/webhooks/seal-aad-invariant.ts` | Parsing error: "parserOptions.project" has been provided for @typescript-eslint/parser. The file was not found in any of the provided project(s): apps/website/src/features/webhooks/seal-aad-invariant.ts |

This file is listed in the root `tsconfig.json` `exclude`, so classic project mode has no program for it. It was not linted for these rules.

## Ignored inline directives (no hits hidden)

| directive (ignored by `noInlineConfig`) | count |
|---|---|
| `// eslint-disable-next-line no-console` | 30 |
| `// eslint-disable-next-line @typescript-eslint/no-explicit-any` | 3 |
| `// eslint-disable-next-line no-control-regex` | 2 |
| `// eslint-disable-next-line @typescript-eslint/no-require-imports` | 1 |
| `// eslint-disable-line no-console` | 1 |
| `/* eslint-disable no-console */` | 1 |
| `/* eslint-enable no-console */` | 1 |

None disable `no-floating-promises` or `no-misused-promises`, so every hit above is un-suppressed in source too. Full list with file:line: `other-messages.tsv`.

## Every hit (531), by file

Same rows as `promises.tsv` (repo `tovu`, unit `apps/website`). Paths relative to `apps/website/src/`. `F` = `no-floating-promises`, `M` = `no-misused-promises`; message keys from the legend above.

- `assistant/agents.ts` (1): 249 F/M1
- `assistant/mcp-ui-tool-calls-route.ts` (1): 319 M/M2
- `assistant/persistence/run-ledger.ts` (1): 27 F/M1
- `assistant/site/visitor-frontend-control.ts` (2): 47 M/M2, 56 M/M2
- `features/agent-plugins/lifecycle.ts` (1): 104 M/M3
- `features/deployments/export-run.ts` (1): 240 F/M1
- `features/deployments/publish-agent-tools.ts` (1): 866 F/M1
- `features/deployments/static-publish/domain-publish-tool.ts` (1): 57 F/M1
- `features/deployments/static-publish/publish-run.ts` (1): 201 F/M1
- `features/media/analytics.ts` (1): 18 F/M1
- `features/members/tool-registrations.ts` (1): 202 F/M1
- `features/plugin-runtime/host-tool-binding.ts` (1): 57 M/M3
- `features/plugin-runtime/install-tool-binding.ts` (2): 20 M/M3, 21 M/M3
- `features/presentation/set-active-theme.ts` (1): 18 F/M1
- `features/site-backup/import-backend.ts` (1): 181 F/M1
- `features/sites/site-admin.ts` (2): 230 F/M1, 335 F/M1
- `features/theme/set-active-theme-tool.ts` (1): 149 F/M1
- `server/inbound/admin-http/dev-auth.ts` (7): 616 M/M2, 668 M/M2, 692 M/M2, 728 M/M2, 746 M/M2, 774 M/M2, 836 M/M2
- `server/inbound/admin-http/owner-mfa-routes.ts` (2): 94 M/M2, 96 M/M2
- `server/inbound/admin-http/owner-passkey-routes.ts` (2): 100 M/M2, 102 M/M2
- `server/inbound/admin-http/owner-recovery-routes.ts` (2): 109 M/M2, 111 M/M2
- `server/inbound/admin-http/routes/agent-plugins/admin-surfaces.ts` (3): 98 M/M2, 105 M/M2, 114 M/M2
- `server/inbound/admin-http/routes/agent-plugins/files.ts` (1): 26 M/M2
- `server/inbound/admin-http/routes/agent-plugins/install.ts` (1): 103 M/M4
- `server/inbound/admin-http/routes/agent-plugins/list.ts` (1): 40 M/M2
- `server/inbound/admin-http/routes/agent-plugins/memory.ts` (2): 69 M/M2, 70 M/M2
- `server/inbound/admin-http/routes/agent-plugins/set-enabled.ts` (1): 273 M/M2
- `server/inbound/admin-http/routes/analytics/recent-hits.ts` (1): 75 M/M2
- `server/inbound/admin-http/routes/api-keys/create-principal.ts` (1): 23 M/M2
- `server/inbound/admin-http/routes/api-keys/issue.ts` (1): 24 M/M2
- `server/inbound/admin-http/routes/api-keys/revoke.ts` (1): 21 M/M2
- `server/inbound/admin-http/routes/assistant/delete-execution-credential.ts` (1): 14 M/M2
- `server/inbound/admin-http/routes/assistant/delete-site-credential.ts` (1): 14 M/M2
- `server/inbound/admin-http/routes/assistant/detect-agents.ts` (1): 169 M/M2
- `server/inbound/admin-http/routes/assistant/get-chat-attachment.ts` (1): 83 M/M2
- `server/inbound/admin-http/routes/assistant/get-execution-credential.ts` (1): 15 M/M2
- `server/inbound/admin-http/routes/assistant/get-settings.ts` (1): 22 M/M2
- `server/inbound/admin-http/routes/assistant/get-site-credential.ts` (1): 14 M/M2
- `server/inbound/admin-http/routes/assistant/list-models.ts` (1): 81 M/M2
- `server/inbound/admin-http/routes/assistant/put-execution-credential.ts` (1): 52 M/M2
- `server/inbound/admin-http/routes/assistant/put-settings.ts` (1): 19 M/M2
- `server/inbound/admin-http/routes/assistant/put-site-credential.ts` (1): 59 M/M2
- `server/inbound/admin-http/routes/assistant/test-agent.ts` (1): 64 M/M2
- `server/inbound/admin-http/routes/assistant/test-connection.ts` (1): 91 M/M2
- `server/inbound/admin-http/routes/assistant/visitor-tools.ts` (2): 57 M/M2, 58 M/M2
- `server/inbound/admin-http/routes/change-sets/get.ts` (1): 15 M/M2
- `server/inbound/admin-http/routes/change-sets/list.ts` (1): 12 M/M2
- `server/inbound/admin-http/routes/change-sets/revert.ts` (1): 66 M/M2
- `server/inbound/admin-http/routes/comments/get-settings.ts` (1): 15 M/M2
- `server/inbound/admin-http/routes/comments/moderate.ts` (2): 70 M/M2, 117 M/M2
- `server/inbound/admin-http/routes/comments/moderation-queue.ts` (1): 34 M/M2
- `server/inbound/admin-http/routes/comments/put-settings.ts` (1): 15 M/M2
- `server/inbound/admin-http/routes/commerce/status.ts` (1): 30 M/M2
- `server/inbound/admin-http/routes/consent/routes.ts` (1): 21 M/M2
- `server/inbound/admin-http/routes/content-types/lifecycle.ts` (1): 24 M/M2
- `server/inbound/admin-http/routes/content-types/list.ts` (1): 16 M/M2
- `server/inbound/admin-http/routes/content-types/register.ts` (1): 20 M/M2
- `server/inbound/admin-http/routes/content-types/update-fields.ts` (1): 17 M/M2
- `server/inbound/admin-http/routes/database/migrate-forward.ts` (3): 38 M/M2, 66 M/M2, 100 M/M2
- `server/inbound/admin-http/routes/database/restore-points.ts` (2): 115 M/M2, 153 M/M2
- `server/inbound/admin-http/routes/database/schema-state.ts` (1): 39 M/M2
- `server/inbound/admin-http/routes/database/timeline.ts` (1): 55 M/M2
- `server/inbound/admin-http/routes/email-templates/routes.ts` (7): 104 M/M2, 105 M/M2, 107 M/M2, 108 M/M2, 109 M/M2, 110 M/M2, 111 M/M2
- `server/inbound/admin-http/routes/entries/create.ts` (1): 35 M/M2
- `server/inbound/admin-http/routes/entries/lifecycle.ts` (1): 21 M/M2
- `server/inbound/admin-http/routes/entries/list.ts` (1): 13 M/M2
- `server/inbound/admin-http/routes/entries/update.ts` (1): 17 M/M2
- `server/inbound/admin-http/routes/external-mcp/admissions.ts` (1): 14 M/M2
- `server/inbound/admin-http/routes/external-mcp/delete.ts` (1): 20 M/M2
- `server/inbound/admin-http/routes/external-mcp/list.ts` (1): 21 M/M2
- `server/inbound/admin-http/routes/external-mcp/oauth.ts` (7): 131 M/M2, 156 M/M2, 190 M/M2, 218 M/M2, 232 M/M2, 240 M/M2, 250 M/M2
- `server/inbound/admin-http/routes/external-mcp/probe.ts` (1): 76 M/M2
- `server/inbound/admin-http/routes/external-mcp/put.ts` (1): 134 M/M2
- `server/inbound/admin-http/routes/external-mcp/tool-approvals.ts` (2): 20 M/M2, 33 M/M2
- `server/inbound/admin-http/routes/forms/authoring.ts` (1): 24 M/M2
- `server/inbound/admin-http/routes/forms/create.ts` (1): 36 M/M2
- `server/inbound/admin-http/routes/forms/delete-submission.ts` (1): 12 M/M2
- `server/inbound/admin-http/routes/forms/get-by-id.ts` (1): 9 M/M2
- `server/inbound/admin-http/routes/forms/get-submission.ts` (1): 27 M/M2
- `server/inbound/admin-http/routes/forms/list-submissions.ts` (1): 43 M/M2
- `server/inbound/admin-http/routes/forms/list.ts` (1): 8 M/M2
- `server/inbound/admin-http/routes/forms/providers.ts` (1): 10 M/M2
- `server/inbound/admin-http/routes/forms/pull-submissions.ts` (1): 44 M/M2
- `server/inbound/admin-http/routes/forms/update.ts` (1): 73 M/M2
- `server/inbound/admin-http/routes/fs-files/custom-root.ts` (3): 78 M/M2, 87 M/M2, 108 M/M2
- `server/inbound/admin-http/routes/fs-files/folder-picker.ts` (2): 52 M/M2, 55 M/M2
- `server/inbound/admin-http/routes/integrations/create.ts` (1): 30 M/M2
- `server/inbound/admin-http/routes/integrations/delete.ts` (1): 17 M/M2
- `server/inbound/admin-http/routes/integrations/deliveries.ts` (1): 30 M/M2
- `server/inbound/admin-http/routes/integrations/list.ts` (1): 23 M/M2
- `server/inbound/admin-http/routes/integrations/pause.ts` (1): 31 M/M2
- `server/inbound/admin-http/routes/media/delete.ts` (1): 18 M/M2
- `server/inbound/admin-http/routes/media/get-providers.ts` (1): 19 M/M2
- `server/inbound/admin-http/routes/media/import-url.ts` (1): 42 M/M2
- `server/inbound/admin-http/routes/media/list.ts` (1): 15 M/M2
- `server/inbound/admin-http/routes/media/original.ts` (1): 192 M/M2
- `server/inbound/admin-http/routes/media/put-providers.ts` (1): 30 M/M2
- `server/inbound/admin-http/routes/media/replace.ts` (1): 63 M/M2
- `server/inbound/admin-http/routes/media/text.ts` (1): 11 M/M2
- `server/inbound/admin-http/routes/media/trash.ts` (1): 23 M/M2
- `server/inbound/admin-http/routes/media/update.ts` (1): 96 M/M2
- `server/inbound/admin-http/routes/media/upload.ts` (1): 143 M/M2
- `server/inbound/admin-http/routes/media/where-used.ts` (1): 10 M/M2
- `server/inbound/admin-http/routes/members/delete.ts` (1): 14 M/M2
- `server/inbound/admin-http/routes/members/disable.ts` (1): 24 M/M2
- `server/inbound/admin-http/routes/members/get-by-id.ts` (1): 26 M/M2
- `server/inbound/admin-http/routes/members/list.ts` (1): 40 M/M2
- `server/inbound/admin-http/routes/members/request-magic-link.ts` (1): 63 M/M2
- `server/inbound/admin-http/routes/menus/assign-location.ts` (1): 54 M/M2
- `server/inbound/admin-http/routes/menus/create.ts` (1): 38 M/M2
- `server/inbound/admin-http/routes/menus/delete.ts` (1): 16 M/M2
- `server/inbound/admin-http/routes/menus/get-by-id.ts` (1): 12 M/M2
- `server/inbound/admin-http/routes/menus/list.ts` (1): 20 M/M2
- `server/inbound/admin-http/routes/menus/update-tree.ts` (1): 96 M/M2
- `server/inbound/admin-http/routes/newsletter/archive-list.ts` (1): 10 M/M2
- `server/inbound/admin-http/routes/newsletter/cancel-campaign.ts` (1): 15 M/M2
- `server/inbound/admin-http/routes/newsletter/create-campaign.ts` (1): 54 M/M2
- `server/inbound/admin-http/routes/newsletter/create-list.ts` (1): 10 M/M2
- `server/inbound/admin-http/routes/newsletter/create-subscription.ts` (1): 16 M/M2
- `server/inbound/admin-http/routes/newsletter/get-campaign.ts` (1): 10 M/M2
- `server/inbound/admin-http/routes/newsletter/import-subscriptions.ts` (1): 15 M/M2
- `server/inbound/admin-http/routes/newsletter/list-campaigns.ts` (1): 15 M/M2
- `server/inbound/admin-http/routes/newsletter/list-lists.ts` (1): 9 M/M2
- `server/inbound/admin-http/routes/newsletter/list-send-log.ts` (1): 10 M/M2
- `server/inbound/admin-http/routes/newsletter/list-subscriptions.ts` (1): 9 M/M2
- `server/inbound/admin-http/routes/newsletter/pause-campaign.ts` (1): 10 M/M2
- `server/inbound/admin-http/routes/newsletter/remove-subscription.ts` (1): 21 M/M2
- `server/inbound/admin-http/routes/newsletter/resend-confirmation.ts` (1): 21 M/M2
- `server/inbound/admin-http/routes/newsletter/resume-campaign.ts` (1): 10 M/M2
- `server/inbound/admin-http/routes/newsletter/schedule-campaign.ts` (1): 33 M/M2
- `server/inbound/admin-http/routes/newsletter/send-campaign.ts` (1): 43 M/M2
- `server/inbound/admin-http/routes/newsletter/send-test-campaign.ts` (1): 15 M/M2
- `server/inbound/admin-http/routes/newsletter/update-campaign.ts` (1): 121 M/M2
- `server/inbound/admin-http/routes/pages/create.ts` (1): 61 M/M2
- `server/inbound/admin-http/routes/pages/delete.ts` (1): 34 M/M2
- `server/inbound/admin-http/routes/pages/get-by-id.ts` (1): 48 M/M2
- `server/inbound/admin-http/routes/pages/list.ts` (1): 16 M/M2
- `server/inbound/admin-http/routes/pages/update-html.ts` (1): 160 M/M2
- `server/inbound/admin-http/routes/pages/update.ts` (1): 133 M/M2
- `server/inbound/admin-http/routes/plugins/chart-providers.ts` (2): 22 M/M2, 35 M/M2
- `server/inbound/admin-http/routes/plugins/files.ts` (1): 40 M/M2
- `server/inbound/admin-http/routes/plugins/install.ts` (3): 95 F/M1, 114 M/M2, 119 F/M1
- `server/inbound/admin-http/routes/plugins/list.ts` (1): 30 M/M2
- `server/inbound/admin-http/routes/plugins/preview.ts` (2): 72 M/M2, 103 M/M2
- `server/inbound/admin-http/routes/plugins/provider-settings.ts` (3): 103 M/M2, 109 M/M2, 124 M/M2
- `server/inbound/admin-http/routes/plugins/set-enabled.ts` (2): 108 M/M2, 190 F/M1
- `server/inbound/admin-http/routes/plugins/uninstall.ts` (1): 46 M/M2
- `server/inbound/admin-http/routes/posts/autosave.ts` (3): 140 M/M2, 171 M/M2, 183 M/M2
- `server/inbound/admin-http/routes/posts/create.ts` (1): 68 M/M2
- `server/inbound/admin-http/routes/posts/delete.ts` (1): 71 M/M2
- `server/inbound/admin-http/routes/posts/get-by-id.ts` (1): 10 M/M2
- `server/inbound/admin-http/routes/posts/list.ts` (1): 11 M/M2
- `server/inbound/admin-http/routes/posts/template-preview.ts` (1): 180 M/M4
- `server/inbound/admin-http/routes/posts/update.ts` (1): 137 M/M2
- `server/inbound/admin-http/routes/presentation/get.ts` (1): 57 M/M2
- `server/inbound/admin-http/routes/presentation/patch-active-theme.ts` (1): 51 M/M2
- `server/inbound/admin-http/routes/presentation/rescan-themes.ts` (1): 25 M/M2
- `server/inbound/admin-http/routes/publish-content/backstop.ts` (5): 231 M/M2, 239 M/M2, 250 M/M2, 260 M/M2, 271 M/M2
- `server/inbound/admin-http/routes/publish-content/blob-get.ts` (1): 73 M/M2
- `server/inbound/admin-http/routes/publish-content/blob-put.ts` (1): 46 M/M2
- `server/inbound/admin-http/routes/publish-content/blobs-probe.ts` (1): 52 M/M2
- `server/inbound/admin-http/routes/publish-content/bundle-create.ts` (1): 193 M/M2
- `server/inbound/admin-http/routes/publish-content/capabilities.ts` (1): 35 M/M2
- `server/inbound/admin-http/routes/publish-content/destination.ts` (3): 153 M/M2, 187 M/M2, 248 M/M2
- `server/inbound/admin-http/routes/publish-content/export.ts` (1): 91 M/M2
- `server/inbound/admin-http/routes/publish-content/import.ts` (4): 153 M/M2, 186 M/M2, 217 M/M2, 283 M/M2
- `server/inbound/admin-http/routes/publish-content/peer-transport.ts` (4): 264 M/M2, 288 M/M2, 306 M/M2, 333 M/M2
- `server/inbound/admin-http/routes/publish-content/peers.ts` (4): 97 M/M2, 108 M/M2, 126 M/M2, 141 M/M2
- `server/inbound/admin-http/routes/recovery/deep-link.ts` (1): 14 M/M2
- `server/inbound/admin-http/routes/recovery/disclosure.ts` (1): 25 M/M2
- `server/inbound/admin-http/routes/recovery/restore-points.ts` (1): 17 M/M2
- `server/inbound/admin-http/routes/recovery/restore.ts` (3): 62 M/M2, 115 M/M2, 161 M/M2
- `server/inbound/admin-http/routes/recovery/status.ts` (1): 34 M/M2
- `server/inbound/admin-http/routes/redirects/create.ts` (1): 53 M/M2
- `server/inbound/admin-http/routes/redirects/get-by-id.ts` (1): 7 M/M2
- `server/inbound/admin-http/routes/redirects/hits.ts` (1): 12 M/M2
- `server/inbound/admin-http/routes/redirects/import.ts` (1): 17 M/M2
- `server/inbound/admin-http/routes/redirects/list.ts` (1): 13 M/M2
- `server/inbound/admin-http/routes/redirects/tombstone.ts` (1): 14 M/M2
- `server/inbound/admin-http/routes/redirects/update.ts` (1): 16 M/M2
- `server/inbound/admin-http/routes/seo/get-entry-analyze.ts` (1): 9 M/M2
- `server/inbound/admin-http/routes/seo/get-entry.ts` (1): 12 M/M2
- `server/inbound/admin-http/routes/seo/get-settings.ts` (1): 8 M/M2
- `server/inbound/admin-http/routes/seo/post-sitemap-regenerate.ts` (1): 7 M/M2
- `server/inbound/admin-http/routes/seo/put-entry.ts` (1): 46 M/M2
- `server/inbound/admin-http/routes/seo/put-settings.ts` (1): 9 M/M2
- `server/inbound/admin-http/routes/settings/events.ts` (1): 363 M/M2
- `server/inbound/admin-http/routes/site/profile.ts` (1): 166 M/M2
- `server/inbound/admin-http/routes/sites/local-sites.ts` (5): 49 M/M2, 50 M/M2, 51 M/M2, 60 M/M2, 64 M/M2
- `server/inbound/admin-http/routes/sites/site-previews.ts` (1): 60 M/M2
- `server/inbound/admin-http/routes/sites/sites-home.ts` (2): 27 M/M2, 46 M/M2
- `server/inbound/admin-http/routes/sites/warm-site-control.ts` (1): 28 M/M2
- `server/inbound/admin-http/routes/skills/files.ts` (1): 11 M/M2
- `server/inbound/admin-http/routes/skills/list.ts` (1): 24 M/M2
- `server/inbound/admin-http/routes/skills/manage.ts` (4): 48 M/M2, 52 M/M2, 57 M/M2, 61 M/M2
- `server/inbound/admin-http/routes/system/assistant-daemon.ts` (1): 55 M/M2
- `server/inbound/admin-http/routes/system/browser-telemetry.ts` (2): 108 F/M1, 143 M/M2
- `server/inbound/admin-http/routes/system/credential-copy.ts` (2): 51 M/M2, 58 M/M2
- `server/inbound/admin-http/routes/system/custom-credentials.ts` (4): 158 M/M2, 181 M/M2, 201 M/M2, 216 M/M2
- `server/inbound/admin-http/routes/system/deployment-overview.ts` (1): 164 M/M2
- `server/inbound/admin-http/routes/system/dockerfile-source.ts` (2): 79 M/M2, 110 M/M2
- `server/inbound/admin-http/routes/system/export-site.ts` (2): 104 M/M2, 156 M/M2
- `server/inbound/admin-http/routes/system/mail-activity.ts` (6): 90 M/M2, 93 M/M2, 97 M/M2, 102 M/M2, 105 M/M2, 115 M/M2
- `server/inbound/admin-http/routes/system/mail-dns.ts` (2): 53 M/M2, 54 M/M2
- `server/inbound/admin-http/routes/system/mail-providers.ts` (4): 108 M/M2, 109 M/M2, 111 M/M2, 118 M/M2
- `server/inbound/admin-http/routes/system/mail-status.ts` (1): 31 M/M2
- `server/inbound/admin-http/routes/system/mail-test-send.ts` (1): 55 M/M2
- `server/inbound/admin-http/routes/system/module-status.ts` (1): 21 M/M2
- `server/inbound/admin-http/routes/system/observability-status.ts` (2): 33 M/M2, 67 M/M2
- `server/inbound/admin-http/routes/system/publish-credentials.ts` (5): 267 M/M2, 284 M/M2, 311 M/M2, 333 M/M2, 353 M/M2
- `server/inbound/admin-http/routes/system/publish-site.ts` (10): 243 M/M2, 257 F/M1, 261 F/M1, 268 F/M1, 276 F/M1, 285 F/M1, 324 M/M2, 346 M/M2, 401 M/M2, 437 M/M2
- `server/inbound/admin-http/routes/system/server-logs.ts` (1): 24 M/M2
- `server/inbound/admin-http/routes/system/site-backups.ts` (2): 47 M/M2, 51 M/M2
- `server/inbound/admin-http/routes/system/site-imports.ts` (7): 73 M/M2, 77 M/M2, 86 M/M2, 99 M/M2, 111 M/M2, 118 M/M2, 130 M/M2
- `server/inbound/admin-http/routes/system/site-key.ts` (6): 263 M/M2, 279 M/M2, 288 M/M2, 307 M/M2, 312 M/M2, 317 M/M2
- `server/inbound/admin-http/routes/system/site-share-password.ts` (1): 34 M/M5
- `server/inbound/admin-http/routes/system/site-shares.ts` (10): 56 M/M2, 60 M/M2, 67 M/M2, 71 M/M2, 79 M/M2, 85 M/M2, 109 M/M2, 115 M/M2, 123 M/M2, 135 M/M2
- `server/inbound/admin-http/routes/system/sites.ts` (5): 315 M/M2, 339 M/M2, 362 M/M2, 383 M/M2, 423 M/M2
- `server/inbound/admin-http/routes/system/source-control-credentials.ts` (5): 130 M/M2, 149 M/M2, 159 M/M2, 180 M/M2, 197 M/M2
- `server/inbound/admin-http/routes/system/tool-gaps.ts` (1): 8 M/M2
- `server/inbound/admin-http/routes/taxonomy/assign-terms.ts` (3): 85 M/M2, 105 M/M2, 124 M/M2
- `server/inbound/admin-http/routes/taxonomy/create-taxonomy.ts` (1): 14 M/M2
- `server/inbound/admin-http/routes/taxonomy/create-term.ts` (1): 37 M/M2
- `server/inbound/admin-http/routes/taxonomy/delete-taxonomy.ts` (1): 19 M/M2
- `server/inbound/admin-http/routes/taxonomy/delete-term.ts` (1): 19 M/M2
- `server/inbound/admin-http/routes/taxonomy/list.ts` (1): 15 M/M2
- `server/inbound/admin-http/routes/taxonomy/merge-term.ts` (3): 39 M/M2, 83 M/M2, 125 M/M2
- `server/inbound/admin-http/routes/taxonomy/rename-term.ts` (1): 14 M/M2
- `server/inbound/admin-http/routes/themes/duplicate.ts` (1): 43 M/M2
- `server/inbound/admin-http/routes/themes/explore.ts` (9): 519 M/M2, 588 M/M2, 668 M/M2, 847 M/M2, 906 M/M2, 940 M/M2, 1122 M/M2, 1190 M/M2, 1262 M/M2
- `server/inbound/admin-http/routes/themes/list.ts` (1): 56 M/M2
- `server/inbound/admin-http/routes/themes/preview.ts` (1): 100 M/M2
- `server/inbound/admin-http/routes/trash/items.ts` (1): 20 M/M2
- `server/inbound/admin-http/routes/trash/list.ts` (1): 17 M/M2
- `server/inbound/admin-http/routes/trash/purge.ts` (1): 26 M/M2
- `server/inbound/admin-http/routes/trash/restore.ts` (1): 20 M/M2
- `server/inbound/admin-http/routes/users/assign-role.ts` (1): 41 M/M2
- `server/inbound/admin-http/routes/users/attach-policy.ts` (1): 42 M/M2
- `server/inbound/admin-http/routes/users/create-policy.ts` (1): 38 M/M2
- `server/inbound/admin-http/routes/users/create-role.ts` (1): 10 M/M2
- `server/inbound/admin-http/routes/users/create.ts` (1): 76 M/M2
- `server/inbound/admin-http/routes/users/delete-policy.ts` (1): 36 M/M2
- `server/inbound/admin-http/routes/users/delete-role.ts` (1): 36 M/M2
- `server/inbound/admin-http/routes/users/delete.ts` (1): 49 M/M2
- `server/inbound/admin-http/routes/users/disable.ts` (1): 73 M/M2
- `server/inbound/admin-http/routes/users/enable.ts` (1): 50 M/M2
- `server/inbound/admin-http/routes/users/list-policies.ts` (1): 14 M/M2
- `server/inbound/admin-http/routes/users/list-policy-permissions.ts` (1): 20 M/M2
- `server/inbound/admin-http/routes/users/list-roles.ts` (1): 14 M/M2
- `server/inbound/admin-http/routes/users/list.ts` (1): 24 M/M2
- `server/inbound/admin-http/routes/users/remove-policy-permission.ts` (1): 55 M/M2
- `server/inbound/admin-http/routes/users/reset-password.ts` (1): 54 M/M2
- `server/inbound/admin-http/routes/users/update-policy.ts` (1): 43 M/M2
- `server/inbound/admin-http/routes/users/update-role.ts` (1): 32 M/M2
- `server/inbound/admin-http/routes/users/update.ts` (1): 79 M/M2
- `server/inbound/admin-http/routes/users/write-policy-permission.ts` (1): 76 M/M2
- `server/inbound/admin-http/routes/widgets/agent-tools.ts` (4): 188 M/M2, 213 M/M2, 261 M/M2, 288 M/M2
- `server/inbound/admin-http/routes/widgets/create.ts` (1): 36 M/M2
- `server/inbound/admin-http/routes/widgets/embed-insert.ts` (1): 12 M/M2
- `server/inbound/admin-http/routes/widgets/embed-remove.ts` (1): 9 M/M2
- `server/inbound/admin-http/routes/widgets/embed-reorder.ts` (1): 10 M/M2
- `server/inbound/admin-http/routes/widgets/get-by-id.ts` (1): 13 M/M2
- `server/inbound/admin-http/routes/widgets/list.ts` (1): 16 M/M2
- `server/inbound/admin-http/routes/widgets/preview.ts` (1): 27 M/M2
- `server/inbound/admin-http/routes/widgets/region-bind.ts` (1): 14 M/M2
- `server/inbound/admin-http/routes/widgets/region-get.ts` (1): 12 M/M2
- `server/inbound/admin-http/routes/widgets/region-mutate-placements.ts` (1): 43 M/M2
- `server/inbound/admin-http/routes/widgets/regions-list.ts` (1): 14 M/M2
- `server/inbound/admin-http/routes/widgets/trash.ts` (1): 11 M/M2
- `server/inbound/admin-http/routes/widgets/update.ts` (1): 9 M/M2
- `server/inbound/admin-http/routes/workspace/create.ts` (1): 14 M/M2
- `server/inbound/admin-http/routes/workspace/delete.ts` (1): 102 M/M2
- `server/inbound/admin-http/routes/workspace/get.ts` (1): 15 M/M2
- `server/inbound/admin-http/routes/workspace/list.ts` (1): 14 M/M2
- `server/inbound/admin-http/routes/workspace/update.ts` (1): 43 M/M2
- `server/inbound/assistant/agent-daemon-scope.ts` (3): 733 F/M1, 735 F/M1, 843 F/M1
- `server/inbound/assistant/federation-reload-route.ts` (1): 45 M/M2
- `server/inbound/assistant/tool-access-lowering-route.ts` (1): 18 M/M2
- `server/inbound/public-http/middleware/published-webmcp.ts` (1): 12 M/M2
- `server/inbound/public-http/middleware/site-cookie-consent.ts` (5): 87 M/M2, 105 M/M2, 296 M/M2, 315 M/M2, 392 M/M2
- `server/inbound/public-http/middleware/site-serving-gate.ts` (1): 53 M/M2
- `server/inbound/public-http/middleware/theme-page-preview.ts` (2): 193 M/M2, 194 M/M2
- `server/inbound/public-http/middleware/theme-preview-refresh.ts` (3): 76 M/M3, 88 M/M2, 89 M/M2
- `server/inbound/public-http/middleware/theme-preview-switcher.ts` (1): 61 M/M2
- `server/inbound/public-http/routes/agent-plugin-surfaces/export-files.ts` (1): 50 M/M2
- `server/inbound/public-http/routes/agent-plugin-surfaces/files.ts` (1): 52 M/M2
- `server/inbound/public-http/routes/api-connections/oauth-callback.ts` (1): 98 M/M2
- `server/inbound/public-http/routes/commerce/purchase.ts` (5): 148 M/M2, 156 M/M2, 176 M/M2, 190 M/M2, 191 M/M2
- `server/inbound/public-http/routes/content/posts/get-by-slug.ts` (1): 30 M/M2
- `server/inbound/public-http/routes/external-mcp/oauth-callback.ts` (1): 128 M/M2
- `server/inbound/public-http/routes/mail-feedback.ts` (1): 29 M/M2
- `server/inbound/public-http/routes/members/complete-sign-in.ts` (1): 78 M/M2
- `server/inbound/public-http/routes/members/forgot-password.ts` (1): 8 M/M2
- `server/inbound/public-http/routes/members/me.ts` (1): 13 M/M2
- `server/inbound/public-http/routes/members/oidc-callback.ts` (1): 63 M/M2
- `server/inbound/public-http/routes/members/oidc-start.ts` (2): 13 M/M2, 28 M/M2
- `server/inbound/public-http/routes/members/oidc-verify-email.ts` (1): 34 M/M2
- `server/inbound/public-http/routes/members/password-sign-in.ts` (1): 12 M/M2
- `server/inbound/public-http/routes/members/reset-password.ts` (1): 8 M/M2
- `server/inbound/public-http/routes/members/set-password.ts` (1): 12 M/M2
- `server/inbound/public-http/routes/members/sign-in.ts` (1): 32 M/M2
- `server/inbound/public-http/routes/members/sign-out.ts` (1): 11 M/M2
- `server/inbound/public-http/routes/members/unlink-identity.ts` (1): 64 M/M2
- `server/inbound/public-http/routes/plugin-contributions.ts` (2): 22 M/M3, 29 M/M3
- `server/inbound/public-http/routes/publish-trust/handshake.ts` (3): 166 M/M2, 176 M/M2, 197 M/M2
- `server/inbound/public-http/routes/site-share.ts` (1): 11 M/M2
- `server/inbound/public-http/routes/site/analytics-ingest.ts` (1): 100 M/M2
- `server/inbound/public-http/routes/site/chat-comparison.ts` (2): 20 M/M2, 20 M/M2
- `server/inbound/public-http/routes/site/comments-submit.ts` (1): 101 M/M4
- `server/inbound/public-http/routes/site/feed.ts` (1): 14 M/M2
- `server/inbound/public-http/routes/site/forms-admission.ts` (1): 15 M/M5
- `server/inbound/public-http/routes/site/forms-multipart.ts` (1): 8 M/M4
- `server/inbound/public-http/routes/site/forms-submit.ts` (1): 78 M/M2
- `server/inbound/public-http/routes/site/llms.ts` (1): 52 M/M2
- `server/inbound/public-http/routes/site/media-rendition.ts` (2): 660 M/M2, 717 M/M2
- `server/inbound/public-http/routes/site/member-pages.ts` (1): 183 M/M2
- `server/inbound/public-http/routes/site/newsletter-confirm.ts` (1): 18 M/M2
- `server/inbound/public-http/routes/site/newsletter-unsubscribe.ts` (2): 41 M/M2, 42 M/M2
- `server/inbound/public-http/routes/site/pages.ts` (3): 3003 M/M2, 3017 M/M2, 3029 M/M2
- `server/inbound/public-http/routes/site/products.ts` (2): 69 M/M2, 94 M/M2
- `server/inbound/public-http/routes/site/robots.ts` (1): 15 M/M2
- `server/inbound/public-http/routes/site/search.ts` (1): 132 M/M2
- `server/inbound/public-http/routes/site/sitemap.ts` (1): 15 M/M2
- `server/runtime/composition/browser-analytics-http.ts` (1): 21 M/M2
- `server/runtime/composition/commerce-http.ts` (1): 37 M/M2
- `server/runtime/composition/content-events.ts` (1): 27 F/M1
- `server/runtime/composition/deps.ts` (1): 3045 F/M1
- `server/runtime/composition/modules/assistant-ag-ui.ts` (1): 654 M/M2
- `server/runtime/composition/modules/assistant-byok.ts` (4): 621 M/M2, 766 F/M1, 775 F/M1, 821 F/M1
- `server/runtime/composition/modules/assistant-chats.ts` (3): 127 M/M2, 164 F/M1, 261 F/M1
- `server/runtime/composition/modules/assistant.ts` (21): 178 M/M3, 592 M/M2, 605 M/M2, 606 M/M2, 607 M/M2, 608 M/M2, 609 M/M2, 610 M/M2, 615 M/M2, 617 M/M2, 618 M/M2, 619 M/M2, 646 M/M2, 647 M/M2, 648 M/M2, 660 M/M2, 672 M/M2, 683 M/M2, 687 M/M2, 714 M/M2, 722 M/M2
- `server/runtime/composition/modules/core.ts` (2): 85 M/M2, 95 M/M2
- `server/runtime/composition/modules/forms.ts` (1): 65 F/M1
- `server/runtime/composition/modules/site-assistant.ts` (1): 671 F/M1
- `server/runtime/composition/provider-plugins.ts` (2): 355 F/M1, 477 F/M1
- `server/runtime/composition/provider-settings-save.ts` (1): 118 F/M1
- `server/runtime/composition/tool-use-events.ts` (1): 30 F/M1
