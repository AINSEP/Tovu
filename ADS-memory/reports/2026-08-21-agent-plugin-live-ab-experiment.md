# UI/UX Design Agent Plugin — live A/B experiment result: NULL (chip never reaches the wire)

Date: 2026-08-21 · Author: QA/E2E dispatch (`plugin-ab-experiment`), Sonnet 5
Environment: owner's live admin at `:5173` (PID 9969) / backend at `:3000` (PID 63126), used with permission, nothing restarted.

## Verdict, up front

**Pinning "UI/UX Design (Agent Plugin)" in the composer has zero observable effect on what the
agent receives.** Confirmed twice, independently: the CLI's own session transcript never contains
the plugin's injected content, and the raw network request the composer actually sends never
contains a plugin reference at all. This holds across three separate sends, all with the chip
visibly pinned in the same screenshot as the click that sent them. This is a genuine null result,
not an inconclusive one — see §2 for why the proof is airtight.

This refines, and in one place corrects, same-day sibling reports
(`2026-08-21-agent-plugin-wiring-static-verdict.md`, `2026-08-21-agent-plugin-url-install-wired.md`):
those describe the composer's "UI/UX Design (Agent Plugin)" row as a dead `insertText` literal.
That was true of an older revision. As of today's `insertText: ""` fix (see §1), the row is wired
correctly client-side, through a real `pluginRefId` mechanism, all the way to `resolveRunContext`.
The break this report found is further downstream, in the transport that actually ships the
request — see §3.

## 1. The prompt, and the two pages

One prompt, sent verbatim for every arm:

> Create a new page for &lt;brand&gt; Coffee Roasters, a small-batch coffee roasting company.
> Include a hero section, a short brand story, a section showcasing their coffee offerings, and a
> call-to-action to visit the shop.

- **Arm A (no plugin pinned)** — brand: *Amber Fields*. New page: `/amber-fields-coffee-roasters` (draft).
- **Arm B, attempt 1 (plugin pinned)** — reused *Amber Fields* by mistake, hit the existing slug,
  and the agent correctly refused to duplicate it (`content_post_search` found the draft, read it,
  reported back, wrote nothing new). Zero comparison value — noted so the run isn't miscounted as a
  second Arm A.
- **Arm B, attempt 2 (plugin pinned)** — brand: *Wren & Anvil*. New page:
  `/wren-and-anvil-coffee-roasters` (draft).
- **Arm B, attempt 3 (plugin still pinned, same thread)** — brand: *Foxglove*. New page:
  `/foxglove-coffee-roasters` (draft).

All three new pages are new content; `/cinder-coffee-roasters` and `/thornwood-coffee-roasters`
were never opened, read, or touched.

Order run: A, then B (×3, as above). Each full generation took 35s–1m28s and $0.35–$0.74.

## 2. Objective half — two independent proofs, both null

### Proof 1: the CLI's own transcript

The daemon spawns the real `claude` CLI per run (`DEFAULT_AGENT_ID = "claude"`,
`src/server/agent-daemon/agent-daemon-server.ts:126`). Like any Claude Code session, each run
writes its own transcript to `~/.claude/projects/-Users-la-Programming-Tovu/<sessionId>.jsonl` —
no code change needed to read it, it's the CLI's own normal behavior.

I grepped every run's transcript for `AGENT_PLUGIN` (the literal wrapper
`assemblePromptWithPluginPrefix` — `src/server/agent-daemon/plugin-prompt-prefix.ts:64-66` —
would produce: `` <<AGENT_PLUGIN pluginId="ui-ux-design">>...<</AGENT_PLUGIN>> ``, then a blank
line, then the base prompt).

| Run | Brand | Plugin pinned? | `AGENT_PLUGIN` in transcript | First user message starts with |
|---|---|---|---|---|
| `0add616e-…` | Amber Fields | No | 0 | `<<SUBAGENT_DISPATCH>>` (as expected — control) |
| `a4ad2638-…` | Wren & Anvil | **Yes** | **0** | `<<SUBAGENT_DISPATCH>>` (no plugin block) |
| `f34acd37-…` | Foxglove | **Yes** | **0** | `<<SUBAGENT_DISPATCH>>` (no plugin block) |

Every transcript's first user message begins directly with `<<SUBAGENT_DISPATCH>>` — the shape
`assemblePromptWithPluginPrefix` produces when `pluginPromptPrefix` is empty, i.e. the daemon-side
code took the `pluginRefIds.length === 0` fast path. That only happens if the daemon received an
empty `pluginRefIds` array for these runs, chip or no chip.

