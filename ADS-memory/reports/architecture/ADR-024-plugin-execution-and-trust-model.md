# ADR-024: Plugin Execution & Trust Model — Tiered Capabilities, Marketplace-Gated Isolation, Transport-Agnostic ABI

- Status: ACCEPTED 2026-07-08 (from a 2-round swarm *planning* debate; the ACCEPTED gate — the plugin-catalog demand audit — was delivered and cleared, see Open: Tier-1 covers ~60–73% of real demand vs the ~50% vindication bar)
- Amended: 2026-08-20 (explicit owner decision, recorded during a 2-round multi-model swarm consensus on the Tovu extension surface, `ADS-memory/reports/swarm-consensus/runs/2026-08-20-tovu-extension-surface/SYNTHESIS.md`) — **§2's blanket "Tier-3 is never listable in the public marketplace" rule is reversed: Tier-3 IS now marketplace-listable.** §2's marketplace forcing function is gone; the install-consent screen becomes the primary user protection in its place; two hard dependencies for that protection are currently unmet in this codebase. See Amendment below. Status is unchanged by this amendment — still ACCEPTED, owner sign-off on the amendment itself not yet separately recorded.
- Author: Leon Aburime / Coordinator (Opus 4.8 Primary) with peers Codex `gpt-5.5`, Gemini 3.1 (`agy`), Fable
- Extends: **ADR-020** (generalizes the theme capability tiers to plugins), **ADR-004** (artifact + signed manifest), **ADR-005** (SDK — this ADR **amends its ABI rule**, §3)
- Relates: ADR-003 / ADR-023 (plugin data), ADR-021 (capabilities are a separate axis), ADR-022 (write chokepoint — attribution amendment), ADR-011 (Electron multi-site topology), ADR-019 (theme→plugin dependency plane), SPEC-005 (plugin walking skeleton), TODO §6

## Context

Tovu promises two things that outrank feature breadth: **"install a plugin from anyone"** and
**"an update or plugin must never brick your site."** SPEC-005 (the plugin walking skeleton) is
explicit that neither holds for third-party code today: *capability enforcement is API-surface-
level, not a sandbox — an in-process ESM plugin can still touch `fs`, `process.env`, and the
network.* SPEC-005 accepted this for a first-party/local v1 and never marketed it as sandboxing.

A 2-round adversarial swarm planning debate stress-tested the whole plugin surface and produced a
roadmap (full report: `.local-artifacts/swarm-consensus/runs/20260708T195959Z-plugin-system-roadmap/`).
Its keystone finding: **the plugin execution & trust model is the single upstream decision** —
signing answers *who published this*, never *what the code can do*. This ADR records that keystone.

