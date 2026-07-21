# Cowork Command (/cowork)

## Purpose
Coordinate multiple LLMs on a bounded file-editing task. Unlike `/debate`, this command is not reasoning-only. Unlike `/audit-work`, this command allows implementation work. All participants read the full scoped file set, independently diagnose what should change and why, converge on one shared edit plan, then write and verify changes under Coordinator-controlled file leases.

## Usage
Provide a bounded task and either explicit files or enough detail for the Coordinator to propose a file scope before writes.

## Arguments
- `[controls] [task]`
- `controls` (optional):
  - `files=<path1,path2,...>`: required for autonomous write execution; if omitted, the Coordinator must propose a scope and ask for confirmation before writes
  - `peers=<claude,gemini,codex>`: peer CLIs to include; default is available external peer CLIs, preferring different model families from the current host
  - `risk=<auto|low|medium|high>`: risk tier; default `auto`; when `auto`, the Coordinator resolves the tier from participant recommendations and change characteristics, using the highest justified tier
  - `approval=<plan|auto>`: default `plan`; `auto` is allowed only when the user explicitly provided it in this invocation
  - `audit=<auto|skip|require>`: default `auto`; `require` means audit must run and skip is not available regardless of conditions; `skip` is honored only when the audit-skip policy is satisfied
  - `max_retry_cycles=<1|2>`: default `1`; applies independently to peer-verification retries and test-gate retries, not as one shared total budget
  - `max_correction_rounds=<1|2>`: default `1`; number of post-audit correction rounds; independent from peer-verification and test-gate retry budgets
  - `test_command=<command>`: explicit verification command; if omitted, infer a safe project test command or report that no automated test gate was found
  - `claude_model=<exact-id>`, `gemini_model=<exact-id>`, `codex_model=<exact-id>`: optional per-run model pins
- `task`: the concrete change to make

---

**Directive:**
Act as a Cowork Coordinator. Prefix user-facing updates with `Coordinator(Cowork):`.

This is a collaborative implementation workflow, not Swarm Consensus debate and not External Audit.

1. Parse `$ARGUMENTS`.
   - Extract controls listed above.
   - Treat remaining text as the task.
   - If `files=` is omitted, inspect the repo enough to propose a bounded file list, then stop and ask the user to approve or revise the scope before any write-capable peer dispatch.
   - If the task is broad enough that the file set cannot be bounded, stop and ask for scope narrowing. `/cowork` is for small, reviewable file sets.
   - If the user asks to abort before writes begin, stop with no file changes. If the user asks to abort after cowork writes begin, restore in-scope files from the saved baseline when safe, report what was restored, and preserve unrelated worktree changes.

2. Run peer and model preflight.
   - Use `<AI_DEV_SHOP_ROOT>/skills/llm-operations/references/peer-llm-dispatch.md` for peer CLI transport, diagnostics, and failure classification.
   - Detect available peer CLIs: `claude`, `gemini`, and `codex`.
   - Select peers from `peers=` if provided; otherwise select available external peer CLIs, preferring different model families from the current host.
   - Minimum viable cowork is the primary model plus at least one external peer. If no external peer is available, stop and ask whether to proceed as single-agent implementation instead; do not call it `/cowork`.
   - Resolve exact model identity for each selected peer using per-run pins, saved local preferences, local CLI config, or smoke-test proof where available.
   - If a selected peer's exact model cannot be proven, print a model confirmation gate before dispatch:
     `Planned cowork peers: Claude=<resolved-or-inferred>, Gemini=<resolved-or-inferred>, Codex=<resolved-or-inferred>. Reply with "run" to proceed or override with claude_model=..., gemini_model=..., codex_model=....`
   - CLI version strings are diagnostics only. Do not present CLI versions as model identities.

3. Protect the worktree before any writes.
   - Run `git status --short`.
   - Separate in-scope files from unrelated dirty worktree changes. Do not revert or overwrite unrelated changes.
   - For every in-scope file, save a baseline copy and content hash under `<ADS_PROJECT_KNOWLEDGE_ROOT>/.local-artifacts/cowork/runs/<timestamp>/baseline/`.
   - Save the initial in-scope diff, if any, under the same run folder so pre-existing user edits can be restored on abort.
   - Before each write step, re-check the scoped file hashes. If a scoped file changed outside the cowork workflow, stop and ask the user how to proceed.

