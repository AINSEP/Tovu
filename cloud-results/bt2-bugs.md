PARTIAL 30aadbe78 3fb9648dd: left = the WAIT-M19 rows (merge-19 has no `combine-19.md` yet, so it was not merged in), the NEEDS-OWNER questions and B262 (its Jini half sits on unmerged `codex/bugs-low-b-jini`)

# bt2-bugs — deferred bugs after combine-18 (2026-11-24)

**Base.** Tovu and Jini `origin/integ/merge-18-2026-11-24`.
**Branches.** Tovu `codex/bt2-bugs-tovu` and Jini `codex/bt2-bugs-jini`. Both are pushed, with 22 Tovu commits (this report is on top) and 17 Jini commits.

**Run.** Opus coordinated. Eleven Sonnet high-effort workers did the fixes, at most 4 at a time. No Opus subagent was needed. Programmer rules come from `AI-Dev-Shop/agents/programmer/skills.md` v1.7.5, which was read and its rules applied: root cause first, failing test first, minimum change, injected dependencies, plain-words errors, and verification before claiming a fix. Every worker brief carried them.

**Sources.**
- The AFTER-COMBINE/AFTER-MERGE rows of `bugs-low-a.md` and `bugs-low-b.md`.
- The still-open entries in `development/open-bugs.md`.
- combine-18 item 6 (bt FIX 7, 15 and 17).
- B229.

**Avoid list.** Every file touched by a commit on `origin/codex/w5-{content,admin,runtime-assistant}-{tovu,jini}` that is not in merge-18: 2,658 Tovu files and 1,126 Jini files.

**Important for merging.** `codex/bugs-low-a-*` and `codex/bugs-low-b-*` are **not merged into merge-18**. Their own FIXED commits (for example B262 Jini `ad0f462d0`, B136/B137 parts and A196 `116d86b69`) are not on this base. A196 was re-done here in Jini `b33f4aede`; expect a small overlap with low-a in `ToolCard.tsx` when those lanes land.

## Results

