PARTIAL T 5c893c6c8 J 056d7f360: built/fixed J01-J06,J08,J11,J13,J17,J18 + T01-T08(T04/T07 partial),T11,T13,T17,T18; LEFT J04-panel,J07-hooks,J09,J12,J14,J15,J16,J19,J20 and their T sheets (not built by Sol; J09/J14/J20/J04-panel need a DOM-tsconfig design first). J10/T10 out of scope.

# w3-ext-a — Opus review + test + fix of Sol round 1 (2026-11-25)

- Branches: Jini `integ/w3-ext-a-2026-11-25`, Tovu `integ/w3-ext-a-2026-11-25`, both cut from `origin/integ/merge-23-2026-11-25` (Jini 7727d518c, Tovu e51dcf470) with Sol's `codex/w3-ext-aj` 6e20bc15e / `codex/tv-w3-ext-a` 047e8de89 merged in. Both merges were conflict-free.
- Personas read: `AI-Dev-Shop/agents/code-inspection/skills.md` (no `agents/code-review/` exists; Code Inspection is the reviewer row in `framework/routing/agent-index.md`) and `AI-Dev-Shop/agents/programmer/skills.md`. Confirmed.
- Inputs: sheet `plan/whats-left-1122:plans/sheets-1125/w3-ext-a.md`; check FIX text + owner decisions `plan/sheets-check-1125:reviews/sheets-check-1125.md` (ext-a section, decisions 6–9). J10/T10 (Email) not touched.
- No subagents were used. No codebase-memory tools. `main`/`release/*`/merge-23/`codex/*` untouched; nothing published or tagged.

## Per-sheet table

| sheet | status | notes |
|---|---|---|
| J01 deployment contracts | built-by-Sol OK | `core/contracts/site/deployment-admin.ts`; `target: string` (owner decision 8). Contract mutation `M-drop-deploy-linked-peer` is caught by `tsc` (the package build compiles tests), not vitest. |
| J02 reconnect + settings feed | built-by-Sol, fixed | Telemetry bullet correctly dropped (decision 9; T02 binds `toRouteTemplate`/`createReactRootErrorHandlers`). Fixed: `receiveSettingsFrame` complexity 11 → split; test fake types. |
| J03 durable transport + routed A2UI | built-by-Sol, fixed | `generation` typed `number` contradicted core's `AdminChartProviderSnapshot.generation: string`; leaf now derives it from core (the Jini contract) so the host binds with no conversion. Stale "defaults to" doc fixed; test types fixed. |
| J04 credential hint + BYOK panel | partial: hint built-by-Sol OK; panel LEFT | Sol's G3 tsconfig change (DOM lib in `integrations`) broke ~30 media-provider files; reverted (hint is plain TS). `AdminByokKeyPanel` needs a separate DOM tsconfig for `integrations` → design. |
| J05 Placeholder + appearance | built-by-Sol OK | Two-hosts test covers `M-read-module-nav-instead-of-arg`. |
| J06 files client + deep link | built-by-Sol, fixed | Guard N2: host paths in moved comments neutralized. Test types fixed. |
| J07 skills client + hooks | partial: `api.ts` built-by-Sol (test fixed); 3 hooks LEFT | Hooks not built by Sol. |
| J08 plugin install + composer source | built-by-Sol, fixed | Security review: `expectedSha256`, `replace`, update-only `expectedOldDigest`, folder `expectedDigest` preserved byte-for-byte; crypto stays host. Test types fixed. |
| J09 webhooks | LEFT | not built; React in `integrations` needs the DOM-tsconfig design. |
| J10 mail | out of scope | NEEDS-OPUS, built separately. |
| J11 page editor port + save | built-by-Sol OK | Expected-version and partial-save witnesses pin metadata version for the body and dirty HTML. |
| J12 post chrome | LEFT | not built (10 files). |
| J13 publish-content client | built-by-Sol, fixed | Ceremony preserved (peer in path, plan omission, confirmed overwrite set echoed). Test types fixed. |
| J14 site-key | LEFT | not built; security-sensitive; `integrations` DOM-tsconfig design. |
| J15 source-control form | LEFT | not built. |
| J16 deployment shell | LEFT | not built. |
| J17 embed insert + attribute rows | built-by-Opus | `cms/react/widgets/{WidgetConfigFields/HtmlAttributeRows, EmbedInsertControl/EmbedInsertControl(.hooks)}`; everything host injected; sanitization stays host policy. Witnesses: `M-bypass-attribute-rejection` 1 red, `M-reuse-placement-id` 1 red. |
| J18 media edit + picker | built-by-Sol, fixed | Redaction stays host (`TOVU_ERROR_REDACTION_OPTIONS` passed in `pickerHostArgs`). cms export-parity test only knew `.ts` (4 old red + 3 Sol leaves) → accepts `.tsx`. |
| J19 agent presentation | LEFT | not built. |
| J20 recovery | LEFT | not built; React in `db` (node) needs the DOM-tsconfig design. |
| T01 | built-by-Sol OK | wire-parity test in Tovu as FIX moved it. |
| T02 | built-by-Sol OK | |
| T03 | fixed + built-by-Opus | Durable subscription bound by Sol. Opus bound the routed card at `use-dock-renderer-registry.hooks.ts` (real card, translator, route hook, chart context, CSS import), removed the local view, repointed 5 tests + comments. |
| T04 | partial built-by-Opus | `lib/credential-copy.ts` is a binder over Jini `storedCredentialHint` + `@jini-ai/admin/security` `credentialDraftError` (CredentialInputError-only describer; unknown errors rethrow). Witness `M-trim-secret-before-validation` 1 red. BYOK mounts LEFT with J04 panel. |
| T05 | built-by-Sol OK | |
| T06 | built-by-Sol OK | |
| T07 | partial built-by-Opus | `features/skills/api.ts` bound to `createSkillsApi` (event, guidance wording, positional `installSkill` stay host). Hook mounts LEFT with J07. |
| T08 | built-by-Sol OK | |
| T09 | LEFT | needs J09. |
| T11 | built-by-Sol OK | |
| T12 | LEFT | needs J12. |
| T13 | built-by-Sol OK | |
| T14 / T15 / T16 | LEFT | need J14 / J15 / J16. |
| T17 | built-by-Opus | `HtmlAttributeRows.tsx` and `EmbedInsertControl.{tsx,hooks.tsx}` are now host mounts (policy, kit, widget hooks, dialogs, placement id); caller/test signatures unchanged; stale literal-copy pin dropped. |
| T18 | built-by-Sol OK | |
| T19 / T20 | LEFT | need J19 / J20. |

