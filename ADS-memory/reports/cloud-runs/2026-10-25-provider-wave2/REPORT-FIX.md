# Provider wave 2 — FIX run report (BRIEF-FIX.md)

> Jini pushes: `cloud/prov-wave2-jini` (no 403). Tovu pushes (code + this report): `cloud/prov-wave2-tovu`.

## Headline per step

| Step | Status | Where |
|---|---|---|
| 1 Codex HIGHs | **DONE** | Tovu ac543391 (TDZ: providers really boot — integration test installs a fake provider plugin ON DISK, enables it, boots the REAL composition root; red = `PLUGIN_SETUP_FAILED` → noop), ad5c96ee (retired leases inert: every composed call re-checks `lease.isCurrent()`, noop after retirement); Jini 839dba92 (OTel exporter built from injected config only — test sets 12 hostile `OTEL_*` vars incl. headers/endpoint/compression/sampler/resource attrs/BSP → all ignored) |
| 2 Codex MEDs | **DONE** | Tovu 7ddd0f38 (import+setup bounded per plugin; on timeout the selection is revoked so a late setup publishes nothing); Jini 146be48f (Langfuse: borrowed client only flushed, never shut down; boundary scan parses specifiers with the TypeScript parser — template, commented, multi-line, `require.resolve`, re-export, type-only, `import()` type, import-equals, side-effect; comments/strings/computed ignored), 8395a5f6 + 2ccf809a (fan-out: a tracker `run()` throwing before/after/instead of its callback never blocks the work or later scopes; callback runs exactly once; the work's own error/result reaches the caller) |
| 3 Settings → vault | **DONE** | Jini 223fc222 (`contributes.providers[].settings`: public + secret fields, validated; OTel/Sentry/PostHog/Langfuse declare theirs); Tovu db55f787 (boot is manifest-driven — Tovu's per-vendor `PROVIDER_PLUGIN_BINDINGS` and the `plugin:<id>` API-credential mapping are gone), 93370fd2 (admin route), 09cab4ba (admin UI card) |
| 4 ProviderConfigSource | **DONE** | Tovu db55f787: neutral port `pluginId → { settings, secrets }`; site-vault adapter (plugin-state rows `plugin-state:<id>:provider.settings` / `provider.secrets` in `secrets_vault`, sealed with the site key — reused, no new table in content.db); precedence = project store, else site vault |
| 5 Project store | **DONE** | Tovu 5685baec: `project.db` (see below) |
| 6 Site attribution | **DONE** | Jini 4a9d6ca8 (neutral `attribution` factory input applied per vendor); Tovu 9c1d33e7 (site identity injected at composition, per-contract key names) |
| 7 Measure | **DONE** (exceptions listed) | §Measurements; refactors da026e9b, 03cc91e0 |

## How an owner enters keys (exact UI path)

Admin → **Plugins** → **Installed** tab (or **Downloaded**) → the provider plugin's row → **Settings** button (shown only for plugins whose manifest declares provider settings) → fill the fields → **Save**.
- Fields come from the plugin manifest. OpenTelemetry: **OTLP endpoint** (e.g. Grafana Cloud's OTLP gateway URL, `…/otlp`) and **OTLP headers** (secret; `Name=Value` pairs, e.g. `Authorization=Basic <base64 of instance-id:token>` for Grafana Cloud — no Grafana-specific code anywhere). PostHog: host + project API key (secret). Langfuse: URL (optional), public key, secret key (secret). Sentry: DSN (secret), environment.
- Secrets are password inputs, never echoed back (the API returns only `saved: true`); leaving a secret blank keeps the saved one.
- The card says where it saves ("for every site in this project" = project.db, or "for this site" = site vault) and that it **takes effect the next time Tovu starts** (providers initialize before application work).
- API behind it: `GET|PUT /api/admin/v1/workspaces/:workspaceId/plugins/:pluginId/provider-settings` (read: `admin.plugins.read`; save: `admin.plugins.enable`).
- Values never go to env, files, logs, manifests or chat. NOTE: keys saved by wave 2's mapping (API credentials labelled `plugin:<id>`) are no longer read; no migration was written (that path never booted — Codex HIGH #1).

## Where project.db lives, and how web + desktop both find it

- **File:** `<shared sites root>/project.db`, the sites root resolved by `platform/site-dir/sites-home.ts` `resolveSitesHome` — `TOVU_SITES_HOME`, else the saved `~/.tovu/sites-home.json`, else `~/Documents/Tovu`. Both the local web app (`development/scripts/dev.mjs` → the website server) and the desktop app (its child server, which shares the desktop profile via `TOVU_DESKTOP_USER_DATA_DIR`) run the same composition (`deps.ts` → `projectStoreFor`), so whichever starts opens the SAME file. Never desktop app-data. ASSUMPTION: `dev-sites-home.mjs` declares `defaultSubfolder: "sites"` for where it CREATES dev sites; the project root is the workspace home both resolve (`home({})`), not that subfolder.
- **Rows:** same `secrets_vault` row shape as a site's (workspace `'project'`, no FK to site tables, kind `api-connection` only). Own ledger `tovu_project_migrations`, step `project/0000_project_vault` (pinned checksum; `checksums.test.ts` covers it), run through `@jini-ai/db/migrate` like `chat.db`.
- **Key:** `~/.tovu/project-key.hex`, minted on first open like the site key (32 random bytes → hex, mode 0600, created with `wx` so a simultaneous web+desktop first start converges on one file); never exported, never in a site folder; a damaged key file is refused, never overwritten.
- **Fly / single-site (`TOVU_RUNTIME_MODE=production`):** no project.db — the project IS the site and the site vault answers. A project store that fails to open is logged and the site vault answers alone (a project fault never stops a site booting).
- Proof: `project-store.unit.test.ts` (two openers on one sites root read each other's saves; secret + public values absent from the raw file bytes; wrong key cannot read; corrupt file → closed + error) and `deps-provider-plugin-boot.integration.test.ts` test 2 (site A saves through the real admin port → lands in project.db → site B, same sites root, boots its provider from it).

## Site-attribution proof (fake values; produced by the real adapters — OTel SDK, posthog-node with a recording fetch, Langfuse sink with a recording client)

Site identity injected at composition (`deps.ts` `siteIdentityFor`): `siteId` = workspace id (v1: one workspace per content.db — the same reuse `databaseLedgerRepo` makes), `siteSlug` = site folder name, `environment` = `fly` (production) | `desktop` (Electron child: `ELECTRON_RUN_AS_NODE=1`) | `local`, `projectId` = `project-<sha256(sites root)[:16]>` (same for web + desktop; Fly: = siteId). Tovu names keys per CONTRACT (never per vendor) in `attributionFor`; Jini plugins apply the neutral `attribution` input.

OTel span resource:
```json
{ "tovu.site.id": "6f1c2b9e-0000-4000-8000-000000000001", "tovu.site.slug": "my-blog", "deployment.environment": "local",
  "tovu.project.id": "project-3fa1c0de5b7a9e21", "service.name": "tovu" }
```
PostHog event (site properties cannot be overridden by the event's own properties):
```json
{ "event": "post_published", "distinct_id": "principal-opaque-42",
  "properties": { "site_id": "6f1c2b9e-0000-4000-8000-000000000001", "site_slug": "my-blog", "environment": "local",
    "project_id": "project-3fa1c0de5b7a9e21", "$groups": { "site": "6f1c2b9e-0000-4000-8000-000000000001" }, "$is_server": true, "$geoip_disable": true } }
```
Langfuse trace (both trace calls of a run carry it; spans/generations untouched):
```json
{ "id": "run-1", "name": "agent:claude", "sessionId": "chat-9", "tags": ["provider:anthropic", "site:my-blog"],
  "metadata": { "runId": "run-1", "agentId": "claude", "provider": "anthropic", "model": null,
    "site_id": "6f1c2b9e-0000-4000-8000-000000000001", "site_slug": "my-blog", "environment": "local", "project_id": "project-3fa1c0de5b7a9e21" } }
```
Tests: Jini `observability-opentelemetry` (every span's resource; `service.name` not overridable), `analytics-posthog` (every event + `$groups`; event cannot spoof `site_id`), `ai-trace-langfuse` (both trace calls); Tovu `provider-plugins.unit` (each contract's factory input), `deps-provider-plugin-boot.integration` (the real composition hands the site's attribution to the plugin factory), `siteIdentityFor` (fly/desktop/local).

## Tests (counts are tests executed)

- **Jini** (vitest 2, `--minWorkers=1 --maxWorkers=2`): provider-plugins **162/162** (incl. packed-install `artifact.integration` 7/7: npm pack → extract outside repo → integrity → fresh-process import with no vendor SDK resolvable → install + load under both host ABIs; core boundary 29/29); plugins **710/710**; diagnostics **788/788**. `pnpm guard`: 3 violations, the same 3 pre-existing ones (daemon `tool-recovery/observability.ts` "Tovu" comment; mcp `stdio-hosting.ts` HW2 ×2).
- **Tovu** new/changed: `deps-provider-plugin-boot.integration` (3), `provider-plugins.unit` (20), `plugin-runtime.provider-plugins` (7), `provider-config-source.unit` (4), `project-store.unit` (5), `provider-settings-route.unit` (4), migrations `checksums` (4), admin `plugin-provider-settings.unit` (5) + admin plugins folder 555/555. `tsc -p tsconfig.json` clean; admin `tsc --noEmit`: 1 error, pre-existing and unrelated (`lib/__tests__/agent-plugin-choice-replay.unit.test.ts` vs published `@jini-ai/chat`).
- **Tovu wide regression** (`node --test --test-concurrency=1`, linked Jini, 213 files: all `runtime/composition/__tests__`, `platform/db/migrations/__tests__`, admin-http `routes/plugins/__tests__`, `features/plugin-runtime/__tests__`, `features/api-connections/__tests__`): **1575 tests, 1553 pass, 19 fail, 3 skipped**. None caused by this run: Postgres (no server) — `runner.postgres` ×4, `create-site-route-deps.postgres`, `move-site-storage.postgres` ×5, `open-site-store.postgres`; `postgres-baseline` "matches schema.postgres.ts" (re-run with this run's migration changes reverted: same failure); `domain-bindings-step` = V8 fatal native crash in PGlite (ENV); and the three listed by wave 2 as pre-existing: `analytics-providers` "forwards to plausible", `commerce-data-retention` "commerce off", `plugin-host.integration` list/toggle (`exports: []`). No test process left running.

## Measurements

**Coverage (lines / branches) on touched non-UI files:**

| File | Lines | Branches | Notes |
|---|---|---|---|
| Jini `provider-plugins/src/**` (all plugins, `attribution.ts`) | 100 | 100 | v8, package suite (funcs 100) |
| Jini `diagnostics/src/observability/fanout.ts` | 100 | 100 | (was 95.45 branches) |
| Jini `plugins/src/host/provider-contributions.ts` | 100 | 95.83 | lines 78/89 uncovered branches are pre-existing (non-list `providers`, empty list) when measured with its own unit file only |
| Tovu `provider-plugins.ts`, `provider-config-source.ts` | 100 | 100 | node coverage (funcs 97.37: the inert AI-trace noop's `flush`/`shutdown`) |
| Tovu `project-store.ts` | 100 | 94.44 | exception: default-parameter branches (`_optional = {}` never passed) |
| Tovu `routes/plugins/provider-settings.ts` | 100 | 96.92 | exception: `req.params.* ?? ""` guards (Express always supplies a matched param — repo convention) and the null-body optional chain |
| Tovu `deps.ts`, `plugin-runtime.ts`, `admin-response.ts`, `migrations/index.ts` | — | — | whole-file % not measured (large pre-existing files); every added line runs in the new tests above |
| Admin UI (`PluginProviderSettingsDialog.tsx`, hooks) | UI | UI | excluded by the brief (UI); dialog 100 lines, settings hook 86 lines (wired binding untested by convention) |

**CCN (lizard 1.24, `-C 10`):** all new/changed functions ≤ 10 (refactored `settingFieldProblem` 13→≤10, dialog field map 11→≤10). Pre-existing: `composeSiteRouteDeps` stays **14** (my additions moved into `composeProviderConfig`, `projectStoreFor`, `siteIdentityFor`).
**Packed-install test:** green (see Tests). **Core boundary test:** green (TypeScript-parser scan, 0 vendor imports in core).

## NOT done / concerns

- No migration from wave 2's `plugin:<id>` API-credential rows (that path never booted).
- Sentry gets no site attribution (not in the brief's list); it receives the input and ignores it.
- The OTel SDK still *reads* `OTEL_TRACES_SAMPLER`/limits env inside `loadDefaultConfig()` before our explicit values override them: no effect on behavior (tested), but the read itself happens inside the SDK.
- Settings take effect at the next start (no hot reload) — stated on the card.
- `project.db` has no admin "where is it / rotate key" screen; key rotation not implemented.
- Admin typecheck pre-existing error (above); wide-run failures listed above are pre-existing/ENV unless stated.

## Commits

Tovu `cloud/prov-wave2-tovu`: ac543391 · ad5c96ee · 7ddd0f38 · db55f787 · 93370fd2 · 5685baec · 9c1d33e7 · 09cab4ba · da026e9b (+ report commits).
Jini `cloud/prov-wave2-jini`: 839dba92 · 146be48f · 8395a5f6 · 2ccf809a · 223fc222 · 4a9d6ca8 · 03cc91e0.

## Run log (append-only)

## 2026-10-26T00:22Z — STARTED
Tovu `w2fix` @ c1e6758f (origin/cloud/prov-wave2-tovu), Jini `w2fix` @ 800d9caf; both checkouts OK.
Caps: stop new work 03:02Z, hard end 03:22Z. Next: Node 24 + Jini install/build + Tovu install/link, then step 1 (Codex HIGHs).

## 2026-10-26T00:45Z — PROGRESS
- Setup: Node 24.22.0; Jini `pnpm install --frozen-lockfile` + `pnpm --no-bail -r build` green; Tovu `npm ci`, `link:jini` (59 links). `@tovu/sdk` build fails against the PUBLISHED `@jini-ai/plugins` (no provider exports) and passes once linked — expected (nothing published).
- Step 1 DONE: Tovu ac543391 (TDZ; integration test red→green), ad5c96ee (retired leases inert); Jini 839dba92 (OTel injected config only).
- Step 2 DONE: Tovu 7ddd0f38 (bounded provider load); Jini 146be48f (Langfuse borrowed client, TS-parser boundary scan), 8395a5f6 + 2ccf809a (fan-out scope containment).
- Each fix's test shown red first (TDZ: PLUGIN_SETUP_FAILED→noop; lease: calls after detach reached the port; load: hung 100 s; OTel: hostile OTEL_* → nothing exported; Langfuse: borrowed client shut down; fan-out: "scope down" reached caller).

## 2026-10-26T01:35Z — DONE
All 7 steps done; wide run triaged (19 failures, all ENV/pre-existing). Jini head 03cc91e0 on `cloud/prov-wave2-jini`; Tovu head on `cloud/prov-wave2-tovu` (this commit). No test processes left running.

WAVE2-FIX DONE 2026-10-26T01:35Z — wall ~1 h 13 m (00:22Z → 01:35Z), rough tokens ~0.55M.
