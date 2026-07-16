# Swarm Consensus Command (/consensus)

## Purpose
To invoke the multi-model Swarm Consensus skill to solve a complex problem using the combined reasoning of available CLI LLM tools (Gemini, Claude, Codex). Use `/debate` as a shorthand when you specifically want debate mode.

## Usage
Provide a mode and question. The active agent will dispatch this prompt to available LLM CLIs, collate independent responses, and synthesize a final `consensus-report.md`.

## Arguments
- `[mode] [controls] [prompt]`
- `mode`: `single-pass` (default) or `debate` (defaults to `max_rounds=2` when selected)
- `controls` (optional): `max_rounds=<int>`, `min_confidence=<0.0-1.0>`, `swarm_timeout_seconds=<int>`, `claude_model=<id>`, `gemini_model=<id>`, and/or `codex_model=<id>`
- `prompt`: the detailed question or architectural problem to analyze

---

**Directive:**
Act as a Swarm Consensus Coordinator.

1. Parse `$ARGUMENTS`:
   - Detect mode from first token when it is `single-pass` or `debate`; otherwise default to `single-pass`.
   - Detect optional controls anywhere in args: `max_rounds=<int>`, `min_confidence=<0.0-1.0>`, `swarm_timeout_seconds=<int>`, `claude_model=<id>`, `gemini_model=<id>`, and `codex_model=<id>`.
   - Remaining text is the prompt.
   - Defaults if omitted: `max_rounds=2` when `mode=debate`; `min_confidence=0.90`; `swarm_timeout_seconds=300`.
2. Load the Swarm Consensus skill from `<AI_DEV_SHOP_ROOT>/skills/swarm-consensus/SKILL.md`.
3. Follow prerequisite checks to verify which CLIs (`claude`, `gemini`, `codex`) are installed, capture CLI version strings as diagnostics, and resolve the planned model for each peer. Before any peer prompt preview or dispatch, run the smoke-test harness model-plan lookup:
   `python3 skills/swarm-consensus/scripts/cli_smoke_test.py --model-plan-only --output-format json`
   The lookup must check retained smoke-test proof first, especially `<ADS_MEMORY_ROOT>/reports/swarm-consensus/smoke-tests/last-known-good.json`, then legacy local smoke-test caches, dated smoke-test reports, retained/local consensus reports, repo-local evidence, and home CLI defaults that expose exact model IDs. CLI version strings prove tool availability only, not model identity.
4. If any installed peer model is inferred, alias-only, a local default without an exact `command_model`, or the exact resolved model ID cannot be proven, stop before packet preview or dispatch and print a blocking model-proof gate:
   `Blocked: exact peer model is not proven for <peer-list>. Checked smoke-test model plan and saved model evidence. Reply with exact model pins (claude_model=..., gemini_model=..., codex_model=...) or say "run smoke test" to prove current models. I will not dispatch peers with unresolved, alias-only, or exact-unknown local defaults.`
   - `run` is not a valid response to this block. The normal peer-dispatch `run` gate is available only after every installed peer selected for the swarm has an exact planned model ID.
   - Exception for Claude model-resolution failures: if a requested or saved Claude model is unproven or rejected, do not keep guessing manually. Run `python3 skills/swarm-consensus/scripts/cli_smoke_test.py --discover-claude --claude-model <requested-or-saved-model> --claude-require json --output-format json` first.
   - A valid Claude proof is any one of: an exact environment cache hit from `<ADS_MEMORY_ROOT>/reports/swarm-consensus/smoke-tests/last-known-good.json` with a real artifact path, an exact-model `session_success` earlier in the current session on the same host/CLI, or a fresh discovery run that writes a new artifact.
   - If discovery finds a working exact Claude model in the same requested family/version, use it and say that it was smoke-proven locally on this host.
   - If discovery finds only a different family/version, stop and ask the user before switching.
5. After exact models are proven or pinned, print preflight with planned model names first and CLI versions only under diagnostics. Never present CLI version strings as model names or model versions.
6. If the question depends on repo-specific or project-specific context, create a shared context packet first using `skills/swarm-consensus/references/context-packet-template.md`. Before writing it, if the user has not already specified retained vs local-only, ask:
   `Save context packet? Reply "save packet" to retain it in <ADS_MEMORY_ROOT>/reports/swarm-consensus/context/ or "local only" to keep it in <ADS_MEMORY_ROOT>/.local-artifacts/swarm-consensus/context/.`
   Save local-only packets to `<ADS_MEMORY_ROOT>/.local-artifacts/swarm-consensus/context/CTX-<slug>-<YYYY-MM-DD>.md` by default. If the user explicitly wants it retained, save or promote it to `<ADS_MEMORY_ROOT>/reports/swarm-consensus/context/`.
   - Prefer serving the packet to peers as a self-contained `stdin` payload when it fits cleanly in one bounded prompt.
   - If a peer still needs file-based packet access, follow the shared transport fallback rules in `skills/llm-operations/references/peer-llm-dispatch.md`.
   - Do not promote a local-only packet into `<ADS_MEMORY_ROOT>/reports/` only to satisfy peer readability.
   - In `debate` mode, apply the Debate Problem-Framing Guard from `<AI_DEV_SHOP_ROOT>/skills/swarm-consensus/SKILL.md`: lead with the user's need and constraints, present candidate solutions as options rather than the expected answer, and require adversarial critique of failure modes and alternatives.
