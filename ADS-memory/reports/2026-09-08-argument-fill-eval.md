# Argument-fill: does the model pass the right `resource`? — measured

Date: 2026-09-08
Eval: `development/evals/tool-search-argument-fill-fixture.ts` (builds the blind payloads) +
`development/evals/tool-search-argument-fill.eval.ts` (scores them). Raw arm answers, the hidden key,
and the scored stdout are committed under `development/evals/argument-fill-run-2026-09-08/`.
Run: `npx tsx development/evals/tool-search-argument-fill.eval.ts development/evals/argument-fill-run-2026-09-08 [read|delete]`
Persona: `AI-Dev-Shop/agents/tdd/skills.md` v1.1.1, loaded and confirmed before any work. Eval-work
pre-reads (`bug-taxonomy.md`, `eval-design-playbook.md`, `agent-evals/README.md`) read per
`AI-Dev-Shop/CLAUDE.md`; those three govern seeded bug-injection evals, and the blindness, disclosure
and "run the agent before ruling" rules in the playbook are the parts actually applied here.

`uptime` during the arms: 1-minute load 19.65 rising to 31.04 on 8 cores (15-minute average 131.50 —
the machine was heavily loaded throughout). Nothing here is timing-sensitive: the deterministic arm is
in-memory SQLite FTS5 scoring, and the live arms are model generations scored offline from files.

---

## Verdict, in one paragraph

**Argument-fill of `resource` is essentially free, and the 15-point asymmetry it was supposed to
explain does not exist.** On requests the tool genuinely serves, every shape measured picks the right
resource: **34/34 (100%, Wilson 90-100) for the fat entry and 34/34 for the 29 cards alike**, and
**8/8 for `content_delete` in all three shapes**. What is *not* free is a different failure the prior
framing never named: on requests the tool **cannot** serve, a fat `content_read` with bare-noun enum
values fills a resource anyway **72 times out of 75 (96%)**, where the shipped 29-card design abstains
**75/75 (100%)**. That failure is **not** granularity — it is caused by the option labels being bare
nouns, and it disappears completely when the same single fat entry's enum values carry the verb
(**arm E: 75/75**). And it is **verb-family-specific**: the identical experiment on `content_delete`
shows **no over-trigger in any shape** (121/122 out-of-scope abstention, the same single miss in all
three arms). So: the card design does **not** bear an argument-fill cost that the fat design escapes,
the fat design does **not** bear a resource-selection cost, and for `content_delete` argument-fill is
simply not a live consideration.

---

## 0. What the code says before any measurement — and it inverts the framing

The dispatch asked, third, whether a card design has an argument-fill cost at all, and to establish it
from the code first. It does not, and the answer is unambiguous. Dumped from the **real** composition
(`installFirstPartyToolContributors()` + `buildAssistantToolRegistrations`, 170 tools):

```
cards declaring a 'resource' property: 0 of 29
content_duplicate props=[resource, id, overrides] required=[resource, id]
content_duplicate.resource: type=string enum=null
```

**The shipped `content_read` has no `resource` argument at all.** The resource is in the tool id
(`content_read.media_asset`), and each card's `inputSchema` is `unionInputSchema` over its member
tools' own already-published schemas — `content-read-tool.ts` never adds a `resource` property and the
built catalog confirms none appears. **18 of the 29 cards accept no arguments whatsoever**
(`props=[]`); the model calls them with `{}`. So the card design's `resource`-fill cost is **exactly
zero, by construction, not by measurement.**

This matters more than it first looks, because the framing in
`2026-09-08-parent-tool-read-eval.md`'s Addendum 2 was that *"both designs relocate the same
disambiguation rather than eliminating it. D1 asks the model to pick the right card at retrieval time
(strict scoring counts that; 15 points). C2 asks it to pick the right `resource` argument after
retrieval (unmeasured here, and not free either)."* The first half is right. The second half assumed a
symmetric cost that turns out not to exist at the size implied — and the asymmetry, once measured,
runs the **other** way (§4).

`content_duplicate`, the other shipped parent tool, is the genuine fat shape: `resource` is required,
a **free string with no enum** (deliberately — its own header explains a boot-populated registry cannot
be a static enum), rejected at call time with the live supported list.

**One residual fill surface the card design does keep, and it is not zero:** 11 of 29 cards take
arguments, and `content_read.content_post` **requires** `kind` (`post` vs `page`). The 7 merged
get/list cards additionally dispatch on id-presence (`dispatchByIdPresence`), so "list" vs "get one" is
a per-call argument decision. **None of that is measured here** — this eval measures `resource`
selection, which is the quantity the open design decisions actually turn on.

---

## 1. Method, and every blindness control

