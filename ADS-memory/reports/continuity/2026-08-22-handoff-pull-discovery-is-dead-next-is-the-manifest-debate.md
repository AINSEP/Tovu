# Handoff: pull-based discovery is dead, measured — next is a debate, then a canary harness

Generated: 2026-08-22
Source: Claude Code (Opus 5, 1M), Coordinator
Subagents this session: 5 × Claude Sonnet 5 (inventory-fix, typed-media, findability, case-b-runner, ab-runner)
Branch `general-work` · **50 unpushed Tovu commits, 8 unpushed Jini commits**

## Next-Agent Prompt

> Read `AI-Dev-Shop/AGENTS.md`, then this handoff.
>
> **Start at §5. Do not build the capability manifest before running the debate in §5.** The owner's
> design is sound but its central fork is unresolved, and the wrong answer is expensive.
>
> Do NOT re-open §3. Pull-based discovery was measured across 5 live runs and is settled. If you find
> yourself proposing better ranking, keywords, embeddings, or a merged index to fix it, stop and re-read
> §3.2 — that is the exact trap the Coordinator fell into this session.
>
> Hard constraints: never `npm run test:cov` or bare `npm test` (OOMs this machine). Scoped runs only.
> Don't start Docker. Don't kill processes without asking. Shared git tree — `git commit -F <msg> -- <paths>` only.
> **Never run a Jini `pnpm -r build` while a live agent run is in flight** — see §6.4.

---

## §1 — WHAT SHIPPED (11 commits, each verified by the Coordinator, not merely reported)

| Commit | What |
|---|---|
| `4116023e` | First live agent run proving `capability_search`/`capability_get` work end to end |
| `f8b14752` | **Pointer delivery mode** — ~400 bytes naming the tool call instead of ~15KB of payload |
| `4c75f210`, `9fcc765e` | Root `AGENTS.md` "Always Consult" repointed at files that actually exist |
| `94864bce` | `capability_get` returns a sibling-file inventory by absolute path |
| `fd504447` | Probe harness `--isolate-memory` |
| `5468fb02`, `c882de18` | **Typed media** — images render inline in chat, end to end (Jini `d3eaf809`, `7a713b39`) |
| `168aea24` | `capability_search` findability keywords **+ fixed a completely broken eval** |
| `c5262804`, `defc45dc` | The two measurement reports |

Every subagent claim was independently re-verified: commits inspected, tests re-run by the Coordinator,
diffs read. Two reported numbers were wrong and were corrected (a test count, and a claim that a run had
not started when it had).

## §2 — THE MEASUREMENTS, AND WHAT THEY ACTUALLY SAID

Seven live agent runs, ~$12. All driven headlessly through `development/scripts/agent-run-probe.mjs`
(§6.1), which is the product's own `POST /api/runs` path.

**Case (a) — something points at a capability. WORKS.** Under a mandatory pointer the agent called
`capability_get` with the exact id supplied, then acted on the content. Zero counterexamples across
every run where a pointer was injected.

**Case (b) — nothing points at it. FAILS, 0 of 5.** Prompt included "use whatever design guidance this
workspace has available to you." `capability_search` was never called. Not once.

**Injection (status quo) works but is expensive.** 12 turns / $0.73 and read exactly the 4 reference
files the SKILL.md names. Pointer mode: the agent obeyed, but then had to `grep`/`find` for the
reference files (fixed in `94864bce`) — 38 turns / $1.95.

## §3 — THE FINDING THAT GOVERNS EVERYTHING AFTER IT

### §3.1 It is not a ranking problem, and this is not an opinion

Every design-related query the agent issued, across all five case-(b) runs, contained the word
**"theme"**:

```
theme design tokens colors fonts brand style guide for this site
read the active theme's design tokens (colors, fonts, spacing)
read theme design tokens, color palette, fonts, and site branding for consistent styling
read theme design tokens like colors, fonts, and spacing variables for the active theme
```

The agent resolved *"design guidance"* to *"the active theme"* **before issuing a single query**, then
searched for theme tools and correctly found them. `capability_search` losing to `theme_read_file` on
"read the active theme's design tokens" is the index **working**.

