# Combine-7 Tovu follow-ups

All sheets use BASE `8d1a4c2742` (full HEAD `8d1a4c2742914f82ea61b50d345fda88845c9a5b`). No tests, builds, installs, type-checks, linters, staging, or commits run; coordinator owns verification and staging.

## C7-FILENAMES — done

Base: `8d1a4c2742`. All production anchors match; all 14 Jini basenames exist at `origin/integ/merge-7-2026-11-20`. Applied 180 input reference lines (97 files), bundler pattern/comments/test name, and 8 fixture renames: 105 logical files touched (renames count once).

BREAKS: third-party agent-plugin packages that still ship tovu-*.json stop loading (owner 11-20: no dual read).

Existing tests repointed; no new behavior tests. Red → green proof owed to combine: site-backup `tool-registrations.unit.test.ts` (62 failures; ENOENT old contribution names), `push-cancellation`, form-destinations `registry.unit.test.ts` “bundled plugin's real file … D1”, `plugin-credential-cards.unit.test.ts`, resend `bundled-mail.test.mjs`, overlay tests. Red reason: bundled Jini merge-7 packages only ship jini-*.json. Mutation owed: restore one constant to tovu-* and confirm that feature's bundled test fails.

Four required residual searches: only excluded `development/todos.md` and `development/open-bugs.md` match. REFRESH: escaped regex expectation in bundler test also repointed. Deletions at diff review: none; all edits required by the sheet.

Existing files above 500 lines (not a stop): api-connection-slice.test.ts 554; credentialed-request.ts 768; sources.unit.test.ts 783; tool-registrations.unit.test.ts 1439; admin-visual.pins.journey.ts 967. All line counts unchanged.

Files touched:

