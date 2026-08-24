# ROUND 2 — Tovu Extension Surface Debate

You answered the round-1 packet. This is the rebuttal round. Read this whole file before answering.

Peers are anonymized as **Peer A / B / C / D** to keep you arguing with the position rather than
the reputation. One of them is you — you will recognize your own. Do not try to identify the
others.

---

## PART 1 — Corrections to the round-1 packet

The round-1 packet contained four material errors. The primary assembled it by reading
surrounding code and inferring, rather than opening the governing documents. **All four have been
verified against source since.** Some of them undercut arguments you made in round 1. Reassess
honestly.

### Correction 1 — `site-glue` is NOT wired. The "3 wired, 3 placeholders" table was wrong.

Round 1 said three site-glue call sites were wired. Verified 2026-08-20:

- `src/features/site-glue/` contains exactly four things: `attachment-points/`, `capability-gate.ts`,
  `manifest.ts`, `ports.ts`. **There is no loader.**
- `GlueHostPort` has **zero non-test implementations** — every reference in `src/` is a type import
  or the interface declaration itself.
- **Zero production callers** of the three attachment points from anywhere outside `site-glue/`.

So site-glue is an interface plus three adapters with nothing driving them. The adapters are real
and tested; the system does not run. Correct framing: **three implementation candidates, not a
live extension system.**

(Credit: one round-1 peer caught this independently. It is now confirmed.)

### Correction 2 — `ADR-057-site-glue-tier.md` exists and argues AGAINST merging.

Round 1 never mentioned it. `ADS-memory/reports/architecture/ADR-057-site-glue-tier.md`, line 52,
verbatim:

> ADR-024's ladder answers one question: how much of the machine does this code get, and who
> vouches for it being here at all... Site Glue's code is never distributed (REQ-18 is explicit:
> **no marketplace, ever**), so on that axis it has exactly one, permanently fixed answer:
> **Tier-3 execution semantics, forever local, forever excluded from ADR-024 §2's
> marketplace-eligibility question.** It is not a new rung on that ladder — the ladder doesn't need
> editing, because Site Glue only ever occupies the leaf ADR-024 already carved out for
> local/first-party code, and simply never leaves it.

Its argument: what varies for glue is a *second, orthogonal axis* — authorship/reviewability
(`staged → approved-active → quarantined/disabled`), because "Site Glue's code has no publisher —
an agent wrote it, in place, for one site."

**Status, line 3, verbatim:** `Status: **DRAFT — not accepted.** Written for owner review; not
self-approved. Do not add to ADR-INDEX.md until a human accepts it.`

So it is reasoned prior work, not a ratified decision. Treat it as a strong argument to answer,
not as settled law.

### Correction 3 — the `render.contribute` seam is already scoped in code.

Round 1 presented `render.contribute` as unbuilt with no existing shape. But
`src/widgets/registry.ts:11` says, verbatim:

> core-owned code in v1, ADR-024 Tier-2/3-gated for any future plugin-contributed dynamic type

`WidgetTypeRegistration` is JSON-serializable data (schema, capability, `placementContexts`, cost
`clamps`, a `resolverId` string). `src/widgets/resolvers/index.ts` defines `CORE_RESOLVERS` — "the
ONE place a `resolverId` string resolves against real, executable code... never used as a dynamic
import path, `eval`-style reference, or arbitrary function lookup anywhere else."

An extension seam for plugin-contributed render types is therefore already designed and partially
built. Any answer proposing a brand-new mechanism must say why this one is insufficient.

### Correction 4 — cron/jobs is NOT greenfield.

Round 1 listed scheduled jobs as having "no vocabulary at all." In fact
`src/server/__specs__/80-platform/tenancy-and-jobs.spec.md` already specifies job initiation
(scheduled, webhook-triggered, event-triggered, manual), a canonical `JobTrackingResponse
{ jobId }` envelope, job state, retries, and dead-letter visibility. Its **Non-goals (current)**
section lists exactly two items: "Final scheduler implementation" and "Final no-code flow builder."

A working scheduled feature already ships: newsletter campaign scheduling
(`src/server/routes/admin/newsletter/schedule-campaign.ts`, `draft → scheduled` with `scheduledAt`).

This does not reopen the sequencing answer (all four peers deferred cron, and the owner agrees) —
but design proposals should target the existing envelope, not invent one.

---

## PART 2 — Owner decisions since round 1 (binding, not debatable)

1. **A2UI / gen-ui is NOT a requirement.** It is a nice-to-have. Nothing in the extension
   architecture may be tied to it or depend on it. Any answer whose admin-UI story requires A2UI
   is invalid — re-answer without it.
2. **Web components are parked, leaning no.** The owner is still evaluating iframes and wants to
   revisit. Do not build an argument that depends on web components being available. If your
   position needs them, say so explicitly and flag it as conditional.
3. **MVP reality check:** the owner's near-term goal is publishing websites, not shipping a
   plugin marketplace. Sequencing answers should reflect that this is architecture-for-later.
   Do not propose anything that must ship before basic publishing works.

---

## PART 3 — Settled. Do NOT re-argue these.

All four peers converged in round 1. These are closed:

- **Machine-readable contract (Q-D):** generate it from the live closed constants in code, expose
  through `tovu introspect`. Do not hand-write docs. (Unanimous.)
