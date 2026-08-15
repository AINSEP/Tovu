# Primary (Claude Opus 5) — Debate 4 (Plugin system)

## ⚠️ Protocol disclosure

I failed to freeze a Round 1 position for this debate before dispatching peers, which the Primary Participation rule requires. The Round 1 section below was therefore written **after** reading the peers — it is informed, not blind, and must be weighted accordingly in the agreement math. It is not a substitute for a blind first pass. The Round 2 section *is* properly frozen: written after Round 1, before any Round 2 output.

---

# Round 1 position (LATE — informed, not blind)

My independent contribution here is not a preference among A–D; it is the verification that reframes the question. Sonnet suspected the walking skeleton does not close its loop but could not confirm it without the composition root. I checked.

`loader.ts:147-158` says in its own words that steps (4)–(5) — invoke `setup()` with the capability-scoped SDK, then attach the declared hooks — **"are still NOT called from inside this function."** `loadPlugin()` returns `{ loaded: true }` after integrity verification, the `sdkRange` check, and a dynamic `import()`, and nothing more. The only production caller of `attachLoadedPlugin()` is `site-glue/attachment-points/content-lifecycle.ts` — ADR-057 Site Glue, outside SPEC-005's scope.

So a plugin enabled through the SPEC-005 path never runs `setup()` and never attaches its hook. AC-01 is not provable end-to-end through its own documented path.

The same comment records something worth generalizing: `hook-registry.ts`'s doc comment previously **asserted a caller that did not exist**, and that claim was "verified false." A confidently-worded comment encoded inference as observation. In this codebase, comments are claims to check.

---

# Round 2 position — FROZEN

Written after reading all Round 1 responses, before reading any Round 2 output.

## Sequencing Verdict

**Wire-then-recover-then-widen. In that order, and the order is the whole answer.**

**(1) Close the loop, proven by a test that fails today.** Not "confirm" — *complete*. A regression test that enables a plugin through the SPEC-005 path and asserts `word-count` writes `ext.word-count.count` on save. It must fail against current `main`. Everything else in this debate is scaffolding on top of a claim nobody has demonstrated, and the cost of discovering this later — after a hook catalog exists — scales with everything built in between.

**(2) Recovery and quarantine, before any new hook.** This is Sonnet's unlisted workstream and I think it is underrated by the whole field, including my own framing. `EC-10`: a throwing filter **blocks every content save** while the plugin is enabled, recoverable only by an operator manually calling `PATCH .../plugins/:id {enabled:false}` — which requires the admin to still be usable and the operator to know that is the cause. ADR-024 promises "an update or plugin must never brick your site," and the one plugin that exists can brick every save. ADR-024's own binding invariant is that **no feature ships whose failure mode exceeds the current recovery rung** — so by the architecture's own rule, widening the hook surface before adding auto-quarantine is prohibited, not merely unwise. It is also the cheapest item here: detect a filter throwing repeatedly, auto-disable through the same gateway path `REQ-07` already uses. No new trust infrastructure.

**(3) Then hook-catalog growth**, under ADR-024 §7 discipline per hook — explicit priority, declared phase, deterministic order, defined failure behavior — with INV-06's anti-hook-soup rule enforced. Going wide fast without that reproduces the exact WordPress failure mode this architecture was designed to avoid.

**(4) Tier-1 primitives**, sequenced by verified infrastructure. Only webhook dispatch has visible backing (`WebhookSubscriptionRepoPort`/`WebhookDeliveryRepoPort` + `KeyringPort` HKDF signing). Snippet/asset injection, mail adapter, redirect executor, and form-submission sink have none, so Tier-1's 60–73% demand vindication is conditioned on four unbuilt things. Build webhook dispatch first *because* it is the one whose cost is known.

Tier-2 sandbox stays deferred. Nothing in Round 1 reopened it.

## Trust vs surface

**Surface, decisively.** One hook gates every plugin at every tier. A fully-trusted, first-party, sideloaded Tier-3 plugin — which ADR-024 already permits today, no sandbox required — still cannot touch admin menus, publish/delete/trash, or filter a query. That is not a trust limitation; advancing the trust rungs would not unlock a single additional capability, because there is only one capability to unlock. The trust ladder governs *who* may run code; the hook catalog governs *what code can do*. Today the second is the binding constraint and the first is not.

## Remaining Disagreements

**Against option A as framed:** growing Tier-1 is not a separate track from growing hooks — every Tier-1 primitive (webhook dispatch, snippet injection, mail, redirects, form sink) *is* a hook, scoped to declarative consumers. Treating A and C as alternatives is a false choice; the real variable is discipline and pace on one axis.

**On the two unverified drift findings** — the `await attachment.filter(...)` against a spec type with no `Promise`, and the shallow `{ ...entry }` snapshot leaving nested references shared — I would not call either broken, but ADR-024 §3 explicitly demanded this audit happen *now*, "while there are zero third parties to break." That window closes permanently the moment a third party exists. Do the audit as part of step (1), when it is free.

**Background/scheduled work** is a genuine gap nobody scoped, and it is structurally harder here than on a server because a desktop site may simply not be running when a job would fire. WordPress ecosystems lean on cron heavily. I would put it explicitly out of scope for v1 and say so, rather than leave it undefined.

## Strongest Counter-Argument

That step (1) is not actually a precondition — Site Glue *does* call `attachLoadedPlugin()` in production, so hooks demonstrably fire through *some* path, and one could grow the catalog against that path while the SPEC-005 path is fixed in parallel. That is fair, and if the two paths are converging anyway it weakens my ordering. My answer is that having two enable paths with different wiring is itself the risk, and that the cheapest moment to reconcile them is before a catalog multiplies the surface.

## What Would Change My Mind

- Composition-root wiring showing the SPEC-005 enable path *does* reach `setup()`/attach — that would remove step (1) and reorder everything after it.
- Evidence that near-term operator demand is dominated by code-requiring integrations rather than declarative content packs — that pulls Tier-2 forward against ADR-024's own stated collapse condition.
- A demonstration that auto-quarantine cannot be built on the existing change-set gateway without new trust machinery — that would move step (2) after step (3).

<<SWARM_END>>