**The blast-radius fact that shapes the decision.** Under ADR-011 the desktop Electron shell runs
**several sites in one host process**, and each site is a folder on disk. An unsandboxed in-process
plugin installed into Site A can read Site B's `content.db`, exfiltrate every site's secrets, and
delete any site folder. **The blast radius of one plugin is the whole machine, not one site.** For a
non-expert multi-site audience this makes a naïve "trust the publisher" model untenable, and makes
the *access-control* guarantees of dependent decisions (e.g. ADR-023's capability-gated data tables)
advisory fiction until real isolation exists.

## Decision

### 1. A tiered plugin trust model (generalizes ADR-020's theme tiers to plugins)
"Install from anyone" is delivered **by tier**, not as a blanket claim:

- **Tier-1 — Declarative (zero executable code).** A manifest-only plugin: content types & fields,
  taxonomies, expression indexes, settings schemas, declarative admin menu items/forms, declarative
  theme presets, and **core-mediated** webhooks ("on publish, core POSTs to a configured URL").
  **Installable from anyone, today** — there is nothing to isolate. This is the ecosystem's on-ramp.
- **Tier-2 — Sandboxed code.** Executable plugin code running under isolation (see §4). Ships
  **with the marketplace**, not before.
- **Tier-3 — Trusted code.** Today's in-process ESM reality. **Local / first-party / explicitly
  sideloaded only**, and honestly labeled at install: *"this plugin runs with full access to your
  machine and every site on it."* Never the default and never marketed as safe.

`plugin.tier` in the manifest drives onboarding and install consent, exactly as `theme.json.tier`
does (ADR-020).

### 2. The marketplace forcing function (so "tiered" cannot collapse into "trust everyone")
- **"Install from anyone" means Tier-1 now, Tier-2 later, and NEVER Tier-3.**
- **Tier-3 plugins are never listable in the public marketplace.** The catalog physically cannot
  offer executable third-party code until Tier-2 isolation exists — so *shipping the marketplace is
  shipping the sandbox.* This makes the promise honest at every stage and prevents "Tier-2 someday" rot.
- **Installability ≠ enablement.** A plugin may be downloadable, but enabling Tier-2/Tier-3 behavior
  requires capability review + explicit user consent + runtime support. Enable/disable stays a
  SPEC-001 change-set (free rollback).

### 3. Freeze a transport-agnostic SDK ABI NOW (amends ADR-005) — the irreversible move
Even though v1 executes in-process, the SDK hook/callback surface is frozen **as if a process
boundary already existed**:
- **Asynchronous only.** No synchronous hook may block the shared host event loop (all sites share it).
- **Serializable payloads only** (structured-clone-safe). **No live core objects** cross the SDK
  surface; capabilities are passed **by handle, not by reference**.

Rationale: ADR-005's semver compatibility promise makes hook signatures nearly irreversible once
third-party plugins exist. Switching sync→async or live-object→serializable later is an ecosystem-
wide breaking change you cannot retrofit. The DX cost is small and front-loaded; the retrofit cost is
unbounded. This freeze pays off **independent of full sandboxing**: it enables the per-site isolation
rung (§4), makes write-attribution / audit / replay possible (recovery), and keeps the shared event
loop responsive. **SPEC-005's single existing hook (`content.entry.beforeSave`) must be audited
against this rule now, while there are zero third parties to break.**

### 4. Per-site process isolation is the named first Tier-2 rung
Tier-2 is decomposed so it has a dated intermediate deliverable, not an open-ended "sandbox someday":
- **Rung 1 — per-site process isolation:** run each site's plugin host in its own Electron
  `utilityProcess`. This alone drops the blast radius from **machine → single site** without solving
  capability sandboxing, and is a **near-free runtime swap** *because* of the §3 ABI freeze.
- **Rung 2 — capability sandbox:** enforce `fs`/network/`env`/resource limits inside the isolate.
Full capability-grade isolation is designed-for here, built later (see Open).

### 5. Tier-1 is only safe if the declarative surface is provably bounded
Tier-1's safety rests on it being **non-Turing-complete with no side effects**. Therefore:
- ADR-022's expression language (used for expression indexes, validation predicates, and any Tier-1
  computed field) **must be total and bounded-cost** — no side effects, no unbounded evaluation, no
  escape hatches. Otherwise Tier-1 silently becomes a DoS vector or "Tier-3 in disguise." *(Recorded
  as an amendment to ADR-022.)*

### 6. Capability manifest — freeze the namespace shape now, iterate the contents
- The **shape** of capability strings (a namespaced, deny-by-default vocabulary, passed by handle)
  is frozen now so manifests are forward-compatible.
- The **contents** (the exact capability set: DB tables, content mutation, admin UI, client assets,
  network, filesystem, secrets, jobs, AI tools) are designed-now / iterated — they extend, not rewrite.
- Capabilities remain a **separate axis** from human authorization (ADR-021), enforced at the SDK
  boundary. Capability taxonomy v1 must land **before** plugin settings/admin design, or a settings
  UI accidentally becomes an authority surface.

### 7. Hook contract minimum (prevents accidental ecosystem lock-in)
- Hooks declare **explicit priority + declared phase + deterministic order + defined failure
  behavior** (fail-closed as in SPEC-005). **No implicit registration-order semantics.**
- **No cross-plugin dependencies in Phase-0** (a dependency graph is a DAG-resolution problem;
  deferring it avoids scope creep). Reassess with OQ-08.