Review depth: every Sol Jini production file was read against its sheet for the security-bearing sheets (J02 retry rule, J04, J08, J13, J18 redaction); the rest were checked by diff skim, lint caps (complexity/cognitive ≤ 10, function ≤ 80 lines on all new Jini files: 0 errors after the J02 fix), `pnpm guard`, host-word grep (0 hits for `tovu|open design|OD_`), and the test runs below.

## Tests run

| command | result | new vs old |
|---|---|---|
| Jini `pnpm install --frozen-lockfile` | failed on Sol's tree → lockfile refreshed | NEW (fixed) |
| Jini `pnpm -r --no-bail build` | 0 errors in touched packages after fixes; `user-management` 4 TS errors in an untouched test | user-management OLD |
| Jini `pnpm -r --no-bail typecheck` + scripts tsc | only `examples/notes-app` 6 + `user-management` 4 (`ActorIdentityInput`, untouched); scripts 0 | OLD |
| Jini `pnpm guard` | 2 N2 violations on Sol's tree → 0 | NEW (fixed) |
| Jini core tests | 3217 pass, 3 fail (`provider-neutral.test.ts`) | OLD (same 3 on merge-23 worktree) |
| Jini admin tests | 6469 pass, 2 fail (`theme-boundaries`, `AlwaysAllowPanel`) | OLD (same on merge-23) |
| Jini agentic / agent-plugins / plugins / integrations / chat | 1238 / 2495 / 1104 / 2306 / 4774 pass, 0 fail | — |
| Jini cms tests | 8805 pass, 10 fail; then export-parity fixed (→ 9) | 9 OLD (same on merge-23); 1 fixed |
| Jini cms widgets (J17 witnesses) | 3 pass; both mutations red | — |
| Tovu root `npm run typecheck` (incl. e2e) | 0 errors | — |
| Tovu admin `tsc --noEmit` | 0 errors | — |
| Tovu `typecheck:tests` | 740 errors, all `apps/website` tests | OLD (identical set on merge-23 worktree) |
| Tovu admin vitest (full, 805 files) | 12813 pass, 22 fail in 11 files | OLD (same 22 on merge-23 worktree) |
| Tovu admin targeted after Opus binds | T03 76/76; T04 29/29; T04/T07/AssistantDock/security/source-control 1933/1933; T17 34 files 892/892 | — |

Baselines: `/home/user/wt/tovu-base` and `/home/user/wt/jini-base` worktrees of merge-23 (node_modules linked to the integ install; Tovu linked to the integ Jini build — Sol's Jini delta is additive, so a red there is old).

Setup notes: Tovu `npm ci` needed `npx npm@11.6.2 ci --ignore-scripts --legacy-peer-deps` (ERESOLVE on `@ag-ui/core` peerOptional), then `link:jini` and a hand build of `packages/{contracts,sdk}`.

## Bugs found (all logged in Tovu `development/open-bugs.md`, section "w3-ext-a integration review")

1. `ext-a-lockfile-stale` — FIXED (Jini 3ade2e1b8).
2. `ext-a-tests-break-build` — Sol's tests broke 6 package builds — FIXED (b471ca6d4).
3. `ext-a-integrations-dom-lib` — G3 recipe broke `integrations` typing — FIXED (reverted); OPEN design for React views in node packages.
4. `ext-a-chart-generation-type` — FIXED (Jini 61385765f, Tovu 63fb35582).
5. `ext-a-settings-frame-complexity` — FIXED (89117d3d3).
6. `ext-a-guard-host-paths` — FIXED (6cbb14076).
7. `ext-a-cms-export-tsx-parity` — FIXED (fad1def50; 4 of its reds were old).
8. `ext-a-host-words-in-comments` — open (comment-only, guard-clean).
9. `ext-a-integrations-react-dom-peer` — open (harmless).
10. `ext-a-contract-mutation-typecheck-only` — noted.
11. `merge23-env-npm-ci` — open (environment).
12. Pre-existing reds listed above — open, not caused here.

## FILES LEFT

Planner count against the sheet's 67 sheeted files: 26 moved (J01 3, J02 2, J03 2, J04 1, J05 2, J06 2, J07 1, J08 3, J11 2, J13 2, J17 3, J18 3) + 1 bound to existing Jini code (browser-telemetry, decision 9) = 27 done; 4 out of scope (J10); **36 left**: J04 1 (AdminByokKeyPanel), J07 3, J09 5, J12 10, J14 4, J15 4, J16 6, J19 2, J20 1.
Needs a design before building: a DOM/JSX tsconfig split for `integrations` and `db` React leaves (J04 panel, J09, J14, J20) — the G3 "add DOM lib" recipe breaks undici typing in `integrations`.
