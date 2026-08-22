# Handoff: capability slice 1 is SHIPPED — the next move is a measurement, not a build

Generated: 2026-08-22
Source: Claude Code (Opus 5, 1M), Coordinator — Debate → Cowork
Peers this session: Codex `gpt-5.6-sol` (high), Gemini `3.7 Flash (High)`, Gemini `3.1 Pro (High)`,
two Claude Sonnet 5 in-host subagents
Target: Claude Code, fresh session
Branch `general-work` · **38 unpushed commits** (3 from this session)

## Next-Agent Prompt

> Read `AI-Dev-Shop/AGENTS.md`, then this handoff.
>
> **Start at §3. Do not build anything before running the A/B in §3.1.** Five models independently
> concluded that findability was never the binding constraint — the capability bucket shipped in
> `bfcbf5bc` is necessary but not sufficient, and building further without the measurement risks
> repeating the original failure at higher cost.
>
> Hard constraints: **never run `npm run test:cov` or bare `npm test`** (35 min, OOMs this machine).
> Scoped runs only: `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test <file>`.
> Do not start Docker. Do not kill any process without asking. Shared git tree — other sessions own
> the uncommitted files in §6. `git commit -F <msg-file> -- <exact paths>` ONLY.

---

## §1 — WHAT SHIPPED

**`bfcbf5bc` — capability discovery seam, catalog, and two agent-facing tools.** 13 files, 1,481
insertions. The agent can now do:

```
capability_search("make this look better")   -> ranked capability cards
capability_get("<card id>")                  -> that skill's real content
```

Three real defects closed, each with a named test:

| Was | Now |
|---|---|
| Only the skill whose folder matched the plugin id was reachable | All 7 of `ui-ux-design`'s skills are individually reachable |
| A plugin with no eponymous skill installed fine and was permanently invisible | It produces cards like any other — the scaling cliff is closed |
| Two installed digests of one plugin collide on a PRIMARY KEY at boot | Digest is part of the card id; both coexist |

**Verified by the Coordinator independently, not merely reported:** 35/35 scoped tests, `tsc --noEmit`
exit 0 repo-wide, `eslint` exit 0.

Design record: `ADS-memory/reports/cowork/runs/2026-08-22-capability-slice/` (`fe598e9c`).
Debate record: `ADS-memory/reports/swarm-consensus/runs/2026-08-22-tovu-capability-bucket-consensus-report.md` (`910949d7`).

## §2 — THE FINDING THAT MATTERS MORE THAN THE CODE

**All five models, independently and blind, concluded that findability is NOT the binding constraint.**

The measured Agent Plugin failure was never a discovery failure. In both A/B runs the skill's full
content was ALREADY unconditionally in the prompt — ~14,800 characters, zero search involved — and the
agent read 0 of 30 referenced files until the wrapper stopped calling them optional. Under corrected
wording it read **exactly the 4 files the SKILL.md itself named**. The mechanism that worked was
*directed fetch* following an author's already-written instructions, not retrieval.

Codex went furthest: *"Improving retrieval cannot fix material that was already retrieved. A larger
catalog could make the failure worse by adding an optional search step the agent can also skip."*

Sonnet drew the distinction nobody else made, and it should govern the next session: the requirement
names **two** cases — (a) the user names a capability explicitly, (b) the user gestures at a category
and does not know what is installed. **Case (a) is the failure we have data on and is not a retrieval
problem. Case (b) is genuinely retrieval and has no data at all.** The bucket's entire warrant is (b),
and (b) is unmeasured. Do not let the bucket's existence imply it fixed (a).

## §3 — DO THIS FIRST

### §3.1 The A/B. This gates everything after it.

Re-run the coffee-roastery prompt (recorded in project memory) three ways on identical input:

1. **control** — no plugin pinned
2. **pointer + tool** — a short MANDATORY pointer naming the exact `capability_get` call, content pulled
3. **status quo** — today's ~15KB injection

Measure with the transcript-grep technique from the prior handoff (§8 there):
`grep -c AGENT_PLUGIN ~/.claude/projects/-Users-la-Programming-Tovu/<sessionId>.jsonl` plus a
`tool_use` histogram. Zero code changes needed to measure.

**If (2) does not match or beat (3), the pull model is wrong. Stop and rethink rather than build more.**
Cost: one afternoon.

### §3.2 The chip change — the owner's own framing, recorded verbatim

