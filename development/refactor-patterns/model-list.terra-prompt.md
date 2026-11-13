# Terra job: delete hard-coded model ids (the model list is discovered)

NOT READY until the Opus stage B0 (`model-list.md` section 4) has landed on the Jini branch. Rows M2, M3 and M4 do not depend on B0 and may run earlier. Revised 2026-11-13 after the Codex review. This prompt is self-contained; `development/refactor-patterns/model-list.md` in the Tovu repo is background only.

Repos: the Jini clone (M1–M3) and the Tovu clone (M4 only). Do not touch `apps/desktop`, `apps/admin`, `scripts/`, `model-discovery*.ts`, `models.ts`, `rules.ts`, `ByokProviderForm.tsx`, `providers.ts`, `seed.ts`, or any file not named below.

## Why
Owner rule: model ids are never hard-coded. Every agent discovers its models at runtime (live CLI/API, the CLI's own disk catalog, the last good snapshot). A hard-coded `fallbackModels` row is shown only when discovery fails, and by then it is stale. The launch code was already changed (B0) so that a user's saved choice still launches when discovery is down; deleting the rows is now safe.

## What to do

### M1: delete concrete rows from agent def `fallbackModels` arrays
For each row of the M1 table, delete exactly the inclusive line range given, and nothing else.
- Work bottom-up inside a file is not needed (one range per file), but **check before deleting**: the first line of the range must contain the "first line starts with" text and the last line the "last line" text. If either does not match, the file moved: stop on that file and report it. Do not guess.
- Keep everything outside the range. In particular keep `DEFAULT_MODEL_OPTION`, `{ id: 'auto' … }`, `{ id: GROK_BUILD_ID … }`, and the alias rows (`fable`, `sonnet`, `opus`, `haiku` in `claude.ts`; `sonnet` in `aider.ts`; every row of `devin.ts`). Those wait on an owner decision.
- Do NOT delete `fallbackModelsAssertedAt` lines or any comment outside the range. A later Opus stage rewrites them together with the freshness guard (deleting them now turns `pnpm guard` red).
- After the edit the array must still parse: e.g. `fallbackModels: [\n  DEFAULT_MODEL_OPTION,\n],`. Leave the trailing comma style as the file had it.

### M2: BYOK `preferredModels` → `[]`
File `packages/integrations/src/media-providers/ui-defaults.ts`.
1. Lines 101, 118, 145, 158: replace the array literal after `preferredModels: ` with `[]`. Line 101 starts `    preferredModels: ['claude-sonnet-5'`, 118 `    preferredModels: ['gpt-5.6-sol'`, 145 `    preferredModels: ['gemini-3.6-flash'`, 158 `    preferredModels: ['anthropic/claude-sonnet-5'`.
2. Delete comment lines 110–117 (first starts `    // \`gpt-4o\`/\`gpt-4o-mini\`/\`o3\`/\`o4-mini\` are stale`, last starts `    // (released 2026-09-03)`) and 140–144 (first starts `    // Ordered newest-first:`, last starts `    // prefers live \`listModels\` discovery`).
3. In the doc comment above `export const DEFAULT_PROVIDER_PRESETS` (lines 89–94), insert these two lines just before its closing ` */`:
```
 * `preferredModels` stay empty: models are discovered at runtime (live `listModels`) and the
 * user's saved choice is used. Never a hard-coded id.
```
Do not touch `rules.ts` or `ByokProviderForm.tsx`.

### M3: AMR preference order
File `packages/agent-runtime/src/defs/amr/index.ts`.
1. Delete lines 9–18 (`const PREFERRED_AMR_CHAT_MODEL_ORDER = [` through the `);` that closes `PREFERRED_AMR_CHAT_MODEL_RANK`) and the blank line after them.
2. Replace the body of `orderAmrChatModels` (starts at `function orderAmrChatModels(`, line 171 before step 1) with `return [...models];` and put this comment above the function: `// Discovered order is kept; the user's saved choice is preselected elsewhere. No hard-coded preference.` Keep its name, signature and caller.
3. Line 159 doc: change `in preferred AMR chat order.` to `in discovered order.`
4. Leave `VELA_MODEL_ID_ALIASES` (lines 50–57) and the non-chat filter (lines 105–109) unchanged: they are wire/capability mappings pending review.

### M4: Tovu tool description
File `apps/website/src/features/media-generation/agent-tools.ts`, lines 102–103. Replace exactly
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

## Tests
- Find the tests for each changed source file: `rg -l "<exported def name or const>" packages/agent-runtime/src packages/integrations/src packages/ui/src --glob '**/__tests__/**'`; for M4, `rg -l "agent-tools" apps/website/src --glob '**/__tests__/**'`.
- A test that asserts the deleted list itself (`expect(def.fallbackModels).toEqual([...])`, a snapshot, a length, `preferredModels[0]`, the AMR rank order) changes to assert the new value.
- A test that only uses a model id as INPUT (a fake live list, a saved choice, a config-file value) keeps it: fixtures may name model ids.
- A test that fails for any other reason (for example it expected an offline launch to resolve through a deleted row) is a behavior question: do not change source to make it pass. Leave it red, and list file, test name and failure under "Needs Opus".
- Test-first, once per changed source file: change the assertion, run the file and paste the red, edit the source, run it green, then restore one deleted row (or one rank entry, or the old description sentence) as a mutant, run and paste the red, and remove it again.
- Single files only: Jini `cd packages/<pkg> && npx vitest run --maxWorkers=2 --minWorkers=1 <file>` (build deps once first: `(cd packages/protocol && npx tsc -p tsconfig.json) && (cd packages/core && npx tsc -p tsconfig.json) && (cd packages/platform && npx tsc -p tsconfig.json)`); Tovu `node --test --test-concurrency=1 <file>` or the runner the file's package uses. No suites, no root tsc. Leave nothing running.

## Rules
No `eslint-disable`, no `as any`, no non-null `!`. Never delete a "why" comment outside the listed ranges. Change nothing outside the listed lines and their tests.

## Done check
- `rg -n "id: '" <each M1 file>` inside the `fallbackModels` array → only `default`/`DEFAULT_MODEL_OPTION`, `auto`, `GROK_BUILD_ID`, and the alias rows listed above.
- `rg -n "preferredModels: \[" packages/integrations/src/media-providers/ui-defaults.ts` → every hit is `[]`.
- `rg -n "PREFERRED_AMR" packages` → only test files you updated, or none.
- `npx eslint <changed files>` → no new errors.
- Commit per repo: `git commit -F <msgfile> -- <paths>` (explicit paths; never `git add -A`, stash, checkout or reset). Message `refactor(models): delete hard-coded model ids; the list is discovered at runtime`, ending with the co-author line the coordinator gives you. Never push.
- Report: per row done / skipped (why); red/green/mutant output per file; the "Needs Opus" list.

## M1 rows (14 files, 107 concrete rows). Paths under `packages/agent-runtime/src/defs/` in the Jini clone.
| # | file | delete lines | first line starts with | last line starts with | rows |
|---|---|---|---|---|---|
| 1 | `claude.ts` | 62–77 | `  // Current picker cache additions` | `  { id: 'claude-sonnet-4-5'` | 15 |
| 2 | `codex.ts` | 341–362 | `      { id: 'gpt-6.1-sol'` | `      { id: 'o4-mini'` | 19 |
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
| 14 | `hermes/index.ts` | 29–50 | `      // xAI Grok — available via SuperGrok OAuth` | `      },` (closes the `openai-codex:gpt-5.4-mini` row) | 7 |

## Other rows
| # | file (repo) | lines | variant |
|---|---|---|---|
| 15 | `packages/integrations/src/media-providers/ui-defaults.ts` (Jini) | 101, 118, 145, 158; comments 110–117, 140–144; doc 89–94 | M2 |
| 16 | `packages/agent-runtime/src/defs/amr/index.ts` (Jini) | 9–18, 159, 171–183 | M3 |
| 17 | `apps/website/src/features/media-generation/agent-tools.ts` (Tovu) | 102–103 | M4 |

Not yours (leave untouched, listed so you do not "finish" them): alias rows (owner question), `fallbackModelsAssertedAt` and the comments about the lists (Opus B1), `scripts/check-model-fallback-freshness.ts` (Opus B1), media catalogs `providers.ts`/`seed.ts`/`ui-defaults.ts:12,59`/`nanobanana.ts` (B-media, owner question), wire/capability mappings (`openai.ts`, `openai-compatible.ts`, `aihubmix*.ts`, `minimax.ts`, `custom-image.ts`, `video-request.ts`, `model-catalog.ts`, AMR normalizer), `xai.ts` (owner question), Tovu `tool-registrations.ts` (Opus O-img), `site-assistant.ts` and the admin visitor form (owner question).