### 8. Client / admin plugin JS is a separate, decide-now ADR
Plugin-contributed admin/editor/client JS has the **same-origin session-theft** problem ADR-020
identified for theme JS (same-origin code can `fetch()` core admin APIs with the operator's cookie).
The fix (sandboxed iframe + `postMessage`, aligned with the §3 serializable ABI) is captured in
**ADR-025 (plugin client / admin JS isolation)**, which generalizes ADR-020; admin-panel work (OQ-07)
is blocked until it lands.

### 9. Organizing spine for the roadmap
The plugin roadmap is sequenced by **two ladders** (temporal invariant) informed by **control vs
extension planes** (spatial implementation map):
- **Trust ladder:** capability shape → transport-agnostic ABI → per-site isolation → capability
  sandbox → signing/provenance → advisory revocation.
- **Recovery ladder:** change-set gateway → snapshot-before-change → write attribution → safe-mode
  quarantine → core/plugin-update compat doctor → advisory kill-switch.
- **Invariant:** *no feature ships whose failure mode exceeds the current recovery rung, and no
  distribution promise ships beyond the current trust rung.* Recovery rungs are built early (they
  protect even first-party plugins); trust rungs gate distribution claims.

## Consequences

- **Both promises become honest and incremental.** Tier-1 makes "install from anyone" true today for
  declarative plugins; the marketplace gate makes it true for code only once isolation ships; Tier-3
  is labeled, not marketed. No stage overstates safety.
- **The rejected alternatives:** *B (isolation-first)* front-loads the hardest runtime work before a
  catalog or author community exists — mis-sequences cost before learning; the ABI freeze keeps B
  available as a later runtime swap. *C (Obsidian / trusted-publisher as the headline)* is subsumed
  into Tier-3, not adopted — the multi-site blast radius makes "trust the publisher" mean "trust their
  compromised updates with every site on the machine," untenable for non-experts.
- **The ABI freeze imposes a real, front-loaded DX cost** on plugin authors (no live objects, no
  shared transaction context, chatty async hooks over SQLite's sync-native bindings). This is accepted
  as the price of a retrofit-free path to isolation.
- **Dependent decisions unblocked:** ADR-023 (plugin data) can now finalize **split** — its
  recoverability guarantees stand unconditionally; its access-control guarantees carry an explicit
  *"advisory until Tier-2 isolation ships"* clause. ADR-022 gains the attribution + expression-language
  bounds amendment. ADR-025 (plugin client/admin JS isolation) is unblocked (§8).
- **Safe-mode / recovery is foundational, not a feature** — it is the recovery ladder, built early.

## Open — deferred (designed-for, not built now)

- **Tier-2 capability-sandbox mechanics** (rung 2): the concrete isolate/worker model, the fs/network/
  secrets enforcement, resource limits & circuit breakers.
- **Plugin secrets storage** — invariant frozen now (**never plaintext in the site folder**, since
  folders travel with copies/backups/exports); mechanism designed later.
- **Settings storage + migration, uninstall/data-lifecycle** (retain-by-default; disable is never
  destructive), **background jobs** (Electron sleep/catch-up semantics), **compat doctor/preflight**,
  **plugin-update channel** (staged rollout, version pin, per-plugin rollback), **conformance/DX kit**,
  **signing/provenance + advisory revocation** (never remote auto-disable — that is itself a brick vector).
- **✅ Gate to ACCEPTED — the owed evidence, now DELIVERED.** A **plugin-catalog demand audit**:
  enumerate the first ~10–15 real target plugins and classify Tier-1-declarative vs needs-code. If
  Tier-1 covers <~20% of demand, the on-ramp claim collapses and *B (isolation-first)* regains
  urgency; if it covers ~half (as the WordPress content-pack category suggests), this ADR is strongly
  vindicated. **Result (2026-07-08, `reports/audits/20260708-plugin-catalog-demand-audit.md`):
  Tier-1 covers ~60–73% of real WordPress-proxy demand (~27–40% needs code) — well above the ~50%
  vindication line, nowhere near the <20% collapse line. VINDICATED → recommend flip to ACCEPTED,
  pending owner sign-off.** Two conditions from the audit: (1) the T1 share depends on core shipping a
  small set of **core-mediated primitives** (webhook dispatch, snippet/asset injection, mail adapter,
  redirect executor, form-submission sink) — these belong on the near-term core roadmap; (2) the
  highest-value single plugin (WooCommerce) is squarely Tier-2 + ADR-023 `dataModule`, so this
  vindicates the *sequencing* (Tier-1 on-ramp, marketplace = Tier-2), not "Tier-1 is enough." This
  was the planning analog of ADR-022/023's owed 100k-entry / 50k-product benchmarks (both still open).

## Debate record

2-round swarm planning debate, unanimous on the tiered model (A). Keystone (execution/trust model)
and the transport-agnostic ABI freeze were reached 4/4; agy and Codex independently re-derived the
ABI-freeze as the irreversible edge, and both moved from "isolation is the keystone" to "tiered is the
only honest near-term path," each independently adding the marketplace-gate forcing function. Fable
surfaced the blast-radius fact, the two-ladder spine, and the per-site-isolation rung, and corrected
"pause ADR-023" → "split-finalize it." R2 confidences: agy 0.90, Codex 0.82, Fable 0.85, Primary ~0.85.
Full trace + all peer positions: `.local-artifacts/swarm-consensus/runs/20260708T195959Z-plugin-system-roadmap/consensus-report.md`.

---

## Amendment — 2026-08-20 (owner decision: §2's Tier-3 marketplace prohibition reversed)

Recorded during a 2-round multi-model swarm consensus on the Tovu extension surface (Primary Claude
Opus 5; peers `gpt-5.6-sol` @ xhigh, Gemini 3.1 Pro and Gemini 3.7 Flash, both owner-downweighted;
non-voting adversarial review by Claude Sonnet 5). Full record:
`ADS-memory/reports/swarm-consensus/runs/2026-08-20-tovu-extension-surface/SYNTHESIS.md`, "Owner
decisions recorded during the debate": *"Tier-3 is marketplace-listable (reverses ADR-024 §2).
Install-consent becomes the primary user protection."* Stated directly by the owner and reaffirmed —
recorded here as a decision, not re-litigated. This amendment does not change this ADR's Status
(remains ACCEPTED) and does not touch `ADR-INDEX.md`.

### 1. REVERSED — §2's blanket Tier-3 marketplace prohibition

§2 currently reads (verbatim, unedited above): *"'Install from anyone' means Tier-1 now, Tier-2
later, and NEVER Tier-3"* and *"Tier-3 plugins are never listable in the public marketplace. The
catalog physically cannot offer executable third-party code until Tier-2 isolation exists — so
shipping the marketplace is shipping the sandbox."*

**Both clauses are reversed.** Tier-3 (today's in-process ESM reality — full access to the machine
and every site on it) may now be listed in the public marketplace. The original §2 text above is left
unedited so the reasoning that produced it stays legible; this amendment is the record of what
changed and why the change is safe to make (or isn't yet — see §3/§4 below).

### 2. What §2 loses: the marketplace forcing function, and what replaces it

§2's actual load-bearing idea was never "Tier-3 is bad" — it was a **mechanical coupling**: because
the catalog *could not* offer executable third-party code without Tier-2 isolation, shipping the
marketplace was *definitionally* shipping the sandbox. This was not a policy the team had to keep
choosing to honor; it was a structural impossibility that did the enforcing for free. That is what
made "install from anyone" honest at every stage (Consequences section above: *"the marketplace gate
makes it true for code only once isolation ships"*) without anyone having to police it.

**That mechanism is gone, and nothing mechanically replaces it.** With Tier-3 listable, a marketplace
can ship today, listing full-machine-access plugins, with zero Tier-2 work done. There is no longer
any structural fact that forces isolation to exist before or alongside distribution.

**What replaces it is the install-consent screen — a categorically weaker kind of protection.** The
old mechanism was a physical impossibility; the new one is a procedural, human-judgment gate: an
operator reads a disclosure and clicks "install." This is not a like-for-like substitute — it trades
an enforcement mechanism that cannot be skipped for one that depends on the disclosure being honest,
legible, and actually read. Per Decision 1's own existing discipline (*"honestly labeled at install
... never marketed as safe"*), the consent screen was always part of the design; what changed is that
it now carries the **entire** weight §2's structural gate used to share with it. It has to be treated
as a primary safety control from this point forward, not a courtesy disclosure — and a primary safety
control has to rest on the two things below actually being true, which today they are not.

### 3. Blocking precondition A — signing is a string comparison, not cryptography

`src/features/plugins/plugin-identity.ts:17-21` states this in its own header, about itself:
*"Signature verification here is a same-string comparison, not real cryptographic verification —
ADR-004 leaves `signature` optional and no signing/verification infrastructure exists anywhere in
this codebase yet ... this is the intended, honest degraded behavior, not an unfinished shortcut."*
Concretely: any manifest can declare `publisher: "Microsoft"` and nothing in this codebase checks
whether the string is true.

This was survivable while §2 forbade Tier-3 marketplace listing, because the only way to run
unsandboxed third-party code was a deliberate local sideload — a user who typed a filesystem path,
not a user who clicked "Install" on a catalog card next to a trusted-looking publisher name. The
reversal puts the identity claim on the critical path: the install-consent screen (§2 above) is only
as honest as the publisher string it displays, and that string is currently unverified. **This is a
hard, currently-unmet dependency for Tier-3 marketplace listing being safe to ship**, not a
nice-to-have — it is the exact gap ADR-024's own Open section already named (*"signing/provenance +
advisory revocation"*) and deferred, written when deferring it was safe because §2 made it moot for
distributed code. It is no longer moot.

### 4. Blocking precondition B — no install, update, or uninstall route exists

`src/server/routes/admin/plugins/` contains exactly two route handlers: `list.ts` (`GET
.../plugins`, a read) and `set-enabled.ts` (`PATCH .../plugins/:pluginId`, toggles an already-present
plugin's activation on/off). Verified directly, not inferred: the third file in that directory,
`deps.ts`, is type-only wiring with no runtime route body — its own header says so explicitly,
`deps.ts:19-21`: *"Not itself a throwing stub (a type-only file has no runtime body to stub) —
`list.ts`/`set-enabled.ts`'s handler bodies are what carry the 'not implemented' stub behavior."*
There is no route that installs a new plugin, updates one, or removes one.

**There is currently no way to revoke a bad install.** `set-enabled.ts` can disable a plugin that is
already on disk, but nothing in this codebase can remove a plugin's code once it has landed. A
marketplace that can install Tier-3 code — full access to the machine and every site on it — but
cannot uninstall it is not a deployable configuration: an operator who approves a malicious or
compromised Tier-3 install via the consent screen (§2) has no recovery path in this codebase today
short of manual filesystem intervention outside the product. This is a second hard, currently-unmet
precondition, independent of §3.

**Both preconditions are blocking on the same claim**: that the install-consent screen is a real
safety control. A consent screen that (a) may display an unverifiable publisher claim and (b) cannot
be acted on later if the claim was false is not the protection §2's reversal now depends on it being.

### 5. Knock-on to ADR-057 — the exclusion for Site Glue no longer rests on §2

ADR-057 Decision 1 states Site Glue is *"forever excluded from ADR-024 §2's marketplace-eligibility
question"* — written when that exclusion was a special case of §2's categorical ban on all Tier-3
code. ADR-057's own 2026-08-20 amendment (§5, *"Flagged, not resolved here"*) already caught this and
recommended exactly this document: *"this reversal wants its own ADR-024 amendment, not a paragraph
here ... a future reader auditing ADR-024's marketplace-gating logic would not find it here."*

With §2's categorical ban reversed (§1 above), Site Glue's exclusion from the marketplace no longer
has a tier-based mechanism to lean on. It now rests entirely on ADR-057 Amendment §3's **`origin`
un-promotability invariant**: an `origin: "local-agent"` extension record can never be promoted to
`origin: "marketplace"` by migration or admin action, mechanically backed by
`plugin-identity.ts`'s first-write-wins minting (`mintPluginIdentity()`, `checkNamespaceAdoption()` —
cited in full in ADR-057's amendment §3, not re-quoted here). That invariant is identity-based, not
tier-based: it is what still keeps Site-Glue-authored code out of the marketplace, and it would keep
doing so even if every tier were listable. Cross-reference is bidirectional: ADR-057's amendment
already points here; this amendment points back at ADR-057 Amendment §3 as the mechanism that now
carries the exclusion alone.

### 6. Also touched by this reversal, not rewritten here — flagged for owner attention

- **Consequences** (above): *"the marketplace gate makes it true for code only once isolation
  ships"* — this sentence describes the now-reversed coupling as if it still holds. It doesn't;
  §2 above is the record of that.
- **Open** section, WooCommerce/demand-audit paragraph (above): *"this vindicates the sequencing
  (Tier-1 on-ramp, marketplace = Tier-2), not 'Tier-1 is enough'"* — "marketplace = Tier-2" was true
  only under the reversed rule. The demand-audit's Tier-1/Tier-2 split percentages are unaffected
  (they measure declarative-vs-code demand, not marketplace eligibility), but the sequencing claim
  built on top of them is not.
- **Open** section's deferred signing/provenance line is elevated by §3 above from "designed later"
  to "blocking, currently unmet" for any Tier-3 marketplace listing specifically — the item itself
  was already tracked; only its urgency changes.

None of these are edited in place, per the same "leave original reasoning legible" discipline as §1
above; this list exists so a future reader scanning the original text does not mistake a
now-superseded sentence for current fact.