- `apps/admin/src/features/deployment/__tests__/publish-targets.fixture.ts`
- `apps/admin/src/features/plugins/__tests__/package-file-tree.unit.test.ts`
- `apps/admin/src/features/source-control/rules.ts`
- `apps/website/src/cli/__tests__/fixtures/deploy-config-plugins/example-host/jini-deploy-configs.json`
- `apps/website/src/cli/__tests__/unit/deploy-config-command.unit.test.ts`
- `apps/website/src/cli/__tests__/unit/deploy-config-target-help.unit.test.ts`
- `apps/website/src/cli/commands/deploy-config.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/bundled-github-actions-ops.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/bundled-mail-credential-cards.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/bundled-search-meilisearch-conformance.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/descriptor-i18n.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/mail-adapter-registry.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/mail-provider-setup.unit.test.ts`
- `apps/website/src/features/agent-plugins/admin-surfaces/README.md`
- `apps/website/src/features/agent-plugins/admin-surfaces/delivery-bindings.ts`
- `apps/website/src/features/agent-plugins/admin-surfaces/surfaces.ts`
- `apps/website/src/features/agent-plugins/auth-schemes.ts`
- `apps/website/src/features/agent-plugins/connect-tool.ts`
- `apps/website/src/features/agent-plugins/executable-tools/README.md`
- `apps/website/src/features/agent-plugins/executable-tools/__tests__/unit/register.unit.test.ts`
- `apps/website/src/features/agent-plugins/executable-tools/host-bindings.ts`
- `apps/website/src/features/agent-plugins/mail-adapter-registry.ts`
- `apps/website/src/features/agent-plugins/search-provider-registry.ts`
- `apps/website/src/features/api-connections/README.md`
- `apps/website/src/features/api-connections/__tests__/api-connection-budgets.test.ts`
- `apps/website/src/features/api-connections/__tests__/api-connection-slice.test.ts`
- `apps/website/src/features/api-connections/__tests__/contribution.unit.test.ts`
- `apps/website/src/features/api-connections/__tests__/fixtures/acme-office/README.md`
- `apps/website/src/features/api-connections/__tests__/fixtures/acme-office/jini-admin-surfaces.json`
- `apps/website/src/features/api-connections/__tests__/fixtures/acme-office/jini-agent-tools.json`
- `apps/website/src/features/api-connections/__tests__/fixtures/acme-office/jini-connections.json`
- `apps/website/src/features/api-connections/__tests__/fixtures/acme-office/jini-form-destinations.json`
- `apps/website/src/features/api-connections/__tests__/support/acme-harness.ts`
- `apps/website/src/features/api-connections/budgets.ts`
- `apps/website/src/features/api-connections/contribution.ts`
- `apps/website/src/features/consent/region-plugins.ts`
- `apps/website/src/features/custom-credentials/__tests__/fixture-auth-schemes.fixture.ts`
- `apps/website/src/features/custom-credentials/__tests__/fixtures/example-host/jini-credential-schemes.json`
- `apps/website/src/features/custom-credentials/credentialed-request.ts`
- `apps/website/src/features/deployments/__tests__/deploy-config-registry.unit.test.ts`
- `apps/website/src/features/deployments/deploy-config-registry.ts`
- `apps/website/src/features/deployments/deploy-config.ts`
- `apps/website/src/features/deployments/deploy-ops/__tests__/fixtures/example-host/jini-deploy-ops.json`
- `apps/website/src/features/deployments/deploy-ops/__tests__/registry.test.ts`
- `apps/website/src/features/deployments/deploy-ops/__tests__/run-ops-contract.test.ts`
- `apps/website/src/features/deployments/deploy-ops/__tests__/secrets-adapter-contract.test.ts`
- `apps/website/src/features/deployments/deploy-ops/__tests__/secrets.test.ts`
- `apps/website/src/features/deployments/deploy-ops/__tests__/typed-secret-card.test.ts`
- `apps/website/src/features/deployments/deploy-ops/registry.ts`
- `apps/website/src/features/deployments/deploy-targets/__tests__/descriptor-fields.unit.test.ts`
- `apps/website/src/features/deployments/deploy-targets/registry.ts`
- `apps/website/src/features/form-destinations/README.md`
- `apps/website/src/features/form-destinations/__tests__/registry.unit.test.ts`
- `apps/website/src/features/form-destinations/index.ts`
- `apps/website/src/features/form-destinations/registry.ts`
- `apps/website/src/features/form-destinations/types.ts`
- `apps/website/src/features/member-login/CONTRACTS.md`
- `apps/website/src/features/member-login/__tests__/providers.test.ts`
- `apps/website/src/features/member-login/providers.ts`
- `apps/website/src/features/object-storage/__tests__/env-declarations.contract.test.ts`
- `apps/website/src/features/object-storage/__tests__/index.unit.test.ts`
- `apps/website/src/features/object-storage/__tests__/registry.unit.test.ts`
- `apps/website/src/features/object-storage/registry.ts`
- `apps/website/src/features/publish-trust/__tests__/candidate-declarations.contract.test.ts`
- `apps/website/src/features/publish-trust/connect.ts`
- `apps/website/src/features/site-backup/__tests__/import-bundled-packages.integration.test.ts`
- `apps/website/src/features/site-backup/__tests__/import-malicious.integration.test.ts`
- `apps/website/src/features/site-backup/__tests__/share-file-policy.unit.test.ts`
- `apps/website/src/features/site-backup/__tests__/share-round-trip.integration.test.ts`
- `apps/website/src/features/site-backup/__tests__/sources.unit.test.ts`
- `apps/website/src/features/site-backup/__tests__/tool-registrations.unit.test.ts`
- `apps/website/src/features/site-backup/share-file-policy.ts`
- `apps/website/src/features/source-control/credential-form.ts`
- `apps/website/src/features/source-control/provider-module.ts`
- `apps/website/src/features/source-control/provider-registry.ts`
- `apps/website/src/server/__tests__/integration/composition-served-site-dir.integration.test.ts`
- `apps/website/src/server/__tests__/unit/bundled-agent-plugins-dir-callers.unit.test.ts`
- `apps/website/src/server/runtime/boot/__tests__/mail-send.golden.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/cost-counters.baseline.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/fixtures/cost-counters.baseline.json`
- `apps/website/src/server/runtime/composition/__tests__/fixtures/other-vendor/jini-form-destinations.json`
- `apps/website/src/server/runtime/composition/__tests__/plugin-credential-cards.unit.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/site-mailer.unit.test.ts`
- `apps/website/src/server/runtime/composition/agent-plugin-connections.ts`
- `apps/website/src/server/runtime/composition/plugin-credential-cards.ts`
- `content/agent-plugin-overlays/cloudflare/__tests__/contribution-migration.test.mjs`
- `content/agent-plugin-overlays/fly/__tests__/bundled-package.test.mjs`
- `content/agent-plugin-overlays/fly/__tests__/publish-candidates.test.mjs`
- `content/agent-plugin-overlays/github/__tests__/source-control-credential.test.mjs`
- `content/agent-plugin-overlays/google-login/__tests__/credential-card.test.mjs`
- `content/agent-plugin-overlays/google-login/__tests__/login-provider.test.mjs`
- `content/agent-plugin-overlays/google-workspace/__tests__/credential-card.test.mjs`
- `content/agent-plugin-overlays/google-workspace/__tests__/oauth.contract.test.mjs`
- `content/agent-plugin-overlays/google-workspace/__tests__/sheets-admin-harness.mjs`
- `content/agent-plugin-overlays/railway/__tests__/deploy-config.test.mjs`
- `content/agent-plugin-overlays/render/__tests__/deploy-config.test.mjs`
- `content/agent-plugin-overlays/resend/__tests__/resend-mcp.test.mjs`
- `content/agent-plugin-overlays/s3-compatible/__tests__/credential-card.test.mjs`
- `content/agent-plugin-overlays/s3-compatible/__tests__/env-declaration.test.mjs`
- `content/agent-plugin-overlays/vercel/__tests__/blob-share.test.mjs`
- `content/agent-plugins/how-tovu-works/skills/build-agent-plugin/SKILL.md`
- `development/e2e/journeys/admin-visual.pins.journey.ts`
- `development/e2e/support/bug-pin-fixtures.ts`
- `development/scripts/__tests__/compose-bundled-agent-plugins.test.ts`
- `development/scripts/compose-bundled-agent-plugins.mjs`