The single most damaging error in this investigation was arm C's hand-written description, authored
with the eval queries in context, which produced a 26-point artifact. Nothing here is hand-authored.

- **Catalog.** `buildEvalToolRegistry()` (`e8245891`, throws below 100 tools). Observed: **170 tools
  shipped, 177 uncollapsed.** No arm ran against a 9-tool catalog.
- **Ground truth redirected through the card mapping.** The 36 retired read ids are resolved via the
  same blind `resourceKeyOf` rule (strip `list`/`get`/`by`/`id`, singularize, dedupe). The fixture
  **fails loudly** if the derived 29 keys differ from the shipped `content_read.*` card ids — it
  printed `29 (verified identical to the shipped card set)` on every run. It also refuses to build if
  any held-out ground-truth id fails to resolve pre-collapse.
- **All arm text is mechanical.** Every resource's text is its member tools' own authored
  `description`, concatenated. **Zero words are written by me.** Specifically, the text is the
  `stripSearchKeywords`-ed description — what `search_tools`/`describe_tool` actually return — not the
  folded index text, because the keyword/doc2query tail is indexed and never shown to the model
  (`tool-catalog-query.ts`'s own comment). Feeding the folded text would have handed the arms operator
  vocabulary the real model never sees.
- **Query order is deterministically shuffled** (seed 20260908, one permutation shared by every arm so
  results pair case-for-case). `tool-search-heldout-v2.ts` authored its 130 cases "one query per tool,
  in the tool-dump's own domain order" — left in that order, an answering agent could read the answer
  sequence off the position.
- **The 34 in-scope cases are not separated from the 96 out-of-scope ones.** An arm that knew which
  queries were in scope would never have to decide whether to abstain, and the false-fill rate — which
  turns out to be the whole result — would be unmeasurable.
- **The answering agents are isolated.** Each was told to read exactly one payload file and forbidden
  to read or search anything else, including the key, the other payloads, and this repo. Each wrote
  130 lines to its own uniquely-named file; every file was verified for line count, byte count, value
  distribution and parseability by me, not taken on the agent's word. The scorer refuses any file that
  does not cover exactly the expected case numbers.
- **Model.** Arms A/A2/B/C/D/E/F/G/H are **Claude Sonnet**; arm A2 was additionally replicated on
  **Opus 5**. Tovu's assistant is BYOK with no hardcoded model (`grep` for `claude-*` model ids in
  `apps/website/src` returns nothing), so no single model is "the" production model.

**Disclosed deviation, one.** Arms A and B were framed *"You have decided to call the tool
`content_read`"*, which pre-commits the model. That is a fair model of an agent that has just
retrieved the fat entry, but it is **not** symmetric with arm C's "or NONE". I caught this after
running them and added **arm A2**, identical to A except it adopts C's framing verbatim. A2 is the
arm quoted in every comparison below; A is retained and reported because it is evidence about the
framing itself. (The framing turned out to matter in the direction *opposite* to my assumption — A2
abstains **less** than A, 12/96 vs 31/96 — so the fat design's over-trigger is not something my prompt
manufactured.)

### The arms