I did initially add a one-line temporary debug log at `plugin-prompt-prefix.ts`'s success-return
point (writing to my own scratchpad, not the repo) to get positive confirmation the "hard way".
Before using it I discovered the agent-daemon subprocess is a long-lived singleton, spawned once at
boot with plain `tsx` (not `tsx watch` — confirmed via `ps -ef`, its parent chain is a separate
`npx tsx agent-daemon-server.ts` invocation from 3:26PM, unrelated to the outer `tsx watch
src/index.ts` supervisor), so it would need an actual restart to load an edited file — which I was
told not to do. I reverted the edit immediately (`git diff` on that file is empty) and used the
transcript method above instead, which needed no code change and no restart.

### Proof 2: the actual wire payload (the stronger of the two)

I patched `window.fetch` in the live tab (a pure browser-runtime monkey-patch, nothing written to
disk, gone on next reload) to log every `POST /api/*` body, then sent two more short follow-ups in
the same pinned-chip thread. The chip was visibly pinned in the screenshot immediately before each
send. Captured body, in full:

```json
{
  "threadId": "b625213d-fe53-4498-a821-2ebf6378a53d",
  "runId": "agui:87934969-de5a-4068-bf7d-edb7f8813201",
  "state": null,
  "messages": [ /* full conversation, role/content pairs */ ],
  "tools": [],
  "context": [],
  "forwardedProps": { "agentId": "claude" }
}
```

The endpoint is `POST /api/admin/v1/assistant/ag-ui-run` — **not** the `/api/runs` +
`contextRef` shape that `apps/admin/src/lib/assistant-transport.ts`'s `buildLocalCliContextRef`
builds (the code path I traced first, before running anything live). `context` — the AG-UI-protocol
field that would carry a plugin reference — is a hardcoded empty array. `tools` is empty too.
There is no `pluginRefIds`, no `ui-ux-design`, nothing about the pinned plugin anywhere in the
payload. Confirmed on two separate sends.

### What this does and doesn't tell us

The client-side state management for the chip is real and, per the code, correctly wired as of
today's fix:

- `composer-capabilities.ts:234-260` (current, committed, clean working tree — verified with
  `git status --short` immediately before writing this) — `agent-plugin:ui-ux-design` carries
  `pluginRefId: "ui-ux-design"` and `insertText: ""`, with an inline comment dated 2026-08-21
  explaining exactly why the empty string matters (an omitted `insertText` would fall back to the
  row's label on the slash-trigger path and type "UI/UX Design (Agent Plugin)" literally into the
  draft — a real bug this fix closed). This is NOT what
  `2026-08-21-agent-plugin-wiring-static-verdict.md` and
  `2026-08-21-agent-plugin-url-install-wired.md` describe for this same row (`insertText: "UI/UX
  Design agent plugin"`) — either they read a pre-fix revision, or (per the code's own comment
  about the two identically-labeled rows) they actually analyzed the neighboring `skill:ui-ux-design`
  row, which does still use a plain `insertText` and is a genuinely different, non-plugin mechanism.
  I did not chase down which — it doesn't change this report's own finding either way, but it's
  worth the next person reconciling these three reports checking.
- `AssistantDock.hooks.tsx`'s `resolveComposerDiscoveryOutcome` → `addPluginRef` → `selectedPluginRefIds`
  → `resolveRunContext()` → conditionally includes `pluginRefIds` in `context`, per my earlier
  research pass this session.
- The daemon-side code that would consume it (`plugin-prompt-prefix.ts`, `resolve-agent-plugin-refs.ts`)
  is real, tested, and (per that same research pass) correctly reads the installed SKILL.md and
  builds the `<<AGENT_PLUGIN>>` block with an absolute-path file inventory.

None of that matters if nothing downstream of `resolveRunContext` actually reaches the wire. I have
not identified which function builds the `ag-ui-run` POST body or why it drops `context`/never
reads `selectedPluginRefIds` — that's the concrete next debugging step, and it's someone else's
call which of the two transports (`/api/runs` vs `ag-ui-run`) is meant to be authoritative going
forward. What I can say with certainty is that **the transport the live composer actually calls
today is not the one carrying the plugin ref**, regardless of which side (client state, or
transport wiring) is "more correct" on paper.

## 3. Subjective half — visual comparison (reduced stakes, per the brief's own instruction)

Per the brief: differences between arms cannot be credited to the plugin once injection is
disproved. What follows is offered as the visual record, not as evidence of any plugin effect.

**Amber Fields** (no plugin, first/control run) — cream/peach hero (`#f7f1ea` background,
`#8a4b2a` brown accent), large serif headline, single CTA button ("Visit the shop"), eyebrow
"SMALL-BATCH ROASTED DAILY". Only hero + "Our story" sections were generated before the agent
paused to ask about the (unspecified) real address/hours rather than invent one.

