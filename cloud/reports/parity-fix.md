# PARITY-FIX: size-aware argv gate for automatic plugin guidance

Branch `cloud/parity-argv` in both repos.
- Tovu base: `cloud/combine` `ee9c64f4a`.
- Jini base: `cloud/combine` `a184586d9`.

Source: Part 2 of `cloud/reports/reviews-1108.md` on `origin/cloud/reviews-1108`.

## Commits

| Repo | SHA | What |
|---|---|---|
| Jini | `d0030e72` | P2-1, engine side. The primary's byte cap comes from the headroom, and `resolveArgvPromptBudget` is exported. Adds a changeset. |
| Tovu | `a25a478c` | P2-1, host side. Computes the real argv headroom and passes it to preflight. |
| Tovu | (this report) | The report and the raw evidence. |

## The change (P2-1)

Before this change, `automatic-use.ts` inlined the primary only when `maxPromptArgBytes === undefined`. So DeepSeek and Aider got no automatic primary guidance on any platform, POSIX included, where the budget is 100 KB and the 16 KiB primary always fit.

### Jini: `packages/agent-plugins/src/lifecycle/automatic-use.ts`
- `maxPromptArgBytes` in `PrepareInput` now means the argv bytes still free for automatic guidance. The host computes it. It stays absent when the adapter has no argv limit.
- The binary gate is gone. `resolveGuidance` takes an optional `primaryBytes` cap (the `MAX_PRIMARY_GUIDANCE_BYTES` default is unchanged). `prepare` passes `Math.min(MAX_PRIMARY_GUIDANCE_BYTES, input.maxPromptArgBytes ?? Infinity)`.
- A primary larger than the cap takes the existing path: the "deferred … Load the full instructions with …" pointer. It is not recorded as delivered, and `load` still returns the full text.
- **Claude:** its def has no `maxPromptArgBytes`, so the cap is `min(16 KiB, Infinity)`, the same as before. Byte-for-byte unchanged.

### Jini: `packages/agent-runtime/src/prompt-budget.ts`
- `resolveArgvPromptBudget` is now exported, as `({ maxPromptArgBytes }, { platform })`, following the (required, optional) rule.
- The one internal caller, `checkPromptArgvBudget`, is updated. Its behaviour is unchanged.
- No Jini package imports another. `agent-plugins` still knows nothing about platforms or agent defs.

### Tovu: `apps/website/src/server/runtime/composition/modules/assistant-tool-exec.ts`
- New exported `automaticGuidanceArgvHeadroom({ agentId, prompt, pinnedPrefix }, { platform })`. It computes:

  `resolveArgvPromptBudget(def.maxPromptArgBytes, platform) − bytes(prompt) − bytes(pinnedPrefix) − 4 KiB`

  The result is clamped at 0. It is `undefined` when the def has no `maxPromptArgBytes`.
- The 4 KiB reserve covers what is added around the prompt: the relevance note (≤ 600 B), a deferred pointer, off-plugin pointers, the refusal prefix and page context.
- At the call site, the prompt is `context.prompt` plus `coldStartContext` when present, and `pinnedPrefix` is the actual pinned text. The call site already returns early when the pins are refused.
- **Windows:** DeepSeek's limit stays 30,000 bytes, and the prompt, pins and reserve all count against it. So the automatic primary can never push a Windows argv adapter over its limit. If prompt plus pins are already over, the headroom is 0 and nothing is inlined. The launch guard still refuses such a run, unchanged.
- The code is generic, not per-CLI. No per-CLI code was added to shared files.

## Evidence

Raw output is in `cloud/reports/raw/parity-fix/`.

### Jini (vitest, `--maxWorkers=2 --minWorkers=1`)

| Step | File | Result |
|---|---|---|
| Red (new tests, old code) | `jini-red.txt` | 2 failed / 67 passed. The "inlines the primary when it fits the remaining headroom" and "defers a primary larger than the remaining headroom" tests fail. |
| Green | `jini-green.txt` | 69 / 69 passed |
| Mutation: `primaryBytes: MAX_PRIMARY_GUIDANCE_BYTES`, which ignores the headroom | `jini-mutation.txt` | 2 failed. The "defers…" and "no headroom left inlines nothing" tests fail. Source restored. |
| `resolveArgvPromptBudget` test | `jini-runtime-budget.txt` | 33 / 33 passed (prompt-budget suite) |
| `tsc --noEmit`, `agent-plugins` and `agent-runtime` | `jini-tsc-*.txt` | exit 0, both |

