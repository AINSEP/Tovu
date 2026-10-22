# assistant-runtime progress (cloud/assistant-runtime-2026-10-21)

- 01:02 item 1: Jini core default-on batching pushed (Jini 4ceb6f7c); Tovu opt-out list + guard test in progress
- 01:08 item 2 (preferSubagents): Jini c47b63a4 (supportsSubagents def field + helpers); Tovu core.interface.preferSubagents (bool, default true), fresh per-run read, guidance via assistant-runtime-guidance.ts, agents API supportsSubagents
- 01:22 item 3 (useClaudeInChrome): Jini d77f7c09 (chromeIntegration -> --chrome/--no-chrome, probe-gated; daemon forwards); Tovu core.interface.useClaudeInChrome (bool, default false, always-ask), owner-only --chrome + allowedTools mcp__claude-in-chrome{,__*}, agents API supportsClaudeInChrome
