# Case (b) measured: the agent does NOT find the capability catalog on its own

Date: 2026-08-22
Run: `caseb` · agent `claude` · model `sonnet` · 33 turns · $1.79 · exit `succeeded`
Closes: the last Unresolved Delta in
`ADS-memory/reports/swarm-consensus/runs/2026-08-22-tovu-capability-bucket-consensus-report.md`

## The question, in the debate's own words

> Whether case (b) — ambiguous-intent search — is a real user need at Tovu's scale, or a projected
> one. No measurement exists. **It is the entire justification for the bucket.**

Case (a) — the user names a capability, something points at it — was measured earlier today and
works: under a mandatory pointer the agent called `capability_get` with the exact id it was given.
Case (b) is the harder half: the user gestures at a category and nothing points anywhere.

## Method

The standard coffee-roastery prompt (Saltmarsh), plus one paragraph that gestures without naming:

> Make it look genuinely premium — this needs to hold up against a well-designed commercial site, not
> look like a default template. **Use whatever design guidance this workspace has available to you.**

**No plugin pinned.** No pointer injected. Delivery mode confirmed absent from the API process env.
Memory store isolated for the run (`--isolate-memory`), so the agent could not read the notes
describing this experiment — verified afterwards: zero `.claude/projects` paths in any `Read` path or
`Bash` command.

## Verdict

**`capability_search`: NOT CALLED. `capability_get`: NOT CALLED.**

## What makes this decisive rather than a shrug

The agent did not ignore the request. **It went looking for design guidance and found something else.**
Nine `mcp__jini__search_tools` queries, including verbatim:

```
"theme design tokens colors fonts brand style guide for this site"
"which theme is currently active on the live site"
```

It then called `theme_list`, `settings_get_effective`, `theme_list_files` ×2 and `theme_read_file`
**×7**, and built the page from the active theme. It satisfied "use whatever design guidance this
workspace has" by reading the theme — a defensible answer to the question as asked. The capability
catalog was simply never a candidate.

## Root cause: you have to discover the discovery tool

`capability_search`'s own description, verbatim from `capability-tool-registrations.ts`:

> "Searches every discoverable capability this workspace has available beyond the ordinary tool
> catalog — today, installed Agent Plugins' Skills. Returns ranked, discovery-only hits
> (name/description/keywords); call capability_get with a hit's id to read its full content. Never
> returns an empty-query 'everything' page."

It contains **none** of *design, style, visual, brand, UI, UX*. The agent's actual queries were built
from the user's vocabulary — "design tokens", "brand style guide" — and there is nothing here for BM25
to match.

The words that WOULD have matched are real and present, but in the wrong index: the capability cards
are named `gstack-design`, `interface-design`, `ui-ux-design`, `vercel-web-design-guidelines`. Those
live **inside** `capability_search`'s own index, unreachable until it has already been called.

This is two-level discovery with no vocabulary bridging level one to level two. It is why the smoke
test earlier today DID find the tool — that prompt contained the word "capability", which is the one
word the description is rich in.

## Consequence for the design

The bucket's warrant, as the debate framed it, is not met today. Not a wording slip in the prompt —
structural. Two candidate fixes, cheapest first:

1. **Vocabulary bridge.** Put the installed capabilities' own vocabulary into `capability_search`'s
   description (or synthesise it from the live card set) so the tool catalog can rank it for the
   queries a real request produces. One string, one re-run to falsify.
2. **One index, not two.** Project capability cards into the tool catalog itself so a single search
   reaches both. This is closer to DP1's "one discovery index over many registered sources" — which
   the debate settled 5/5 — and it would make the failure impossible rather than unlikely.

Try 1 before 2: it is cheap, and if it works 2 is unnecessary. If it does not work, that is strong
evidence for 2 and the argument is then grounded rather than assumed.

## Not claimed

- One prompt, one model (sonnet), one workspace with one installed plugin. A different phrasing might
  find it; this measures one honest phrasing, not the whole space.
- Nothing here says the catalog is wrong. Case (a) works. This says it is not *self-discoverable*.
- The theme-reading behaviour was not scored for output quality; only for what the agent reached for.