| id | severity | status | commit | test |
|---|---|---|---|---|
| B236 webhook owner hard-coded `user-local` | security | FIXED | J `55e102b44`, T `47a0aa2e8` | J cms `integrations/__tests__/create.test.ts` "refuses to create when no one is signed in…" (mut `drop-actor-principal` 2 red); T `routes/integrations/__tests__/create.test.ts` (mut `restore-user-local` 1 red) |
| B115 desktop `sandbox:false` (sites-home window) | security | UNVERIFIABLE-IN-CLOUD / NEEDS-OWNER | — | Deliberate (`sites-home-window.ts:123` doc): the Electron native-ESM preload needs an unsandboxed renderer. **Local check:** bundle `preload.mts` to one CJS file, flip `sandbox:true`, and confirm every bridge works in a real desktop run. |
| sheet-header drift (NEW): `_tovu_*` → `_jini_*` sheet columns | data | FIXED (Jini) + **WAIT-M19 (Tovu wiring) — RELEASE BLOCKER** | J `2d5441259`, T `c0586f9f1` | J `google-workspace/__tests__/form-delivery.contract.test.mjs` "legacy headers: …keeps them, with no duplicate columns" (mut `drop-legacy-names` 3 red); cms `deliver.unit.test.ts` (mut `drop-adapterOptions-spread` 1 red). Still to do after merge-19, in `composition/form-delivery-deliverer.ts:50`: pass `legacyHeaders {submissionId:["_tovu_submission_id"], submittedAt:["_tovu_submitted_at"]}` for `google-workspace`. Until then, existing owner sheets refuse delivery. |
| A312 / C13-test-writes-dev-site | data (dev site) | FIXED | T `5f3c4aca1` | `composition/__tests__/create-site-route-deps-db-path-binding.integration.test.ts` (mut `drop-dbpath-binding` 2 red); before/after listing of `sites/tovu-dev` identical |
| A007 lock wait at boot disables plugin | wrong behaviour | FIXED | J `e9a3556f9` | `lifecycle/__tests__/unit/update.unit.test.ts` ×3 (mut `treat-lock-wait-as-failure` 3 red). Check locally whether the background retry timer keeps a CLI process alive. |
| B143 failed run projected as succeeded | wrong behaviour | FIXED (that part); NEEDS-OWNER for "durable acceptance"; UNVERIFIABLE for "inventory latch" | J `bb7ff2705`, T `e1921f9f4` | `chat/src/core/ag-ui/__tests__/run-frames.test.ts` "a stream closing without a terminal frame is reported as an interrupted failed run…" (mut `restore-run-finished-on-close` 1 red). **Owner review:** this replaces the old pinned "dual-completion" test. The Tovu wire golden was regenerated for exactly this. |
| C131 RUN_ERROR forwards daemon text | wrong behaviour | FIXED (no error ID: the AG-UI path has no ID source) | J `bb7ff2705`, T `e1921f9f4` | run-frames.test.ts "(C131)" ×2 (mut `restore-daemon-text-in-run-error` 2 red). New copy `AG_UI_FAILURE_MESSAGE` can be reworded. |
| B189 member challenge matched by message | wrong behaviour | FIXED | J `0d023b082`, T `ebf2e36b1` | `user-management/src/members/__tests__/member-challenge-consume.test.ts` (mut `restore-message-match` 1 red) |
| B109 Soon plugins offered by search | wrong behaviour | FIXED | J `3fb9648dd`, T `632349d1f` | J `host-tools/__tests__/search-tool.soon.test.ts` (mut `ignore-maturity` 2 red); T `agent-plugins/__tests__/unit/search-host-soon.unit.test.ts` (mut `host-maturity-port-returns-undefined` 1 red) |
| B120 Stop ignored by credential update/delete/relabel | wrong behaviour | FIXED | T `49a3972a4` | `source-control/__tests__/credential-setup-projections.unit.test.ts` (mut `drop-delete-signal-check` red). Red shown by mutation only. |
| B284 mail HTTP client cast hides ABI mismatch | wrong behaviour | FIXED | T `604afc515` | `boot/__tests__/sender-domain-verification.test.ts` + `resolve-mailer.unit.test.ts` (red first; mut `restore-cast-in-resolve-mailer` 1 red) |
| B033 one bad entry stops import expiry sweep | wrong behaviour | FIXED | T `fd91fe3b9` | `site-backup/__tests__/import-registry.unit.test.ts` "expiry keeps sweeping … deletes nothing extra" (red first) |
| B174 retry reuses the failed message id/runId | wrong behaviour | FIXED | J `db09c43f5` | `chat/src/react/hooks/__tests__/useConversation.test.ts` (mut `reuse-old-id` 3 red). Three assertions that pinned the old id were repointed, not loosened. |
| B257 reattach uses a stale transport | wrong behaviour | FIXED | J `f38789b80` | `useRunStream.test.ts` "reattach() uses the transport the hook was last rendered with…" (red first) |
| B233 stale per-field sort after collection change | wrong behaviour | FIXED | J `d1cc79394` | Jini `admin/…/WidgetConfigFields.hooks.unit.test.tsx` (mut `drop-sort-clear` 1 red). The code lives in Jini now, not the Tovu path in the row. |
| B159 CLI install hard-codes `word-count` | wrong behaviour | FIXED (+ WAIT-M19 tail) | T `bd57f2fe4` | `cli/__tests__/unit/plugin-command.unit.test.ts` "B159…" (mut `revert-to-hardcoded-word-count` 1 red). Tail: `composition/app.ts:232` and `site-deps/plugin-runtime.ts:39` should import `BUILT_IN_RUNTIME_SOURCES`. |
| C130 raw MCP protocol text on tool card | wrong behaviour (words) | FIXED | J `c9ede7ece` | `chat/src/core/__tests__/tool-call-detail.test.ts` (mut `drop-isError-check` 1 red) |
| C014 / 1280-optional-peer-contract | wrong (contract) | FIXED | J `b40a5b121` | `scripts/__tests__/optional-peer-contract.test.ts` 58/58 (mut `drop-agentic-render-surface-text` 1 red) |
| C13-overlay-core-primitives-uuid | test infra | FIXED | T `4dc5db3cd` | resend-mcp 11/11, sheets-admin-host-schema.security 1/1 |
| source-control-tool-wiring overlay test (NEW) | test infra | FIXED (stale test) | T `e6cd834ac` | `github/__tests__/source-control-tool-wiring.test.mjs` 1/1 |
| A448 "ZIP size or SHA-256 mismatch." | cosmetic | FIXED | T `a0a381d34` | `import-verifier-refusals.unit.test.ts` (mut `restore-old-sentence` 1 red) |
| C025 seed log says bare "Error" | cosmetic | FIXED | J `c88baebd1` | `seed-bundled-edges.unit.test.ts` (mut `drop-install-error-branch` 1 red) |
| B015 attachment error copy | cosmetic | FIXED (copy) | J `d47610048` | chat-pane `rules.test.ts`, `ChatPane.test.tsx` (mut `restore-remove-it-copy` 2 red). A removable failed-file chip would be a larger owner call. |
| A196 Read card drops `limit` | cosmetic | FIXED | J `b33f4aede` | `ToolCard.batch-target.test.tsx` (mut `drop-limit-pass-through` 1 red) |
| C8-css-unrenamed-jini-classes (C017) | cosmetic | FIXED (3 selectors) | T `ea4452915` | none (CSS); admin kit 10/10 |
| C028 why-comment blocks | cosmetic | FIXED (share-service) / WAIT-M19 (site-search.ts) | T `2d475494a` | checker 91 → 90 (`--base 8e4a52b1f^1`) |
| C037 user-management README | doc | FIXED | J `5207cf2e0`, `e1be6ab35` | — |
| snapshot-stale-header | doc | FIXED | J `15aa85744` | — |
| A310 consent gate why-comment | doc | FIXED | T `2556075fe` | pin 3/3 |
| bt FIX 15 held-back `defineJsonRoute` | refactor | FIXED | T `05af4d88e` (pins first), `30aadbe78` | `held-back-route.test.ts` 8 → 11, new auth-order/body pins green on old code (mut `drop-refusing` 7 red) |
| bt FIX 17 hook split | refactor | FIXED | T `baa9cb963` | `use-held-back-themes.hooks.unit.test.tsx` 16 → 16; themes 843/843 |
| bt FIX 7 visitor-turn dedupe mount | wrong behaviour | WAIT-M19 | — | `composition/modules/site-assistant.ts` (recipe in `bt-dec-a.md` §AFTER-MERGE 3) |
| C026 vendor names in seam files | cosmetic | PARTIAL (guard repaired) / OPEN | T `ffe8c6fc1` | `vendor-neutrality.test.ts`: before, an ENOENT crash; now it reports 25 real hits. The manifest move needs a Jini descriptor field; do it after merge-19. |
| B229 shared app-data DB rule | data | STALE (pinned) | — | `site-trash.integration.test.ts` "B229: …" 49/49 |
| C115 | — | STALE | `46fc4f901` in base | `admin-failure.ts:75-79` |
| C100 | — | STALE | — | error gate has no row for `tovu-server.ts` |
| C7-jini-directory-trash-exdev-cause | — | STALE | — | `directory-adapter.test.ts:319` |
| C7-plugin-contribution-filenames | — | STALE | — | constants are `jini-*`; tool-registrations 84/84 |
| C7-theme-preview-refresh-public-barrel | — | STALE | — | imports `theme-roster-ports` |
| C7-y1-credential-label-prefix | — | STALE | — | legacy label fallbacks in search and mail |
| C8-github-managed-manifest-path | — | STALE | T `feec2fe6f` (guidance only) | `commit-site.unit.test.ts:344` |
| C8-dev-select-node-runtime-env | — | STALE | — | `dev.mjs:863` |
| A2-resend-positional-http-abi | — | STALE | — | neutral-host `mail-port-regression.test.ts` 1/1 |
| B258 desktop redactor swap | — | STALE | — | `redactor-bindings.test.ts` 5/5 |
| B102 netlify JSDoc | — | STALE (not a bug) | — | `@jini-ai/devops` is a real package |
| B262 login save reverts password reset | security | OPEN — blocked | — | Jini fix `ad0f462d0` is on unmerged `codex/bugs-low-b-jini` / `ex7-settings-sec-jini`; four call sites still whole-row save (`auth-service.ts:153`, `mfa/service.ts:71,111`, `mfa/passkey-service.ts:126`) |
| plugin-host-bundled-identity | test drift | WAIT-M19 | — | the test's 9-row identity map vs ~37 shipped `jini/*` ids |
| B164, B005, B206, B186, B136 (rest), B137 (rest), B183, B245, B228, B210, B212, B197, B202, B095, B145, B217, B203/B204, B121, C063, C036, C046, C074, C101, B122 (Tovu part), B224 wiring, A212 wiring, xAI providers, B272 (Tovu part), B234, B215 | various | WAIT-M19 | — | their fix files are on the w5 avoid list (each file named in the worker notes and in `bugs-low-b.md`) |
| B214, B215 | — | NOT-A-BUG per low-b appendix (re-check after merge-19) | — | — |
| C9-share-zip-refusal-vs-acknowledgement | data | NEEDS-OWNER | — | keep the hard refusal, or scope it to public shares |
| L079 ×2 (revert force / partial inverse) | data | NEEDS-OWNER (kept on purpose, pinned) | — | P8 C002 plan is ready if the owner wants it |

