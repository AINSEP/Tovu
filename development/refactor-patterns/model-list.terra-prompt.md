# Terra job: delete hard-coded model ids (the model list is discovered)

## What you may run now
- **Runnable now: rows 15, 16 and 17 only (M2, M3, M4).** Each is independent of the others and of every Opus stage.
  - Preconditions for each row: (1) you are on the branch the coordinator names, never `main`; (2) the "starts with" text quoted in that row's steps matches the file exactly at the stated line (if not, skip the row and report it; do not search for a new location); (3) `git status --short -- <that file>` is empty before you start.
  - None of these files is read by the guard rule R13, so they do not change `pnpm guard`.
- **Not runnable now: rows 1–14 (M1).** M1 runs only when the coordinator's dispatch says all of these hold: (a) the Opus stage B0 (including B0-0, the Qoder classifier fix) has landed on the Jini branch; (b) you are on a separate lane branch the coordinator names; (c) the dispatch confirms that the Opus stage B1 will be committed on that same branch and the two landed as one squash commit. Your M1 commit on its own turns the guard check MF3 red on machines with codex, agy or claude installed. That is expected. Do not try to fix the guard, and do not claim the commit is green.

Revised 2026-11-13 after the second Codex review. This prompt is self-contained; `development/refactor-patterns/model-list.md` in the Tovu repo is background only.

Repos: the Jini clone (M1–M3) and the Tovu clone (M4 only). Do not touch `apps/desktop`, `apps/admin`, `scripts/`, `model-discovery*.ts`, `models.ts`, `rules.ts`, `ByokProviderForm.tsx`, `providers.ts`, `seed.ts`, or any file not named below.

## Owner rules (apply to every line you write)
- Cyclomatic and cognitive complexity at 10 or below per function; functions at most 50 lines.
- Any new or changed function signature takes `(requiredObj, optionalObj)`. (No row here needs a new function.)
- "Why" comments are moved, never deleted. The only comments you may delete are the ones listed for deletion below; every other comment stays. Where a step says to move a reason, use the exact text given.
- Vendor names and model ids live only in the def or adapter that owns them. Do not add any.
- No `eslint-disable`, no `as any`, no non-null `!`.