| arm | shape | choice expressed as | n |
|---|---|---|---|
| A | one fat `content_read`, `resource` = closed enum of the 29 keys, pre-committed | argument value | 130 |
| **A2** | **identical to A, free to decline** | **argument value** | **130** |
| A2-opus | arm A2, replicated on Opus 5 | argument value | 130 |
| B | one fat `content_read`, `resource` = free string (`content_duplicate`'s shipped shape) | argument value | 130 |
| **C** | **29 `content_read.<resource>` cards — THE SHIPPED DESIGN** | **tool id** | **130** |
| D | 29 cards with the verb **stripped** (bare-noun tool ids) | tool id | 130 |
| E | one fat entry with the verb **added** to the enum (`read_<resource>`) | argument value | 130 |
| F | one fat `content_delete`, bare-noun enum | argument value | 130 |
| G | one fat `content_delete`, verb-carrying enum (`delete_<resource>`) | argument value | 130 |
| H | 8 `content_delete.<resource>` cards | tool id | 130 |

A and C are **information-symmetric**: identical 29 resources, identical text, identical 130 queries in
identical order. The only difference is whether the choice is expressed as an argument value or a tool
id. The retrieval step is deliberately held out — it is already measured deterministically for both
designs (`tool-search-fat-concat-arm.eval.ts`: D1-strict **85% top-10** on the affected cases, C2
**97%**) — and holding it out is what makes A-vs-C attributable to the shape of the choice rather than
to how the candidates were reached.

Delete-family membership and card keys are taken **verbatim** from
`2026-09-08-content-delete-eval.md` §1.2/§4.1, not re-derived: those scope calls are that report's
ruling to make.

---

## 2. Result 1 — on requests the tool serves, resource-fill is free

`content_read`, restricted to the **34** in-scope cases:

| arm | correct resource | wrong resource | abstained |
|---|---|---|---|
| A — fat, enum, pre-committed | 33/34 **97%** [85-99] | 0/34 0% [0-10] | 1/34 3% |
| **A2 — fat, enum** | **34/34 100%** [90-100] | 0/34 0% [0-10] | 0/34 |
| A2-opus | 34/34 100% [90-100] | 0/34 0% [0-10] | 0/34 |
| B — fat, **free string** | 34/34 100% [90-100] | 0/34 0% [0-10] | 0/34 |
| **C — 29 cards (shipped)** | **34/34 100%** [90-100] | 0/34 0% [0-10] | 0/34 |
| D — 29 cards, bare-noun ids | 34/34 100% [90-100] | 0/34 0% [0-10] | 0/34 |
| E — fat, verb-carrying enum | 34/34 100% [90-100] | 0/34 0% [0-10] | 0/34 |

Brackets are **Wilson** score intervals, not the normal approximation — at 34/34 the normal
approximation reports `±0`, which reads as certainty and is false. **The defensible claim is
"≥90% at 95% confidence", not "100%".** Paired McNemar on in-scope cases: every arm vs C is
`p=1.0000` with at most one discordant pair.

Three things follow.

1. **The card design's implicit resource resolution and the fat design's explicit `resource` argument
   are equally accurate.** There is no measurable fill penalty for the fat shape on the cases it
   serves.
2. **A free-string `resource` costs nothing when the description enumerates the resources.** Arm B had
   no enum and produced **zero** invalid strings across 130 answers — it copied the keys out of the
   description. This is a direct, if narrow, vindication of `content_duplicate`'s no-enum design.
3. **The 15-point "scoring asymmetry" does not transfer.** D1-LENIENT beat D1-strict by 15 points
   because a *wrong card* out-ranked the right one in BM25. Under a fat entry those same cases were
   supposed to become wrong-`resource` fills. They did not: **0/34 wrong resources in every arm.**

### The deterministic bound — why the 15-point number was the wrong instrument

Ranking the 29 resource documents against each other with **no other tools competing** — i.e. BM25's
own model of the fill decision, which is what reusing a retrieval number as a fill estimate assumes:

```
resource picked by BM25 top-1   25/34 74% [57-85]
correct resource in BM25 top-3  30/34 88% [73-95]
can it ever abstain?            no — BM25 always ranks something; every out-of-scope case is a forced fill
```

**BM25 gets 74%; every live arm gets 100%.** The nine cases BM25 misses and every live arm gets right
include *"what widgets have we built for the sidebar and stuff"*, *"show me all the recipes we've added
so far"*, and *"what's this site actually called and what's its url slug"* — the model resolves these
semantically, BM25 cannot resolve them lexically. And note the structural point: **BM25 has no way to
express "none of these" at all**, so the abstention behaviour that turns out to dominate the real
result is invisible to it *in principle*. A retrieval statistic was never going to estimate this.

---

## 3. Result 2 — the real cost is over-triggering, and it lands on the fat design

`content_read`, on the **96** out-of-scope cases, where the only correct answer is to abstain:

| arm | correctly abstained | FALSE FILL |
|---|---|---|
| A — fat, enum, pre-committed | 31/96 32% [24-42] | 65/96 68% [58-76] |
| **A2 — fat, enum** | **12/96 13%** [7-21] | **84/96 88%** [79-93] |
| A2-opus | 10/96 10% [6-18] | 86/96 90% [82-94] |
| B — fat, free string | 13/96 14% [8-22] | 83/96 86% [78-92] |
| **C — 29 cards (shipped)** | **85/96 89%** [81-93] | **11/96 11%** [7-19] |
| D — 29 cards, bare-noun ids | 86/96 90% [82-94] | 10/96 10% [6-18] |
| E — fat, verb-carrying enum | 91/96 95% [88-98] | 5/96 5% [2-12] |

Split by what the request **actually** wanted, classified from each ground-truth tool's own `readOnly`
flag (mechanically, never by judgment):

| arm | abstain on the 21 that wanted a *different read* | abstain on the 75 that wanted a **mutation** |
|---|---|---|
| A | 12/21 57% [37-76] | 19/75 25% [17-36] |
| **A2** | 9/21 43% [24-63] | **3/75 4%** [1-11] |
| A2-opus | 6/21 29% [14-50] | **4/75 5%** [2-13] |
| B | 10/21 48% [28-68] | 3/75 4% [1-11] |
| **C (shipped)** | 10/21 48% [28-68] | **75/75 100%** [95-100] |
| D | 11/21 52% [32-72] | 75/75 100% [95-100] |
| E | 16/21 76% [55-89] | 75/75 100% [95-100] |

**The mutation column is the result.** On 75 requests that asked for something to be *changed* — *"that
banana bread recipe is ready, put it live"*, *"rewrite the whole about page here's the new text"*,
*"kick that member out"* — the card design declines all 75. The fat entry with bare-noun enum values
returns a read resource on 72 of them. Paired McNemar, A2 vs C on the whole set: **C-only=74,
A2-only=1, p=4.0e-21**. Opus: **C-only=76, A2o-only=1, p=1.0e-21**.

The 21-case "wanted a different read" column is **largely a construction artifact and should not be
read as a design signal**: those requests' correct tools are Tier-2/Tier-3 reads (`webhooks_get_deliveries`,
`newsletter_list_send_log`, `redirects_get_hits`, `database_get_health`, …) that were never collapsed and
that **no arm was offered**. Every arm is mediocre there for the same reason. It is the one place all
six arms cluster.