4. Build the shared context packet.
   - Include the task, controls, selected peer models, risk assumptions, scoped file paths, baseline hashes, and full content of every scoped file.
   - Include relevant test files or commands when they are obvious from repo conventions.
   - Save local-only context by default to `<ADS_PROJECT_KNOWLEDGE_ROOT>/.local-artifacts/cowork/runs/<timestamp>/context.md`.
   - If the user explicitly asks to retain the packet, save it under `<ADS_PROJECT_KNOWLEDGE_ROOT>/reports/cowork/runs/<timestamp>/context.md`.
   - Give every participant the same context packet. Do not let one model reason from hidden extra file content unless the Coordinator adds that content to the shared packet first.

5. Independent diagnosis phase, read-only.
   - The primary model must produce and freeze its own diagnosis before reading peer diagnoses.
   - Dispatch selected peers in read-only or plan mode where supported. If a peer CLI cannot enforce read-only mode, the prompt must explicitly forbid edits in this phase.
   - Require every participant to return:
     - scope check
     - reasoning flaws or implementation defects found
     - proposed changes with file and line references where possible
     - proposed file ownership
     - risk tier recommendation
     - tests or checks that should prove the change
   - Do not invent missing peer responses. If a peer fails, classify the failure and continue only if minimum viable cowork still holds.

6. Converge on the shared edit plan.
   - Synthesize all diagnoses into one plan.
   - The plan must include:
     - scoped files
     - risk tier; when `risk=auto`, use the highest justified tier from participant recommendations and change characteristics
     - file-level lease map with exactly one writer per file
     - intended changes per file
     - acceptance checks
     - known disagreements and their resolution rationale
     - audit expectation from the audit-skip policy
   - Use file-level leases for v1. Hunk-level leases are out of scope unless the user explicitly asks for experimental behavior.
   - If participants cannot converge within two plan rounds, stop and present the competing proposals plus the disagreement ledger.
   - Default `approval=plan`: show the plan and ask the user to approve before writes.
   - If `approval=auto` was explicitly provided, proceed without the plan approval pause, but still print the plan before writes.

7. Write under leases.
   - A participant may modify only files it owns in the lease map.
   - If running multiple writer peers concurrently, use isolated worktrees or another proven isolation mechanism. Do not run unconstrained writer CLIs concurrently in the same worktree.
   - If writing in the main worktree, run write leases sequentially unless the tooling can enforce disjoint file writes.
   - Prefer peer-native file edits only when the CLI can be constrained to the leased file set. Otherwise, ask the peer to return a unified diff for its leased files and have the Coordinator apply that diff.
   - After each writer returns, inspect `git diff --name-only` for out-of-lease changes. Out-of-lease writes are a protocol violation: stop, restore only the violating cowork changes from the saved baseline when safe, and record the violation in the disagreement ledger.
   - Scope expansion requires user approval before any new file is read into the shared context or modified.

8. Peer verification phase.
   - For each file-level lease diff, dispatch all non-writers to verify the diff against the shared edit plan and current file state.
   - Require explicit `APPROVE` or `REJECT` with reasons.
   - A rejection must identify the violated plan item, changed behavior, missed edge case, or test gap.
   - **Scoring Gate (mandatory):** Every verifier must include a numerical score (1-10) with:
     - The score and one-sentence rationale (required even for a 10)
     - Top issues that reduced the score (if < 10)
     - What specifically would raise the score to 10 (if < 10)
   - Score/vote precedence: an explicit `REJECT` is always binding regardless of score. Additionally, a score below 7 is treated as a `REJECT` even if the verifier said APPROVE.
   - Scores 7-9 with APPROVE: pass. The "path to 10" items are surfaced as `should-fix` in the final output but do NOT trigger re-verification.
   - If a verifier omits a score, returns a non-numeric value, or provides an out-of-range number, retry the verification request once with an explicit score reminder. If still missing, treat that verifier's response as abstained and note it in the final output.
   - Scores are included in the final output's verifier votes section.
   - Give the writer at most `max_retry_cycles` peer-verification retry cycles for that file. If verification still fails, restore the cowork baseline for in-scope files, present the disagreement ledger, and stop.

