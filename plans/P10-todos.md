# P10 · Remaining todos (triage groups 3, 4, 5, 6, 8, 10, 11, 12, 13; group 7 as questions)

**Bases:** Tovu `41e948ee4`, Jini `6b8e0d48a`. `W/` = Tovu `apps/website/src/`, `A/` = Tovu `apps/admin/src/`, `J/` = Jini `packages/`. Source: `inputs/todos-triage.md` "OPEN, grouped for planning"; text in Tovu `development/todos.md` (2351 lines on base — the triage's line refs are from an older copy; sections are named below instead).
**Owner (11-21 ~9:05 PM):** do all needed todos via plan → Codex review → Opus implement; **skip production email** (needs Resend); the old Master Build Inventory stays parked. Group 1 (extraction) is P9 (separate run); group 2 (protocols) is P6.
**Owner rules:** as in P1 (simple; plain words; hooks as props; args rule and pads untouched; 50/80; complexity ≤ 10; keep why-comments; Jini vendor/framework-neutral; nothing above domains; every agent CLI).

## Group 3 · Observability (approved 11-14) — M
State: `ObservabilityPort` with DB/outbound/agent-run spans exists (todos "Observability (OpenTelemetry)", partly done 10-04); Jini `J/provider-plugins/src/observability-opentelemetry/otel-port.ts` already emits `gen_ai.*` on agent-run spans; P4 brings `runOperation` and `http.route`/`tool.call`/`ipc.handle` operations. Admin client timings and Web Vitals were **skipped by the owner (10-04, legal)**.
- **P10-O1 · Tovu · operations at publish, deploy, import (~1.5 h; after the P4 Jini release).** Wrap the three entry points in `runOperation` with operations `content.publish`, `site.deploy`, `site.import` and bounded attributes (destination kind, provider id — never URLs or names): `W/features/publish-content/publish-tool.ts` (`publishContentFromTool`), `W/features/deployments/deploy-ops/*` execute path, `W/features/site-backup/import-backend.ts` admission. Tests: `one operation per publish with outcome completed/failed/refused`; mutation: open a second tracker.
- **P10-O2 · Jini · counters (~1.5 h).** `tool.failures` counter (labels: `kind` internal|input|refused) in `withToolCallObservability`, and `outbox.queue_depth` gauge read by the outbox worker loop; `gen_ai.usage.input_tokens`/`output_tokens`/cost attributes confirmed on the agent-run span (add if absent). Tests: recording observability sees one counter per failure, gauge after enqueue/drain. Mutation: count refusals as internal.
- **P10-O3 · Jini · browser adapter, off by default (~1.5 h).** A browser `ObservabilityPort` adapter in `provider-plugins` that is **disabled unless the host turns it on**, and never records before visitor consent. Tests: `default config sends nothing`; `with consent off nothing is sent`. Owner question G7-9.
- **P10-O4 · Tovu · outbox worker trace (~0.5 h, test-only).** Prove an outbox event's handler span is a child of the producing request's trace (or linked). If red → small fix in the worker's context propagation.

## Group 4 · Bug-class sweeps — M (each step: run the existing audit, fix what it finds, add one witness per class)
Tool: `development/scripts/bug-class-audit.mjs` (exists).
- **P10-S1 · Tovu · silent truncation via list cursors (~2 h):** newsletter list tools (also NOT-CHECKED B179), saved keys lists (B123), visitor assistant lists, members (B209). Each list tool/route returns `nextCursor` or says "showing N of M". Witness per list: 101 rows → nothing silently dropped.
- **P10-S2 · Tovu · lost-update stages after S1 (~2 h):** apply the `expectedVersion` CAS pattern to the remaining `0042` tables found in P8-T2's C058 STOP list and to identity login (B262 if P8-V confirms). Witness: two same-basis writers, second refused.
- **P10-S3 · Tovu · abort-before-write (~1.5 h):** every paid/external call checks `signal` before the call and passes it into it (pattern of P8-T10's B206/B141). Witness per site found.
- **P10-S4 · Tovu · `$`-replace codemod + fix the audit check (~1 h):** replace `str.replace(x, userValue)` with the function form where the replacement is not a literal; fix the audit rule to flag only non-literal replacements. Witness: a `$&` in a user value round-trips.
- **P10-S5 · Tovu · translations (~1.5 h):** ChatFab `hi`/`ur`/`bn` and empty keys; run the hygiene missing-keys report (also A106). Witness: dictionary completeness test for those locales.
- **P10-S6 · Jini · stale `source-map.md` comments + ui a11y menus/palette (~2 h):** fix stale references; `RowMenu`/command palette arrow keys, Escape returns focus (same rules as P1-J3). Witness per component.
- **P10-S7 · both · Knip dead-code pass + duplication re-measure (~2 h):** remove only what Knip proves unused **and** no test references; report duplication numbers (no forced dedupe). Test counts before/after recorded.

## Group 5 · Env schema (one per repo) + overlapping env names — M
- **P10-E1 · Jini (~1.5 h):** `J/core/src/config/env-schema.ts` `defineEnvSchema({ vars }, _optional = {})` (plain object of name → `{ description, parse }`; no vendor, no zod requirement in core) + `readEnv({ schema, env })` returning typed values and one plain error listing every bad variable ("TOVU_PORT must be a number between 1 and 65535."). Guard HW9 (env reads, 70 today) points at the schema: a new `process.env.X` outside a schema fails `pnpm guard`.
- **P10-E2 · Tovu (~2 h):** `W/server/runtime/configuration/env-schema.ts` declares every variable the website/desktop read; boot parses once; `development/scripts/check-env-schema.mjs` (+ `check:env`) fails on an undeclared read. Overlapping names: list pairs that mean the same thing (e.g. Jini and Tovu names for the same port/dir) and keep **one** name, reading the old one with a deprecation log (owner 11-21 "read old, write new" pattern). Witness: `an undeclared env read fails the check`; `a bad value stops boot with the plain message`. Note: the owner's "remove Tovu from Jini" rename (P9) renames `TOVU_*` names in Jini — coordinate with P9; do not rename here.

## Group 6 · Media — S–M
State: video accept `A/features/media/rules.ts:373` `"video/mp4,video/webm"`; Jini `J/cms/src/media/file-extension.ts:4` maps only mp4/webm; Library `A/features/library/rules.ts:23` `LIBRARY_MAX_BYTES = 10 MiB`; Media/upload `TOVU_MAX_UPLOAD_BYTES` = Jini `MAX_DOCUMENT_BYTES` (`W/contracts/core/upload-limits.ts:7`). Owner 10-31: keep a `.mov` as-is when ≤ 50 MB; transcode only over 50 MB; small HEVC files show a "may not play in Chrome" note.
- **P10-M1 · Jini (~1 h):** accept `video/quicktime` (`.mov`) and `video/x-m4v` (`.m4v`) in cms media; export one `MEDIA_MAX_UPLOAD_BYTES` (50 MiB) as the single limit. Tests: upload a `.mov` fixture; over-limit message names the limit.
- **P10-M2 · Tovu (~1.5 h):** Library, Media, chat attachments and assistant imports all use the one limit; error words "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it."; `.mov`/`.m4v` in the accept list; HEVC note on the media card ("This video may not play in Chrome."). i18n: those two strings, all admin locales.
- **P10-M3 · Jini + Tovu · transcode over 50 MB (~2 h each):** Jini `MediaTranscoderPort` (`transcode({ input, target: 'mp4-h264-aac-faststart' })`), no ffmpeg in core; a provider plugin (`agent-plugins/ffmpeg-transcode`) that uses a local `ffmpeg` binary when present; Tovu media tool `media_convert_video` behind the approval policy, keeps the original. STOP if no ffmpeg is available on the desktop — the tool then says "Video conversion needs ffmpeg on this computer." (owner question G7-10 about bundling it).
- **P10-M4 · Tovu · media grid cursor paging (~1.5 h)** (Performance I): Media grid loads by cursor pages instead of the full list; witness with 500 items.
- **P10-M5 · Tovu · description field for search (~1.5 h)** (todos "Whenever an agent creates, imports or sees an image, it also writes a plain-language description"): optional `description` on media, written by media tools when the agent sees an image, indexed by site search. Witness: search finds an image by its description.

## Group 8 · Verification passes (Opus + Chrome on the owner's localhost; no code unless a check fails)
1. Cookie-consent thorough test (consent on/off, theme overrides, embeds). 2. Attachment preview modal. 3. AssistantDock save-failure toast. 4. Gemini chat re-check. 5. Tool-call screenshot deadline / Chrome tab collisions. Each produces a short pass/fail note; a fail becomes a P8-style step.

## Group 10 · Update a deployed site from production — L (contract-first)
State: `deployment_ops` tools exist (`W/features/deployments/deploy-ops/agent-tools.ts`); nothing compares versions or updates in place (todos "NEEDED … update a deployed site").
- **P10-U1 · Jini · contract (~1.5 h):** in `J/deploy`: `SiteUpdatePort` — `checkForUpdate({ runningVersion }) → { latest, notes } | null`, `planUpdate`, `applyUpdate({ plan, backupId })`, `verifyUpdate`, `rollback({ to })`; plain status values. Types + a fake adapter + contract tests only.
- **P10-U2 · Tovu · "Update available" (~1.5 h):** admin notice + `site_update_check` tool comparing the running version with the latest release (GitHub release of Tovu). Never auto-updates.
- **P10-U3 · Tovu · update flow (~2 h):** one approval card → backup (site-backup) → migration readiness gate → bump + platform deploy via existing deploy adapters → wait → check the live site → show what changed; on failure roll back to the kept previous version. Witness with a fake platform: failed readiness → no deploy; failed live check → rollback.
- **P10-U4 · Tovu · desktop and self-hosted path (~2 h):** same port with a local adapter (desktop: app update + site migrate; self-hosted: image tag bump). Owner question G7-11.

## Group 11 · Agent-capability hardening — S–M
- **P10-H1 · Jini · output-schema validation (~1.5 h):** tool descriptors may declare `outputSchema`; the executor validates results in dev/test and logs (not fails) in production first. Witness: a tool returning a wrong shape is caught.
- **P10-H2 · both · actor kind on every mutation/outbox event (~2 h):** `actor: { id, kind: 'user' | 'agent' | 'system' }` on change sets and outbox envelopes; agent runs stamp `agent`. Witness: an assistant edit's change set and event say `agent`.
- **P10-H3 · Tovu · read-only two-sided conformance test (~1 h):** a read-only principal neither sees nor can invoke write tools (CLI and BYOK catalogs).
- **P10-H4 · Tovu · kill-switch completeness test (~1 h):** turning the assistant off stops artifacts it created (routines from P3, scheduled jobs, webhooks it registered), not only new calls.
- **P10-H5 · Jini · per-principal discriminator (~1.5 h):** tool discovery cache keys include principal + permission version; the entity discriminator is an enum per principal.
- **P10-H6 · Jini · event-handler idempotency policy (~1 h):** document + enforce that outbox handlers take an idempotency key; witness: duplicate delivery applies once.

## Group 12 · Per-CLI folders + xAI to a provider plugin — M
State: `J/agent-runtime/src/defs/` mixes `<cli>.ts` files with `<cli>/` folders (`antigravity/` has `index.ts`; `claude/`, `gemini/` have helpers beside a top-level `claude.ts`; `gemini.ts` absent). xAI: built-in `grok` entries in `J/integrations/src/media-providers/providers.ts:52,102`.
- **P10-C1 · Jini (~2 h, mechanical):** move each `<cli>.ts` to `<cli>/index.ts` (antigravity pattern); `defs/index.ts` imports updated; no behaviour change; API baseline unchanged (internal paths). Witness: existing defs tests unchanged in count and green.
- **P10-C2 · Jini + Tovu (~2 h):** move the xAI (`grok`) media provider entries into a provider plugin package, like other plugin-vendor media keys; saved `grok` keys keep working (read old id, write new). STOP: the todos K section text for "xAI to a provider plugin" was not found by line number on base — confirm scope (media only, or also an xAI chat/BYOK provider) before starting.

## Group 13 · End of refactor (owner: last) — L
Coverage plan is **P7-C**. Also: 10% test-quality sample (second Opus reads a random 10% of tests for hollow assertions); Stryker scale-up per package after coverage; property/fuzz tests on parsers (`html` region scanner, schedule parser, import manifest reader, AG-UI SSE parser); performance budgets (admin bundle size, first response, media grid) as CI checks with current values as the baseline.

## Group 7 · Owner decision batch (questions + recommendations only)
1. New-site password flow: **recommend** keep desktop default as is (owner: B213 not a bug); server sites ask for a password at setup.
2. Dev CORS outside dev: **recommend** off outside dev, explicit allow-list only.
3. Menu-widget HTML mode permissions: **recommend** require `pages.edit_html` (same as page HTML).
4. Trash retention 60 → 30 days? **Recommend 30** (matches import history).
5. Q-M2: **recommend** decide with the media plan above (P10-M2 one limit).
6. Sent-email 30-day delete: **recommend yes**. 7. Test-email auto-delete: **recommend yes, after 7 days**.
8. Cached pre-consent pages: **recommend** never cache pages rendered before consent with tracking scripts.
9. Captions for video/audio: **recommend** optional caption file on media, rendered when present.
10. 4 catch-await handlers: **recommend** fix them in P4-T4 sheet O.
11. Keep the `<<SUBAGENT_DISPATCH>>` prompt prefix? **Recommend** only when the site folder has AI-Dev-Shop `AGENTS.md` (P8 question 2).
12. Theme `/` layout design questions: **recommend** park until the owner designs it.
13. Tool page-tagging post-save pass: **recommend** run it only on owner request.
14. Browser observability adapter (P10-O3) and bundling ffmpeg (P10-M3): **recommend** both off/not bundled by default.

**combine-12 Tovu decisions 1–3, 5** (also in P7): 1 refactor the gate debt (P7-T1…T3); 2 keep howto2's wording; 3 confirm tv-bugs3b product choices; 5 repoint `site-plugin-directories.test.mjs` to `site-paths.ts`'s `pluginsInstallDir`.

## Dependencies / batches
- Jini first where marked (P10-O2, O3, S6, E1, M1, M3-J, U1, H1, H5, H6, C1, C2-J).
- P10-O1 after the P4 Jini release. P10-S2 after P8-T2. P10-H4 after P3. P10-E2 coordinate with P9's env renames.
- Parallel batches: {O2, O3, E1, M1, C1, H1} Jini; {S1, S3, S4, S5, M2, M4, M5, H3} Tovu; then {O1, O4, S2, E2, M3, U1→U2→U3→U4, H2, H4, H5, H6, C2, S6, S7}.

## Estimate
~55 implementer-hours across ~40 steps (group 13 excluded; see P7-C).
