# Codex full audit s10–s17: Claude judgment (judge B, 2026-11-15)

Source: `../codex-full-audit-2026-11-15/out/s10.md … s17.md`. All ~150 candidate groups were checked against `CLASSIFY-files.tsv`: none of the candidate files is listed there (the survey labelled them STAY), so every ACCEPT reverses the survey. Claims were spot-checked in `refactor/terra` source (Tovu `tovu-codex-trial-terra`, Jini `jini-terra-base`) and against the untangle sheets. Planning only. ACCEPT rows are in `AUDIT-ADDITIONS-2-b.tsv`, which uses the same 21 columns and the same estimate formulas as `AUDIT-ADDITIONS.tsv`.

## Summary
- **Counts:** 33 ACCEPT rows (they merge about 75 candidate files), about 30 ACCEPT-LATER groups and about 40 REJECT groups. 3 candidates are merged into earlier audit rows (B03 allowlists, B05 daemon client, D12 ports).
- **Size:** about 12.3k movable lines. Sheet estimates are about 0.26M Opus + 0.59M Sonnet. Execution is about 1.66M Sonnet.
- **Biggest real finds:**
  - **Publishing engine (B01–B03, B08, B14, B16).** Row 140 tracks only the planner/handler layer. The transfer layer, the apply loop, the backstop and the peers code (about 4.5k lines) are on no row. Four per-feature contributors (navigation, settings, entries, forms) also fell off, although their six siblings are MOVE-AFTER.
  - **Theme engine (B04, B10, B15).** The todos list it as lane T, but it was never file-tracked: row 162 lists 12 files and none of the loader.
  - **Newsletter (B05).** Row 52 moves the send pipeline without the campaign domain it needs.
  - **Three security/parity HARDENs (B06, B07, B12).**
- **Codex over-reach:**
  - Tool-registration wrappers, one-site product code (multi-site, seed, legacy vault codecs), 10–40-line helpers and type-only moves.
  - All dev-analysis scripts, which follow owner Q1 of the earlier audit (AI-Dev-Shop toolkit, not Jini).

## Possible bug (for open-bugs.md; I am read-only)
- `features/agent-plugins/install-upload.ts:77` uses Jini's yauzl reader **without** the special-entry guard that `plugin-runtime/install-archive.ts:17` adds (FIFO/device/socket entries).
  - The Jini reader refuses only symlinks.
  - **Severity:** low to medium. Exploitability depends on how the extractor writes the entry's mode.
  - The fix is B06.

## Top rows by value (lines × reuse ÷ cost)
| # | id | What | Startable |
|---|---|---|---|
| 1 | B01 | Publish transfer contracts, staging and blob index → `cms/publish` | blocked (cycle-cuts, row 140) |
| 2 | B02 | Publish apply, import/export and backstop engine (~1.8k) | blocked |
| 3 | B04 | Theme loader, catalog, validation and conformance → `cms/theme` (~1.5k) | blocked (row 162, parse5) |
| 4 | B05 | Newsletter campaign domain → `cms/newsletter` (~1.5k) | partial (C3/C4 type imports) |
| 5 | B03 | Publish peers and transport (~1.3k) | blocked (+C5) |
| 6 | B06 | yauzl special-entry refusal HARDEN (security) | **now** (after R-BARRELS) |
| 7 | B07 | Vault `rotate` verify-before-persist HARDEN (security) | **now** |
| 8 | B08 | Navigation/settings/entries/forms publish contributors | blocked |
| 9 | B09 | Root-key provisioning state machine → `platform/secrets` | partial (row 57 parity) |
| 10 | B12 | Form-delivery "definitively gone" HARDEN | partial (after C3 wave) |

