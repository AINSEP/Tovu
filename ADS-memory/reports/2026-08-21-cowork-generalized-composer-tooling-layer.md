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


---

# ROUND 4 — plan v2 ALSO REJECTED (2 STOPs; all four below the 8.5 floor)

| Reviewer | Verdict | Score |
|---|---|---|
| Gemini 3.7 Flash | GO-WITH-CHANGES | 8/10 |
| Sonnet 5 | GO-WITH-CHANGES | 6/10 |
| Codex gpt-5.6-sol | **STOP** | 5/10 |
| Gemini 3.1 Pro | **STOP** | 4/10 |

## v2's defects (all VERIFIED against source by the Coordinator)
- **D1 still MOVED, for TWO independent reasons.**
  (a) Sonnet: `listInstalledPlugins` (`resolve-agent-plugin-refs.ts:109-121`) walks EVERY digest under
  `packages/sha256/*`, so two installed digests of one plugin id — the normal upgrade path, and a state
  that file's own doc at :18-26 explicitly anticipates — re-collide on `pluginRefId`.
  **Real fix: dedupe by `pluginId`, not by digest.**
  (b) Codex: the live row coexists with the BUNDLED `ui-ux-design` row and collides. v1 said "delete the
  bundled row" TWICE; **v2 says it ZERO times** — the Coordinator silently dropped a correct requirement
  during a prose rewrite.
- **`resolveRunContext` has no return field for hints** (Gemini Pro). Its signature is
  `{frontendBindToken?, model?, pluginRefIds?}`. v2 says it "partitions by effect kind" — the hints would
  be computed and discarded. Every MCP/plugin pin would silently do nothing.
- **`AgentPluginCapabilityDescriptor` has NO `skillName` field** (Codex) — VERIFIED, zero occurrences.
  v2's "match the descriptor whose skill name equals the plugin id" requires parsing the encoded `id`
  or extending the DTO. v2 assumed a field that does not exist.
- **`list(): Promise<T[]>` cannot distinguish legitimate emptiness from caught failure** (Codex).
  So "retain last-known-good on failure" is unimplementable under the current source contract; sources
  need an explicit result status.
- **`useComposerCapabilities` is a ONE-SHOT mount effect** (`AssistantDock.hooks.tsx:596-612`, `[]` deps)
  — Sonnet. v2's "failed refresh retains previous" describes a refresh loop that does not exist.
  The real risk is an initial-load failure leaving the catalog empty forever behind a `console.error`.
- **`SelectedAgentPluginTray.tsx` has no `unavailable` state** — VERIFIED, zero occurrences. v2's
  "chip shows unavailable" is unscoped new UI.
- **v2's new silent-hide bug**, flagged by all three: "emit nothing for a plugin with no eponymous skill"
  makes an installed plugin vanish with only a server log. Must be a visible disabled row with a reason.

## THE PROCESS FINDING (the most useful output of round 4)
Most of what rounds 3-4 caught is **the class of defect a type checker rejects for free**:
a missing return field, a missing DTO field, an unguarded deref, an exported-signature break.
Five models were being asked to hand-simulate `tsc`.

And the Coordinator **lost a correct requirement in a prose rewrite** (the bundled-row deletion,
present twice in v1, absent in v2) — a deletion `git diff` would have shown instantly in code and
that prose hid completely.

**Conclusion: paper review has stopped being the cheap way to find these.** The two remaining defects
that a compiler CANNOT catch are logic, and both are one sentence each:
1. dedupe by `pluginId`, not digest;
2. a hidden plugin must render as a visible disabled row, never vanish.
Fix those two in the plan, then write code and let `tsc` + tests find the rest.
