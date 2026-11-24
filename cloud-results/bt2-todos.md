PARTIAL a2e00ac4d e4966cb84: left = WAIT-M19 wiring/patches (site-update + H5 mounts, mail_clear_captured patch, .mov URL import, media description, G7-1/4/9/11, A212, B224, 108 rest, G8.3, H4 schema columns, api:update) + merge-19 not merged (no combine-19.md yet); NEEDS-OWNER release-feed URL; xAI provider-plugin move needs design

# bt2-todos — deferred TODOs (AFTER-COMBINE / AFTER-MERGE / owner-decided) — 2026-11-24

- **Branches:** Tovu `codex/bt2-todos-tovu`, Jini `codex/bt2-todos-jini`, both from `origin/integ/merge-18-2026-11-24` (Tovu `8e00664eb`, Jini `57aa0b9b7`).
- **Programmer skills:** I read `AI-Dev-Shop/agents/programmer/skills.md` (v1.7.5, 2026-11-05) before dispatching, and every worker brief told the worker to follow its Workflow and Guardrails. That meant red first, a named mutation, an architecture check per diff, and fresh evidence before claiming done.
- **Setup:**
  - Jini: `pnpm install --frozen-lockfile` + `pnpm -r build` (exit 0).
  - Tovu: `npm ci --ignore-scripts` fails under the container's Node 22 / npm 10. The `@tovu/contracts` prepare builds against the registry Jini 0.7.3-next.2, which has no `extraPatterns`. `npx npm@11 ci --ignore-scripts` works for root, admin and desktop. After that I ran `link-jini.mjs` (with `JINI_PACKAGES_DIR=/home/user/Jini/packages`), built contracts, and ran `prepare-desktop-hooks.mjs` (hooksPath `apps/desktop/scripts/hooks`).
- **Sources:**
  - `cloud-results/todos-a.md` and `todos-b.md` (on `origin/codex/todos-{a,b}-tovu`).
  - `cloud-results/bt-dec-b.md`.
  - `origin/plan/whats-left-1122:plans/owner-decisions-1123-bugs-todos.md`.
- **Key finding:** `codex/todos-a-*` and `codex/todos-b-*` were **never merged** (combine-17b/18: "not taken"). The Jini halves those rows depend on were missing from the base, so this run ported them first:
  - .mov sniffing, video conversion, the processed-event guard
  - J-DESC, which was reverted (see below)
- The Tovu halves still not on any integ branch:
  - todos-a `cf77668a7` (admin 50 MB single limit + .mov picker)
  - todos-a `9eaafa36b` (publish carries description)
  - todos-b `c3c6626c7` (change_sets actor_kind, P10-H2)
- **AVOID:** files changed on `origin/codex/w5-{content,admin,runtime-assistant}-*` against their merge-base with merge-18 (Tovu 2,278 paths, Jini 1,112). No AVOID file was edited. Every item that needs one is WAIT-M19 below, with the exact file and change.
- **Model use:**
  - Opus coordinated.
  - Opus-high workers for the data-deletion and security items only (mail retention + clear-all, the kill-switch, the clear-all tool).
  - Every other worker was Sonnet high.

## Items

