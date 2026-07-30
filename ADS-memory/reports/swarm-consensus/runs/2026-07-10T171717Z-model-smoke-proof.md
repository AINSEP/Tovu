# Model Smoke-Proof — CLI + model verification (not a debate)

**Date:** 2026-07-10T17:17:17Z
**Host:** LAs-MacBook-Pro
**Purpose:** Prove the exact peer models before dispatching `/debate sweep-crosscutting-002`, and supersede the stale `gpt-5.4` / `claude-opus-4-6` evidence the model-plan lookup was pulling from the historical `2026-03-24-191415-consensus-report.md`. This file is a model-resolution pointer only — it records a lightweight ACK probe, **not** a consensus run. The March report is left intact as genuine history; this newer report shadows it by mtime for future codex/model resolution.

## The Swarm
| Role | CLI | Requested Model | Resolved Model | CLI Version | Selection Source | Status | Attempts |
|---|---|---|---|---|---|---|---|
| Primary | current-session coordinator | n/a | Opus 4.8 (host, not externally introspected) | n/a | thread host | Responded | 1 |
| Peer | codex | `gpt-5.5` | `gpt-5.5` | `codex-cli 0.144.0` | per-run pin (owner, 2026-07-10) | Responded | 1 |
| Peer | agy | `Gemini 3.1 Pro (High)` | `Gemini 3.1 Pro (High)` | `agy 1.1.1` | agy default | Responded | 1 |
| Participant | fable-subagent | n/a | `fable` (host Agent tool) | n/a | in-host subagent | n/a | n/a |

## Dispatch Diagnostics
| CLI | Output Mode | Reasoning | ACK Result | Notes |
|---|---|---|---|---|
| codex | jsonl (`--json`) | `model_reasoning_effort=xhigh` | `ACK_PACKET_RECEIVED sweep-crosscutting-002 -- received, ready.` (rc 0, ~15s) | codex-cli 0.144.0 `--json` no longer emits a `model` field in `thread.started`; proof is forced `-m gpt-5.5` + session-success (codex errors/hangs on an invalid model rather than substituting). stderr had only the cosmetic `Reading additional input from stdin...` close artifact. |
| agy | text (`--print`) | Gemini 3.1 Pro (High) | `ACK_PACKET_RECEIVED sweep-crosscutting-002 -- received, ready.` (rc 0, ~8s) | Run from `/tmp`; clean single-line output, no preamble. |

## Notes
- The prior real smoke test (`2026-07-10T003532Z-cli-smoke-test.json`) ran codex on `gpt-5.4` because the resolver read the March run report. The owner pinned `gpt-5.5` xhigh for the sweep-crosscutting chain ([[use-agy-not-gemini-cli-for-swarm]]); this proof records it as the current resolved codex model.
- `last-known-good.json` was NOT written: the resolver consults that cache only for the `claude` peer, and claude is not dispatched as a CLI peer here (host = Primary, Fable subagent fills the Anthropic voice). The codex/gemini resolution is driven by newest `runs/*.md`, which this file now is.
