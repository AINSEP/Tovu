# vendor-to-plugins REPORT (lane B) — 2026-10-22, 05:37–06:45 UTC
Branch `cloud/vendor-to-plugins-2026-10-22` (Tovu, from origin/cloud/deploy-2026-10-22 1dc9a8fa), head after this report.
~35 commits (`git log --no-merges origin/cloud/deploy-2026-10-22..`). Full per-file audit tables (every hit, class, outcome):
`.cloud-coord/vendor-to-plugins-fly-table.md` (Fly + follow-ups) and `.cloud-coord/vendor-to-plugins-others-table.md`.

## What moved / changed (behaviour identical)
| area | class | outcome (commits) |
|---|---|---|
| `.github/workflows/fly-deploy.yml` | d | now RENDERED by `content/agent-plugins/fly/scripts/render-deploy-workflow.mjs` from `skills/fly/references/fly-deploy.template.yml` (`#>> tovu-host` regions) + `scripts/tovu-production.values.json`; plugin test asserts committed == render; `--check` mode. Diff vs base = comment lines only (GENERATED header + script path); same steps/flyctl commands, no snapshot step (69b5dc18) |
| `development/scripts/fly-build.sh` | a | moved to `content/agent-plugins/fly/scripts/` (no Dockerfile/package.json referenced it) (69b5dc18) |
| Fly core tests (deploy-server, deploy-config, fly-module, fly-secrets, credential-scheme, package manifest, CLI output) | a | moved to `content/agent-plugins/fly/**/__tests__/*.test.mjs` (5f23265a + follow-up) |
| 9 non-Fly vendor tests (railway, render, cloudflare-pages ×2, github-pages, netlify, s3-compatible, vercel, resend mail) | a | moved into their plugins, 261 tests, same counts (34f82b118) |
| deploy-ops/__tests__ (14 files) | a/test | neutral fixture plugin `deploy-ops/__tests__/fixtures/example-host/`; Fly/GitHub-value tests moved to fly/github plugins; 159→167 total tests (b0e47e332…155cd6860) |
| ~40 core tests using "fly" as fixture id (custom-credentials, origin, seo, source-control, identity, server, admin 10 files, CLI deploy-config) | test | switched to neutral `example-host` fixtures, counts unchanged (92a1c67c…c26f760b) |
| `BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED` | b | derived from `extensions.tovu.seededEnabled` in each vendor's plugin.json (fly, render, railway, vercel, netlify, cloudflare, github-pages, s3-compatible, resend, github); same set; core literal now only names Tovu's own skills; vendor "why seeded" notes moved to resend/github NOTES.md (58201bc4, 4291a54f) |
| ~75 core/admin comments, @examples, CLI `--base-path` help, mail-status search query | c | genericized; vendor-specific 'why' moved to plugin NOTES.md / deploy-configs/fly.mjs (2091b2bc, 721515cd, 95758c8c, b8677aab, ab1ff1a7, 07af4d7b, 04ce449f, 6d3d9290) |
| `knip.json` | — | entry globs cover plugin `scripts/` + nested `__tests__` + fixture plugins |

## Left in core, with why (details in tables)
| hit | why left |
|---|---|
| `FLY_*` env reads: trust-proxy, boot-readiness-warnings, assistant-native-fallbacks, plugin-runtime/install, local-owner-signin | runtime/security behaviour; moving needs a plugin-declared env-signal port (owner Q4) |
| `DEPLOY_CONFIG_CANDIDATE_PATHS` (publish-trust/connect.ts) | ordered multi-vendor list; derive from `tovu-deploy-configs.json` only if consult order is preserved (owner Q5) |
| retired-plugin maps, `DEPLOY_SPLIT_HOST_PLUGIN_IDS`, lifecycle cloudflare-pages supersession, migration 0013 | migration data / applied migration — must not change |
| tool-metadata search keywords naming fly etc. (pinned by deploy-vendor-baseline.json) | removing changes search behaviour; needs plugin-contributed keywords (owner Q3) |
| admin UI copy + i18n catalogs, admin `plugins/rules.ts` glyph keyword | no UI/visual change allowed |
| `deploy-ops/agent-tools.ts` "GitHub Actions" wording; github plugin `DEPLOY_WORKFLOW = "fly-deploy.yml"` | model-facing copy / cross-plugin reference (owner Q2) |
| installed-deploy-verb split-upgrade tests (4), search-discoverability "is my fly app up" (1) | cross-plugin migration check (plugins can't import each other) / depends on real catalog text |
| Dockerfile/.gitignore/.dockerignore fly.toml lines, workflows naming the real `fly-deploy.yml` | functional references to real files |
| cloudflare-dns.com DoH resolver, S3 media blob store + `TOVU_S3_*` | public resolver / generic S3 protocol, not a vendor plugin |
| remaining core tests using non-Fly vendor ids as fixtures (publish-agent-tools, static-publish/*, admin deployment/security, retire-bundled…) | not done this run — a separate mechanical pass |
| ADS-memory/, RELEASE-NOTES, .cloud-coord history | history docs |

## Tests run (node:test --test-concurrency≤2; touched areas only)
- Final sweep, 236 files (all plugin tests + agent-plugins, custom-credentials, deployments, cli deploy-config, mail, tool-search):
  3469 tests, 3460 pass, 6 skip, 3 fail → 1 real (github package "knows nothing about fly.io": a moved test fixture said
  "Deploy to Fly.io") fixed 984bf2eb; 2 = base-branch descriptor-fields/propose-credential mediaBucket pins (fixed on lane A
  branch 849d6e53, not this base).
- deploy-ops core + fly/github plugin tests: 293/293. Root `tsc -p tsconfig.json --noEmit` clean. `render-deploy-workflow --check` rc 0.
- Admin vitest: 10 touched files 426/426 before and after (maxWorkers=2).
- Pre-existing, not caused here: `check:architecture` hard constraints fail at base too; `check-hardwiring` stops on ui-ux-design import;
  `tsc -p tsconfig.tests.json` 62 errors at base-level files.

## LOCAL-RUN NEEDED
Full `npm test`, full admin vitest, typecheck:tests, Postgres suites (unify-vault-credentials-step, custom-credential-repo),
Chromium e2e journeys + 12 vendor-named visual snapshots.

## Merge note
Lane A (`cloud/fix-verify-2026-10-22`) and lane B both genericize core `mail-status.ts` (Resend) — expect a trivial conflict there
and in `tool-metadata.baseline.json`; keep either generic wording.

## Owner questions
1. OK to ship `tovu-production.values.json` + `tovu-host` template regions inside the bundled Fly plugin (reaches every workspace), or keep values in core `deploy/`?
2. github plugin hard-codes `DEPLOY_WORKFLOW = "fly-deploy.yml"` — should host plugins declare their workflow file?
3. Allow plugins to contribute search keywords so vendor names can leave core tool-metadata / deploy-vendor-baseline?
4. Move FLY_* hosted/trust-proxy detection to a plugin-declared env signal (security call)?
5. Derive `DEPLOY_CONFIG_CANDIDATE_PATHS` from plugin manifests (needs an order field)?
6. Want a follow-up pass switching remaining non-Fly vendor ids in core tests to neutral fixtures?
