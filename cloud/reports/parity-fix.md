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

## PARITY-FIX-2

This is a follow-up to an independent review of the change above, on the same branch `cloud/parity-argv`.

### Commits

| Repo | SHA | What |
|---|---|---|
| Jini | `7edf8f17` | `daemon`: `AgentExecutor.run` takes an optional `compactPrompt`. Includes a changeset. |
| Jini | `ba2de1ad` | `agent-plugins`: `prepareVariants` returns `{ prefix, compact }`, where `compact` has the inlined primary replaced by its load pointer. |
| Tovu | `58677865` | Preflight returns `compactPrefix`. The daemon scope builds `compactPrompt`. The guessed-headroom helper is removed. |

### Approach

The review showed that the site cannot know the CLI's real remaining argv space. The executor adds things after the site prepares the prompt:
- the system overlay;
- the attachment notice;
- the executable and its options;
- Windows quoting.

Two more problems came from where the decision was made:
- The prompt and the history representations were counted together.
- A retry reused the first attempt's decision.

So the decision has moved to where the real assembly happens:
1. **Preflight returns two variants.** The full prefix, as before, and a compact one in which an inlined automatic primary is replaced by the existing "deferred … Load the full instructions with …" pointer. Pinned guidance is identical in both. The Tovu response carries `compactPrefix` only when it differs from `prefix`.
2. **The Tovu daemon scope assembles both prompts.** It does so after `selectRunHistoryPrompt`, so only the history that actually runs is included. The page context, attachment notice, capability manifest and refusal prefix are also included. The only difference between the two prompts is the plugin prefix. `compactPrompt` is passed to the executor only when it differs.
3. **The executor chooses per attempt.**
   - `run()` first runs the full prompt with the two budget guards set to signal rather than fail the run. Those guards are `checkPromptArgvBudget` and the post-`buildArgs` Windows cmd-shim / direct-exe command-line guard, which sees the overlay-bearing args, the executable, the options and the quoting.
   - If either guard fires, it launches `compactPrompt`. Both guards release anything they staged before failing, and the argv guard runs before anything is staged.
   - The guards apply unchanged to the compact prompt, so a run fails only when neither variant fits.
   - Without `compactPrompt`, `run()` behaves exactly as before.

### Findings

**Finding 1, High: incomplete command-line accounting. Fixed.**
- `automaticGuidanceArgvHeadroom` and its guessed 4 KiB reserve are deleted.
- The decision is now made against the executor's real guards on the real assembly.
- The old integration assertion that read the executor input is replaced. It now checks:
  - `compactPrompt` is exactly `prompt` with the prefix swapped;
  - the real DeepSeek def's argv guard refuses `prompt` and accepts `compactPrompt`.

**Finding 2, Medium: a reconstruction retry reuses an obsolete budget decision. Fixed.**
- The cached preflight now keeps both variants. Consent and resolved content are still prepared once per turn.
- Each attempt (`rejoin`) gets both variants, and its own executor launch chooses against its own assembled prompt.
- A rejected preparation stays retryable, as before.
- This applies on POSIX too. My earlier "Windows-only" note was wrong: the POSIX 100 KB argv guard also fires.

**Finding 3, Medium: two history representations counted together. Fixed by removal.**
- The sum `prompt + coldStartContext` no longer exists.
- The compact and full prompts are both assembled after `selectRunHistoryPrompt` has picked one representation.

### Evidence

Raw output is in `cloud/reports/raw/parity-fix/fix2-*.txt`.

| Step | Result |
|---|---|
| Jini daemon red (`fix2-jini-daemon-red.txt`) | 2 failed. "launches the compact prompt when the full prompt exceeds the argv budget" and "… when Windows quoting expands the full command line past the limit". |
| Jini daemon mutation: the retry relaunches the full prompt (`fix2-jini-daemon-mutation.txt`) | The same 2 fail. Source restored. |
| Jini daemon green (`fix2-jini-daemon-green.txt`) | All 393 tests in `agent-executor.test.ts` pass. This includes "keeps the full prompt when it fits" and "still fails before spawn when the compact prompt does not fit either". |
| Jini agent-plugins red / mutation / green | Red: 2 failed. Mutation (`compact = prefix`): 1 failed. Green: 71/71. |
| Jini `tsc --noEmit` | `daemon`: exit 0. `agent-plugins`: exit 0. |
| Tovu red (`fix2-tovu-red.txt`) | 2 failed. The deepseek preflight does not carry `compactPrefix`, and `runs.compactPrefix` does not exist. |
| Tovu mutation: `compactPrefix` returns the full prefix (`fix2-tovu-mutation.txt`) | The same 2 fail. Source restored. |
| Tovu green (`fix2-tovu-green.txt`) | 58 of 59 pass. The one failure is pre-existing (see below). |

The Tovu green run covers four files:
- `automatic-agent-plugins.integration`;
- `assistant-tool-exec.unit`;
- `assistant-agent-plugin-preflight.integration`;
- `agent-daemon-site-tools.unit`.

**Pre-existing failure, not caused by this change:** `agent-daemon-site-tools.unit.test.ts` › "plugin preflight sends only the live run id…".
- Its fake response omits `pluginIds`, which the strict schema already requires.
- It fails the same way with the untouched base version of `agent-daemon-site-tools.ts` (`fix2-tovu-sitetools-baseline.txt`).
- It was left alone as out of scope.

### Residual, not fixed

- **The fallback does not update delivery state.** If the executor falls back to the compact prompt, the controller has still recorded the primary as delivered. As a result:
  - the usage chip shows it;
  - children are told to `load_agent_plugin` it;
  - a later turn will not re-inline it.
  
  The parent still receives the load pointer in its prompt, so the guidance stays reachable. Reporting the executor's choice back to the site would need a new daemon → site message, which is larger than this fix.
- **POSIX overlay gap in the argv guard.** On POSIX the argv guard measures the prompt before the overlay, as before. An overlay that pushes argv past the kernel limit on POSIX still surfaces as a spawn error. This guard was kept unchanged, as instructed.
- **Leftover cap.** Jini's `PrepareInput.maxPromptArgBytes` cap from PARITY-FIX remains. It is harmless, but Tovu no longer passes it.
- **Release coupling.** Tovu `58677865` needs Jini `7edf8f17` and `ba2de1ad` released, or linked.

### Tovu type-check
- `tsc -p tsconfig.json --noEmit`, with Jini linked to the local build.
- Exit 0, no errors (`fix2-tovu-tsc.txt`).

PARITY-FIX-2 DONE
