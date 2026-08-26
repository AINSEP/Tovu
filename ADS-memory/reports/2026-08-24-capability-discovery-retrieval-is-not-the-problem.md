# Capability discovery: retrieval is NOT the problem — selection is

Date: 2026-08-24
Method: live run in the browser admin chat (Claude Code CLI, default model), no plugin pinned,
`TOVU_CAPABILITY_MANIFEST_ARM` unset (= `off`), agent-plugin tools wired into live boot.

## Setup

`registerInstalledAgentPluginTools` was wired into `agent-daemon-server.ts`'s `start()`, immediately
before `buildToolCatalogQuery(registry)` (the one-shot FTS snapshot). Verified live: the daemon
exposes `agent_plugin_ui_ux_design` as a real tool.

Prompt, chosen to contain NO vocabulary that matches the plugin's indexed text:

> My site looks kind of plain and amateur. How do I make it look more polished and professional?

## Result: the run searched 8 times, got the right answer at #1, and ignored it

The agent issued 8 `search_tools` calls. Its FIRST was:

> "change site theme, colors, fonts, or visual design template for the website"

Replaying that query verbatim against the live catalog:

```
 1. agent_plugin_ui_ux_design   <<<< the plugin
 2. theme_write_file
 3. theme_read_file
 4. pages_write_html
 5. theme_list
 ...
```

**The plugin was rank #1 in the agent's own query.** The agent called `theme_list` — rank #5 — and
never touched the plugin. Its remaining 7 queries were all in service of a goal it had already
fixed: swap the active theme. Final answer: "your site is using the Basic theme… pick Ember or
Atelier", with a fabricated-sounding theme list and no reference to the installed design guidance.

## Why this settles the "do we need semantic embeddings?" question: NO

Embeddings improve *ranking*. The correct result was **already rank #1** in the agent's own,
self-authored, semantically-rich query. There is no ranking improvement available above #1.

The failure is **selection**, not retrieval: the agent decided "polish = change the theme" before
reading its results, then picked the result matching that plan. This is a sharper version of the
2026-08-23 root cause ("resolves a plausible answer before issuing any query") — corrected: it DOES
issue queries, good ones, and discards the better answer they return.

## What this does and does not invalidate

- **Does NOT invalidate the structural fix.** Registering agent plugins as real tools demonstrably
  works: #1 on "design guidance", "accessibility", "visual design", "ui", and on the agent's own
  query. Native tools were not crowded out (`theme_read_file` #3, `theme_list` #5 in the same list).
- **Does invalidate an earlier framing in this session's own notes** — that the vocabulary gap
  ("polished"/"professional"/"accessible" are zero-hit) was the binding constraint. It is real but
  NOT binding: the agent never searched the user's words, it wrote its own query, and that query hit.
- **`mandate` cannot be retired on this evidence.** Structure alone did not produce use.

## Open, and the honest next question

Why does a #1 result get skipped? Candidates, untested:
1. The tool's description reads as documentation, not as an action, so it loses to an executable verb.
2. Result ORDER may not be what the model weights — it may prefer a familiar `theme_*` name.
3. The agent may never have seen result #1 (truncation/rendering in the jini bridge) — **check this
   first; it is cheap and would change the diagnosis entirely.**

Do not build embeddings until (3) is ruled out.

## Incidental bug found (real, unfixed)

The admin's floating assistant toggle (the orange circle, bottom-right) renders ON TOP of the
composer's Send button, which is directly beneath it. Clicking "Send" hits "Close assistant"
instead: the dock closes, the composer keeps its text, no message is sent and no error appears.
Reproduced 2×. Workaround: press Enter. Confirmed visually by zooming the overlap region.

---

# SECOND RUN, same setup: a CLEAN Case (b) success — and it isolates the real rule

Same conditions (arm `off`, no plugin pinned, agent-plugin tools wired, Claude Code CLI). Prompt:

> Can you audit my site and tell me if I'm breaking any privacy or cookie laws before I launch?

**The FIRST tool call of the run was `agent_plugin_ui_ux_design`.** All three criteria hit:

1. **Searched** — "searching the site's tool catalog for anything that does a compliance/privacy audit"
2. **Found** — "the top hit has a **web-compliance** checklist skill"
3. **USED** — opened it and structured the whole answer as a compliance risk-screen (jurisdiction
   framing, red/yellow tiers, "not legal advice" caveat) — the skill's own shape, not generic advice.

22 tool calls, run succeeded. Output was genuinely good: it caught a published-but-unedited Privacy
Policy (`[Company Name]` placeholders live on `/privacy-policy`, including the "do not publish this
section unedited" author note), analytics enabled with **no consent capability anywhere in the
product**, and undisclosed IP collection by 9 live forms and by comments.

## The rule both runs together isolate

| Prompt | Does a native tool plausibly fit the goal? | Plugin rank | Outcome |
|---|---|---|---|
| "make it look polished/professional" | **YES** — `theme_*` | **#1** | **ignored**; used `theme_list` (#5) |
| "audit for privacy/cookie law" | **NO** — no compliance tool exists | **#1** | **used FIRST**, unprompted |

**The agent prefers an executable native verb over guidance content whenever one plausibly fits the
goal it has already formed. When nothing native fits, it takes the guidance immediately.**

This is not a retrieval problem, not a ranking problem, and not a vocabulary problem — the plugin was
rank #1 in both runs. It is a *preference* between two things it can see.

## Consequences

- **§6.2 is answered, with a qualification.** Structure alone DOES produce discovery and use — but
  only when no native tool competes. `mandate` therefore **cannot be retired**; its value is exactly
  the contested case.
- **Do not build semantic embeddings.** Confirmed twice: the correct result was already #1.
- **The promising cheap lever** is the plugin tool's *description*, which currently reads as
  reference material ("...guidance from the installed plugin, covering 7 skills..."). Making it read
  as an action to take first is a one-line experiment against the contested ("polished") prompt,
  which is now a known-failing control. That is the next test.