## ACCEPT (rows in AUDIT-ADDITIONS-2-b.tsv)
| id | Tovu path(s) | Kind | Target | Lines | Blocked on | Tier |
|---|---|---|---|---:|---|---|
| B01 | `publish-content/{apply-errors,artifact-format,backstop-audit,backstop-ports,baseline-repo,bundle-staging,file-blob-index,packed-entity,blob-staging,composite-blob-source,content-references}` | MOVE | `cms/publish(+/node)` | 800 | row 140, A01, C5 | S+R×2 |
| B02 | `publish-content/{apply-loop,execute-import,export-bundle,gated-hooks,backstop-*,raw-*-contributor}` | SPLIT | `cms/publish` | 1800 | B01 | Opus+S×3 |
| B03 | `publish-content/{connect-destination,destination-credential,peer-transport,peer-url,peers,pull}` | SPLIT | `cms/publish/peers` | 1300 | B02, C5 | Opus+S×2 |
| B04 | `theme/{theme,template-applicability,build-conformance,validation/structure,validation/references}` | SPLIT | `cms/theme(+/node)` | 1500 | row 162, C5; cookie-consent `validateScripts` → port | Opus+S×2 |
| B05 | `newsletter/{campaign-write-service,campaign,errors,hooks,launch-gate,lists,ports,repo.memory,types}` | MOVE | `cms/newsletter` | 1500 | C3, C4 type imports | S+R×2 |
| B06 | `plugin-runtime/install-archive.ts` | HARDEN | `agent-plugins/lifecycle/yauzl` | 46 | after R-BARRELS | S |
| B07 | Jini `vault.service.ts` rotate (pattern: `vault-boot.ts:153`) | HARDEN | `platform/secrets/credential-sets` | 25 | none | S |
| B08 | `{navigation,settings,entries,forms}/publish-content.ts` | MOVE-AFTER | `cms` | 650 | row 140 + feature rows | S×2 |
| B09 | `webhooks/site-key-ensure.ts` | SPLIT | `platform/secrets` | 400 | row 57 keyring parity | Opus |
| B10 | `theme/{duplicate-theme,sync-originals,file-identity-lock,file-mutation-tools,theme-trash,theme-preview-image,migration/migrate-theme}` | SPLIT | `platform/fs` + `cms/theme/node` | 900 | B04 | Opus+S×2 |
| B11 | `public-http/routes/members/*` (8) | SERVER | `user-management/server` members | 350 | server-port, C4, rows 54/78 | Opus |
| B12 | `composition/form-delivery.ts` emptyPlanWhenGone | HARDEN | `cms/forms/delivery` planner | 40 | after C3 wave | S |
| B13 | `plugin-runtime/admin-response.ts`, `assistant/ensure-json-agent-install.ts` | DELETE | repoint to `plugins/host`, `mcp` | 49 | after R-BARRELS | S |
| B14 | `publish-content/ui/{criteria,phase,publish-order,replan}` | MOVE | `cms/publish/ui` | 450 | B01 | S |
| B15 | theme render helpers + publication/activation (8 files) | SPLIT | `cms/theme`, `cms/presentation`, `cms/navigation` | 380 | B04 | S+R |
| B16 | `publish-trust/{connect,provisioning.node-io}`, `routes/publish-trust/handshake.ts` | SPLIT | `cms/publish` trust (extends A01) | 220 | A01, server-port | S+R |
| B17 | `webhooks/tool-registrations.ts` | SPLIT | `integrations/webhooks/tools` | 200 | row 57; C3/C4/C11 overlap | S+R |
| B18 | `post/reverters.ts` | SPLIT | `cms` (posts reverters) | 250 | row 156 | S+R |
| B19 | `routes/commerce/purchase.ts`, `routes/site/product-checkout.ts` | SERVER | `commerce/http`, `commerce/checkout-browser` | 110 | server-port, C4 | S+R |
| B20 | `inbound/shared/{async-route,request-id,dev-cors,json-body-parsers,route-guards}` | SERVER | `http-kit/middleware` | 150 | server-port, C4 | S+R |
| B21 | `seo/{cover-image,page-head-contributor,agent-tools}` | SPLIT | `cms/seo` | 200 | row 48 precondition | S+R |
| B22 | `settings/form-delivery.ts` | SPLIT | `cms/forms/delivery` | 140 | row 133 | S |
| B23 | `routes/oauth/callback-page.ts` | MOVE | `oauth/callback-page` (new) | 90 | none | S |
| B24 | `assistant/{agent-daemon-scope-control,agent-plugin-preflight-events,durable-run-routes,tool-access-lowering-route}` | SPLIT | `daemon` scopes + `daemon/http` | 160 | server-port, C4 | S+R |
| B25 | `assistant/{attempt-process-identity,early-run-session,run-start-decisions}` | SPLIT | `platform/process`, `daemon/session-coordination` | 100 | C6 | S+R |
| B26 | `plugin-runtime/{host-binding,lower-tool-access,widget-partials}` | SPLIT | `plugins/host(/node)` | 80 | after R-BARRELS | S |
| B27 | `site-export/{media-original-urls,static-security-headers,theme-preview-report}` | SPLIT | `devops/static-export` | 110 | row 144 | S |
| B28 | `platform/db/drift.ts`, `site-dir/schema-guard.ts` | SPLIT | `db/migrate` | 90 | after C3 wave | S |
| B29 | `routes/site/{sitemap,llms}.ts` | SPLIT | `cms/seo` serializers | 45 | none | S |
| B30 | `composition/database-transfer-adapters.ts:38` + `deps.ts:2362` | DEDUPE | `db/transfer` | 45 | hot composition file | S |
| B31 | `object-storage/artifact-provider.ts` | SPLIT | `platform/object-store` | 45 | fold into row 77 | S |
| B32 | `site-search/settings.ts` | SPLIT | `search/settings` | 60 | row 123 (kysely) | S |
| B33 | `skills/install-tool.ts` | SPLIT | `agentic/skills/install` | 60 | fold into row 63 | S |

