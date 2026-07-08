# ADR-024: Plugin Execution & Trust Model — Tiered Capabilities, Marketplace-Gated Isolation, Transport-Agnostic ABI

- Status: ACCEPTED 2026-07-08 (from a 2-round swarm *planning* debate; the ACCEPTED gate — the plugin-catalog demand audit — was delivered and cleared, see Open: Tier-1 covers ~60–73% of real demand vs the ~50% vindication bar)
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
