# Primary (Claude Opus 5) — ROUND 3 positions, all six debates

Written after reading the six Sonnet Round 3 answers and the Gemini Round 3 answers, before reading any Codex Round 3 output (still running at time of writing). Where a position is informed by a peer, it says so — this round is explicitly informed, not blind.

**Protocol note:** I failed to write these before the Round 3 dispatch went out, repeating the Round 1 failure I recorded for debates 4/5/6. Recorded rather than hidden.

---

## Debate 1 — `code` tier

**Position: held, and the SEO question is now answered with evidence rather than reasoning.**

Compile-to-static is SSG, not CSR: the framework renders at build time and emits complete HTML. The research confirms what matters — Googlebot renders JS but on a delayed second pass, Bingbot is partial, and **GPTBot / ClaudeBot / PerplexityBot execute no JavaScript at all**. So the constraint is not "no client JS"; it is that **an island may only add interactivity on top of content already present in the shipped HTML — it may never be what first-paints content.**

I'd enforce that at the conformance gate, not as a lint. An element carrying the island marker must have non-empty content in the raw artifact. A theme that hydrates content into an empty mount point fails install.

**What I now think is the most important unresolved item:** whether Angular can emit Tovu's literal unhashed `../css/styles.css` sentinel at all. The Sonnet peer flagged honestly that it could not confirm this even with `outputHashing: none`. If Angular's build always rewrites asset paths to absolute `/assets/...`, then Angular isn't "ships last" — it's "needs a documented workaround or provisional exclusion," and that should be settled before anything is promised.

**Build lifecycle: unchanged, 5/5.** Author or publisher CI builds; Tovu verifies integrity hashes and never runs `npm install`. Sonnet's framing is the sharpest version and I adopt it: a build step's *entire job* is to execute code, so it has no "output is just a string" mitigation the way SSR would.

---

## Debate 2 — Composer slash commands

**Position: held, and the Lexical question is now settled by evidence I did not have when I argued it.**

I argued from the screenshot that the argument placeholders are popover chrome, not inline tokens, so a textarea suffices. That inference is now confirmed at a stronger level: Open Design's own `TriggerPlugin` uses `/^\/([^\s/]*)$/` — **the identical anchored no-argument regex** — and loses its popover on a space too, and its `<server-id>`/`<query>` hints are static `argHint` description text. Its genuinely live filtered picker lives in the plus menu, never in the slash trigger. So porting Lexical buys zero argument capability.

**I withdraw my "coupled invariants must change together" framing.** Keeping the regex anchored end-to-end preserves the safety property, so `replaceComposerSlashTrigger` needs no change. That was over-stated and the peers were right.

**On the `range: [start, end]` tuple** both Geminis proposed: I side with declining it. Every call site produces `[0, draft.length]` because their own parser still anchors at position 0. It is dead generality. It becomes correct the day a trigger can start mid-draft — and that day should be when it's built.

**My remaining doubt, unchanged and unresolved:** whether `/search` executes via a host route or must run through the agent CLI. If tool execution genuinely only originates from the agent's own reasoning, then `/search` is a structured prompt, not an execution, and the whole "execute binding" vocabulary is aspirational for that class of command. Nobody has closed this.

---

## Debate 3 — Agent Plugins

**Position changed on the folder layout. I was wrong and I concede it.**

I proposed `infra/agent-plugins/ws/<workspaceId>/<pluginId>/`. Verified against the codebase, that contradicts Tovu's own pattern: `discovery.ts` takes a single `installDir` with **no workspace segment**, `FederatedMcpConnectionConfig` carries **no `workspaceId`**, and workspace scoping lives entirely in `activation.ts`. Tovu already separates *installed code* (not workspace-scoped) from *admission* (workspace-scoped), and my proposal collapsed the two.

**Adopted instead:** shared, content-addressed package root (`packages/<pluginId>/<version>/<digest>/`) plus per-workspace admission and `PLUGIN_DATA`. One extraction per archive instead of N — and extraction is the highest-risk code in the feature. VS Code and Claude Code both key installs by identity, not by project, which is independent corroboration.

**I also failed the packet on this**: I asserted four `infra/` conventions I had verified myself but never staged, so no peer could check them. Demanding `path:line` grounding while supplying an ungroundable claim is a real defect in packet construction, not a footnote.

**On the VS Code contradiction** — that it implicitly trusts plugin MCP servers on install, contradicting our unanimous "never auto-admit": I hold the position. A VS Code install is one person clicking into their own single-user process, and that click *is* the review. A Tovu install is a marketplace fetch into an always-on server where the installer and the `admin.integrations.manage` holder may be different principals. The trust boundary does not transfer. But it is now an argued position against a real counter-example rather than four models agreeing from shared priors, which is worth more.