7. Before dispatching any external peer LLM, write the exact peer-facing prompt/context packet to disk, show the user a short `Peer Dispatch Brief`, show the file path, and wait for the user to reply `run`.
   - This preview gate is mandatory even when model resolution was already confirmed.
   - Do not inline the full packet by default unless the user asks for it. The linked file is the exact source of truth for what will be sent.
   - The `Peer Dispatch Brief` must include:
     - planned peer models, with CLI versions only as diagnostics
     - current position summary by participant when this is a later debate round
     - reasoning summary, limited to the strongest 2-4 reasons or disagreements
     - what is specifically being asked in this dispatch or next round
     - **file-context line (mandatory):** state plainly that peers will read repo files for more context and better results, and name the bounded file set (or staged path) being made available. Reading necessary files is the default; if a run is deliberately packet-only (no file reads), say so and why. For Gemini/`agy`, name the staged `<ADS_MEMORY_ROOT>/tmp/peer-dispatch/<workflow>/files/` set per the peer-dispatch rules.
     - what replying `run` will do
   - If the user flags an issue, revise the file and repeat the preview gate.
   - In debate mode, the Round 1 peer prompt must not include the Primary model's answer. Preview later rebuttal prompts too when they are materially different or include other participants' full previous-round reasoning.
8. Treat the current host model as the `Primary` participant and require a substantive frozen first-pass response before any peer synthesis. If the host environment cannot surface that first-pass response cleanly, create exactly one same-family child/helper to fill the `Primary` slot before continuing. Do not count that helper as an extra voting peer. A peer-only run is invalid and must stop.
9. Run consensus in the chosen mode:
   - `single-pass`: independent first pass + one synthesis.
   - `debate`: independent first pass + bounded debate rounds until `min_confidence` agreement or `max_rounds`.
   - Apply the **Solution Slate Protocol** from `skills/llm-operations/references/peer-llm-dispatch.md` to the synthesis: require peers to return a ranked slate of solutions and reconcile them into one Coordinator slate (≥2 options, explicit ranking criteria, per-option trade-offs, a recommendation + cheapest de-risking test; for debate, back the leading option with sample code / pseudocode). This applies to `single-pass` synthesis and to `debate` synthesis / Round 2+ only — never `debate` Round 1, which stays solution-neutral.
   - In `debate` mode, each rebuttal round must require every responding model — the Primary/host model included, not just external peers — to explain its current position, why it holds that position, whether that position changed this round, the strongest argument against the leading opposing position, and what evidence or assumption change would move it. The Primary must independently freeze its own rebuttal before reading peers' this-round responses (same anti-bias rule as Round 1); a round where the Coordinator only dispatches/synthesizes without producing its own updated position is invalid and must be redone.
   - Before starting the full peer timer, run the Peer Handshake Gate from `skills/llm-operations/references/peer-llm-dispatch.md`: require packet-bound ACK within 60 seconds by default, using `ACK_PACKET_RECEIVED <packet-id or deterministic packet marker> -- I received the packet and will work on it.`
   - Start `swarm_timeout_seconds` only after peer handshakes succeed or failed peers are explicitly classified and excluded.
   - Apply `swarm_timeout_seconds` as the total wall-clock budget for substantive peer dispatch across the whole run.
10. Prefer structured output modes for peer CLIs when available. Parse `stdout` only as the peer answer; keep `stderr` as diagnostics.
11. Treat transient peer failures such as `429`/`503` or clear capacity/rate-limit errors as retryable within the remaining `swarm_timeout_seconds` budget.
12. Before writing the final report, if the user has not already specified retained vs local-only vs inline-only, ask:
   `Save consensus report? Reply "save report" to retain it in <ADS_MEMORY_ROOT>/reports/swarm-consensus/runs/, "local only" to keep it in <ADS_MEMORY_ROOT>/.local-artifacts/swarm-consensus/runs/, or "inline only" for no file.`
   Save the final report to `<ADS_MEMORY_ROOT>/.local-artifacts/swarm-consensus/runs/<timestamp>-consensus-report.md` by default. If the user explicitly wants a retained artifact, save it to `<ADS_MEMORY_ROOT>/reports/swarm-consensus/runs/<timestamp>-consensus-report.md` instead. If the user wants inline-only output, skip file creation. Follow the Step 5 template from `skills/swarm-consensus/SKILL.md` exactly.
13. In `debate` mode, include round-by-round movement in an optional `## Debate Trace` section, including why models held or changed their positions and what would change their minds, but do not omit or rename the mandatory Step 5 sections (`The Swarm`, `Dispatch Diagnostics`, `Individual Responses`, `Synthesis`, `Decision Ledger`, `Final Recommendation`).
14. A valid consensus report must contain a non-empty `Primary` row in `The Swarm` and a non-empty primary subsection under `Individual Responses`. If either is missing, stop and report an invalid peer-only consensus run instead of returning the report.