9. Test and formatting gate.
   - Run `test_command` if provided.
   - If omitted, infer the narrowest safe test/format/lint command from project evidence. If no automated command can be inferred, say so plainly.
   - If tests fail, classify failures by likely owner file or lease.
   - Give the cowork run at most `max_retry_cycles` test-gate retry cycles for test failures. This budget is separate from peer-verification retries. If failures persist, restore the cowork baseline for in-scope files, present failure clusters and the disagreement ledger, and stop.

10. Run `/audit-work` on the implementation.
   - After tests pass, run `/audit-work` inline as a built-in cowork guardrail. This is not optional by default.
   - Use the diff from the saved cowork baseline hashes to current in-scope files as the audit input. Exclude unrelated dirty worktree changes.
   - Use `suggest_changes=patches`.
   - Prefer a different model family from the writer for the auditor. If no external auditor is available, invoke the primary model in a fresh context/session so it does not rubber-stamp its own prior output.
   - When same-family audit is used, disclose it in the final output. For medium/high risk, require user confirmation before proceeding with a same-family auditor.
   - The audit examines the actual implemented diff, not the plan. It catches mistakes that only surface in written code.
   - The `/audit-work` scoring gate applies here: the auditor must return a 1-10 score. An audit score below 7 becomes a normalized `blocker` for correction rounds. Scores 7-9 are advisory — the "path to 10" items are surfaced as `should-fix` but do not block. A score of 10 with no findings skips correction rounds.
   - If the auditor omits a score, returns a non-numeric value, or provides an out-of-range number, treat it as a malformed response: retry once with an explicit score reminder, then classify as `degraded coverage` if still missing.
   - The Coordinator normalizes audit findings into `blocker`, `should-fix`, or `optional` while preserving the auditor's original wording and severity rationale.
   - Present the full normalized audit findings to the user and the writer before correction rounds begin.
   - Audit-skip policy: `/audit-work` may be skipped only when `audit=skip` is explicitly provided AND all of these hold:
     - risk tier is `low`
     - the change does not involve security, authentication, authorization, data integrity, schema migration, payment, public API contract, dependency/infra, concurrency, or architecture-sensitive areas
     - no unresolved or material resolved disagreement remains in the ledger
     - all peer verifiers approved their non-owned diffs
     - no out-of-lease writes occurred
     - automated tests/checks passed
   - If `audit=skip` conflicts with the policy, do not silently skip. Report that the requested skip is blocked, explain why, and proceed with running the audit.

11. Correction rounds.
   - After the audit report is delivered, run up to `max_correction_rounds` correction rounds (default 1, max 2).
   - Present audit findings (classified as `blocker`, `should-fix`, or `optional`) to the writer.
   - The writer reviews each finding and states whether it agrees or disagrees, with reasoning.
   - The writer applies only the corrections it agrees with — no blind acceptance.
   - Disagreements are recorded in the disagreement ledger with the writer's reasoning.
   - After each correction round, re-run the step 9 test gate. If tests fail, the writer gets one test-fix attempt within the same round. If the test-fix attempt also fails, restore the cowork baseline for in-scope files when safe, report the correction failure and disagreement ledger, and stop.
   - After each correction round that produced changes, the Coordinator performs a targeted self-verification pass on the correction diff. This is a zero-external-token check using the Coordinator's existing context. It verifies:
     1. Each accepted fix actually resolves the finding it addressed.
     2. The correction diff does not introduce obvious contradictions with adjacent steps or the converged plan.
   - If the self-verification spots a problem, flag it as an unresolved blocker for the user rather than triggering another correction cycle.
   - If blockers remain unaddressed after all correction rounds, flag them prominently for user decision.
   - If no audit findings require changes, skip correction rounds.

12. Final output.
   - Include:
     - participants and resolved model identities
     - scoped files
     - baseline snapshot location
     - file lease map
     - summary of changes
     - disagreement ledger
     - verifier votes (must include each verifier's 1-10 score, rationale, and path-to-10)
     - tests/checks run and results
     - audit findings summary (auditor family, same-family disclosure if applicable, auditor score)
     - correction rounds: what was accepted, what was rejected, and why
     - self-verification results
     - unresolved blockers (if any) requiring user decision
     - remaining risks or manual follow-up
   - If the run reverted to baseline, state that no cowork changes remain applied and include the reason.
   - Keep the final answer decision-ready and concise.