The old test "an argv-budgeted adapter retains metadata-only automatic preparation" asserted the over-correction. It was replaced by the three headroom tests.

### Tovu (node:test, `--test-concurrency=2`, linked to the local Jini build)

| Step | File | Result |
|---|---|---|
| Red (new tests, old `assistant-tool-exec.ts`, fixed Jini) | `tovu-red.txt` | 2 failed / 43 passed. (a) The unit file cannot import `automaticGuidanceArgvHeadroom`. (b) `deepseek, prompt=full` fails, because old Tovu passes the raw 30,000 limit as headroom, so the primary is inlined into a ~84 KB prompt and the composed argv exceeds the 100 KB guard. |
| Green | `tovu-green.txt` | 48 / 48 passed |
| Mutation: prompt bytes dropped from `used` | `tovu-mutation.txt` | 2 failed, the same two. Source restored and verified with `cmp`. |

The integration test `accepted adapter prompt budget preserves preflight delivery` now covers four cases:
- **deepseek, prompt=fits (~3 KB).** The primary is inlined, `pluginIds = [plugin]`, and the composed daemon prompt contains it and stays ≤ budget. It fits under Windows' 30,000 too.
- **deepseek, prompt=full (~84 KB).** A deferred pointer, no guidance text, `pluginIds = []`. The composed prompt is ≤ budget, and composed plus guidance would be over it.
- **claude.** The full primary, unchanged.
- **deepseek with a pin.** The pinned text only, unchanged.

The unit test pins the Windows arithmetic: `30,000 − 16,000 − 4,096`. The integration test runs on the Linux host.

### Tovu type-check
`tsc -p tsconfig.json --noEmit`: see "Tovu type-check result" at the end.

## P2-2: confirmed not real as written; not fixed

- The review's scenario is a restarted attempt of the same message running a different `agentId`, then reusing a Claude-sized cached preflight. That cannot happen.
  - Restarts are built by `continuationRequest` (Jini `packages/chat/src/core/durable-runs/continuation.ts:97`), which spreads `...run.request`. The accepted `agentId` is carried unchanged, and only `contextRef` is rebuilt.
  - The first launch (`accept.ts:29`) also uses `run.request`.
- A related variant does exist now that the gate depends on prompt size, and it is left open:
  - A reconstruction continuation's `prompt` includes the saved transcript, so it is larger than the first attempt's.
  - `rejoin` keeps the cached preflight, so a Windows argv run could receive a primary sized for the shorter first prompt.
  - It fails closed: the launch guard refuses with `AGENT_PROMPT_TOO_LARGE`. It is Windows-only.
  - The fix is not small. Re-preparing a turn whose primary is already recorded as delivered would drop the primary rather than re-size it, and the existing test "replacement preflight retains the exact prepared bytes" pins byte-identical reuse as intended. This needs a design decision, not a one-line cache key.

## P2-3 (listed, not fixed, as instructed)

- `automatic-use.ts` `rememberDelivery` merges `decision?.delivered` into the persisted list in every mode, not just Off.
- So a plugin delivered earlier, then excluded or disabled, then re-admitted, still counts as delivered:
  - its primary is not inlined again;
  - it appears in children's `guidanceIds`.
- That holds even after the CLI session that saw it has been reset.
- Suggested fix: merge `decision?.delivered` only when `mode === 'off'`. Severity: low.

## Release coupling

- Tovu still declares `@jini-ai/agent-plugins` / `@jini-ai/agent-runtime` from the registry. `resolveArgvPromptBudget` is a new export.
- So Jini `d0030e72` (changeset `argv-headroom-primary-guidance.md`, patch) must be released, or linked, before Tovu `a25a478c` builds against the registry.
- Nothing was published.

## Not done
- No run on a real Windows host.
- No signed-in live run.
- No full test suites: only the changed test files were run.

## Tovu type-check result
- `tsc -p tsconfig.json --noEmit`, with Jini linked to the local build.
- Exit 0, no errors (`raw/parity-fix/tovu-tsc.txt`).

PARITY-FIX DONE