## C7-IDS — done with per-test STOPs

Base: `8d1a4c2742`. Test-only changes in 7 files:

- `apps/website/src/features/agent-plugins/__tests__/unit/bundled-supabase-package.unit.test.ts`: done — “mcp.json offers the access-token fallback…” now matches Jini tokenAuth without retiredEnv; changed assertion carries a message.
- `apps/website/src/features/member-login/__tests__/providers.test.ts`: STOPPED — “bundled preset admits the active, unchanged installed contribution” has no identity literal to repoint. Production `features/member-login/providers.ts:43` rejects Jini's `jini/google-login` because it requires `tovu/${plugin.pluginId}`. No production edit; unrelated namespace-loop and precedence cases unchanged (apart from sheet 1 filenames).
- `apps/website/src/server/inbound/admin-http/routes/agent-plugins/__tests__/integration/agent-plugin-set-enabled.integration.test.ts`: done — seeded enabling case at :175/:185 uses jini namespace/id; both “post-activation discovery failure preserves the successful toggle” cases at :667 use jini metadata, retaining their synthetic test/site-compliance identity. Changed identity assertion carries a message.
- `apps/website/src/server/runtime/composition/__tests__/plugin-host.integration.test.ts`: STOPPED — “every bundled agent and site package declares…” (:189–202): entry contains only pluginId and packageRoot; the composed copy erases source origin, so it cannot distinguish Jini packages from Tovu-owned content without extra catalog/scaffolding outside literal/expectation edits. No edit. STOPPED — “an approved enable reports…” (:456) and “an approved enable missing its snapshot…” (:475): no bundled qualified id or namespace literal to repoint; github is the local pluginId and must stay so. Fixing setup/production exceeds this sheet. No edit.
- `content/agent-plugin-overlays/fly/__tests__/bundled-package.test.mjs`: done — “Fly owns ops, config and FlyV1 scheme…” expects jini/fly.
- `content/agent-plugin-overlays/google-login/__tests__/exports.test.mjs`: done — config, owner, and “U1: disabled, unconfigured and foreign-owner providers…” catalog expectation use jini/google-login.
- `content/agent-plugin-overlays/google-login/__tests__/login-provider.test.mjs`: done — “Google Login is discoverable…” expects jini/google-login.
- `content/agent-plugin-overlays/railway/__tests__/deploy-config.test.mjs`: done — seeded-disabled package identity expects jini/railway; filename case handled by sheet 1.
- `content/agent-plugin-overlays/render/__tests__/deploy-config.test.mjs`: done — seeded-disabled package identity expects jini/render; filename case handled by sheet 1.

