# ACP for Jini's agent adapters: index (2026-11-16)

**Status: COMPLETE** for research and design. Docs only; no source file was edited and nothing was run.
Branch: Tovu `plan/acp-research-2026-11-16` (from `origin/plan/terra-2026-11-15`).
Jini read at `integ/wave-b-r2` @ `02edbb68`.

## Files

| File | What it holds |
|---|---|
| `RESEARCH.md` | What ACP is today (version, transport, methods, governance, v2 draft), what ACP code Jini already has and where it falls short of the spec (G1–G9), each CLI's ACP route, what ACP does not solve, the full unverified list, sources with commits |
| `CLI-MATRIX.tsv` | One row per Jini def (28) plus Gemini CLI: ACP support, how, version, gaps, source URL, Jini's format today, how the row was verified |
| `DESIGN.md` | Who-does-what map, options, target shape (`AcpProfile`, host opt-in list), numbers, risks, lane K and R8 fit, migration steps A–E, security surface, owner practices 1–12, lessons 1–11, owner decisions O-1 to O-10 |

## The answer in short

1. **Jini already has the ACP client.** `agent-runtime/src/agent-protocol/acp/` is 3,249 lines; 12 of 28 defs run through it.
2. **12 more CLIs have an ACP route**: 7 built into the CLI (opencode, cursor-agent, qoder, qwen, droid, grok-build, codebuddy), 3 through a separate vendor program (claude, codex, antigravity), 2 through a community adapter (pi, amp). **4 have none** (aider, crush, deepseek, mimo).
3. **ACP replaces** launch arguments, event parsing, MCP delivery, the permission gate, resume and model selection. **It does not replace** config and home isolation, switching off the agent's own MCP servers or built-in tools, binary and login detection, or the native path for the CLIs without ACP.
4. **Saving:** about 1,000 lines for the 7 built-in ones; 1,700–2,100 more for Claude, Codex and Antigravity; ceiling about 2,700–3,200 of roughly 8,000 adapter lines. Estimated from file sizes, not from a trial.
5. **Recommendation:** finish the existing client (Phase A, seven small steps), add a per-CLI profile and a host opt-in list, move OpenCode first, Claude last. Keep the native path.
6. **Lane K does not wait.** 729 of its 1,272 lines are still needed under ACP. One request: keep staging files and MCP-delivery files separate while moving.

## Found on the way (worth knowing even if the owner says "leave it")

- Jini's client does not read the agent's `initialize` result, so it checks no capability before `session/load` (the spec says it must) and never uses `session/resume`.
- It still falls back to `session/set_model`, which the spec removed on 2026-06-01.
- It ignores `usage_update`, so cost and context size reported during a session are dropped.
- It sends no reply to an agent request it does not know; the agent then waits until the 10-minute watchdog.
- One vendor's quirks (AMR) live inside the shared client files.
- Two existing ACP defs drifted from the registry: kiro (missing `--agent-engine=v3`), kimi (targets the CLI the registry now calls legacy).

## Owner decisions (details in `DESIGN.md` §11)

O-1 extend the existing client CLI by CLI · O-2 allow the Claude and Codex adapter programs on the run path · O-3 lane K now · O-4 how long a native path is kept after a switch · O-5 keep the four CLIs with no ACP · O-6 stay on ACP v1 · O-7 keep the hand-written client · O-8 pi stays on pi-rpc · O-9 fix the kiro and kimi drift · O-10 do Phase A regardless.

## Not done, and why

1. No CLI or adapter was started. Every coverage claim is from docs or source.
2. Vendor doc hosts (`opencode.ai`, `geminicli.com`, `cursor.com`) are outside this session's network. OpenCode and Gemini docs were read from their git repositories instead. Cursor, Qoder, Droid, Grok Build, CodeBuddy and Antigravity rest on their registry entry only. To close this, allow those hosts in the environment's network settings, or check each CLI live.
3. The brief cites 22 lessons; the file at `origin/plan/size-designs-2026-11-16` has 11. Those 11 were applied.
4. `interface-design` was read; it is a visual-UI skill and had nothing to apply to.
5. The full unverified list is `RESEARCH.md` §6.

## Re-run the counts

```sh
cd Jini   # integ/wave-b-r2
grep -rhE "^\s*streamFormat: *'[a-z-]*'" packages/agent-runtime/src/defs --include=*.ts --exclude-dir=__tests__ | sed 's/^ *//; s/,$//' | sort | uniq -c   # 28 defs: 12 acp, 3 claude, 5 json-event, 1 pi-rpc, 6 plain, 1 qoder
find packages/agent-runtime/src/agent-protocol/acp -name '*.ts' -not -path '*__tests__*' | xargs wc -l | tail -1
for d in claude codex opencode antigravity pi gemini; do find packages/daemon/src/agent-executor/$d -name '*.ts' -not -path '*__tests__*' | xargs wc -l | tail -1; done
grep -c "loadSession\|usage_update\|32601" packages/agent-runtime/src/agent-protocol/acp/session.ts   # expect 0
```

External sources are pinned by commit in `RESEARCH.md` §7.