## Gates (no new red vs base)
- **Jini**
  - `pnpm -r build` 0. `pnpm typecheck` 0 (base 0).
  - `pnpm guard`: 1 violation, the same as the base (HW3 `admin/src/shell/lib/shell-failure-log.ts`).
  - vitest:
    - Clean: chat 4595/4596 (1 skipped), agent-plugins 2364 (2 skipped), admin 5234/5234, db 982/982, optional-peer-contract 58/58.
    - cms 9 red, user-management 4 red. Each of those files is equally red on the clean base worktree: forms boundary, universal-entries, result-html ×6, `RegExp.escape` on Node 22 vs required 24, and the user-management entry/rename/runtime-boundary tests.
- **Tovu**
  - `tsc -p tsconfig.json --noEmit` 0. admin `tsc --noEmit` 0.
  - Changed node tests are all green, except four files that have the same counts on the base tree:
    - `vendor-neutrality` 1 red (the base crashed outright).
    - `member-password-auth` 1 red.
    - `resolve-mailer` 1 red.
    - `create-app-route-table.pin` 7 red (stale snapshot; regenerate with `UPDATE_ROUTE_TABLE_PIN=1`).
  - Also green: AG-UI wire golden 12/12, site-trash 49/49, bundled-github-commit-site 59/59.
  - `plugin-host.integration` has 3 red, the same on the base.
  - admin vitest (themes + integrations) has 7 red, all base-red: `security-panel` `useAdminLocaleHook is not a function` ×6 and the `jini-class-host-css` editor.css rule.
- Base comparisons ran on a clean merge-18 worktree. Tovu base tests used the shared node_modules, which are linked to the branch Jini.
- `apps/desktop` was not changed, so its gates did not need to run.

## Environment notes
- Node is 22.23 here, but the repo wants 24. That is the cause of `RegExp.escape`.
- `npm ci` runs `@tovu/contracts`' `prepare` against registry Jini and fails. The install here disabled `prepare` temporarily, then restored it before linking local Jini.
- `@tovu/sdk` dist has to be built before the composition tests.

## New bugs / follow-ups
1. **Release blocker:** the Tovu `legacyHeaders` wiring for Google Sheets in `form-delivery-deliverer.ts` (WAIT-M19). Also add a `changes` entry in `persisted-names.json` for the `_jini_*` rename.
2. After merge-19, do bt FIX 7 (dedupe mount), the B159 tail, B164, and the plugin-host identity map.
3. Owner review of the B143 behaviour change (bare stream close is now a failure) and the new C131/B015 copy.
4. Regenerate the route-table pin snapshot, which was stale on the base.
5. Desktop scripts still use the plain `redactLocalText` (`smoke-native`, `check-*`), which is outside B258's file list.
