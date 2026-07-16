# Handoff Command (/handoff)

## Purpose
Create a compact continuation document so another agent, host, or future session can pick up the current work without replaying the full conversation. Useful for moving from Codex to Claude Code, resuming later, or handing a bounded workstream to a teammate.

## Usage
Provide optional controls and the intended next-session focus.

## Arguments
- `[controls] [focus]`
- `controls` (optional): `target=<claude|codex|gemini|generic|human>`, `save=<local-artifacts|os-temp|inline>`, `include_diff=<summary|stat|none>`
- `focus`: what the next session should continue or verify

---

**Directive:**
Act as a Handoff Coordinator. Prefix user-facing updates with the current AI Dev Shop agent and mode.

1. Parse `$ARGUMENTS`:
   - Detect optional controls anywhere in args: `target=<claude|codex|gemini|generic|human>`, `save=<local-artifacts|os-temp|inline>`, and `include_diff=<summary|stat|none>`.
   - Remaining text is the handoff focus.
   - Defaults if omitted: `target=generic`, `save=local-artifacts` when `<ADS_MEMORY_ROOT>` is available and writable, otherwise `save=os-temp`; `include_diff=summary`.
2. Load `<AI_DEV_SHOP_ROOT>/skills/handoff/SKILL.md`.
3. Resolve `<AI_DEV_SHOP_ROOT>` and `<ADS_MEMORY_ROOT>` from the current session. If project knowledge is unavailable and `save=local-artifacts`, fall back to the OS temp directory and say so.
4. Inspect the current evidence surface before writing:
   - current conversation state and active agent/mode
   - `git status --short`
   - relevant changed-file names and, when useful, a diff stat or short diff summary
   - active specs, ADRs, tasks, reports, or project-knowledge artifacts referenced during the session
   - commands run and their pass/fail result when relevant
5. Build the handoff document using the template in `skills/handoff/SKILL.md`.
   - For `target=claude`, include a `Next-Agent Prompt` that tells Claude Code to read `<AI_DEV_SHOP_ROOT>/AGENTS.md` first, then this handoff, then continue from the listed next steps.
   - For `target=codex`, include any relevant skill names and repo instructions needed for Codex to rehydrate context.
   - For `target=human`, bias toward concise status, risks, and decision points instead of agent-operating instructions.
6. Redact secrets and sensitive personal data. Do not include raw `.env` values, tokens, passwords, private keys, or unnecessary personal information.
7. Avoid duplicating durable artifacts. Reference existing specs, ADRs, PRDs, reports, issues, commits, and logs by path or URL with a short relevance note.
8. Save the handoff:
   - `save=local-artifacts`: `<ADS_MEMORY_ROOT>/.local-artifacts/handoff/<timestamp>-handoff.md`
   - `save=os-temp`: the OS temp directory, e.g. `${TMPDIR:-/tmp}/ai-dev-shop-handoff-<timestamp>.md`
   - `save=inline`: return the handoff in the response and do not write a file
9. Final response must include:
   - handoff path, or `inline only`
   - target
   - focus
   - source evidence inspected
   - exact next-agent opening prompt
   - any known limits, especially inaccessible artifacts or unresolved model/host assumptions