### The mechanism: it is the option labels, not granularity

Arms D and E are the 2×2 that separates the two candidate explanations. Abstention on the 75 mutation
requests:

| | option labels are **bare nouns** | option labels **carry the verb** |
|---|---|---|
| **one fat entry** | A2: **3/75 (4%)** | E: **75/75 (100%)** |
| **29 separate entries** | D: 75/75 (100%) | C: 75/75 (100%) |

- **Granularity, holding labels fixed:** C vs D is 100% vs 100%. E vs C is 100% vs 100%. **No effect.**
- **Labels, holding granularity fixed at 29:** C vs D is 100% vs 100%. **No effect.**
- **Labels, holding granularity fixed at 1:** A2 vs E is 4% vs 100%. **A 96-point swing from renaming
  `widget_instance` to `read_widget_instance`.**

The reading: when the model chooses among bare resource **nouns**, it answers *"what is this request
about?"* — and *"change the settings on that recent-posts widget"* is unarguably about a widget
instance. When the verb is attached to the thing being chosen, the same model answers *"what should I
do?"* and correctly declines. **The card design gets this for free** — `content_read.<resource>` carries
the verb in every option, structurally, because the option *is* a tool id. **A fat entry gets it only
if someone thinks to name the enum values that way**, and neither `content_duplicate`'s shipped
`resource` values (`post`, `page`, `form`, `media`) nor any obvious fat `content_read` would.

E vs C on the whole set is **C-only=0, E-only=6, p=0.0313** — arm E is *better* than the shipped cards,
by six out-of-scope cases. That is a real but small edge, on a single arm, and the six are the
Tier-2/3-artifact cases above; I would not act on it.

---

## 4. Result 3 — `content_delete` shows none of this, in any shape

The same three shapes on the 8-tool delete family (family and keys taken verbatim from
`2026-09-08-content-delete-eval.md`), same 130 queries, 8 in-scope / 122 out-of-scope:

| arm | in-scope correct (n=8) | out-of-scope abstained (n=122) | abstain on the 55 that wanted a read | abstain on the 67 that wanted a mutation |
|---|---|---|---|---|
| F — fat, **bare-noun** enum | 8/8 100% [68-100] | 121/122 99% [96-100] | 55/55 100% | 66/67 99% |
| G — fat, verb-carrying enum | 8/8 100% [68-100] | 121/122 99% [96-100] | 55/55 100% | 66/67 99% |
| H — 8 cards | 8/8 100% [68-100] | 121/122 99% [96-100] | 55/55 100% | 66/67 99% |

**All three shapes are identical, case for case.** McNemar: `H-only=0, F-only=0, p=1.0000` at every
scope. The single false fill is the **same case in all three arms** — *"stop sending that slack ping
for now we're getting spammed"* → `webhook_subscription`, which is a defensible reading of a request
whose ground truth is a disable, not a delete. It is not a shape effect.

**This is also the control that rules out my arms' biggest artifact.** In arms A/A2/B/E/F/G the fat
tool is the model's *only* option — there are no competing write tools to win instead. If "only option
available" were what caused the read family's 96% false-fill rate, arm F would show it too. It does
not: `content_delete` with bare-noun enum values abstains on 121/122. **The read family's over-trigger
is a property of the read verb, not of the one-option setup.**

Why the asymmetry is real rather than a fluke: reading is a plausible first step toward almost any
request, so a tool that reads *anything* is a plausible answer to almost any request. Deleting is a
plausible first step toward nothing. A generic read tool is genuinely ambiguous in a way a generic
delete tool is not.

---

## 5. What this retracts, confirms, and leaves standing