**Wren & Anvil** (plugin pinned, not actually injected) — same cream family background, bold serif
headline, two CTA buttons ("Visit the shop" + "See this week's coffees"), a simple line-art
steam/kettle illustration, eyebrow "SMALL-BATCH ROASTERS · EST. 2016". This run *did* invent a
fake address (114 Cutler Street) without asking first — a real behavioral difference from Amber
Fields, but attributable to ordinary run-to-run variance, not the plugin (which never reached it).

**Foxglove** (plugin pinned, not actually injected, third run in the same thread) — cream/pink
background, two-line mixed-weight headline (bold sans "Foxglove" / italic serif "Coffee
Roasters"), a custom illustrated flower graphic, mauve accent, two CTA buttons ("Visit the shop" +
"See our coffees"), eyebrow "SMALL-BATCH ROASTERS · EST. 2019". Also invented a fake address.

**Cross-arm pattern, unprompted by any plugin:** all three (plus, per the brief's own background,
the two much earlier Cinder/Thornwood pages) converge on the same family — cream/warm-neutral
background, a serif or mixed serif/sans headline, a muted accent color, and an eyebrow line
following the shape "SMALL-BATCH ROAST\* ... EST./TO ORDER". Two of three new runs (Wren & Anvil,
Foxglove) independently produced the near-identical eyebrow pattern "SMALL-BATCH ROASTERS ·
EST. &lt;year&gt;" without any plugin content reaching either of them — strong circumstantial
support for the same conclusion the brief's background section already suspected about the earlier
Cinder/Thornwood convergence: this is the model's own prior for "coffee roaster landing page,"
not anything a plugin or a hand-typed instruction contributed. Concrete, nameable differences
between the three (secondary CTA present in 2/3, custom illustration in 2/3, fake-address
invention in 2/3, headline typography mixing serif+sans in 1/3) look like ordinary sampling
variance riding on top of that shared prior, not a plugin-driven shift in type scale, spacing
rhythm, component states, or accessibility affordances — the SKILL.md's actual claimed contributions
(see §4) are not visible in any of the three.

I did not screenshot the coffee-offerings/CTA sections below the fold for Wren & Anvil — the
admin's own "Preview" panel clips to a fixed height for sections below the hero (confirmed on both
Amber Fields and Wren & Anvil; "Interactive" mode's own scroll didn't respond to synthetic wheel
events either). The hero comparison above is what's screenshotted and load-bearing in this report.

## 4. What the plugin would have said, had it arrived

`infra/agent-plugins/ws/workspace-local/packages/sha256/f64f7a62e483a965d8c697d4403ff6e8a3ce5243ae3094a045f96f74d7b4a14d/skills/ui-ux-design/SKILL.md`
is real, substantial content (78 lines, YAML frontmatter + Execution/Guardrails/Output/Reference
sections) — not a stub. Notably, its own "Decision Rule" says any signal that visual quality
matters ("make it look good", a first-impression/marketing surface — a landing page prompt clearly
qualifies) should load `references/premium-ui.md` **and its three companion notes** up front, and
the daemon-side injection format (`resolve-agent-plugin-refs.ts:165-171`) appends an absolute-path
file inventory specifically so the agent can `Read` any of those reference files directly. None of
the three transcripts contain a `Read` call, or even the string `premium-ui`, for any file under
that package — consistent with, and a third independent confirmation of, the transcript/network
findings in §2: the plugin's content was never available to look up in the first place.

## 5. What I did not do

- Did not touch, edit, or regenerate `/cinder-coffee-roasters` or `/thornwood-coffee-roasters`.
- Did not start Docker, kill or restart any process, or leave any debug code in the tree (`git diff`
  on `plugin-prompt-prefix.ts` is empty; the fetch patch was browser-runtime only).
- Did not run a full test suite or `npm test`.
- Left `apps/admin/src/styles/assistant.css` and the four named off-limits files untouched.

## 6. Bottom line for whoever picks this up

The chip-pinning UI and the daemon-side SKILL.md injection are each independently real and
correctly implemented. They are just not connected to each other in the transport the live admin
actually uses today (`ag-ui-run`). Until that gap is closed, pinning "UI/UX Design (Agent Plugin)"
in the composer does nothing observable — not a design influence, not even prompt text. Anyone
re-running this experiment after a transport fix should reuse the network-interception method in
§2 (a two-line `window.fetch` patch, no restart, no code change) as the fastest way to get a
definitive yes/no before spending time on a visual comparison.