| id | status | commit | test |
|---|---|---|---|
| 102 rest · .mov/.m4v in Jini cms (prereq, todos-a `9aea2fc70`) | DONE | J `848323076` | cms `content-type-sniffer.test.ts`, `media-service.test.ts` «uploadMedia accepts .mov and .m4v originals as-is» (red: src reverted → 2 fail) |
| 102 rest · backup archive extension map | DONE (the map is in Jini, not Tovu) | J `584899361` | devops `backup/site/__tests__/archive-media.test.ts` «keeps the .mov and .m4v extensions…» (red: `outro.bin`; mutation: drop m4v → red). Tovu archive-media importers 22/22 |
| 102 rest · assistant URL import allow-list | WAIT-M19 | T `363a8df97` then reverted in `ac8498e86` | The shared allow-list also drives the refusal message pinned at AVOID `media-import/__tests__/import-local-file.test.ts:292`. Re-apply `363a8df97` together with that string |
| 104 transcode on import | Jini DONE (todos-a `e2fbab44b` ported) / Tovu hook WAIT-M19 | J `9881dfeef` | `video-transcode.test.ts`, `video-transcode.ffmpeg.test.ts` (real ffmpeg ran), `convert-video-tool.test.ts`. The Tovu hook needs `routes/media/upload.ts` + `features/media/*` (AVOID) |
| 107 assistant conversion tool | Jini DONE / Tovu registration WAIT-M19 | J `9881dfeef` | «media_convert_video is present with a transcoder and asks the owner for approval» (mutation: drop approval → red). Needs AVOID `features/media/tool-registrations.ts` |
| 108 rest · one size limit (composer, Library, server) | WAIT-M19 | – | Every file is AVOID: AssistantDock composer, `use-library.hooks.ts`, `Library.tsx`, `routes/media/upload.ts`. The todos-a Tovu half `cf77668a7` was never merged |
| 866 media description | WAIT-M19 | J `a38a264c9` then reverted in `abdad7622` | Tovu `publish-content.ts` `MEDIA_FIELDS: Record<keyof MediaRecord,…>` (AVOID) needs `description`, even when optional. Also Jini `cms/media/list-page.ts` (AVOID) search haystack. Then re-pick `a38a264c9` |
| 112 / U2 «Update available» · `site_update_check` | DONE (tool); admin notice PARTIAL; wiring WAIT-M19 | T `2be36f1f5` | `features/site-update/__tests__/check-tool.test.ts` 6/6 (mutation: drop notes → red) |
| 113 / U3 one-click update behind approval | DONE (tool) | T `c326f1779` | `apply-tool.test.ts` 11/11: «cancel: nothing is applied», «a version other than the one on offer is refused…» (mutations: no card → 4 red; approval names 0.0.0 → 4 red) |
| 122 desktop + self-hosted same path (owner YES) | DONE | T `1afdde660` | `host-runtime.test.ts` 6/6: both host kinds go through the same card; «nothing is automatic» (mutation: self-hosted not routed → red) |
| site-update wiring | WAIT-M19 | – | `contracts/core/tool-metadata/index.ts` (+ `site_update`), `composition/tool-catalog-manifest.ts` (register `contributeSiteUpdateTools()`), host composition passes `createSiteUpdateRuntime({host, shared})`. Then run `mcp-ui-allowlist-completeness`. Still to write: the real `SiteBackupPort` + `MigrationReadinessPort` adapters |
| release-feed adapter | UNVERIFIABLE-IN-CLOUD / NEEDS-OWNER | – | Which feed URL per host kind? Today only desktop auto-update points at GitHub releases (`apps/desktop/electron-builder.yml:147`). `ReleaseFeedPort` stays injected |
| G11·P10-H6 handler idempotency export | DONE | J `6aaf998d6` | infra `outbox/__tests__/processed-event-guard.export.test.ts` «reachable from the outbox entry» (red: not a constructor; mutations: drop release → 2 red, drop export → red). `packages/infra/README.md` pointer line WAIT-M19 |
| G11·P10-H5 per-principal catalog | Jini DONE; Tovu factory DONE; mount WAIT-M19 | J `bfbe821c2`; T `8b39f0244`, `a2e00ac4d` | J `daemon/src/http/__tests__/tool-catalog-principal.test.ts` (3/3 red→green; mutations: fixed principal → red, cached view → red). T `assistant/__tests__/tool-catalog-principal-scope.test.ts` 3/3 (mutation: drop filter → 3 red). Mount: AVOID `server/inbound/assistant/agent-daemon-scope-http.ts:255-261` + test helper `__tests__/helpers/daemon-catalog.ts`. J `route-table.ts` `gatedJsonRoute` generalisation also WAIT-M19 |
| G11·P10-H4 kill-switch · webhooks (owner YES) | DONE | T `a80c5f1db` | `composition/__tests__/webhook-delivery-worker.agent-pause.test.ts` 3/3: «assistant off: agent-created … held, person-created … still go out», «adversarial: pausing deletes and disables nothing…» (red 2/3; mutations: always-on → 2 red, missing = off → red). The creator was already recorded (STALE part) |
| H4 · scheduled sends / scheduled publishes / API keys | WAIT-M19 | – | Each needs a `created_by_kind` column in AVOID `schema.sqlite.ts` (+ newsletter `send-pipeline.ts`/`tool-registrations.ts`, `contracts/core/scheduled-publish.ts`). No agent tool creates API keys today |
| H4 · resume through the approval card | PARTIAL | – | Held deliveries resume when the switch is turned back on (env + restart), not through a card. Plan: resume-approved flag (schema, WAIT-M19), `isAgentEnabled = on && approved`, `approvalToolHandler` card listing held items |
| G7-6 / 847 sent-email records 30 d (owner YES) | DONE (30 d already; boundary + injection fixed) | J `f4d1d64e9`, T `a5b8b0d1c` | `features/mail/__tests__/capture-clear-retention.dialects.test.ts` «exactly 30 days old are kept, 30 days + 1 ms are deleted» (sqlite + pglite; mutation `<=` → red) |
| G7-7 / 848 captured test emails 7 d (owner YES) | DONE (was 24 h) | J `f4d1d64e9`, T `a5b8b0d1c` | same file, «exactly 7 days old are kept…» (mutation: back to 24 h → red); «injected windows… other workspaces and tables are untouched» |
| clear all · server route behind confirm | DONE | J `f4d1d64e9`, `fc5d5108f` (preview carries its revision); T `a5b8b0d1c` | «unconfirmed deletes nothing; confirmed deletes only this workspace's captured test emails», «without the owner permission is refused before anything is read or deleted» (mutations: drop workspace filter → red; no confirmation → red) |
| clear all · admin confirm card | DONE | J `fc5d5108f`, `a793d532a`, `82a7af668`; T `de047ccb0` | J `screens/email/__tests__/use-capture-clear-flow.unit.test.ts` 12; T `EmailCaptureClear.unit.test.tsx` 10, `email-api.unit.test.ts`. Covers the hidden-without-permission, checking, empty, stale, error and success states; 21 locales |
| clear all · assistant tool `mail_clear_captured` | WAIT-M19 (held as patches) | J `e1838e3e2` reverted in `360503bd0`; patches `cloud-results/bt2-todos/clear-captured-tool-{jini,tovu}.patch` | `mail-status/__tests__/clear-captured-tool.dialects.test.ts` 8/8 (mutation: drop stale check → red). Needs the `BATCH_OPT_OUT` line in AVOID `assistant/batch-tool-inputs.ts`, else the batch guard turns red |
| C026 vendor names → plugin manifests (A) | DONE | T `da6e511d6` | `admin-surfaces/__tests__/unit/public-config.unit.test.ts` 3 (mutation: ignore manifest names → red) |
| C026 (B) clientNamespace from manifest | DONE | J `0911c22c3`; T `cdb3085cd` | J `portable-metadata.unit.test.ts`; T `api-connections/__tests__/contribution.unit.test.ts` + `bundled-client-namespace.unit.test.ts` (mutation: ignore resolver → 3 red); digests 14/14 |
| C026 guard | UNVERIFIABLE (base red) | – | `vendor-neutrality.test.ts` is red on base (ENOENT stale seam `apps/admin/.../agent-plugin-surfaces-port.hooks.ts`), so its hit list cannot be read. contribution.ts no longer contains vendor vocabulary |
| A310 why-comment | DONE | T `802a43f23` | comment only; `check-why-comments` ok |
| G7-2 inject dev CORS (optional) | DONE | T `9c798cf5f` | `composition/__tests__/app.dev-cors-injection.test.ts` (mutation → red) |
| B258 desktop `redactTovuLocalText` | STALE | – | All 5 named files already call `redactTovuLocalText`; pinned by `apps/desktop/src/redactor-bindings.test.ts` |
| A287 / B258 `pnpm api:update` | WAIT-M19 | – | `api-baseline/*.json` are AVOID. This run's cms/devops/infra/daemon/agent-plugins additions also need `api:update` |
| B224 widget slug → id at write | WAIT-M19 | – | AVOID `features/pages/html-document-store{,.memory}.ts` |
| A212 big agent video via local file import | WAIT-M19 | – | AVOID `features/media/tool-registrations.ts` (`.map(withLargeUploadRouting)`) |
| xAI media entries → provider plugin | PARTIAL / NEEDS-DESIGN | – | The old id is already read: `MEDIA_PROVIDER_ID_ALIASES['xai-grok-imagine']='grok'` (`integrations/src/media-providers/providers.ts:31`), so writes use `grok`. provider-plugins has no media precedent. Plan: `provider-plugins/src/media-xai/` + register through `dispatch/media-provider-registry.ts`. Open question: should integrations depend on provider-plugins, or should the registry take entries by injection (recommended)? |
| G7-1 new-site password wiring | WAIT-M19 | – | AVOID `composition/site-deps/identity-settings.ts` (+ `identity/wiring.ts` call) |
| G7-4 trash retention 30 d | WAIT-M19 | – | Apply both `cloud-results/bt-dec-b/g7-4-*.patch` together; AVOID `apps/admin/src/features/trash/Trash.tsx` |
| G7-9 captions | WAIT-M19 | – | AVOID `schema.sqlite.ts` + `features/media/publish-content.ts` |
| G7-11 `<<SUBAGENT_DISPATCH>>` call site | WAIT-M19 | – | AVOID `agent-daemon-run-start.ts:378` |
| G8.3 AssistantDock save failure toast | WAIT-M19 | – | AVOID `local-cli-selection.hooks.ts`, `AssistantDock.state.hooks.ts` |
| G12·P10-C1 defs shells | DONE | J `f677fdec5` (+ the 4 deletions landed in `fc5d5108f`, swept in by a concurrent commit; content correct) | `src/defs` 631/631 before/after |
| G12·P10-C1 defs/<cli>/index.ts move | DONE (22 CLIs) | J `e96650c4d`, `978d68748`, `e4966cb84` | 631/631 before/after; ratchets repointed with identical counts; guard output identical. `docs/spec/api.spec.md:360` link WAIT-M19 |
| Owner YES bug items (B229 site-delete appData, B176, visitor chat dedupe, A452) | not in this lane | – | Bug lane `codex/bt2-bugs-*` |

