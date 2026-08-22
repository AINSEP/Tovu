# /cowork — generalized composer tooling layer (MCP + plugins + agent plugins)

Date: 2026-08-21. Coordinator: Claude Opus 5 (1M).
Participants (5): Claude Opus 5 · Codex `gpt-5.6-sol` xhigh · Gemini `3.1-pro-high` ·
Gemini `3.7-flash-high` · Claude Sonnet 5 subagent (ADS software-architect persona).
Rounds: 1 blind independent proposals → 2 challenge → 3 adversarial review of the merged plan.

**OUTCOME: merged plan v1 REJECTED (3 of 4 reviewers below the 8.5 medium-risk floor).
Zero lines of code written. Six real defects found before implementation.**

| Reviewer | Verdict | Score |
|---|---|---|
| Gemini 3.1 Pro | STOP (binding) | 9/10 |
| Codex gpt-5.6-sol | GO-WITH-CHANGES | 9/10 |
| Gemini 3.7 Flash | GO-WITH-CHANGES | 8/10 |
| Sonnet 5 | GO-WITH-CHANGES | 6/10 |

## THE HEADLINE DEFECT — found independently by Sonnet AND Codex, verified by the Coordinator

The Coordinator's own prescribed "Step 0" fix would have **blanked the entire composer menu.**

```
ui-ux-design has 7 skill folders                     VERIFIED: 7
 -> projection emits one descriptor per skill        capability-projection.ts:103
 -> the fix gives all 7 the same pluginRefId
 -> byPluginRefId guard THROWS on the 2nd            composer-capabilities.ts:180 (explicit throw)
 -> useComposerCapabilities .catch swallows it       AssistantDock.hooks.tsx:604 (console.error only)
 -> setComposerCapabilities never fires
 -> WHOLE MENU EMPTY, silently
```
Multi-skill is not an edge case: `capability-projection.unit.test.ts:134` explicitly tests
"descriptor ids are stable and collision-free across two differently-named skills".

**Second, underneath it:** `resolve-agent-plugin-refs.ts:153` hardcodes
`skills/${pluginRefId}/SKILL.md` — the resolver ALWAYS loads the eponymous skill regardless of
which skill row was pinned. So a per-skill row promises content it cannot deliver.

**The decision nobody had named (Sonnet):** is a composer row one per PLUGIN or one per SKILL?
The code answers it — since the resolver only ever loads the eponymous skill, **per-skill rows are
a lie**. One row per plugin, unless the daemon changes (ruled out).

## OTHER VERIFIED DEFECTS IN v1
1. **Metadata-only route crashes the adapter.** `agent-plugin-capability-adapter.ts:83` dereferences
   `descriptor.execute.kind` unguarded; a metadata-only payload strips `execute`. (Flash)
2. **Send-time resolution can silently drop pins.** Sources "degrade to `[]` on failure" AND effects
   resolve at send time — a transient failure at Send drops the user's pins with no signal.
   (Pro + Flash, independently)
3. **`resolveRunContext` cannot do what v1 asked.** It is synchronous and receives only a string
   array (`AssistantDock.hooks.tsx:1048`); it has no catalog access. (Pro + Flash)
4. **v1 self-contradicts:** Step 0 sets `pluginRefId`; Step 2 deletes `pluginRefId`. (Flash)
5. **"TWO live transports" is FALSE — there are THREE.** Local CLI, BYOK, and AG-UI
   (`assistant-transport.ts:606-615`), runtime-selectable. (Codex)
6. Prompt hints folded into message text repeat once per turn (linear bloat, not exponential as
   claimed) — cap count and length. (Pro)

## CRITIQUES REJECTED BY THE COORDINATOR (verified false)
- Flash: "pin rows without `resolve` leave `/query` stuck." FALSE — that is exactly what the working
  chip does; observed working live 2026-08-21, and `composer-capabilities.ts:247` documents the fix.
- Pro: "`insertText` is not a flat property." FALSE — `composer-capabilities.ts:231` uses it.

## SETTLED BY THE CHALLENGE ROUND (round 2)
- Pin state stores ONLY `item.id`, never a snapshot. 5/5 — **Codex changed position**. Rationale:
  a vanished chip is user-recoverable; a stale snapshot ships an uninstalled ref and fails the run closed.
- The effect union is keyed on semantic effect type, NOT envelope destination. 3/3 —
  **Flash changed position** (from flat optional fields). The Coordinator's destination-keying
  proposal LOST: it only differs from effect-keying when one effect targets two destinations,
  which nobody proposed.
- Unanimous, unchallenged: no wire change; no daemon change; `pluginRefIds` stays agent-plugin-only
  and fail-closed; reuse the existing slash typeahead (no new search code); every pin row sets
  `insertText: ""`; hints built only from validated ids, never operator-authored labels.
- Codex's TOCTOU rule: effects must be resolved from the current catalog immediately before
  transport, not only at render.

## WHAT IS ALREADY BUILT (so v2 is smaller than it looks)
- `api.listPlugins()` (`lib/api.ts:2729`) and `api.listExternalMcpServers()` (`:1917`) are already
  wired to production routes. Only agent plugins needs one new read-only route.
- The slash typeahead already searches the merged catalog — "search everything" needs NO new
  search code. Five of six groups are simply hardcoded stubs with nothing real behind them.

