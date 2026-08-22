# `capability_search` / `capability_get` — FIRST LIVE AGENT RUN (PASS)

Date: 2026-08-22
Closes: §7 open item of `continuity/2026-08-22-handoff-capability-slice-shipped-next-is-the-measurement.md`
("wired but have never been exercised by a real agent run — the tests are unit-level, first live call is unproven")

## Verdict

**Both tools work end-to-end against a real spawned agent.** Not reported by a subagent — driven
directly by the Coordinator through the product's own path and read out of the run's own event stream.

Run id `a14aca0a-375e-438b-8a1a-8b15a13c29c1` · agent `claude` · model `sonnet` · 9 turns ·
exit `{"code":0,"status":"succeeded"}` · $0.55 · 49s.

## What was actually exercised

`capability_search("visual design")` returned **7 hits — all 7 installed skill folders**, which is the
precise defect `bfcbf5bc` was built to close (before it, only the eponymous `ui-ux-design` skill was
reachable):

```
agent-plugin-skill:ui-ux-design:f64f7a62…a14d:gstack-design
agent-plugin-skill:ui-ux-design:f64f7a62…a14d:interface-design
agent-plugin-skill:ui-ux-design:f64f7a62…a14d:ui-ux-design
agent-plugin-skill:ui-ux-design:f64f7a62…a14d:vercel-web-design-guidelines
agent-plugin-skill:ui-ux-design:f64f7a62…a14d:frontend-accessibility
agent-plugin-skill:ui-ux-design:f64f7a62…a14d:shadcn-ui
agent-plugin-skill:ui-ux-design:f64f7a62…a14d:web-compliance
```

`capability_get(<top hit>)` returned **real SKILL.md bytes**, verified against disk:

```
---
name: gstack-design
version: 0.1.0
last_updated: 2026-06-05
description: Use when a user manually invokes gstack-inspired design workflows…
```

The digest-in-the-id decision holds in practice — ids are well-formed and unambiguous.

## THE FINDING THAT CHANGES §3.2

The agent could not call `capability_search` by name. It is **not a native tool in the agent's
namespace** — it is reachable only through the Jini MCP bridge, and the agent had to *discover* that
route first. Verbatim tool_use histogram:

```
ToolSearch                      3    <- hunting for the tool
mcp__jini__search_tools         1    <- found it via Jini's own catalog search
mcp__jini__describe_tool        2    <- read capability_search + capability_get schemas
mcp__jini__execute_delegated_tool  2 <- the two real calls
```

Five discovery hops before the first useful call, on a prompt that **named both tools explicitly and
did nothing else**. The real invocation shape is:

```json
mcp__jini__execute_delegated_tool {"toolId":"capability_search","input":{"query":"visual design"}}
```

**Consequence for the §3.2 pointer:** a pointer that says *"call `capability_get`"* names a tool that
does not exist from the agent's side. The pointer must name the bridge call and the exact card id, or
it re-creates the same optional-and-skippable step the 0-of-30 result already proved this agent skips.
This was not visible from the unit tests and would have quietly weakened arm 2 of the A/B.

## Method (reusable — this is how the A/B should be run)

Browser automation was not used. `POST /api/runs` + `GET /api/runs/:id/events` is the identical path
`apps/admin/src/lib/assistant-transport.ts` uses; a session cookie comes from
`POST /api/admin/v1/auth/login` with the seeded owner. Body shape:

```json
{"contextRef":"{\"prompt\":\"…\",\"model\":\"sonnet\",\"pluginRefIds\":[\"ui-ux-design\"]}","agentId":"claude"}
```

The SSE `stdout` frames carry the raw CLI stream-JSON, so the tool_use histogram and the final text are
both recoverable from the run's own events — no `~/.claude/projects/**.jsonl` grep needed, and no
dependency on which session id the CLI happened to pick. Harness:
`development/scripts/agent-run-probe.mjs`.

## Not claimed

- This says nothing about whether a **pull** model beats the ~15KB injection. That is §3.1 and is still
  unmeasured.
- Ranking quality is untested: the query "visual design" put `gstack-design` above `ui-ux-design` and
  above `vercel-web-design-guidelines`. Whether that order is defensible is open.
- One workspace, one installed digest, seven cards. Nothing here tests the two-digest coexistence path
  beyond its unit test.