The owner's words, 2026-08-22: *"the chip shouldn't inject anything… let the AI know what to look at."*

That is right, with one precision that must not be lost: **the chip still injects something — a
pointer, not a payload.** It cannot inject nothing. A tool can be ignored, and the 0-of-30 result is
direct evidence that this agent skips whatever is framed as optional. So:

- The pointer stays **mandatory** and names the exact tool call to make.
- The ~15KB of content moves behind `capability_get`.
- Injection's one real virtue — it is guaranteed — is kept for the ~100 bytes and dropped for the 15KB.

Touch point: `src/features/agent-plugins/resolve-agent-plugin-refs.ts`. Ship this as its own commit,
separate from anything else, so the A/B result stays attributable.

### §3.3 Delivery levels

Codex's ladder, agreed 5/5: every capability reference carries
`on-demand | recommended | required-context | user-pinned`. This is the piece that makes "mandatory"
mean something structural rather than a wording convention. Field on the record from day one.

### §3.4 Failure classification — cheaper than any architecture here

Record separately whether the agent **never saw** an instruction, **saw and ignored** it, or
**followed it and the task still failed**. Today those are indistinguishable, which is exactly why
last session could not tell whether the plugin or the agent had failed. Different causes, different
fixes.

## §4 — VERIFIED REPO FACTS (do not re-derive; each was checked against source this session)

1. `Jini/packages/core/src/tool-registry.ts` — `ToolRegistration.handler` is **non-optional**. A
   handler-less row cannot enter the real `ToolRegistry`. Do not change this shared kernel type.
2. `ToolDescriptor` is pure metadata ("Never carries the handler or policy"); `ToolRegistry.list()`
   returns `readonly ToolDescriptor[]`; `buildToolCatalogQuery` takes `Pick<ToolRegistry,"list">`.
   **Any object with a `.list()` can back the FTS5 index.** This is why the slice needed no core change.
3. **A process serves exactly ONE workspace.** `agent-daemon-server.ts:295` binds `TOVU_WORKSPACE` at
   module load; `daemon-supervisor.ts:353` sets it on every spawn; `index.ts:273` builds one `deps` per
   process. **Never resolve workspace from `process.env`** — that env var is set only on daemon spawn,
   so it is correct in the daemon and WRONG in the BYOK path (`app.ts:1034`), where
   `createSqliteRouteDeps` can carry a non-default `overrides.workspaceId`.
4. `assertRiskMetadataIsWirable` (`tool-registrations.ts:529`) is a **boot-time** gate. A new domain
   must export a `DerivedRiskByToolId` (`Map<string, AgentToolSideEffect>`) covering every tool id.
5. `sourceForToolId` (`tool-catalog-query.ts:36-39`) splits on the first underscore — a tool-id-shaped
   assumption. **Do not copy it** for non-tool ids.
6. `listInstalledPlugins` is now **exported** from `resolve-agent-plugin-refs.ts` (this session).
7. `tool_catalog` is `(id, description, input_schema_json, source, updated_at)` — **no `kind` column**,
   and it lives in a published cross-repo package. That is why the capability catalog has its own schema.
8. **Root `AGENTS.md` lines 14-17 mandate three documents that do not exist** —
   `tovu-architecture.md`, `tovu/PROJECT_MEMORY.md`, `tovu/src/INFO.md`. Stale `tovu/` prefix from an
   older layout. Every agent booting here is told to read missing files; Codex had to caveat its whole
   first answer because of it. **Unfixed. ~2 minutes. Do this.**
9. `resolve-agent-plugin-refs.ts` runs under `tsx watch`, so `:3000` DOES auto-reload — the prior
   handoff's claim that it does not appears to be wrong.
10. The prior handoff's "six composer groups, five stubs" is wrong: **five groupIds, five entries,
    four stubs**, one wired. That handoff needs correcting.

## §5 — ARCHITECTURE DECISIONS ALREADY SETTLED (5/5 — do not re-litigate)

- One discovery index over many registered sources, with a `kind` column. Not two indexes.
- **There is no `capability_invoke` and must never be one.** Discovery unifies; activation does not.
- The extension point is a registered **source**, not a new **kind**. Adding a kind = its own files
  plus one registration call. That two-file property is the falsifiable definition of "future-proof" —
  test it by registering a throwaway second source and counting files changed outside it.