| claim | source | status |
|---|---|---|
| "Both designs relocate the same disambiguation rather than eliminating it… C2 asks it to pick the right `resource` argument after retrieval (unmeasured, and not free either)" | read eval, Addendum 2 | **HALF RETRACTED.** The relocation is real, but the fat design's half is **free on the cases the tool serves** (0/34 wrong resources). The costs are not comparable in kind: cards pay at retrieval in *recall*, the fat entry pays at fill in *precision*. |
| "The asymmetry is worth 15 points, and it favours C2 in every table" | read eval, Addendum 2 | **STANDS as a retrieval statistic, RETRACTED as a fill estimate.** Those 15 points are BM25 ranking the wrong card first. Measured, the model gets 34/34 of exactly those cases right. The lexical model that the estimate assumed scores 74%, not 100%, so it was the wrong instrument in both directions. |
| "C2's apparent 97% is an upper bound in the same way arm C's RICH text was — just in the opposite direction" | read eval, Addendum 2 | **CONFIRMED, and now quantified — but the ceiling is somewhere other than expected.** The overhead is not in picking the resource; it is that the fat entry gets *invoked* on 88% of requests it should decline. |
| "A-concat's 100% is a retrieval-only ceiling… a cost this eval defers entirely to argument-filling and does not measure" | `2026-09-08-content-delete-eval.md` §2.6 point 3 | **MEASURED: that deferred cost is zero for this family.** F/G/H are identical at 8/8 and 121/122. The caveat was correct to state and can now be discharged. |
| The shipped 29-card `content_read` is safe | read eval, Addendum 2 point 1 | **STANDS, and is strengthened.** C is 34/34 in-scope and 75/75 on mutation abstention. |
| The argument for 29 cards over one entry is "top-1 precision alone (65% vs 38%), not significant" | read eval, Addendum 2 | **SUPERSEDED — there is now a second, much stronger and highly significant argument**: mutation over-trigger, 100% vs 4%, p=4.0e-21, replicated on two models. |

---

## 6. What this means for the open decisions

### `content_delete` — argument-fill is off the ledger

**Measured: zero cost, in every shape** (§4). One fat entry, one fat entry with verb-carrying enum
values, and 8 cards are indistinguishable — 8/8 in-scope, 121/122 out-of-scope, the same single miss.
The peer's own caveat that its A-concat 100% deferred an unmeasured fill cost is discharged: there
isn't one.

**So the `content_delete` shape should be decided on the grounds the delete report already gave** —
its top-1 retrieval signal (B-LENIENT 63% vs A-concat 13% at n=8), whether one shared handler is worth
having, and permission visibility — **and not on argument-fill.** My data removes one item from that
decision rather than settling it. If the fat entry is chosen anyway, §3's mechanism says to name the
enum values `delete_<resource>` rather than `<resource>`; §4 says it will not matter for this family,
but it costs nothing and it is the difference between a 4% and a 100% abstention rate on the family
where it *does* matter.

The n=8 in-scope sample is the binding limit here: 8/8 has a Wilson lower bound of **68%**. The
out-of-scope evidence (n=122) is the well-powered half, and it is the half that carries the risk for a
destructive verb.

### Collapsing `create`/`update` — **my result does not license it, and I want to be explicit about why**

Everything measured here is *resource selection from an enumerated set*. `content_read` takes
`{resource}` plus at most an id; `content_delete` takes `{resource, id}`. **`content_create` would take
`{resource, ...every field that resource requires}` — a union schema whose required fields vary by
resource.** That is the "conditional monster" `2026-09-07-assistant-tool-coverage-audit.md` §4 named,
and it is a **different and harder fill task** than anything in this eval. Selecting `post` from a list
of nouns is not evidence that the model will correctly fill a post's required payload while a form's
and a media asset's required payloads are also in the schema.

Two things *do* transfer, and both are worth having:

- **The resource-selection half is free** for create/update too, on this evidence.
- **The over-trigger risk is verb-shaped.** `create` and `update` are marked verbs like `delete`, not
  generic like `read`, so §4 predicts they will not over-trigger the way a fat `content_read` does.
  This is a prediction from the delete result, **not a measurement** — I did not run it.

