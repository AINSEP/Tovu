# wave1 kt-K-01 (redirects agent tools -> `@jini-ai/cms/redirects`): SKIPPED at V1, "baseline red"

Date 2026-11-17. Branch `wave1/kt-K-01` (this report is the only commit). Base: `origin/integ/merge-final-2026-11-16` in both repos (Tovu `232764af`, Jini `65d73b0d`).

## Result
SKIPPED, nothing changed in source. COMMON-KT V1 says "Tovu gates on the unmodified tree: `check:size && check:complexity && check:architecture` exit 0 (red = STOP 'baseline red', never fix it)". All three exit 1 on the unmodified merge-final tree, so S0..S4 were not started.

## Setup (done, green)
- Node v24.22.3 in `~/.local/node24`, pnpm via corepack.
- Jini: `pnpm install --frozen-lockfile`, `pnpm --no-bail -r build`: ok (no failed package).
- Tovu: `npm ci`, `JINI_PACKAGES_DIR=/home/user/Jini/packages node development/scripts/link-jini.mjs` (71 links), `packages/contracts` and `packages/sdk` built.
- Blob guards: `redirects/agent-tools.ts` = `9f866fec...` and `redirects/tool-registrations.ts` = `ca0de6ab...`, both match `K-01.files.tsv`. The census/guards for S0..S4 were not run (stopped earlier).

## V1 baseline on the UNMODIFIED trees
| gate | result |
|---|---|
| Jini `pnpm --filter @jini-ai/cms run typecheck` | ok |
| Jini `npm --prefix packages/cms run test` | 338 files, 4085 tests passed |
| Jini `pnpm guard` | ok, "zero violations found in packages/" |
| Tovu `tsc -p tsconfig.json --noEmit` | ok (no output) |
| Tovu `tsc -p tsconfig.tests.json --noEmit` | ok (no output) |
| sheet tests (`features/redirects/**` + `assistant/__tests__/tool-registrations.redirects.test.ts`) | 94 tests, 94 pass |
| Tovu `npm run check:size` | **exit 1**: 17 lines (16 "Worsened violation" + the rest), all unrelated to redirects, e.g. `server/runtime/composition/deps.ts:742 <file> 1952 (baseline 1926)`, `composeSiteRouteDeps 1202 (baseline 1199)`, `provider-plugins.ts bootProviderPlugins 149 (baseline 147)`, `admin App.hooks.ts 518 (513)`, `features/webhooks/tool-registrations.ts buildWebhooksRegistrations 130 (127)` |
| Tovu `npm run check:complexity` | **exit 1**: 23 lines, e.g. `admin/src/features/plugins/Plugins.tsx LoadedPlugins [complexity] 16`, `server/runtime/composition/modules/assistant-byok.ts:453 attachTurnMessagesOrRespond [sonarjs/cognitive-complexity] 11`, `publish-content/backstop.ts handleUndoRequest 13 (baseline 12)` |
| Tovu `npm run check:architecture` | **exit 1**: "4 metric(s) regressed against a hard constraint"; e.g. back-edges into composition root 0 -> 6, module API surface 821 -> 852; 124 "NEW cross-feature edge" lines |
| Tovu `npm run check:errors \| rg "^(New\|Worse):"` | not empty (e.g. `New: [catch-reads-error] apps/admin/src/features/ai-assistant/api/ai-assistant-api.ts (1)`), so the V2 pass condition "prints nothing" cannot hold on the base |

These match the merge-final report (`cloud-results/merge-final-2026-11-16.md`: check:size red 17 lines, check:complexity red 23 lines on Tovu, "already red on terra; fix or accept before Tovu CI"). None of the red lines is in a K-01 file.

## STOPs hit
- V1 "baseline red" (check:size, check:complexity, check:architecture, check:errors on the base). Not fixed, per the sheet.

## Deviations
None. No source, debt file, changeset or test was edited. No Jini commit.

## Next step
Owner decision, one of: (a) fix or re-lock the Tovu debt/architecture baselines on `integ/merge-final-2026-11-16` (a separate sheet), then re-run K-01 from S0; or (b) allow K-01 to use "no new lines versus the base output" as the per-commit gate in place of exit 0 (a rule change to COMMON-KT V1/V2, not made here). K-01's own prerequisites looked fine: blobs match, baseline tests are green, and `buildRedirectsRegistrations` (123 lines) is a listed accepted exception that S1 would delete.