## Gates (no new red vs base)
- **Jini:**
  - `pnpm -r build` ok, and each touched package was rebuilt.
  - `pnpm typecheck` exit 0, after C1.
  - `pnpm guard`: one violation, already on base (`HW3-module-state packages/admin/src/shell/lib/shell-failure-log.ts`). Debt warnings unchanged.
  - Changed vitest files are green.
- **Tovu:**
  - Root `tsc -p tsconfig.json --noEmit`: 0 errors.
  - Admin `tsc --noEmit`: 0 errors.
  - Changed node and vitest files plus importers are green.
  - Known base red, not ours:
    - `vendor-neutrality.test.ts` (ENOENT)
    - `bundled-automatic-relevance` / `bundled-deploy-package` (the jini/ vs tovu/ publisher identity listed in combine-18)
    - 2 webhook-worker tests also red on the unmodified tree
  - `apps/desktop` was not touched, so desktop gates were not needed (the pre-push hook skipped them).

## Merge-19
- At report time, `origin/integ/merge-19-2026-11-24` existed but had no `cloud-results/combine-19.md`. Its DONE/PARTIAL precondition was not met, so it was **not merged**, and the WAIT-M19 rows above stay open.
- Order to apply after merge-19:
  1. The site-update and H5 one-line wirings.
  2. Both `clear-captured-tool` patches.
  3. Re-pick `363a8df97` with the message pin.
  4. Re-pick `a38a264c9` with `MEDIA_FIELDS` + list-page.
  5. Both G7-4 patches.
  6. The schema columns for H4.
  7. `pnpm api:update`.
