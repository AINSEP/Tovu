# Swarm Consensus CLI Smoke Test

- Generated at: `2026-07-29T00:13:43.558627+00:00`
- Host: `LAs-MacBook-Pro`
- Working directory: `/Users/la/Programming/Tovu/AI-Dev-Shop`
- Prompt: `Reply with OK and then <<SWARM_END>> only.`
- Case timeout: `75s`
- Codex --cd: `/Users/la/Programming/Tovu/AI-Dev-Shop`
- agy --cd: `/tmp`

## CLI Versions

| CLI | Path | Version |
|---|---|---|
| `claude` | `/Users/la/.npm-global/bin/claude` | `2.1.220 (Claude Code)` |
| `gemini` | `/Users/la/.npm-global/bin/gemini` | `0.47.0` |
| `codex` | `/Users/la/.npm-global/bin/codex` | `codex-cli 0.145.0` |
| `agy` | `/Users/la/.local/bin/agy` | `1.1.7` |

## Model Resolution

| CLI | Requested | Resolved | Selection Source | Note |
|---|---|---|---|---|
| `claude` | `claude-opus-5` | `claude-opus-5` | `requested_model` | `discovery requirement=both` |
| `gemini` | `n/a` | `gemini-3.1-pro-preview` | `local_default` | `from ~/.gemini/settings.json` |
| `codex` | `n/a` | `gpt-5.5` | `local_default` | `from /Users/la/.codex/config.toml; reasoning=high` |
| `agy` | `n/a` | `Gemini 3.1 Pro (High)` | `default` | `agy replaces gemini CLI; run from /tmp to avoid AGENTS.md pickup` |

| Case | Status | RC | Dur (s) | JSON-ish stdout | Parsed end marker | stdout | stderr |
|---|---|---|---:|---|---|---:|---:|

## Claude Discovery

- Requirement: `both`
- Saved Claude model: `sonnet`
- Requested Claude model: `claude-opus-5`
- Requested Claude family: `opus`
- Saved Claude family: `sonnet`
- Cache hit: `False`
- Cache path: `/Users/la/Programming/Tovu/ADS-memory/reports/swarm-consensus/smoke-tests/last-known-good.json`
- Candidate ladder: `/Users/la/Programming/Tovu/AI-Dev-Shop/skills/swarm-consensus/references/model-candidate-ladders.json`
- Winning model: `claude-opus-5`
- Winning source: `requested_model`

| Candidate | Source | Success | JSON OK | Text OK | Suggested Models |
|---|---|---|---|---|---|
| `claude-opus-5` | `requested_model` | `True` | `True` | `True` | `none` |

