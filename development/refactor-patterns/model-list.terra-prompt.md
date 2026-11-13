# Terra job: delete hard-coded model ids (the model list is discovered)

READY (2026-11-13). This prompt is self-contained. Background only: `development/refactor-patterns/model-list.md` in the Tovu repo.

Repos: the Jini clone (rows M1–M3) and the Tovu clone (row M4 only). Do not touch `apps/desktop`.

## Why
Owner rule: model ids are never hard-coded. Every agent already discovers its models at runtime (live CLI/API, the CLI's own disk catalog, the last good snapshot). A hard-coded `fallbackModels` list is shown, and even launched, only when discovery fails, and by then its ids are stale. Deleting the rows makes a failure show up as an error instead of hiding behind an old id.

## What to do, per variant
**M1: def `fallbackModels` rows.** Open the file at the row's line and find the array the row is in (`fallbackModels: [...]` or a `const X_FALLBACK_MODELS = [...]` used as `fallbackModels`).
- Delete every row whose `id` is a vendor model id. KEEP `DEFAULT_MODEL_OPTION` and keyword rows `{ id: 'auto', … }` / `{ id: 'default', … }`.
- Delete aliases too (`'sonnet'`, `'sonnet-4'`, `'sonnet-4-thinking'`): they are model names. The final array is `[DEFAULT_MODEL_OPTION]`, `[DEFAULT_MODEL_OPTION, { id: 'auto', label: 'auto' }]`, or `[]` if `DEFAULT_MODEL_OPTION` was not in it.
- Delete the `fallbackModelsAssertedAt: '…',` line in that def and the comment lines directly above it that talk only about asserting/refreshing the list.
- Comments inside the deleted array that explain specific ids go with the rows. A comment that explains the CLI's behaviour (how it routes, what `--model` accepts) stays: move it above the array.
- If a now-unused `const` or import remains, delete it.

**M2: BYOK `preferredModels`.** In `packages/integrations/src/media-providers/ui-defaults.ts`, set each flagged `preferredModels: [ … ]` to `preferredModels: []`. Replace the comment block above each one with: `// Discovered at runtime (live listModels); the saved choice is used. Never a hard-coded id.` Do not touch `rules.ts`/`ByokProviderForm.tsx` (Opus lane).

**M3: AMR preference order.** In `packages/agent-runtime/src/defs/amr/index.ts`, delete `PREFERRED_AMR_CHAT_MODEL_ORDER` and `PREFERRED_AMR_CHAT_MODEL_RANK`. Make `orderAmrChatModels` return `[...models]`, and keep its signature and callers. Comment: `// Discovered order is kept; the user's saved choice is preselected elsewhere. No hard-coded preference.`

**M4: Tovu tool description.** In `apps/website/src/features/media-generation/agent-tools.ts`, replace the sentences `"Defaults to 'gpt-image-2' (OpenAI) when omitted. Other options include 'gemini-3.1-flash-image-preview' " + "(Nano Banana / Google Gemini) and 'grok-imagine-image' (xAI Grok), across every registered vendor. Which "` with `"Defaults to the workspace's saved default image model when omitted; the allowed values are this field's enum, " + "across every registered vendor. Which "`. Keep the rest of the string exactly as it is.

**SKIP rows:** leave untouched (Opus lane).

## Tests
- For each changed Jini file, find its tests: `rg -l "<def id or exported const name>" packages/agent-runtime/src --glob '**/__tests__/**'` and `packages/agent-runtime/src/**/*.test.ts`.
- A test asserting the old fallback ids (for example `expect(def.fallbackModels).toEqual([...ids])` or a snapshot) changes to assert the new array.
- A test that only uses an id as INPUT (a fake live list, a saved choice) keeps it: test fixtures may name model ids.
- Test-first for one def per file: change the assertion, run the file and paste the red, edit the source, run it green, then restore one deleted row as a mutant, run and paste the red, and remove the row again.
- Run single files only: `cd packages/agent-runtime && npx vitest run --maxWorkers=2 --minWorkers=1 <file>` (first build deps once: `(cd packages/protocol && npx tsc -p tsconfig.json) && (cd packages/core && npx tsc -p tsconfig.json) && (cd packages/platform && npx tsc -p tsconfig.json)`). No suites, no root tsc. Leave nothing running.
- `scripts/check-model-fallback-freshness.ts` will now report defs without `fallbackModelsAssertedAt`. Do NOT edit the script (Opus lane); list its output in your report.

## Rules
No `eslint-disable`, `as any`, non-null `!`. Never delete a "why" comment about CLI behaviour (move it). Change nothing outside the listed rows, their arrays, their asserted-at lines and their tests.

## Done check
`rg -n "'(claude|gpt|gemini|o4)-[a-z0-9.-]+'" <changed source files>` → only test files or SKIP rows. `npx eslint <changed files>` → no new errors. Commit per repo: `git add -- <paths> && git commit -F msg -- <paths>`, message `refactor(models): delete hard-coded model ids; the list is discovered at runtime`. Never push.

## Sites (76: 75 Jini + 1 Tovu). M1 65, M2 3, M3 1, M4 1 = 70 yours; 6 SKIP
| # | file:line (Jini unless marked) | id | variant |
|---|---|---|---|
| 1 | `packages/agent-runtime/src/defs/aider.ts:27` | `gpt-5.6-sol` | M1 |
| 2 | `packages/agent-runtime/src/defs/amr/index.ts:13` | `gemini-2.5-flash` | M3 |
| 3 | `packages/agent-runtime/src/defs/antigravity/index.ts:195` | `claude-opus-5-5-low` | M1 |
| 4 | `packages/agent-runtime/src/defs/antigravity/index.ts:196` | `claude-opus-5-5-medium` | M1 |
| 5 | `packages/agent-runtime/src/defs/antigravity/index.ts:197` | `claude-opus-5-5-high` | M1 |
| 6 | `packages/agent-runtime/src/defs/antigravity/index.ts:198` | `claude-sonnet-5-5-low` | M1 |
| 7 | `packages/agent-runtime/src/defs/antigravity/index.ts:199` | `claude-sonnet-5-5-medium` | M1 |
| 8 | `packages/agent-runtime/src/defs/antigravity/index.ts:200` | `claude-sonnet-5-5-high` | M1 |
| 9 | `packages/agent-runtime/src/defs/antigravity/index.ts:201` | `gemini-4-argon-high` | M1 |
| 10 | `packages/agent-runtime/src/defs/antigravity/index.ts:202` | `gemini-4-argon-medium` | M1 |
| 11 | `packages/agent-runtime/src/defs/antigravity/index.ts:203` | `gemini-4-argon-low` | M1 |
| 12 | `packages/agent-runtime/src/defs/antigravity/index.ts:204` | `gemini-3.8-flash-high` | M1 |
| 13 | `packages/agent-runtime/src/defs/antigravity/index.ts:205` | `gemini-3.8-flash-medium` | M1 |
| 14 | `packages/agent-runtime/src/defs/antigravity/index.ts:206` | `gemini-3.8-flash-low` | M1 |
| 15 | `packages/agent-runtime/src/defs/antigravity/index.ts:207` | `gemini-3.7-flash-high` | M1 |
| 16 | `packages/agent-runtime/src/defs/antigravity/index.ts:208` | `gemini-3.7-flash-medium` | M1 |
| 17 | `packages/agent-runtime/src/defs/antigravity/index.ts:209` | `gemini-3.7-flash-low` | M1 |
| 18 | `packages/agent-runtime/src/defs/antigravity/index.ts:210` | `gemini-3.6-flash-high` | M1 |
| 19 | `packages/agent-runtime/src/defs/antigravity/index.ts:211` | `gemini-3.6-flash-medium` | M1 |
| 20 | `packages/agent-runtime/src/defs/antigravity/index.ts:212` | `gemini-3.6-flash-low` | M1 |
| 21 | `packages/agent-runtime/src/defs/antigravity/index.ts:19` | `gemini-3.1-pro-high` | M1 |
| 22 | `packages/agent-runtime/src/defs/antigravity/index.ts:214` | `gemini-3.1-pro-low` | M1 |
| 23 | `packages/agent-runtime/src/defs/antigravity/index.ts:215` | `claude-sonnet-4-6` | M1 |
| 24 | `packages/agent-runtime/src/defs/antigravity/index.ts:216` | `claude-opus-4-6-thinking` | M1 |
| 25 | `packages/agent-runtime/src/defs/claude.ts:63` | `claude-opus-5-5` | M1 |
| 26 | `packages/agent-runtime/src/defs/claude.ts:64` | `claude-sonnet-5-5` | M1 |
| 27 | `packages/agent-runtime/src/defs/claude.ts:65` | `claude-haiku-5-5` | M1 |
| 28 | `packages/agent-runtime/src/defs/claude.ts:66` | `claude-haiku-4-5-20251001` | M1 |
| 29 | `packages/agent-runtime/src/defs/claude.ts:67` | `claude-fable-5-1` | M1 |
| 30 | `packages/agent-runtime/src/defs/claude.ts:68` | `claude-fable-5` | M1 |
| 31 | `packages/agent-runtime/src/defs/claude.ts:69` | `claude-opus-5` | M1 |
| 32 | `packages/agent-runtime/src/defs/claude.ts:70` | `claude-sonnet-5` | M1 |
| 33 | `packages/agent-runtime/src/defs/claude.ts:71` | `claude-haiku-4-5` | M1 |
| 34 | `packages/agent-runtime/src/defs/claude.ts:72` | `claude-opus-4-8` | M1 |
| 35 | `packages/agent-runtime/src/defs/claude.ts:73` | `claude-opus-4-7` | M1 |
| 36 | `packages/agent-runtime/src/defs/claude.ts:74` | `claude-opus-4-6` | M1 |
| 37 | `packages/agent-runtime/src/defs/claude.ts:75` | `claude-sonnet-4-6` | M1 |
| 38 | `packages/agent-runtime/src/defs/claude.ts:76` | `claude-opus-4-5` | M1 |
| 39 | `packages/agent-runtime/src/defs/claude.ts:77` | `claude-sonnet-4-5` | M1 |
| 40 | `packages/agent-runtime/src/defs/codebuddy/index.ts:28` | `claude-opus-4.8-1m` | M1 |
| 41 | `packages/agent-runtime/src/defs/codebuddy/index.ts:28` | `claude-opus-4.8` | M1 |
| 42 | `packages/agent-runtime/src/defs/codebuddy/index.ts:30` | `claude-sonnet-4.6-1m` | M1 |
| 43 | `packages/agent-runtime/src/defs/codebuddy/index.ts:31` | `claude-haiku-4.5` | M1 |
| 44 | `packages/agent-runtime/src/defs/codebuddy/index.ts:33` | `gpt-5.5` | M1 |
| 45 | `packages/agent-runtime/src/defs/codebuddy/index.ts:34` | `gpt-5.4` | M1 |
| 46 | `packages/agent-runtime/src/defs/codebuddy/index.ts:35` | `gpt-5.3-codex` | M1 |
| 47 | `packages/agent-runtime/src/defs/codebuddy/index.ts:37` | `gemini-3.5-flash` | M1 |
| 48 | `packages/agent-runtime/src/defs/codex.ts:341` | `gpt-6.1-sol` | M1 |
| 49 | `packages/agent-runtime/src/defs/codex.ts:342` | `gpt-6.1-terra` | M1 |
| 50 | `packages/agent-runtime/src/defs/codex.ts:343` | `gpt-6-sol` | M1 |
| 51 | `packages/agent-runtime/src/defs/codex.ts:344` | `gpt-6-luna` | M1 |
| 52 | `packages/agent-runtime/src/defs/codex.ts:345` | `gpt-6-astra` | M1 |
| 53 | `packages/agent-runtime/src/defs/codex.ts:346` | `gpt-5.6-sol` | M1 |
| 54 | `packages/agent-runtime/src/defs/codex.ts:347` | `gpt-5.6-terra` | M1 |
| 55 | `packages/agent-runtime/src/defs/codex.ts:348` | `gpt-5.6-luna` | M1 |
| 56 | `packages/agent-runtime/src/defs/codex.ts:349` | `gpt-5.5` | M1 |
| 57 | `packages/agent-runtime/src/defs/codex.ts:350` | `gpt-5.4` | M1 |
| 58 | `packages/agent-runtime/src/defs/codex.ts:351` | `gpt-5.4-mini` | M1 |
| 59 | `packages/agent-runtime/src/defs/codex.ts:352` | `gpt-5.3-codex` | M1 |
| 60 | `packages/agent-runtime/src/defs/codex.ts:356` | `gpt-5.2` | M1 |
| 61 | `packages/agent-runtime/src/defs/codex.ts:357` | `gpt-5.1` | M1 |
| 62 | `packages/agent-runtime/src/defs/codex.ts:358` | `gpt-5.1-codex-mini` | M1 |
| 63 | `packages/agent-runtime/src/defs/codex.ts:359` | `gpt-5-codex` | M1 |
| 64 | `packages/agent-runtime/src/defs/codex.ts:360` | `gpt-5` | M1 |
| 65 | `packages/agent-runtime/src/defs/codex.ts:362` | `o4-mini` | M1 |
| 66 | `packages/agent-runtime/src/defs/cursor-agent.ts:91` | `gpt-5` | M1 |
| 67 | `packages/integrations/src/media-providers/dispatch/providers/nanobanana.ts:35` | `gemini-3.1-flash-image-preview` | SKIP (M5, Opus) |
| 68 | `packages/integrations/src/media-providers/dispatch/providers/openai.ts:117` | `gpt-4o-mini-tts` | SKIP (M7, Opus) |
| 69 | `packages/integrations/src/media-providers/providers.ts:103` | `gemini-3.1-flash-image-preview` | SKIP (M6, Opus) |
| 70 | `packages/integrations/src/media-providers/providers.ts:118` | `gemini-3-pro-image-preview` | SKIP (M6, Opus) |
| 71 | `packages/integrations/src/media-providers/providers.ts:181` | `gpt-4o-mini-tts` | SKIP (M6, Opus) |
| 72 | `packages/integrations/src/media-providers/ui-defaults.ts:12` | `gemini-3.1-flash-image-preview` | SKIP (M5, Opus) |
| 73 | `packages/integrations/src/media-providers/ui-defaults.ts:101` | `claude-sonnet-5` | M2 |
| 74 | `packages/integrations/src/media-providers/ui-defaults.ts:118` | `gpt-5.6-sol` | M2 |
| 75 | `packages/integrations/src/media-providers/ui-defaults.ts:143` | `gemini-3.6-flash` | M2 |
| 76 | Tovu `apps/website/src/features/media-generation/agent-tools.ts:102` | `gpt-image-2`, `gemini-3.1-flash-image-preview`, `grok-imagine-image` | M4 |