## Why
Owner rule: model ids are never hard-coded. Every agent discovers its models at runtime (live CLI/API, the CLI's own disk catalog, the last good snapshot). A hard-coded row is shown only when discovery fails, and by then it is stale.

## M2 (row 15): BYOK `preferredModels` → `[]`
File `packages/integrations/src/media-providers/ui-defaults.ts` (Jini). Work bottom-up so the line numbers stay valid.
1. Line 158 starts `    preferredModels: ['anthropic/claude-sonnet-5'`; replace the array literal after `preferredModels: ` with `[]`.
2. Line 145 starts `    preferredModels: ['gemini-3.6-flash'`; same.
3. Delete lines 140–144 (first starts `    // Ordered newest-first:`, last starts `    // prefers live \`listModels\` discovery`). Its reason moves in step 7.
4. Line 118 starts `    preferredModels: ['gpt-5.6-sol'`; same as step 1.
5. Delete lines 110–117 (first starts `    // \`gpt-4o\`/\`gpt-4o-mini\`/\`o3\`/\`o4-mini\` are stale`, last starts `    // an existing user's cost without them choosing it.`). Its reason moves in step 7.
6. Line 101 starts `    preferredModels: ['claude-sonnet-5'`; same as step 1.
7. In the doc comment above `export const DEFAULT_PROVIDER_PRESETS` (lines 89–94), insert these lines just before its closing ` */`:
```
 *
 * `preferredModels` stay empty: models are discovered at runtime (live `listModels`) and the
 * user's saved choice is used, never a hard-coded id. Two reasons, both seen live: a hard-coded
 * first entry goes stale and silently pins new users to an old model generation (the Gemini
 * field once defaulted to an older flash model than the one the operator was running), and a
 * code-picked newer, pricier flagship as the silent default would jump an existing user's cost
 * without them choosing it.
```
Do not touch `rules.ts` or `ByokProviderForm.tsx`.

## M3 (row 16): AMR preference order
File `packages/agent-runtime/src/defs/amr/index.ts` (Jini). Work bottom-up.
1. In `orderAmrChatModels` (lines 171–184: line 171 starts `function orderAmrChatModels(`, line 174 starts `  return models`, line 183 starts `    .map(({ model }) => model);`, line 184 is `}`), replace lines 174–183 with `  return [...models];`, and put this comment directly above the function: `// Discovered order is kept; the user's saved choice is preselected elsewhere. No hard-coded preference.` Keep its name, signature and caller.
2. Line 159 doc: change `in preferred AMR chat order.` to `in discovered order.`
3. Delete lines 9–18 (`const PREFERRED_AMR_CHAT_MODEL_ORDER = [` through the `);` that closes `PREFERRED_AMR_CHAT_MODEL_RANK`) and the blank line after them. They carry no comment.
4. Leave `VELA_MODEL_ID_ALIASES` (lines 50–57) and the non-chat filter (lines 105–109) unchanged: they are wire/capability mappings pending review.

## M4 (row 17): Tovu tool description
File `apps/website/src/features/media-generation/agent-tools.ts` (Tovu), lines 102–103. Replace exactly
```
        "Defaults to 'gpt-image-2' (OpenAI) when omitted. Other options include 'gemini-3.1-flash-image-preview' " +
        "(Nano Banana / Google Gemini) and 'grok-imagine-image' (xAI Grok), across every registered vendor. Which " +
```
with
```
        "When omitted, the first model in this list whose vendor has a credential configured is used; if no vendor " +
        "has one, the call fails and says so. Which " +
```
Keep the rest of the string exactly as it is. Do not touch `tool-registrations.ts` (Opus stage O-img).

## M1 (rows 1–14; NOT runnable until the conditions at the top hold)
For each row, delete exactly the inclusive line range(s) given, and nothing else.
- **Check before deleting**: the first line of each range must start with the "first line" text and the last line with the "last line" text. If either does not match, the file moved: stop on that file and report it. Do not guess.
- Codex and Hermes keep a why-comment between or before their ranges. Leave it exactly where it is; the Opus stage B1 moves it. In `codex.ts`, delete the lower range (356–362) first so the upper range's numbers stay valid.
- Keep everything outside the ranges. In particular keep `DEFAULT_MODEL_OPTION`, `{ id: 'auto' … }`, `{ id: GROK_BUILD_ID … }`, and the alias rows (`fable`, `sonnet`, `opus`, `haiku` in `claude.ts`; `sonnet` in `aider.ts`; every row of `devin.ts`). Those wait on an owner decision.
- Do NOT delete `fallbackModelsAssertedAt` lines or any comment outside the ranges. B1 rewrites them together with the freshness guard on the same lane branch.
- After the edit each array must still parse, e.g. `fallbackModels: [\n  DEFAULT_MODEL_OPTION,\n],`, or with the kept comment inside it. Leave the trailing comma style as the file had it.

| # | file (under `packages/agent-runtime/src/defs/`) | delete lines | first line starts with | last line starts with | rows |
|---|---|---|---|---|---|
| 1 | `claude.ts` | 62–77 | `  // Current picker cache additions` | `  { id: 'claude-sonnet-4-5'` | 15 |
| 2a | `codex.ts` | 356–362 (first) | `      { id: 'gpt-5.2'` | `      { id: 'o4-mini'` | 7 |
| 2b | `codex.ts` | 341–352 (second) | `      { id: 'gpt-6.1-sol'` | `      { id: 'gpt-5.3-codex'` | 12 |
| 3 | `antigravity/index.ts` | 195–217 | `    { id: 'claude-opus-5-5-low'` | `    { id: 'gpt-oss-120b-medium'` | 23 |
| 4 | `codebuddy/index.ts` | 24–45 | `  // GLM family (Zhipu AI)` | `  { id: 'minimax-m2.7-ioa'` | 15 |
| 5 | `cursor-agent.ts` | 89–91 | `      { id: 'sonnet-4',` | `      { id: 'gpt-5'` | 3 |
| 6 | `aider.ts` | 22–29 | `      // \`gpt-4o\` is stale` | `      { id: 'gemini/gemini-2.0-flash'` | 3 |
| 7 | `deepseek.ts` | 25–26 | `      { id: 'deepseek-v4-pro'` | `      { id: 'deepseek-v4-flash'` | 2 |
| 8 | `kimi.ts` | 14–16 | `      { id: 'kimi-k2-turbo-preview'` | `      { id: 'moonshot-v1-32k'` | 3 |
| 9 | `qwen.ts` | 14–15 | `      { id: 'qwen3-coder-plus'` | `      { id: 'qwen3-coder-flash'` | 2 |
| 10 | `reasonix.ts` | 55–56 | `      { id: 'deepseek-v4-pro'` | `      { id: 'deepseek-v4-flash'` | 2 |
| 11 | `opencode.ts` | 51–56 | `      {` (then `id: 'anthropic/claude-sonnet-5'` on 52) | `      { id: 'google/gemini-2.5-pro'` | 3 |
| 12 | `pi.ts` | 60–72 | `      {` (then `id: 'anthropic/claude-sonnet-5'` on 61) | `      { id: 'google/gemini-2.5-flash'` | 6 |
| 13 | `grok-build.ts` | 69–78 | `    { id: 'grok-4.3'` | `    },` (closes the `grok-4.20-multi-agent` row) | 4 |
| 14 | `hermes/index.ts` | 31–50 | `      { id: 'grok-4.3'` | `      },` (closes the `openai-codex:gpt-5.4-mini` row) | 7 |

Kept in place by M1 (B1 moves them): `codex.ts:353–355` (starts `      // Found by the freshness guard`) and `hermes/index.ts:29–30` (starts `      // xAI Grok — available via SuperGrok OAuth`). The other comments inside the ranges only describe the deleted rows or are headings; the design records that decision per comment.

## Tests
- Find the tests for each changed source file: `rg -l "<exported def name or const>" packages/agent-runtime/src packages/integrations/src packages/ui/src --glob '**/__tests__/**'`; for M4, `rg -l "agent-tools" apps/website/src --glob '**/__tests__/**'`.
- A test that asserts the deleted list itself (`expect(def.fallbackModels).toEqual([...])`, a snapshot, a length, `preferredModels[0]`, the AMR rank order) changes to assert the new value.
- A test that only uses a model id as INPUT (a fake live list, a saved choice, a config-file value) keeps it: fixtures may name model ids.
- A test that fails for any other reason (for example it expected an offline launch to resolve through a deleted row) is a behavior question: do not change source to make it pass. Leave it red, and list file, test name and failure under "Needs Opus".
- Test-first, once per changed source file: change the assertion, run the file and paste the red, edit the source, run it green, then restore one deleted row (or one rank entry, or the old description sentence) as a mutant, run and paste the red, and remove it again.
- Single files only: Jini `cd packages/<pkg> && npx vitest run --maxWorkers=2 --minWorkers=1 <file>` (build deps once first: `(cd packages/protocol && npx tsc -p tsconfig.json) && (cd packages/core && npx tsc -p tsconfig.json) && (cd packages/platform && npx tsc -p tsconfig.json)`); Tovu `node --test --test-concurrency=1 <file>` or the runner the file's package uses. No suites, no root tsc, no `pnpm guard`. Leave nothing running.

## Done check
- M2: `rg -n "preferredModels: \[" packages/integrations/src/media-providers/ui-defaults.ts` → every hit is `[]`; the inserted doc lines are present and lines 110–117 / 140–144 are gone.
- M3: `rg -n "PREFERRED_AMR" packages` → only test files you updated, or none.
- M4: `rg -n "gpt-image-2" apps/website/src/features/media-generation/agent-tools.ts` → no hit.
- M1 (only when it ran): `rg -n "id: '" <each M1 file>` inside the `fallbackModels` array → only `default`/`DEFAULT_MODEL_OPTION`, `auto`, `GROK_BUILD_ID`, and the alias rows listed above; the two kept comments are present.
- `npx eslint <changed files>` → no new errors.
- Commit per repo: `git commit -F <msgfile> -- <paths>` (explicit paths; never `git add -A`, stash, checkout or reset). Message `refactor(models): delete hard-coded model ids; the list is discovered at runtime`, ending with the co-author line the coordinator gives you. Never push.
- Report: per row done / skipped (why); red/green/mutant output per file; the "Needs Opus" list.

## Other rows
| # | file (repo) | lines | variant |
|---|---|---|---|
| 15 | `packages/integrations/src/media-providers/ui-defaults.ts` (Jini) | 101, 118, 145, 158; comments 110–117, 140–144 (reasons moved); doc 89–94 | M2 |
| 16 | `packages/agent-runtime/src/defs/amr/index.ts` (Jini) | 9–18, 159, 174–183 | M3 |
| 17 | `apps/website/src/features/media-generation/agent-tools.ts` (Tovu) | 102–103 | M4 |

Not yours (leave untouched, listed so you do not "finish" them): alias rows (owner question), `fallbackModelsAssertedAt` and the comments about the lists (Opus B1), `scripts/check-model-fallback-freshness.ts` (Opus B1), the identity classifier `core/model-discovery-shared.ts` (Opus B0-0), media catalogs `providers.ts`/`seed.ts`/`ui-defaults.ts:12,59`/`nanobanana.ts` (B-media, waiting on owner question Q-M2), wire/capability mappings (`openai.ts`, `openai-compatible.ts`, `aihubmix*.ts`, `minimax.ts`, `custom-image.ts`, `video-request.ts`, `model-catalog.ts`, AMR normalizer), `xai.ts` (owner question), Tovu `tool-registrations.ts` (Opus O-img), `site-assistant.ts` and the admin visitor form (owner question).