Existing file above 500 lines (not a stop): agent-plugin-set-enabled.integration.test.ts 822 → 822.

Jini manifests and Supabase mcp.json read only from pinned git objects. All changed assertions carry messages. REFRESH: named post-activation cases are at :667, separate from the explicitly named :175/:185 seed case; both repaired within the named file. Mutation owed: none separately specified. Deletions at diff review: none; all edits required by the sheet.

## C7-CRED-LABELS — STOPPED

Base: `8d1a4c2742`. Sheet-specific files touched: none (mail-adapter-registry.ts retains only sheet 1's filename edit). Both named declarations exist: site-search.ts:60 and mail-adapter-registry.ts:10. Pinned Jini Meilisearch card saves `Search — Meilisearch`; pinned Resend jini-mail-adapters.json saves `Mail — Resend API`.

STOP: Tovu writes credentials with its own Tovu Mail label outside the named files. `apps/website/src/server/runtime/boot/mail-provider-catalog.ts:45` defines `Tovu Mail — SMTP Server`, :77 passes it into the provider catalog. `apps/website/src/features/mail-status/provider-operations.ts:69` reads `provider.credential.label`; :104–107 selects creation/rotation; :116–118 writes `plan.credential.label` with createCustomCredential. This is the SMTP save path, not a test or read-only lookup. The sheet says change nothing on such a writer, so neither tests nor label implementations changed.

Tests unchanged: “the credential label is the fixed prefix plus the provider label”, vendor credential lookup/logging and bound-port assertions in site-search.unit.test.ts; “parseMailAdaptersFile accepts schemaVersion 2 with credentialKeys/feedback and defaults the credential label” in mail-provider-contribution.unit.test.ts. Red reason remains: current Jini/Tovu labels disagree. Mutation owed to combine if unblocked: put Tovu Search — back and confirm site-search assertions fail.

BREAKS: saved credentials labelled Tovu Search/Mail — … need the label migration

That break is accepted for the planned change; this STOP applies no new label break. REFRESH: writer chain recorded; webhook/SMTP reads and docs were not edited. Deletions at diff review: none.

## C7-CSS — done

Base: `8d1a4c2742`. Files touched: `apps/admin/src/styles.css` (one form-name selector), `apps/admin/src/features/themes/__tests__/Themes.unit.test.tsx` (three dialog selectors). Pinned Jini emits both required jini-* classes. Tests changed: “opens the ImagePreviewModal at the same image when the thumbnail is clicked”, “closes the modal on the close button, dropping the dialog's open attribute”, “translates the expanded preview's close button and alt text through the screen's own t, not raw English”.

Existing files above 500 lines (not a stop): styles.css 6799 → 6799; Themes.unit.test.tsx 582 → 582.

Combine owes Chrome look: admin form editor Form name row spans one column. Mutation owed: none separately specified. REFRESH: none. Deletions at diff review: none; all edits required by the sheet.

## C7-PREVIEW-FEED — done

Base: `8d1a4c2742`. File touched: `apps/website/src/server/inbound/admin-http/routes/settings/__tests__/preview-feed-access.test.ts`. Test changed: “existing stream emits exact theme frames across writers, reauthorizes and cleans up its timers”. Inserted exactly the specified settle loop and message-bearing assertion between handler completion and first tick. Production events.ts untouched.

Mutation owed to combine: delete the loop and confirm the case fails with only the connected frame. REFRESH: none. Deletions at diff review: none; all edits required by the sheet.

## C7-AGUI-TESTS — done (dependency pending)

Base: `8d1a4c2742`. File touched: `apps/admin/src/lib/__tests__/assistant-transport.ag-ui.unit.test.ts`. All six expectation anchors found exactly at base :384, :395, :404, :411, :423, :540 (within ±10). Kept setup and test names; first five now capture failure with the specified .then pattern, check the plain-words message prefix/status and original cause; the started-run case checks reported message and cause. Tests changed: non-ok HTTP 502, network Error, network non-Error, empty HTTP 500 body, body-read error, transport error after run started. Vitest assertions only; assert safety counts unchanged. Production assistant-transport-ag-ui.ts untouched.

DEPENDS: Jini c7-jini C7-J-AGUI-ERROR

Existing file above 500 lines (not a stop): assistant-transport.ag-ui.unit.test.ts 794 → 801. No new function declarations or additional setup.

These six stay red until that Jini change is linked. Mutation owed: none separately specified. REFRESH: none. Deletions at diff review: none; all edits required by the sheet.

## C7-TEST-SAFETY — done

Base: `8d1a4c2742`; historical added lines inspected with `git diff 776ce6d0f HEAD -- <file>` for all 9 files. Messages only, exact asserted expressions unchanged; all pre-existing message-less assertions untouched. Files touched and message-less counts (dispatch base → edited state):

| File under apps/website/src | Before → after | Test changed |
| --- | --- | --- |
| cli/__tests__/unit/serve-command-wiring.unit.test.ts | 6 → 5 | runServeCommand boot token/startup order |
| cli/commands/__tests__/stdin-input.unit.test.ts | 2 → 1 | over-cap stdin cause |
| features/agent-plugins/__tests__/unit/bundled-kuinetic-package.unit.test.ts | 1 → 0 | complete automatic guidance |
| features/agent-plugins/__tests__/unit/bundled-ui-ux-design-package.unit.test.ts | 4 → 2 | automatic overlay/core guidance |
| server/inbound/admin-http/routes/integrations/__tests__/integration/create-delete-pause.integration.test.ts | 6 → 5 | pause/delete concurrent edit |
| server/inbound/public-http/http/site/__tests__/form-render.unit.test.ts | 3 → 1 | multibyte flash byte budget |
| server/inbound/public-http/middleware/__tests__/site-consent-metadata.unit.test.ts | 5 → 1 | metadata/assistant/consent ordering |
| server/runtime/composition/__tests__/serving-app-trash-sweep.test.ts | 1 → 0 | rejected sweep error callback |
| server/runtime/composition/site-deps/__tests__/outbound-connections.characterization.unit.test.ts | 2 → 1 | B23 publishing-phase call placement |

Every file had the specified added assertions; none skipped. 14 message additions total. Mutation owed: none specified (messages only). REFRESH: none. Deletions at diff review: none; all edits required by the sheet.

Final diff review: compared all 97 input files against exactly the 180 prescribed substitutions; the only additional differences in those files are the named bundler pattern/test-name/escaped-regex edit and four sheet-2 overlay id expectations. All eight moved fixtures match their base bytes except the explicitly listed credential-schemes note substitution. All other diffs reread. No out-of-sheet work deleted. The only content removal is sheet 2's required retiredEnv array; the eight old fixture paths are plain-mv renames, with replacement paths still untracked for coordinator staging. Static per-file assertion counts confirm all nine sheet-7 targets. No tests or gates executed.