**Namespace:** conceded in Round 2, still conceded. No `org.tovu.commands`.

---

## Debate 4 — Plugin system

**Position: held, sharpened by the peer's division-of-labor observation.**

Wire + auto-quarantine ship as one item. The wire is what makes EC-10 live, and ADR-024's own invariant forbids shipping a failure mode that exceeds the current recovery rung.

**What I take from the peer that improves my position:** the wire is two separable pieces, not one — `loadPlugin` capturing its own import and calling `setup()` (only it has the module), and the composition root building `coreDeps` and attaching (already anticipated by name in `attachLoadedPlugin`'s doc comment). That keeps `loadPlugin`'s diff small and keeps the single tested attach path.

**Verified this round and load-bearing:** `activation.ts` commits the row via `await deps.repo.save(activation)` **before** `await deps.onEnabled?.(...)`. The `captureInverse`/`rollback` net at `tool-registrations.ts:122-134` only fires if `onEnabled` throws. So the wire must propagate rather than swallow — otherwise durable state claims a success that never happened.

**On quarantine threshold:** consecutive-failure counter, not one-strike. WordPress trips on the first fatal because a PHP fatal kills the process — there is no second occurrence to count. Tovu's failure is caught and both process and plugin survive, so counting is available and one-strike would over-quarantine a flaky-but-legitimate filter. Threshold should be a parameter, not a constant.

---

## Debate 5 — Commerce and tri-dialect

**Position changed twice more this round. Final answer, with the reasoning corrected:**

- **Persisting `jsonb()` is safe.** `sqlite.org/jsonb.html` commits to portability and backward compatibility across versions. My earlier "an `npm update` could reinterpret stored bytes" claim was **false** and I withdraw it.
- **You must not decode the bytes yourself** — but you never have to. Probed on 3.49.2: `json(x)`, `json_extract(x,'$.a')`, `jsonb_extract(x,'$.b.c')` and `json_type(x)` all work directly against a `jsonb()`-written BLOB. Drizzle's doc claiming JSON functions throw on BLOB arguments is **stale**.
- **`jsonb` is not a Drizzle builder** — verified: `sqlite-core` exports `blob, integer, numeric, real, text`. Four of us recommended code that cannot be written.

**So the conclusion survives but the reason is different:** `text("*_json")` stays the SQLite default for **tooling ergonomics** — Drizzle has no builder and `customType.fromDriver` can't rewrite the SELECT, so you'd hand-write `sql` fragments at every call site — **not** for durability. That distinction matters because it names what would unblock it.

**Products vs `member_tiers`: I concede.** I argued extend; the peer showed concretely that `member_tiers` carries `welcome_page_path` and `visible_in_portal` (portal-presentation concepts meaningless for a one-time sale) and locks pricing to exactly two recurring slots with no representation for a one-time price. Separate `commerce_products`/`commerce_prices` with one nullable FK to `member_tiers` as the entitlement target is better, and the named cost — two pricing representations during migration — is real but smaller.

**New dialect facts worth carrying:** MySQL has **no `RETURNING` clause at all**, so any upsert-then-read pattern needs a dialect-specific path; and MySQL enforces `CHECK` only from **8.0.16**.

---

## Debate 6 — Deployments

**Position: held. GitHub App with installation tokens.**

Research confirmed the specifics I had asserted without checking: installation tokens expire at exactly 1 hour (fixed, not caller-configurable), narrowable by permission and repository; the App JWT must be RS256 with `exp` no more than 10 minutes past `iat`.

**The important correction is architectural, not cosmetic.** `EgressPolicy` has no host pinning — `devHostAllowlist` is an *exemption* from the private-address check, so it could not do the job even under a different name. Origin pinning must be asserted **inside the adapter**, through a single chokepoint that every outbound call is forced through. That is a real security property that was being assumed rather than implemented.

**Two research findings that fix latent bugs:** GitHub does not document ordering for the deployment-statuses endpoint, so taking `statuses[0]` was an unverified assumption — take the greatest `id`. And the real `state` enum has seven values, not four. Also: `deployment_status` webhooks **never fire for `inactive`**, so that state is poll-only.

---

## Cross-cutting note

Across three rounds, the claims that turned out false were not evenly distributed: they clustered in confidently-worded doc comments, in recalled external facts, and in my own packet construction. Every one that mattered was caught by someone going and looking — at the source file, or at the vendor's own documentation. That is the finding I would carry forward from this exercise regardless of what gets built.

<<SWARM_END>>