The failure is upstream of retrieval. No keyword set, no BM25 weighting, no merged index, no embedding
and no doc2query entry reaches it, because none of them change what the agent decides to look FOR.

**Discovery itself is fine.** In those same runs the agent found `content_post_create`,
`pages_write_html`, `widgets_insert_embed`, `forms_create_definition` and `theme_read_file` unprompted.
It finds what it is looking for. It does not look for what it has not considered.

### §3.2 The Coordinator's own error, recorded so it is not repeated

The prior 5-model consensus already settled this — *"Is this a discovery problem? **No** — 5/5.
Necessary, not sufficient."* The Coordinator drifted from that conclusion mid-session and built
`168aea24` on the untested assumption that a search happens and merely ranks badly. That assumption was
never checked first. Five runs and ~$8 brought it back.

`168aea24` is still worth keeping — it is harmless, and it fixed a genuinely broken eval — but it is not
the fix, and the owner was right to ask whether we were going in circles.

**The rule this yields: before improving how something is found, verify it is being looked for.**

## §4 — THE OWNER'S DESIGN, IN THE OWNER'S OWN TERMS

The Coordinator got this wrong once and the correction matters, so it is recorded precisely.

**Wrong (Coordinator's first reading):** a manifest listing what is installed. This is why the first
debate packet asked "what bounds its size at 50 plugins."

**Right (the owner's actual design):** a short, **fixed list of capability CATEGORIES** — kinds of thing
this system can do at all — plus a pointer to the search tools. Roughly:

```
deploying / hosting this site
generating or adding images and media
adding functionality to the site (plugins)
design and visual guidance
connecting outside services (Higgsfield, Vercel, AWS, Midjourney, …)
…and here are the tools that will help you find the specifics
```

Owner, verbatim: *"We're not stuffing the manifest with fifty plug-ins... We're saying we can do these
things generally. Here's the tools that'll help us search."*

**Why this is better than what the Coordinator encoded:** it is bounded by construction. It does not
grow with installs — fifty plugins, same manifest, ~200 bytes rather than 15KB. And it attacks the
measured failure exactly: the agent did not fail to *find* design guidance, it never knew that
"installed guidance" was a category of thing that exists.

Owner's second point, which is the sharpest framing of the failure anyone produced this session:
*"An agent may think it knows the right answer, but it doesn't, and that's almost certainly gonna
happen."* The agent had "the theme." It was plausible. It never questioned it. **Any design that assumes
the agent knows it is missing something is dead.**

### §4.1 The real fork — truthfulness, not size

- A category listed with **nothing installed** is a lie. "I can help you deploy" → the agent hunts,
  finds nothing, burns turns or invents something.
- A category **not** listed but with something installed → invisible again, i.e. back where we started.

So: is the category list **fixed** by Tovu, or **derived** from what is installed?

- Fixed → stable, cheap, but drifts out of truth in both directions.
- Derived → always true, but something must decide which category a newly-installed thing belongs to,
  and plugin authors self-declaring gives inconsistent junk.

**That is the debate.**

## §5 — DO THIS FIRST: the debate

A Round 1 packet already exists and is **committed but WRONG** — it encodes the Coordinator's
misreading (§4) and asks "what bounds its size as installs grow." **Rewrite it around §4.1 before
dispatching.**

Existing packet: `ADS-memory/reports/swarm-consensus/context/CTX-tovu-unconsidered-capability-2026-08-22.md`

Participants the owner asked for (4 voting + Primary):

| Participant | Route | Model | Resolution |
|---|---|---|---|
| Primary | host | Claude Opus 5 (1M) | — |
| Peer | `agy` | Gemini 3.1 Pro (High) | local default, proven |
| Peer | `agy` | Gemini 3.7 Flash (High) | per-run override |
| Peer | `codex` | `gpt-5.6-sol` | saved report, proven |
| In-host | subagent | Claude Sonnet 5 | Addition case — alongside, never replacing a peer |

`max_rounds=2`, `min_confidence=0.90`. Models were resolved this session via
`python3 skills/swarm-consensus/scripts/cli_smoke_test.py --model-plan-only --output-format json`
(run from inside `AI-Dev-Shop/`) — all four proven, no blocking gate.

### §5.1 Two changes the owner asked for, both binding

1. **Ask every participant for SEVERAL testable experiments, not one.** The prior packet demanded "the
   cheapest experiment that would falsify your own recommendation." The owner wants a *slate* — several
   things we can put the agent through — because the intent is to run canaries, not to adopt on
   argument.
2. **Round 2 is a design round, not a re-argument.** Round 1 settles the fork in §4.1. Round 2 asks
   *how to build it*, including the harness.

### §5.2 What Round 2 is actually for — the harness

This is the part that is easy to lose. The output is **not** just a capability manifest. It is a
**canary harness**: a set of live probes that check whether the agent actually responds to a directive,
so that behaviour is measured continuously rather than assumed.

The measurement machinery for this already exists and works (§6.1). What does not exist is a standing
set of canaries. Round 2 should produce their design: what each canary asserts, what a pass looks like,
and how a regression surfaces.

Note the reframe this implies, and keep it: the manifest is one instrument for **constraining and
directing agent behaviour**, and the harness is how we know whether it worked. Neither is useful alone.

## §6 — VERIFIED FACTS AND TRAPS (do not re-derive; each cost real time today)

### §6.1 The measurement harness — use it, do not rebuild it
`development/scripts/agent-run-probe.mjs`. One command drives one real agent run through the exact path
`apps/admin/src/lib/assistant-transport.ts` uses — no browser, no Playwright.

```bash
PROBE_OUT=./out node development/scripts/agent-run-probe.mjs \
  --label caseb --prompt-file p.txt --model sonnet --timeout 900 --isolate-memory
```

Emits `<label>.events.jsonl` (streamed as events arrive) and `<label>.summary.json` (tool_use histogram,
every `Read` path, every `Bash` command, turn count, cost, final text). Auth is the seeded owner
(`admin` / `tovu-dev`, `DEFAULT_OWNER_PASSWORD` in `src/identity/wiring.ts`); the session cookie is
flagged `Secure` so it must be replayed as a raw `Cookie:` header, not from a curl jar.

**Fidelity, checked not assumed:** the composer sends exactly five fields — `prompt`,
`frontendBindToken`, `model`, `attachmentIds`, `pluginRefIds`. The probe sends all but
`frontendBindToken` (no browser tab to drive) and `attachmentIds`. That means the browser has *more*
tools registered than the probe, so `capability_search` would rank *lower* there, not higher — the probe
is generous to what was being tested, not flattering. **Still never confirmed against a real browser
run.** Worth one run to close.

### §6.2 The agent reads AND WRITES your Claude Code memory store
The spawned agent is Claude Code in this same project directory, so it inherits
`~/.claude/projects/-Users-la-Programming-Tovu/memory/`. Measured: one arm read the memory file
describing the experiment it was inside (which names the known-null control), and another **`Edit`ed**
one. Use `--isolate-memory` on every measurement run. **Counting `Read` calls does not detect this** —
one arm read memory via `Bash cat` and scored `fileReadCount: 0`. Scan Bash command strings too.

### §6.3 Interrupting the probe does NOT cancel the run
The probe is only a client. An interrupted/rejected invocation still leaves the run executing
server-side, where it completes and publishes a page. This produced a mystery "third party" page today.
Reconcile with `GET /api/runs` after any interruption; `POST /api/runs/<id>/cancel` actually stops one.
Note the run registry is **in-memory per daemon process** — a restart destroys it, so recovery via
`GET /api/runs/<id>/events` only works within one process lifetime.

### §6.4 A Jini build flaps the Tovu API — this cost three runs
`cd ../Jini && pnpm -r build` writes into `dist/`, which Tovu's `tsx watch` follows through the
`file:../Jini/packages/*` links. The API restarts on every file. Two signatures, one cause:
`ECONNREFUSED` (no listener) and `UND_ERR_SOCKET` with bytes written and none read (died mid-request).
**Never run a code-editing agent and a live-measurement agent concurrently against one dev stack.** That
scheduling error was the Coordinator's.

### §6.5 The tool-search eval was scoring ZERO wired tools
`development/evals/tool-search-quality.eval.ts` had two stacked bugs: an import of
`src/assistant/tool-registrations/index.js` (does not exist — ESM-flip damage from `39096e15`), and no
`installFirstPartyToolContributors()` call, so it built a registry containing only 4 env-gated demo
tools. Every case scored "(no hits)" while looking like a working measurement. Fixed in `168aea24`; the
registry now has **147 tools**. True held-out baseline: **top-1 45%, top-3 75%, found 85%**. Any
tool-search number quoted between the registry rollout and today measured an empty registry.

**General rule this yields:** assert the population is non-empty before trusting any harness. "0 of 0
passed" and "all passed" are the same shape.

### §6.6 Smaller verified facts
- The slash-command idea needs **zero server work**. `/ui-ux-design` would set the same `pluginRefIds`
  field the existing composer chip sets, which `resolve-agent-plugin-refs.ts` already turns into a
  mandatory pointer. It is a composer UI feature on a proven wire path. Machinery:
  `SelectedAgentPluginTray.tsx`, `useSelectedAgentPlugins`, `composer-capabilities.ts`.
- `AI-Dev-Shop/` is its **own git repo**, gitignored from Tovu. A stray `cd` into it makes `git log`
  report a different branch entirely — this looked briefly like Tovu had lost 50 commits.
- Delivery mode is per-process: `TOVU_AGENT_PLUGIN_DELIVERY=pointer|inject`, default `inject`. It must
  be set at boot; the daemon inherits it (`daemon-supervisor.ts:353` spreads `process.env`).
- `check:architecture` is red at 205 exposed files vs a 202 baseline. **Owner ruled 2026-08-22: leave it
  red, do not run `--update`.** Nothing this session moved the number.

## §7 — OPEN ITEMS

- **50 unpushed Tovu commits, 8 unpushed Jini commits.** Everything from today is local only.
- **Typed media has never been seen in a browser.** Tests prove real PNG bytes survive both
  serialization boundaries and that `ToolCard.tsx` renders an `<img>`, but nobody has watched an image
  appear in the actual chat pane. The Coordinator's instruction not to touch the dev server caused this.
  Five minutes with `TOVU_ENABLE_DEMO_TOOLS` and `assistant_demo_image` closes it.
- **The probe has never been diffed against a real browser run** (§6.1).
- MCP as a second capability source: designed, settled 5/5, **not built.** It is also the first real test
  of the "adding a source is two files plus one registration call" claim, which nobody has verified.
- Still unbuilt from the prior handoff: delivery levels (`on-demand | recommended | required-context |
  user-pinned`), and failure classification (never-saw / saw-and-ignored / followed-and-still-failed).

## §8 — PROCESS FINDINGS WORTH REUSING

- **Subagents were right and the Coordinator was wrong, twice.** Once when a run genuinely had started
  and the artifacts had not yet appeared; once when a guessed rendering failure mode was disproved with
  a control. Check a subagent's own background output before characterising its work.
- **Pre-commit to what each outcome means, before seeing it.** Done this session for the 3-run
  replication. It is what made "my rule was wrong for a reason I did not anticipate" sayable instead of
  rationalisable.
- **Persist findings the moment they land.** Two reports and five memories were written mid-session;
  a restart would have re-bought ~$12 of runs otherwise.
- **Don't write memory during an isolated run** — the file lands in front of the agent under test. Park
  it in the hold directory instead.

## Handoff Contract

- **Inputs used:** 7 live agent runs driven by the Coordinator; independent re-verification of 5 subagent
  reports (commits inspected, tests re-run, diffs read); direct reads of `resolve-agent-plugin-refs.ts`,
  `capability-source.ts`, `capability-tool-registrations.ts`, `tool-search-keywords.ts`,
  `assistant-transport.ts`, `dev.mjs`, `delegated-tool-bridge.ts` (Jini); the prior 5-model consensus
  report; `cli_smoke_test.py` model-plan resolution.
- **Output summary:** pull-based discovery is empirically dead and the reason is understood; push is
  proven; the owner's category-manifest design is captured correctly and its real fork isolated.
- **Risks:** the existing debate packet encodes a superseded reading and will mislead if dispatched
  as-is; typed media unverified in a browser; 58 commits unpushed across two repos.
- **Suggested next assignee:** Coordinator (fresh session) for §5, then Programmer for §5.2's harness.