**Startable now:** B06, B07, B13, B23, B26, B29, B31, B33. B06, B13, B26 and B31 run after the R-BARRELS lane, because they touch the same files.

**After untangle wave B (C3/C4/C5):** B05, B12, B28, B30, B19, B20, B11, B24, B16; B01–B03 also need the row-140 cycle cuts.

**After wave C (C6):** B25.

**Theme (B04/B10/B15), post (B18), settings (B22), export (B27), search (B32):** these wait on their hard-blocked feature rows.

## Merged into earlier audit rows (no new row)
- `theme/{handlebars,liquid}-allowlist.ts` → earlier **B03** (provider plugins, theme wave).
- `composition/modules/assistant-tool-access-lowering.ts` and `lifecycle/{assistant-daemon-connection,daemon-demand-fetch}.ts` → earlier **B05** daemon transport. Codex says the park-recovery sequence is generic, which reverses B05's "park recovery stays"; re-judge it in that sheet.
- `development/scripts/start.mjs` bind preflight → **D12**. `classify-coverage-gaps.ts` → **D03** (optional).
- `settings/visitor-tools-service.ts` → **B09** (visitor-tools, with row 168).

## ACCEPT-LATER (one line each)
- **Publish leftovers:** `newsletter/repo.ts`, `publish-content/publish-backstop-row.sqlite.ts`, and the `platform/db/repos/publish-*` and `publish-history-repo` SQL adapters. They wait on the C3 storage contract and a decision on who owns Tovu tables in Jini SQL adapters (Jini's `cms/*/sql` precedent).
- **Tool layers:** newsletter tools and `publish-content/{publish-tool,tool-registrations}` follow B05/B02. Do them after the domain lands.
- **Site backup (c28–c36, about 2.8k):** entangled with Tovu's v2 share format, saved keys and static copy. Re-judge inside row 160's Opus sheet. A generic portability package needs a second host's format to design against.
- **Rows 137/32/66:** `site-inspection/site-profile.ts` and the inspection, evidence and screenshot tool registrations. Do them in those rows' Opus sheets.
- **Theme preview and refresh:** `theme/preview-*`, `theme-roster-sync`, `theme-watcher`, the `public-http/middleware/theme-*` files and `admin-http/routes/themes/{explore,preview}.ts` follow B04/B10 and the server port. `code-tier-asset-normalizer.ts` is an Angular output adapter that becomes a provider later.
- **`public-http/http/site/worker-sandbox.ts`** (esbuild bundle lifecycle) waits for the provider-plugin decision.
- **`public-http/http/site/member-auth-script.ts`** is a 445-line inline script with copy baked in. It needs a copy-injection design and should go after B11.
- **Origin and search codecs:** `seo-render-context.ts` and `comments-submit.ts` origin helpers go to `core/contracts/server` after C4 (http-kit `verified-origin` is deleted there). `routes/site/search.ts` codecs also wait for C4.
- **Composition modules:** `assistant-byok`, `assistant-chats`, `assistant.ts`, `agent-daemon-core-rpc`, `assistant-tool-exec`, `assistant-server-federation` and `product-telemetry` go to row 166's planned **Opus per-file relabel**. `assistant-run-tool-facts`/`runtime-guidance` wait for C6.
- **Database composition:** `move-site-storage`, `open-site-*`, `storage-secret.ts` (sealed-file helper), `other-site-keys.ts`, `prepare-content-store.ts` (with earlier D07 drizzle) and `hydrate-content-db-from-seed.ts`.
- **Platform site-dir:** `local-site-{child,supervisor}` goes with the todos desktop-supervision lane. `init-site.ts` and `read-site-dir.ts` are a dedupe onto `createGuardedFileReader`, not a move.
- **Boot:** `production-readiness-gate.ts` and the `capability-inventory` contract (mind the no-boot-refusal owner rule), `startup-secrets.ts`, `site-daemon-listener.ts`, `chart-providers.ts`, `plugin-tier2/run-in-worker.ts`, `visitor-analytics` consent observer.
- **`trash/adapters/{media,member,user}.ts`, `tool-audit/tool-gaps.repo.ts`, `source-control/{types,repository-target}.ts`** go to their rows' sheets (139, 27, 159). `commit-site.ts` keeps DELETE-AFTER-PARITY.
- **`packages/sdk/src/{content-contracts,index}.ts`** follow the todos "@tovu/sdk FIRST" plan and R-BARRELS.
- **Dev scripts:** `measure-idle-cpu`/`measure-site-memory` would extend `devops/checks/memory-soak` later. `build-brand-icons.mjs` goes to `devops/packaging` with an image-codec provider. `lib/secret-patterns.ts` is a detection contract that waits on C5's redaction move.
- **Analysis scripts go to the AI-Dev-Shop toolkit (owner Q1 of the earlier audit):** `args-object-audit`, `check-outbox-bridge`, `rewrite-deep-imports`, `write-path-inventory`, `admin-route-walk`/`check-admin-api-routes`, `check-governance-adr-scope-drift`, `check-idle-motion`/`check-theme-replaced-elements`, `check-immutable-migrations`/`test-safety-*`, `check-test-baseline`/`tap-summary`, `openapi-*`, `route-tool-parity`/`check-menu-href-allowlist-sync`, `deploy-html-snapshot`, `size-hotspots`, `theme-tool.ts`.

## REJECT (one line each)
- `pages/html-document-store.memory.ts`: a memory twin. Codex itself says to avoid a separate memory-only owner. It goes with the entries document-store row.
- Content-analyzer and word-count built-ins: Tovu built-in plugins. The helpers are tiny.
- `post/slug.ts` (23 lines) and `post/search-index.memory.ts`: host naming policy and a memory projection.
- `project-keys/site-references.ts`: the persistence owner is already Jini's `createAgentPluginStateStore`. What is left is Tovu namespaces.
- `server-logs` tools (70), `settings/operator-locale.ts` (42), `inbound/assistant/plugin-prompt-assembly.ts` (11), `app.ts` lazy proxy (15), `seed.ts` doc builders (34), `generate-seed-content` assertion (28), `cleanup-stale-owner-sessions` predicate (12), `test-home-isolation.ts` (10), `trash/remove-without-blocker.ts` (37): too small or pure wiring; the extraction costs more than the code.
- `sites/{site-admin,warm-switch}`, `site-dir/{move-sites-home,site-databases,product-root,seed-site-themes,sites-project-references}`, `composition/registered-sites.ts`: Tovu's multi-site product.
- `headless-browser/playwright-loader.ts` and `sites/site-preview/playwright-site-preview-capture.ts`: already decided by the W0 corrected `sheets/delete-headless-browser.md` (the vendor binding stays in Tovu).
- `platform/db/kernel/{dialect,port}.ts`: already DELETE-FILE rows in `C3t.repoint.tsv`.
- `platform/html/escape.ts`: row 13. The duplicate escape in `seed-starter-title.ts` should be noted in the row-13 sheet. `platform/html/slug.ts` (28) depends on a vendor transliterator and is low value.
- `platform/db/watermark-kernel.ts`: Jini deliberately leaves the watermark table to the host (`db/src/core/ports.ts:50`).
- `web-screenshot/capture-files.ts` (47): a local refactor onto `createLocalFsObjectStore`, not a move.
- `admin-http/routes/widgets/*`: thin routes over Jini `createWidgetInstance`. Row 167's SERVER route conversion covers them.
- `render-context.ts` `MediaAssetRenderMeta`: type only (same reasoning as earlier B09).
- `composition/modules/integrations.ts` (store choice) and the `vault-boot.ts` legacy normalization: Tovu composition and historical codecs. Only the open-after-seal check is generic (B07).
- `split-chat-data-into-chat-db.ts`: a one-off migration. Migrations are exempt (owner 10-29), same as earlier D16.
- `seed-site.mjs`, `codex-jini-rebuild.mjs`/`dev-lite.mjs`, `agent-run-probe.mjs`, `quality-semgrep.mjs`: Tovu seed policy, Tovu↔Jini dev workflow, a provider-specific probe and a CI tool call.

## Wrong backlog labels: confirmed (spot-checked or self-evident from the cited source)
- **CLASSIFY-files:1007** (`webhooks/agent-tools.ts` → core): retarget to `integrations/webhooks` (B17).
- **CLASSIFY-files:1019** (`widgets/agent-tools.ts` → core): the package column contradicts its own note (`cms/widgets`).
- **CLASSIFY-files:1237** (analytics → core) and **:1238** (rendition: `cms/media` vs `http-kit` in the note): metadata conflicts. Fix before the sheets are written.
- **CLASSIFY-files:1215** (`routes/widgets/agent-tools.ts` DELETE): change to MIXED. Its create-then-place recovery (`:205`, `:219`) has no single Jini replacement.
- **CLASSIFY-files:1154** (`routes/pages/update.ts` DELETE): it is still registered (`composition/modules/content.ts:94`). Consolidate before deleting.
- **CLASSIFY-files:1103** (`http/workspace.ts` DEDUPE "identical"): Tovu emits `version`, and Jini's `AdminWorkspace` does not. It needs a contract extension first.
- **CLASSIFY-files:1243** (`trust-proxy.ts`), **:1250** (mail policy), **:1256** (commerce-drain), **:1278** (provider-revision-watch): the extraction has already landed, so what is left is HOST. Re-kind them to a REPOINT/STAY check.
- **CLASSIFY-files:1013** (`seal-aad-invariant.ts` DELETE): it is an AST checker. Keep it, or move it to dev tooling (AI-Dev-Shop); do not delete it.
- **CLASSIFY-files:1026, :1033, :1077, :1085/1086, :1281, :1282, :1223–1225:** Codex reports these as HOST at the audited ref because they already call Jini owners. Re-check them in the row-69/166/171 relabels. Not spot-checked here.
- **The `content-hash.ts` DEDUPE-UNVERIFIED caution stays** (versioned hash contract), as does the keyring/sealer parity work in row 57.

## Owner questions
None new. The earlier audit's Q1 (dev-analysis engines → AI-Dev-Shop toolkit) also decides the s17 script group listed above.