- `kind` is an unrestricted string, never switched on in core.
- The primary structural axis is the **operation contract**, not the CALL/READ/SHAPE/RENDER verb
  taxonomy — all five rejected that, including its author.
- No new persistent datastore. No change to the Jini kernel. MCP is a *source*, not the model.
- MCP-UI stays deferred, **but tool results must carry typed media rather than flattened text** — one
  field, and without it the owner's image-generation use case forces a transport rework later.
- Enforce "the discovery surface never gains an execute path" in `check:architecture`, **not** an ADR.
  The gate exists (`development/scripts/check-architecture.ts` + `.dependency-cruiser.cjs`). Caveat:
  `GUARDED_MODULES` is a hardcoded path list, so renaming the folder silently removes the rule — add a
  test that the guarded path still resolves.

## §6 — DO NOT TOUCH (other sessions' uncommitted work)

`apps/admin/src/features/plugins/{agent-plugin-catalog,agent-plugin-source-catalog}.ts` + their two
tests; `src/assistant/__tests__/execution-credential-store.test.ts`;
`apps/admin/src/styles/assistant.css`; several `ADS-memory/reports/architecture/*.md`; and everything
in the Jini repo outside `packages/chat` (still 3 unpushed, unbuilt commits there).

## §7 — OPEN ITEMS

- **`check:architecture` reports FAILED, and it is not this slice's fault.** Stored baseline 202;
  current tree 205; the pre-existing stale drift is **+2**, this slice's attributable delta is **+1**.
  Two participants confirmed the arithmetic independently. `--update` was deliberately NOT run —
  reconciling a baseline is an owner policy call. **Decide this.**
- `capability_search`/`capability_get` are wired but **have never been exercised by a real agent run**.
  The tests are unit-level. First live call is unproven.
- 38 unpushed commits. Jini `packages/chat` still 3 ahead and unbuilt.
- `:3000` and `:5173` were left RUNNING at session end.

## §8 — PROCESS FINDINGS WORTH REUSING

- **The adversarial verify gate earned its cost this session, concretely.** Sonnet's implementation had
  green tests, clean `tsc`, and looked finished. Codex rejected it at 8.0 for a real leak: absolute host
  paths escaped through `capability_get`'s ERROR path (`readFile` embeds the path in `ENOENT`; the call
  site had no try/catch), so uninstalling a plugin mid-conversation would hand the model the filesystem
  layout. Reproduced empirically before acting. A single agent working alone ships that bug.
- **Ask peers to break a specific thing, not to propose plans.** The prior session's six rounds of
  plan-proposal produced three of four plans scoring at or below a rejected control. This session's
  "answer these five decision points and attack this taxonomy" produced position changes from every
  single participant.
- **Every peer claim was re-verified against source before being written down.** Several confident
  claims were wrong; two of the Coordinator's own were wrong and are recorded as such in the reports.
- **Persist agent output on arrival.** Two subagents went idle without reporting, repeatedly, and
  messages crossed in flight more than once. Artifacts were written to
  `ADS-memory/.local-artifacts/` and then moved to `reports/` and committed — `.local-artifacts` is
  gitignored and one `git clean` from gone.
- **Subagents were stood down at ~400-500k and replaced fresh.** The replacement read the converged
  plan file rather than the conversation, and lost nothing — which is the entire argument for writing
  the plan to disk before granting a write lease.

## Handoff Contract

- **Inputs used:** a 2-round 5-model Swarm Consensus debate; a 4-model blind cowork co-design; direct
  reads of `tool-registry.ts`, `tool-executor.ts`, `tool-catalog.ts` (Jini), and
  `tool-contribution-registry.ts`, `tool-catalog-query.ts`, `tool-catalog-manifest.ts`,
  `capability-projection.ts`, `resolve-agent-plugin-refs.ts`, `install.ts`, `agent-daemon-server.ts`,
  `daemon-supervisor.ts`, `deps.ts`, `index.ts`, `app.ts` (Tovu); scoped test runs and `tsc` re-run
  independently by the Coordinator; two Codex verification passes with a binding score floor.
- **Output summary:** slice 1 is shipped and verified; the next session can start at the measurement
  without replaying any design.
- **Risks:** the bucket's warrant (case b) is unmeasured; the tools have never run live;
  `check:architecture` is red for a pre-existing reason; 38 commits unpushed.
- **Suggested next assignee:** Coordinator (fresh session) for §3.1, then Programmer for §3.2.