- **Lifecycle (Q-G):** consent screen for Tier-3, real cryptographic signing (replacing today's
  string comparison), never delete plugin data on uninstall, permanently tombstone the plugin id.
  Install/update/uninstall routes must land **before** any marketplace opens. (Unanimous.)
- **Sequencing (Q-E):** `admin.nav` + i18n first (Tier-1, pure data, cheapest). Defer cron,
  automation/flow steps, dashboard panels, collection layouts. (Unanimous.)
- **Admin UI isolation (Q-F):** Tier-1 declarative; executable plugin UI goes in an iframe, not a
  React error boundary — a boundary catches a render throw but not an infinite loop, a memory
  leak, or a React version mismatch. (Unanimous, and the owner accepts it.)

---

## PART 4 — The three live disagreements

### D1 — Merge or separate?

- **Peers A, B, C: merge.** The separation is historical, not principled — both systems validate
  manifests, build capability gates, attach to the same content hook machinery, and both need
  activation, quarantine, introspection, and lifecycle. One position offered five orthogonal axes
  instead of one join: *distribution* (built-in / marketplace / upload / local-agent), *authorship*
  (publisher / operator / agent), *tier* (how code runs), *extension kind* (where it attaches),
  *granted capabilities* (what the handler may do) — with distribution and authorship recorded by
  the installer, never claimable by a manifest about itself.
- **Peer D: separate.** Grounded in ADR-057 (Correction 2): glue can never be distributed, so it
  never varies on the tier axis — tier therefore cannot be the join. Adds a mechanical argument:
  `site-glue/manifest.ts:44-48` and `capability-gate.ts` deliberately re-declare the three shared
  capability strings as independent literals *specifically to avoid depending on the sibling
  mechanism*, stated in two file headers. And integrity hashing is meaningful against a distributed
  artifact of unknown provenance but a no-op against code shipping in the same deploy as core —
  merging either hashes files against themselves for no benefit, or reintroduces a conditional
  inside one system. Peer D still wants the capability *vocabulary* unified (glue's 8 is already a
  superset of plugin-runtime's 3; duplicating by value is itself a drift risk).

**Answer specifically:** Does ADR-057's "never distributed, therefore fixed on the tier axis"
argument survive Correction 1 — that site-glue has no runtime at all? Is this "two systems on
orthogonal axes" or "one working system plus an unfinished design"? If you argued merge in round 1
without having seen ADR-057, say whether it changes your answer. If you argued separate, say
whether Correction 1 changes yours.

### D2 — What does a front-end contribution return?

Four different round-1 answers:

- **Raw HTML string**, plugin escapes its own output (one peer).
- **JSON component descriptor** resolved through the existing `data-embed-config` scanner.
- **`{componentId, props}`** reusing `WidgetTypeRegistration` + `CORE_RESOLVERS` — Tier-1 may only
  parameterize `componentId`s already in `COMPONENTS`; Tier-2/3 may register new ones via a
  sandboxed resolver.
- **A host-owned `RenderIR` node tree** — `{kind:"element", tag: SafeHtmlTag, attrs, children}` —
  strictly bounded, never an arbitrary string.

Three of four explicitly reject the raw HTML string, citing "genericity belongs in the scanner,
not the renderer" and the four-scanner drift that `core/embeds/marker.ts` just unified away.

**Answer specifically:** raw HTML looks close to dead — if you proposed it, defend it or concede.
Then settle the live question: **how expressive should a contribution be?** Can a plugin describe
an arbitrary element *tree*, or only supply props to components the host already owns? Name the
concrete failure case that decides it — a real plugin that the narrower option cannot express, or
a real security/maintenance cost the richer option imposes. Given Correction 3, also say why the
existing widget seam is or is not sufficient.

### D3 — Closed "kinds" catalog vs. capability strings

- **Closed catalog of extension kinds** (`render.component`, `http.route`, …), Directus-style,
  with capabilities used only for *authority* — not to duplicate what the extension already
  declares.
- **Keep capability strings.** They are already closed TS unions validated against `Set`s at parse
  time, so they already have the enumerability WordPress lacks, with less ceremony. The addition
  required is that every capability string ship a data record (schema + placement + clamps +
  resolver pointer) so nothing is an implicit contract.

**Answer specifically:** these may be less far apart than they look — both end at "closed,
enumerable, schema-backed." Is the difference substantive or vocabulary? If substantive, name what
one expresses that the other cannot. If not, say so and propose the merged form.

---

## PART 5 — How to answer

**Conceding is a valid and valued answer.** If another peer's position is better than yours, say
so plainly and explain what changed your mind. A round-2 answer that simply restates round 1 with
more confidence is a failure. State explicitly, for each of D1/D2/D3, whether you are **holding**,
**conceding**, or **revising**.

Repo access unchanged: read-only, full repo, cbm-mcp available (project `Tovu`), ignore graphify
if it errors. Still do not read
`ADS-memory/reports/architecture/2026-08-20-extension-surface-gap-inventory.md` or the run
directory `ADS-memory/reports/swarm-consensus/runs/2026-08-20-*`.

Output format:

```
## D1 Merge or separate — [HOLDING | CONCEDING | REVISING]
## D2 Contribution return shape — [HOLDING | CONCEDING | REVISING]
## D3 Kinds vs capabilities — [HOLDING | CONCEDING | REVISING]
## What I got wrong in round 1
## The one thing I would still refuse to concede, and why
```

Be shorter than round 1. Argument, not restatement.
