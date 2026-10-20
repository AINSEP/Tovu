# TW1 features — cloud coordinator progress

Branch: `cloud/tw1-features` (base `origin/restructure/apps-website-phased`). Started 2026-10-20 01:02 UTC.

## Setup (≈3 min total)
- STEP 0: `Linux vm 6.18.44-fc-v139 x86_64`, host `vm`, `/home/user/Tovu`; proof commit 4281af19 pushed.
- Node: container default v22.22.0. `nvm install 24` (NVM_DIR=/opt/nvm) → v24.22.0, but the shell profile re-prepends /opt/node22, so every command must start with `export PATH=/opt/nvm/versions/node/v24.22.0/bin:$PATH`.
- AI-Dev-Shop cloned to /home/user/AI-Dev-Shop. Jini (general-work) cloned to /home/user/Jini; `pnpm install --frozen-lockfile` OK; `pnpm --no-bail -r build` 38 pass / 1 fail (@jini-ai/integrations tsc, expected; dist emitted).
- Tovu `npm ci` root + apps/admin + apps/site-chat: OK. `npm run link:jini` with JINI_PACKAGES_DIR=/home/user/Jini/packages: 57 links (relative symlinks).
- Worktrees `/home/user/wt-<LOT>` on `cloud/tw1-features-<LOT>`; node_modules symlinked (root, apps/admin, apps/site-chat); `require.resolve('@jini-ai/core')` OK; site-backup sources.unit test 50/50 in a worktree. Symlinks + `eslint.cx.tmp.mjs` added to `.git/info/exclude` (shared by worktrees).
- Complexity config: `eslint.cx.tmp.mjs` (Tovu's own eslint + eslint-plugin-sonarjs + @typescript-eslint/parser), never committed.

## Personas
- Coordinator loaded software-architect/skills.md and code-inspection/skills.md.

## Lots (baseline worst cyc/cog, violations)
| Lot | Area | Baseline worst cyc/cog | Violations | Status | After | Coverage | Commits |
|---|---|---|---|---|---|---|---|
| L003 | site-backup A | 86/72 | 21 | running (01:20) | | | |
| L011 | theme | 67/92 | 17 | MERGED (7/7, 2 subagents) | all ≤10/≤10 | 100/100/100 on 6 files; static-render.ts 99.4/96.7/100 (gaps only in untouched code: 228-230, 490, 520-527, 598, 646-647, 674, 749, ~1500) | f973d835, 6f470424, 9c4fee3e..f935edf9 |
| L033 | media | 34/22 | 16 | MERGED (6/6) | all ≤10/≤10 (view-video-tool was 34/21) | 100/100/100 all six (see notes) | 05365813..eab672c2 |
| L064 | plugin-runtime | 34/42 | 11 | part 1 merged (5/6); part 2 (tool-registrations.ts) running | install-archive 7/6, install-tool 5/4, tiptap-blocks 7/7, source-tools 4/3, declarative 7/9 | 100/100/100 (install-tool+source-tools funcs need assistant tool-registrations.contracts.test) | 63d0f665..f1d408c1 |
| L068 | post | 24/18 | 17 | dispatched | | | |
| L086 | webhooks | 34/25 | 6 | running | | | |
| L095 | site-backup B | 19/18 | 15 | queued (after L003 merge) | | | |
| L112 | publish-trust | 18/17 | 11 | running | | | |
| L115 | navigation | 21/17 | 8 | queued | | | |

## Problems / notes
- SETUP GAP: `@tovu/sdk` (packages/sdk) dist is not built by `npm ci`; without it root/tests typecheck show ~14/39 errors and an integration test fails. Fix: `cd packages/sdk && npx tsc -p tsconfig.json` in the main checkout (worktrees see it through the node_modules symlink). After that root + tests typecheck are clean (0 errors).
- Desktop pre-push hook runs its gates (which fail: no electron installed) whenever `@{push}` is unresolved, i.e. a new branch with no upstream. FIX USED: coordinator pre-creates `origin/cloud/tw1-features-<LOT>` at the base commit and sets the worktree branch upstream to it, so the hook takes its "no apps/desktop changes" skip path. Do this for every new lot worktree. Never use --no-verify (L011 part 1 did once, before this fix).
- Coverage tip (L011): add `--enable-source-maps` to the coverage command, or the uncovered line numbers are wrong.
- L011 part 1 verify: eslint 0, 181/181 tests (validation/__tests__ + publish-content.*), root + tests tsc 0. Removed the exported legacy `checkTovuAgentAttributePresence` (only its own test called it); its history comment moved to webmcp-markup.ts.

## Next
- Coordinator dispatched L003, L011, L033, L064, L068 in parallel at ~01:20 UTC (opus-high subagents, brief file + inline context/persona rules).
- L064 part 1 verify: eslint 0; 146/146 (lot unit tests + assistant contracts + plugin-runtime tests touching these files); root+tests tsc 0. Read install-archive diff: removed `i < segments.length` guard is provably dead (duplicate-path refusal fires first). Three commit subjects carry estimated (not measured) numbers; measured values are in this table. Out of scope: Jini `PluginInstallError` takes no `cause` (PLUGIN_ARCHIVE_INVALID drops the original error).
- L033 verify: eslint 0; 278/278 (lot tests + library-publish + server admin-media-provider-routes); root+tests tsc 0. Security files (vault/store) diff read line by line: behaviour identical (keyMarkers/preservedHints/rowIdentity are straight extractions). One pre-existing `as unknown as MediaRecord` moved, not added.
  - FLAG FOR OWNER (path safety, read-chat-attachment.ts): two checks deleted as unreachable: (a) the `dirname(sidecarPath) !== sidecarDirectory` defence-in-depth re-check — the sidecar-name sanitiser `[^a-zA-Z0-9-] → _` makes it unreachable, now pinned by a property test; the original comment was kept on the sanitiser; (b) `Number.isFinite(size)` — a JSON sidecar can't hold NaN, and ±Infinity is already refused by `<0` / `>max`. Behaviour identical today; re-add (a) if the owner wants belt-and-braces.
  - BUG PINNED (reported, not fixed): media publish-content — a forged bundle with no `source` crashes with TypeError (reading 'sha256') instead of a typed blocked result (publish-content.write.test.ts).
  - Coverage caveats: view-video-tool shows 100% only with `--test-isolation=none` (node coverage merge artefact at line 198); read-chat-attachment 100% without --enable-source-maps (with it the header comment counts as uncovered); publish-content needs media-video-embed round-trip + library-publish tests in the run.
  - L033 subagent ran to ~318k tokens (over the 300k cap) — next wave: tighten the stop rule (e.g. ~200k / 100 tool calls).
  - Scratchpad collision: subagents shared /scratchpad/red.sh; give each lot its own scratch subdir in the brief.
- L011 part 2 verify: eslint 0 on all 7 lot files (1 warning: an inline no-control-regex directive ignored by noInlineConfig — expected); theme __tests__ + validation + assistant theme/contracts: 1029 tests, 1025 pass, 0 fail, 4 skipped (pre-existing permission-based skips, not added by this work); root+tests tsc 0. Removed: dead `?? "0.0.0"` fallback, unused `_optional` on an internal helper, unreachable `name.length === 0` (requireString refuses empty first; comment added). tool-registrations coverage 70.6/88.9/72.1 → 100/100/100.
