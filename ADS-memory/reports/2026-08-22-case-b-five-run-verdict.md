# Case (b), five runs: pull-based discovery does not work, and ranking is not why

Date: 2026-08-22
Runs: `caseb`, `caseb2`, `Bramblewick`, `Copperkiln`, `Nettlefold` — same prompt, same model (sonnet),
no plugin pinned, memory isolated on every run. Total ~$7.70.

## Result

| run | turns | searched for design? | `capability_search` called? |
|---|---|---|---|
| caseb | 33 | yes | **no** |
| caseb2 | 9 | no | **no** |
| Bramblewick | 36 | yes | **no** |
| Copperkiln | 27 | yes | **no** |
| Nettlefold | 46 | yes | **no** |

**0 of 5.** Two of those runs were AFTER `168aea24` added category keywords that moved
`capability_search` from unranked to rank 8/10 on the originally-recorded query.

## The finding that matters, and it is not the count

Every design-related query the agent issued, across every run, verbatim:

```
theme design tokens colors fonts brand style guide for this site
which theme is currently active on the live site
get current site settings value for active theme id
read the active theme's design tokens (colors, fonts, spacing)
read theme design tokens, color palette, fonts, and site branding for consistent styling
get the currently active theme applied to the live site
site appearance settings, which theme id is currently applied to the site
read theme design tokens like colors, fonts, and spacing variables for the active theme
get the site's currently active theme and site settings
```

**Every one contains the word "theme."** Not one asked for installed guidance, a plugin, a skill, a
playbook, or a reference.

The agent did not fail to find the capability catalog. It never looked for it. Given "use whatever
design guidance this workspace has available to you," it resolved *design guidance* to *the active
theme* before issuing a single query, then searched for theme tools — and found them, correctly.

`capability_search` losing to `theme_read_file` on "read the active theme's design tokens" is the
index working. It is the right answer to the question actually asked.

## Consequence: retire the ranking hypothesis

This is upstream of retrieval. No keyword set, no BM25 weighting, no merged index and no doc2query
entry reaches it, because none of them change what the agent decides to look FOR. A better index
answers a question that is never asked.

The prior session's 5-model consensus reached this by argument and recorded it as settled:

> Is this a discovery problem? **No** — 5/5. Necessary, not sufficient.

Five runs now say the same thing empirically. **The Coordinator drifted from that conclusion during
this session and had to be brought back by data** — the keyword work in `168aea24` was built on the
assumption that a search happens and merely ranks badly. That assumption was never tested first.

`168aea24` is still worth keeping: it fixed a genuinely broken eval (which had been scoring against
**zero** wired tools) and the keywords are harmless and correct. It is simply not the fix for this.

## What does work

Push, not pull. Every run where a pointer was injected, the agent followed it — case (a),
`capability_get` called with the exact id supplied. 100%, small n but zero counterexamples.

Recommended next build: **the operator's slash-command pointer.** `/ui-ux-design` in the composer sets
the same `pluginRefIds` field the existing chip sets, which `resolve-agent-plugin-refs.ts` already
turns into a mandatory pointer in `pointer` delivery mode. **No server change is required** — it is a
composer UI feature on top of a proven wire path. And `capability_search` remains exactly right for
populating that menu: a human scanning a list is a completely different act from an agent forming a
query, and the catalog is good at the former.

## Not claimed

- One model (sonnet), one workspace, one installed plugin, one phrasing of the gesture. A prompt that
  said "check for installed plugins" would obviously behave differently — and would be case (a).
- Nothing here says the capability catalog is wrong or should be removed. It works; it is simply not
  self-discoverable, and human-facing discovery is a different job than agent-facing discovery.