**What it would take to measure the part that matters.** The held-out set cannot do it: its 130 queries
are one-line *discovery* requests ("show me X"), and none carries enough content to fill a create
payload. It needs a new query set of authoring requests, scored against each resource's real required
fields (readable mechanically from each tool's own `inputSchema`), with the same blindness protocol —
mechanical arm text, shuffled order, in-scope and out-of-scope mixed, answers written to files by
isolated agents. That is roughly the same size as this pass. **Until then, the honest statement is that
the schema-union objection to collapsing create/update is untested, not answered.**

### Immediately actionable, independent of any collapse decision

`content_duplicate` ships today with `resource` values `post` / `page` / `form` / `media` — **bare
nouns, the arm A2 shape.** §3 predicts it will be reached for on requests that are merely *about* a
post rather than requests to *copy* one. §4 says a marked verb is protective and it probably will not,
so this is a flag rather than a finding: it is the one live tool in the shape that failed, it was not
measured, and the fixture generalises to it for the cost of one more arm.

---

## 7. The strongest argument against my own conclusion

**Every arm strips away the 141 competing tools, and that is exactly where the fat design's over-trigger
would be rescued.** In arm A2 the model is asked "read something, or nothing" about *"rewrite the whole
about page here's the new text"* and there is no `content_post_update` on the table. In production
there is. A model that can see the write tool will take it, and the fat entry's 88% false-fill rate
could collapse toward zero in situ. If it does, the p=4.0e-21 gap is an artifact of the option set and
the two designs are as indistinguishable at fill time as C2 and D1 already are at retrieval time — in
which case §3's headline is measuring my fixture, not the design.

Three things temper that, and none of them is a refutation:

- **The delete family is the built-in control and it survives.** Arms F/G/H have the identical
  one-option handicap and abstain on 121/122. So the handicap does not automatically manufacture
  over-triggering; something specific to the read verb does.
- **Arm E has the identical handicap and abstains 75/75.** Within the fat design, holding the option
  set fixed, the label change alone recovers all of it. That is an internal contrast the artifact
  cannot explain.
- **The 2026-08-24 finding cuts toward the risk, not away from it.** That report found the agent forms
  a plan early and takes the first matching result rather than reading down the list. A fat
  `content_read` that ranks for a write request is exactly the "first matching result" that anchors a
  wrong plan — and C2's own signature, "always present, rarely first" (38% top-1 → 97% top-10), means
  the fat entry is *present* on nearly every affected query.

**The decisive experiment I did not run**, and what it costs: swap a fat `content_read` into the real
composition behind `includeContentReadCollapse`, run the 130 queries end to end against the live
`search_tools` on :3000 with a real model, and count how often it calls `content_read` on a request
whose correct answer is a write. That is a live-model run against a live daemon — not free, not
deterministic, and it needs a BYOK credential — but it is the only thing that converts §3 from
"measured under a restricted option set" to "measured in production shape". Everything in §3 should be
read as an **upper bound on the fat design's over-trigger rate**, with the delete family as evidence
that the bound is not vacuous.

**A second, weaker counter.** The in-scope side hit a ceiling — 34/34 in six arms, 8/8 in three more.
A ceiling means the task was too easy to separate the arms, and "fill is free" may hold only because
the 29 resources are semantically well-separated nouns drawn one-per-tool from a set built to cover
distinct tools. A harder set — two queries that are genuinely ambiguous between `content_read.member`
and `content_read.identity_user`, say, or between `newsletter_list` and `newsletter_campaign` — could
separate them. I did not build one, and **"resource-fill is free" is therefore established for
well-separated resources only.** The Wilson lower bound of 90% (n=34) is the honest ceiling on that
claim.

**A third, on the models.** Every arm is Claude. The A2 replicate on Opus 5 reproduces the effect
almost exactly (4% vs 5% mutation abstention), which rules out a Sonnet-specific quirk but not a
Claude-family one. Tovu is BYOK; a GPT or Gemini caller is untested.

---

## 8. What this pass changed

- **Added** `development/evals/tool-search-argument-fill-fixture.ts` and
  `development/evals/tool-search-argument-fill.eval.ts`, plus the raw run under
  `development/evals/argument-fill-run-2026-09-08/` (nine answer files, both keys, both scored
  stdouts) so every number above is re-derivable without re-running any model.
- **Changed nothing else.** No tool registered, no shipping catalog touched,
  `content-read-tool.ts` / `tool-catalog-manifest.ts` / `tool-registrations.ts` untouched. Root
  `npx tsc -p tsconfig.json --noEmit`: clean, re-run after each milestone. No
  `serve-command*.integration` suite was run. Databases were never opened.
- Commits: `33a27714` (fixture, scorer, arms A/A2/B/C/D/E), `b9f05e5f` (delete arms F/G/H, the Opus
  replicate, Wilson intervals, the readOnly split).

## 9. Open

1. **The create/update payload-fill question is untested** (§6). It is the one that would actually
   settle the audit's §4 objection, and it needs a new query set.
2. **`content_duplicate`'s bare-noun `resource` values** are the one live instance of the shape that
   failed (§6). One arm would settle it.
3. **The production-shape run** (§7) — the fat entry competing against the real 141 tools with a real
   model — is the experiment that would convert §3's upper bound into a point estimate.
4. **The shipped cards' own residual fill surface is unmeasured** (§0): `content_read.content_post`'s
   required `kind`, and the id-presence get/list dispatch on the 7 merged cards.

---

# Addendum (2026-09-08, same day): the peer's top-1 result, verified — and the destructive question, priced

Written after the coordinator relayed `2026-09-08-content-delete-eval.md`'s cards-vs-fat top-1 result
and asked three things: verify rather than inherit it, keep restricted and whole-set views separate,
and price "wrong resource, harmless" against "wrong resource, destructive" if this eval can.
`uptime` at run: 1-minute load 115.10 on 8 cores. All arms are deterministic FTS5 scoring or offline
file scoring; nothing is timing-sensitive.

## 1. The 50-point top-1 claim: verified, with one qualification their table does not show

I re-ran `tool-search-parent-tool-delete.eval.ts` and its restricted table reproduces **exactly**:
baseline 25/63/75/75, A-thin 13/13/13/50, A-concat 13/100/100/100, cards-strict 25/63/75/75,
cards-LENIENT 63/100/100/100 (top-1/5/10/20, n=8).

I then rebuilt both arms independently — same family, same mechanical `indexedDescriptionFor` text —
and ran **the paired test their table omits**. It reports each arm against BASELINE; it never tests
the two arms the claim is actually about against each other:

```
top-1   cards-LENIENT 4/8   fat-concat 0/8   discordant: lenient-only=4 fat-only=0   McNemar exact p=0.1250
top-5   cards-LENIENT 7/8   fat-concat 7/8   discordant: lenient-only=0 fat-only=0   p=1.0000
top-10  cards-LENIENT 8/8   fat-concat 8/8   discordant: lenient-only=0 fat-only=0   p=1.0000
top-20  cards-LENIENT 8/8   fat-concat 8/8   discordant: lenient-only=0 fat-only=0   p=1.0000
```

**Direction and magnitude confirmed** — cards ahead at top-1 by ~50 points under identical lenient
scoring, and the one-document/one-slot mechanism is the right explanation. My absolute numbers are
4/8 and 0/8 rather than their 5/8 and 1/8 because I counted only family hits while their scoring also
credits a surviving non-family `alsoAcceptable` id; the **gap** is the same size either way.

Two qualifications the claim needs carried with it:

- **It is not significant. `p=0.1250`, four discordant pairs all one-directional.** At n=8 the exact
  test cannot reach p<0.05 unless six or more discordant pairs fall one way. This is a directional
  signal, exactly as the peer said — but "50 points" and "p=0.125" should travel together, because
  the first number reads as decisive on its own and three unlabelled figures in this investigation
  have already been mis-quoted onward.
- **The gap exists at top-1 and nowhere else. At top-5, top-10 and top-20 the two arms are identical
  case-for-case — zero discordant pairs in either direction.** So the entire claim rests on rank #1,
  which makes it wholly dependent on the 2026-08-24 "takes the first matching result" finding being
  true of the deployed agent. If that behaviour does not hold, the two designs are indistinguishable
  at every cutoff measured.

## 2. On "every fat-entry number is flattered by an unknown-but-larger-than-15-point leniency margin"

**This inference has the sign backwards, and the correction is the point of this whole eval.**

The leniency margin is the set of cases where *some* member of the family ranks but the *right* one
does not. The argument that it flatters the fat entry assumes those extra hits fail to become correct
calls — that the fat entry ranks, and then the model fills `resource` wrongly. **Whether they convert
is precisely what §2 and §4 measure, and they convert at ~100%**: 34/34 for `content_read`, 8/8 for
`content_delete`, 20/20 on a set built to break it (§3). A fat entry that ranks does get called with
the right resource. So its leniently-scored retrieval numbers are **not** inflated by leniency — they
are approximately its end-to-end recall.

Under the card design those same cases are genuine misses: the right card did not rank, and the model
cannot call a card it was not shown. Strict scoring is correct for cards. So the leniency margin is a
real **fat-design advantage**, not a hidden fat-design cost.

**But the conclusion the coordinator was reaching for is right, for a different reason.** Every
retrieval table in both reports scores **recall only** — "did the right thing rank?" — and never
"did the wrong thing rank and get used?". That is where the fat design's real cost lives, and it is
invisible to all of them: for the read family, 72 false fills in 75 out-of-scope mutation requests
(§3). So the honest restatement is: **the published fat-entry numbers are not flattered by leniency;
they are flattered by being recall-only.** For `content_delete` even that correction is nil — its
precision cost is 1/122, identical in all three shapes — so for the delete family the fat entry's
numbers really are honest.

## 3. Pricing the destructive question — the answer is "no measurable difference", under a set built to find one

The peer's stakes argument is that a wrong `resource` is strictly worse on delete than on read: on
read it returns confident plausible wrong data, on delete it destroys the wrong thing. The premise is
obviously true. The question this eval can answer is whether the *rate* differs by design.

§4's held-out delete evidence was n=8 and hit a ceiling — **0/8 wrong has a Wilson upper bound of
32%**, which is far too loose for a destructive operation, and those 8 queries are well-separated
("delete that old logo image"). So I built a set to break it.

**`development/evals/tool-search-argument-fill-adversarial.ts` — 20 delete-family queries, 16 of them
BAIT**: the most lexically salient noun in the query is a *different* family resource from the one the
request targets, so a model matching on salience deletes the wrong thing. *"that blog post about the
summer sale has a photo we no longer have the rights to, take the photo down"* → `media_asset`, bait
`content_post`. *"remove the forwarding for /old-blog but keep the article it points at"* → `redirect`,
bait `content_post`. *"take out that one remark, not the block that displays remarks"* → `comment`,
bait `widget_instance`. Four controls where salience and target agree.

| arm | bait cases (n=16) | control (n=4) | all 20 |
|---|---|---|---|
| J — fat, bare-noun enum | 16/16 **100%** [81-100] | 4/4 100% [51-100] | 20/20 **100%** [84-100] |
| K — fat, verb-carrying enum | 16/16 **100%** [81-100] | 4/4 100% [51-100] | 20/20 **100%** [84-100] |
| L — 8 cards | 16/16 **100%** [81-100] | 4/4 100% [51-100] | 20/20 **100%** [84-100] |

**Zero traps sprung, in any shape. Not one wrong resource across 60 destructive decisions.** McNemar
J vs L: `L-only=0, J-only=0, p=1.0000` at every scope.

**Disclosed, and load-bearing: I authored these 20 queries with the 8 resources in front of me,
choosing them to be confusable.** That breaks blindness — in the only direction that cannot flatter
anything. An adversarial set can lower a measured accuracy, never raise it, so this is a **lower bound
on accuracy**, which is the bound a destructive operation actually needs. The honest limit on the
other side is that my traps may simply not be good enough; a stronger adversary might find real
confusions, and the arms answer all 20 in one batch with the full resource list visible, which is
easier than an agentic turn.

**So the answer to the peer's question is: yes, this eval can separate harmless from destructive wrong
fills, and the destructive rate is the same in every shape and indistinguishable from zero — ≤16%
(Wilson, n=20, 0 errors) and identical across fat-noun, fat-verb and cards.** The stakes asymmetry is
real as a premise and does **not** convert into a measurable error-rate difference between the
designs.

**What that means for the recommendation, stated plainly:** the peer's case for cards on a destructive
family should rest on **confirmation-flow and human visibility** — making resource selection explicit
*before* a confirmation gate, so a reviewer of the catalog and a human at the dialog both see which
resource is in play — and **not** on a predicted destructive-error rate, because there isn't a
measurable one. That is still a good argument; it is just an argument about what humans see, not about
what the model gets right. I would not weaken their recommendation on this evidence, but I would
change the reason attached to it, because a reason that does not survive measurement will be
challenged later by exactly the kind of re-measurement that produced this report.

There is also a counter-consideration on the top-1 result worth putting on the record, offered as an
inference and not a measurement: for a **destructive** family, the fat entry's low top-1
("always present, rarely first" — 13% top-1, 100% top-5) means an agent that grabs the first matching
result grabs *something other than a delete*. On a destructive verb that is the safe direction to
fail. The top-1 advantage cards hold is unambiguously good for a read family and is at least arguable
for a delete family.

## 4. Restricted vs whole-set — confirmed separate throughout

Every table in this report is labelled with its own denominator and never blends the two: `n=34`
in-scope and `n=96` out-of-scope for `content_read`; `n=8` and `n=122` for `content_delete`; `n=20` for
the adversarial set. The one whole-set table (`n=130`) is a composite of "fully correct per case" and
is labelled as such. Retrieval figures quoted from prior reports (D1-strict 85% top-10, C2 97%) are
quoted with "on the affected cases" attached. No figure here is a blend.

## 5. What this addendum changed

- **Added** `development/evals/tool-search-argument-fill-adversarial.ts` and arms J/K/L, plus the
  independent re-derivation of the peer's top-1 comparison. No production file touched; root
  `npx tsc -p tsconfig.json --noEmit` clean.
- **Corrects nothing in §§0-9 above.** §7's stated weakness — that the in-scope ceiling came from
  well-separated queries and might not survive genuinely ambiguous ones — is now tested for the delete
  family and survives. It remains untested for the read family's 29 resources.
