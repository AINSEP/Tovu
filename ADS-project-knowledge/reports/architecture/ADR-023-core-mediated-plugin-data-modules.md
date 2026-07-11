# ADR-023: Core-Mediated Plugin Data Modules — Declared Schema, Core-Executed DDL, Snapshot-Anchored Recovery (Split-Finalized)

- Status: ACCEPTED 2026-07-11 (from a 2-round swarm debate; resolves the ceiling deferred by ADR-003/ADR-022 §Open / TODO §6) → round-1 external audit `TM-adr023-dataModule-001` FAIL (internal verifier 5.0 / Codex 6.5 / agy 6.5; T1-T7 findings, all `agree-defer`) → T1-T7 folded as normative text → round-2 diff-only re-audit FAIL (internal 7.0 / Codex 8.0 / agy 5.0; T1-T4+T6-T7 confirmed genuinely fixed, T5 still-gap + T8 new finding, all `agree-defer`) → T5 (fail-closed two-track rule) + T8 (WAL/SHM restore cleanup) + T3-residual (one-sentence clarification) folded here as normative text → **round-3 diff-only re-audit PASS 2026-07-11 (Codex 9.0 / agy 10.0; 0 blockers, 0 findings from either; T5/T8/T3-residual all reverified resolved; T2-residual remains deferred/non-blocking advisory)**. **Coordinator judgment call:** no fresh internal-verifier round was run for round-3 — round-2's internal pass (7.0) already drove the T5/T8 fixes, and two independent externals then re-verified them at 9.0/10.0 with zero findings; a third internal pass over an already-resolved, twice-externally-confirmed surface was judged process overhead, not risk reduction. Round-3 report: `.local-artifacts/external-audit/runs/20260711T054512Z-external-audit-report.md`
- Author: Leon Aburime / Coordinator (Opus 4.8 Primary) with peers Codex `gpt-5.5`, Gemini 3.1 (`agy`), Fable
- Extends: **ADR-003** (lifts its "plugins never get DDL" ceiling, without handing plugins a DB handle) and **ADR-022** (its `entries`/ext-bag stays the default plugin data surface; this adds an opt-in tier above it)
- Relates: **ADR-024** (its §4 Rung 2 capability sandbox is the hinge of this ADR's split — see Decision §0), ADR-015 (Drizzle behind ports; core owns migrations), ADR-021 (`dataModule` is a capability, a separate axis from human authz), ADR-008 (change-sets / reversibility), ADR-011 (end-user SQLite on a non-expert's machine), ADR-004 (plugin-artifact-manifest signing — publisher/signing identity for §5/§6's namespace-reuse guard), TODO §6
- Sources: debate `.local-artifacts/swarm-consensus/runs/20260708T162852Z-plugin-extensibility-ceiling/consensus-report.md`; round-1 audit report `ADS-project-knowledge/.local-artifacts/external-audit/runs/20260711T045742Z-external-audit-report.md` (`TM-adr023-dataModule-001`); round-1 proposed fixes `ADS-project-knowledge/.local-artifacts/external-audit/proposed-fixes/20260711T045742Z/proposed-fixes.md`; round-2 audit report `ADS-project-knowledge/.local-artifacts/external-audit/runs/20260711T052258Z-external-audit-report.md`; round-2 proposed fixes `ADS-project-knowledge/.local-artifacts/external-audit/proposed-fixes/20260711T052258Z/proposed-fixes.md`

## Context

ADR-003 forbade plugin DDL and ADR-022 kept that ceiling: plugin data lives in the
validated, expression-indexed `fields.ext.{owner}.*` bag. That bag carries most
extension needs, but it caps **relational-heavy / commerce-scale** plugins —
WooCommerce-style faceted catalogs, directories, booking systems — which want real
tables with joins, foreign keys, and compound indexes. ADR-022 recorded this as an
explicit unresolved Open ("the owner wants a compromise") and pointed at the
core-mediated **tier-promotion** path ADR-003 had already seeded. This ADR is that
compromise.

The governing constraint is unchanged from ADR-022 §4: the site is a **live end-user
SQLite file on a non-expert's machine** (ADR-011). No plugin action may require a risky
migration or leave the site unable to reach a working state. The question this ADR
answers is therefore *not* "can plugins have tables" but "**can plugins have tables
without giving up never-brick or the ADR-022 write chokepoint**."

A 2-round adversarial swarm debate stress-tested the design and converged tightly
(combined ~0.88; Q1 effectively unanimous). Full trace + decision ledger:
`.local-artifacts/swarm-consensus/runs/20260708T162852Z-plugin-extensibility-ceiling/consensus-report.md`.

## Decision

### 0. This decision is SPLIT along the isolation line (read first)

Because a Tier-3 in-process plugin can today touch `fs`/`env`/network directly
(ADR-024 §Context — the multi-site blast-radius fact) **and, specifically, can open its
own direct SQL connection to the site's `content.db`** (the same "full machine access"
fact extended to its logical SQL conclusion), the guarantees below fall into two classes
with **different force**. **Round-1 audit note (`TM-adr023-dataModule-001`):** an earlier
draft of this section claimed the recoverability half "holds unconditionally, now …
regardless of plugin trust tier" without disclosing the gap below; that claim is narrowed
here (T1) to what the mechanism actually delivers. See "Debate + Audit record" at the end
of this ADR for the full finding set.

- **Recoverability half — holds unconditionally for every operation that enters core's
  migration path (§2, §4, §5, §6, §9), regardless of plugin trust tier.** Who executes
  and who reverses schema change *through that path* is a property of *core*, not of the
  plugin's trust level. A plugin that goes around core with raw `fs` writes still cannot
  defeat snapshot-before-DDL for that path, because the snapshot is taken and the DDL is
  run *by core*, under an exclusive cross-process lock that quiesces other writers across
  snapshot and restore (§4) and a durable crash-recovery journal that survives a process
  death mid-DDL (§2).

  **Excluded from "unconditional" — advisory only, until ADR-024 §4 Rung 2 (capability
  sandbox) ships (T1 fix, folds round-1 audit finding):** a Tier-3 plugin can open its
  *own* direct SQL connection to `content.db`, outside core's repository, and run its own
  DDL (`ALTER`/`CREATE`/`DROP`) against that connection without ever entering core's
  migration journal. Core's snapshot/restore/journal machinery has no visibility into a
  connection it did not open and cannot detect or recover from corruption or schema drift
  that connection causes. Rung 1 (per-site process isolation) alone does not close this —
  ADR-024 §4 is explicit that Rung 1 "drops the blast radius from machine → single site,
  **without solving capability sandboxing**"; a Tier-3 process still has ordinary
  filesystem access to its own site's DB file post-Rung-1. Only Rung 2's `fs` restriction
  makes a second raw connection to `content.db` structurally unavailable to plugin code.
  This is not a new hole this ADR introduces — it is the same Tier-3 "full machine
  access" reality ADR-024 already names — but this ADR's earlier text overclaimed past
  that boundary. **Today, for Tier-3, recoverability against self-inflicted out-of-band
  DDL is advisory, not guaranteed** — identical in force to the access-control half
  below — until Rung 2 ships. Recoverability against *core-mediated* DDL (the only path a
  Tier-1/Tier-2 plugin can use at all, and the path an honest Tier-3 plugin uses absent a
  deliberate bypass) remains unconditional today, with no change to that guarantee's
  force.
- **Access-control half — ADVISORY until Rung 2 (capability sandbox) ships (ADR-024
  §4) (T7 fix — citation corrected from "Tier-2 isolation" to the specific rung; folds
  round-1 audit finding).** The capability gate (§3), typed-only writes (§7), and
  authorizer-sandboxed reads (§8) are **real containment for Tier-1/Tier-2 plugins and
  real intent for Tier-3**, but a Tier-3 in-process plugin can **bypass them** (open the
  DB file directly, ignore the repository, escape the authorizer) until real isolation
  exists. Until then these clauses are enforced-by-convention-and-API for trusted code,
  enforced-by-runtime only once ADR-024's per-site `utilityProcess` (Rung 1) **and**
  capability sandbox (Rung 2) land — Rung 1 alone is not sufficient, since it does not
  restrict `fs`/network/`env` access (see the T1 carve-out above for why this distinction
  matters). **They must not be marketed as enforced security boundaries for third-party
  code before that.**

Everything below is written to that split.

### 1. Lift the ceiling — eventually, not in v1 (the mechanism, not the engine)

Plugins **may** own real relational tables, but **only** by **declaring the desired
schema as data** that **core alone executes**. A plugin never authors a migration and
never holds a raw DB handle. v1 ships the **seams**, not the engine (§12).

### 2. Mechanism = core-mediated declarative tables (state-based reconciliation)

A plugin declares its desired schema (tables, columns, indexes, declared FKs) as a
**manifest data structure**. Core diffs declared-state against live-state and executes
the DDL itself via a **core-owned migration journal + lock** — the same path core uses
for its own schema (ADR-015). Plugins never emit `ALTER`/`CREATE`; they emit a
description core is free to satisfy, refuse, or defer. *(Access-control caveat per §0
applies to "never emit" for Tier-3.)*

**Crash-recovery state machine (T3 fix, folds round-1 audit finding — internal + Codex +
agy, 3-way convergence):** every DDL attempt writes durable, fsynced phase markers to the
migration journal, in strict sequence: `PREPARED_SNAPSHOT → DDL_IN_PROGRESS → VERIFYING →
COMMITTED` (success) or `→ ROLLED_BACK` (failure, after a completed restore per §4). Each
phase transition is fsynced to the journal **before** the corresponding DB operation is
attempted, so a crash or power loss can always be placed at a known, durable phase on the
next boot. On boot, core inspects the journal **before** the site is opened to end users:
- journal shows `COMMITTED`, `ROLLED_BACK`, or no in-flight entry → boot normally.
- journal shows any other phase (`PREPARED_SNAPSHOT`, `DDL_IN_PROGRESS`, `VERIFYING`) →
  core treats this as a **stale lock / incomplete journal entry** and automatically
  **completes the restore** from that entry's associated pre-DDL snapshot (§4) before the
  site is allowed to open.

This restore-or-complete step is **mandatory and blocking**: the site must never boot
into a half-migrated schema, and a non-expert operator must never be asked to manually
edit a SQLite file to recover from an ordinary crash mid-DDL — crash-mid-DDL is a normal
operating condition on end-user hardware (ADR-011), not an exotic failure this ADR is
allowed to leave unhandled.

### 3. Table ownership is capability-gated (default-deny) — *advisory until isolation*

The ext-bag (ADR-022) is free to every plugin. **Owning tables** requires the plugin's
manifest to request a **`dataModule` capability**, which is **default-deny** and
**user-consented** at install. The gate is load-bearing not for *corruption* (§2 handles
that by construction) but for **operational blast radius** — a multi-hour rebuild, disk
exhaustion, or a lock storm on a non-expert's machine is a "brick" even when the file
stays valid. The capability **record** (not the consent dialog) is the mechanical anchor
to which core attaches the mandatory pre-DDL snapshot, disk preflight, maintenance-window
scheduling, and journal entry. *(Per §0, this gate is advisory for Tier-3.)*

**Disk-headroom preflight (T4 fix, folds round-1 audit finding — internal + Codex + agy,
3-way convergence):** before any snapshot (§4) is taken, core computes
`required_headroom = 1.5 × (current DB file size + WAL file size)`. If free disk space on
the volume holding the site's `content.db` is below `required_headroom`, the DDL attempt
**fails closed**: no snapshot is taken, no DDL runs, the `dataModule` operation is refused
with a clear insufficient-disk-space error, and the site is left untouched. The **1.5x**
multiplier covers the whole-file snapshot copy itself plus WAL/checkpoint growth and
restore-path headroom; it is a starting default, open to revision once the CoW
optimization (§11) ships and changes the cost model. This headroom requirement — and the
fact that a `dataModule`-capable plugin can transiently require **up to ~2.5x its own
table footprint in free disk** during a schema change — is **disclosed at the capability-
consent step**, not left as a silent surprise to the site operator.

**Tier matrix for `dataModule` (T6 fix, folds round-1 audit finding — internal + Codex,
2-way convergence, correctly non-blocking):** `dataModule` is scoped to **Tier-2 and
Tier-3 plugins only** (ADR-024). A Tier-1 (zero-code, declarative-only) plugin cannot
request `dataModule` — a manifest declaring it is rejected at validation time with a
clear "requires executable code" error, the same shape as v1's overall `dataModule` gate
rejecting with "data-tier coming later" (§12). This is a scoping choice, not a temporary
gap: Tier-1's whole safety case (ADR-024 §5) rests on its declarative surface being
**non-Turing-complete with no side effects**, and the manifest-load / diff / reconcile /
backfill machinery this ADR describes is not that — §7's typed repository and §8's
named/raw reads are APIs a plugin's **code** calls, which a true zero-code Tier-1 plugin
has no way to invoke. If a future need for Tier-1 structured data emerges, it is scoped
to the existing ext-bag (ADR-022), not `dataModule` — the ext-bag is already
declarative-safe by construction.

### 4. Snapshot-before-any-DDL is the reversibility anchor — *holds unconditionally for core-mediated DDL (see §0's Tier-3 direct-connection carve-out)*

Core takes a **whole-file snapshot** (SQLite online backup API) **before every schema
change that enters core's migration path**. If the change fails, core **restores** and
leaves the plugin **uninstalled**. This is the never-brick primitive for that path and
does not depend on the plugin's trust tier for DDL core itself executes. Copy-on-write
shadow-tables are a **later >~1GB optimization**, not v1 (CoW WAL manipulation is
riskier to build than a file copy).

**Concurrency-quiescing lock (T2 fix, folds round-1 audit finding — agy-only, Coordinator-
endorsed after checking the reasoning against the internal verifier's initial dismissal):**
the SQLite online backup API is safe under concurrent writers **during snapshot
creation** — that step needs no change here. **Restore is a different, less-safe
operation:** it is a plain file copy of the snapshot back over the live `content.db`, and
performing that copy while another connection holds an open WAL against the file being
overwritten can desync the WAL/SHM sidecar files from the main DB file and corrupt it.
Core closes this by acquiring an **exclusive cross-process lock** — `PRAGMA
locking_mode=EXCLUSIVE` against the site's own connection pool, or an equivalent
host-level IPC lock reaching any other process with a handle to the file — **before**
taking the snapshot, holding it through the DDL attempt, and releasing it only **after** a
successful commit (§2's `COMMITTED` phase) **or** a complete restore (§2's `ROLLED_BACK`
phase). No other connection, including a core-issued read connection, may hold the DB
file open across a restore while this lock is held. This lock is also what makes the §2
phase-marker journal trustworthy: a phase transition is only meaningful as "durable and
race-free" because the lock guarantees no concurrent writer could have interleaved with
it.

**Sidecar cleanup on restore (T8 fix, folds round-2 audit finding — agy, Coordinator-
endorsed after independent re-verification against §2/§4's current text):** the exclusive
lock above closes the *concurrent-connection* WAL/SHM desync vector, but not a distinct
*sequential* one — a DDL attempt that crashes or fails leaves its **own**
`content.db-wal`/`content.db-shm` sidecar files on disk, written against the pre-restore
(now-discarded) main DB file. If those sidecars are left in place, a subsequent SQLite
open could replay stale WAL frames from the discarded attempt onto the restored (older)
snapshot and corrupt it — a direct never-brick violation this ADR exists to prevent. Core
therefore treats sidecar cleanup as part of the restore step itself, not a follow-up: after
the plain file copy restores `content.db` and **before** releasing the exclusive lock
above, core **deletes** (or truncates to empty) `content.db-wal` and `content.db-shm` if
either is present. Only once the file copy and the sidecar cleanup have both completed does
core release the lock and transition the journal to `ROLLED_BACK` (§2) — the still-held
exclusive lock guarantees no connection can reopen the database between the restore and the
sidecar cleanup, so no stale WAL frames can ever be replayed against the restored snapshot.

**Headroom is a precondition, not an afterthought (T4, specified in §3):** the snapshot
step above only proceeds after the §3 disk-headroom preflight passes; insufficient
headroom fails closed before the lock is acquired or any file is touched.

### 5. Namespaced tables — collisions structurally impossible

All plugin tables live under a reserved namespace **`p_{pluginId}__*`** keyed on a
**stable, globally-unique plugin ID**. Two plugins cannot collide; core tables are never
shadowed. The namespace is a frozen v1 seam even before the engine exists.

**Plugin IDs are minted once and never reused (T5 fix, folds round-1 audit finding —
internal + Codex + agy, 3-way convergence; both external auditors independently proposed
near-identical publisher/signing-based mechanisms):** a `pluginId` is permanently retired
the moment it is minted and is **never freed for reuse**, including after uninstall *and*
purge (§6). Core maintains a persistent plugin-identity record keyed by the immutable
`pluginId`, carrying whatever **publisher/signing identity** (ADR-004's `provenance`
fields — `sourceUrl`, `publisher`, and, when present, the optional `signature`) the ID was
first bound to. Without permanent retirement, a purged `pluginId` could be re-minted for
an unrelated — possibly malicious — plugin, which would then silently inherit the
original plugin's `p_{pluginId}__*` namespace and any retained-but-not-yet-purged data.
**Permanent retirement by itself does not close that path (T5 round-2 correction, folds
round-2 audit finding — internal + Codex + agy, 3-way convergence)** — it only guarantees
the identity record exists to check against at reinstall time; §6's two-track fail-closed
adoption guard is what actually decides whether a reinstall may bind automatically or must
fall to explicit operator consent. This record is not itself a cryptographic guarantee:
ADR-004 leaves `signature` optional, so the record may hold nothing stronger than a
self-declared `publisher` string. See §6 for the guard that accounts for this honestly.

### 6. Uninstall retains data (mirrors ADR-003)

Uninstall is **non-destructive**: a plugin's tables and rows are retained. **Purge** is a
separate, explicit user action. Reinstall reconciles against retained data. This mirrors
ADR-022's retain-on-uninstall stance and is part of the recoverability half.

**Install-time namespace-binding guard (T5 fix — round-1; revised T5 — round-2, folds
round-2 audit finding, internal + Codex + agy 3-way convergence):** if a newly-submitted
plugin manifest's `pluginId` matches an **existing** `p_{pluginId}__*` namespace that is
retained-but-unpurged from an earlier uninstall, core **refuses to bind** the new install
to that namespace by default. Binding follows a **two-track, fail-closed rule**:

- **(a) Verified-signature track — automatic rebinding.** Binding proceeds automatically,
  with no operator prompt, **only if both** the newly-submitted artifact **and** the
  original artifact that first minted the namespace (per §5's identity record) carry a
  **valid signature from the same key** (ADR-004's optional `provenance.signature`
  field). A verified same-key signature is the only condition strong enough to stand in
  for "this is genuinely a reinstall of the same plugin" without asking the operator.
- **(b) Consent track — everything else.** If **either** artifact is unsigned, or the two
  artifacts' only point of agreement is the self-declared `publisher` string with no real
  signature on one or both sides, core **MUST** treat this as an identity mismatch and
  fall to the explicit consent step: the site operator is shown a plain-language prompt
  ("this plugin ID has retained data from a previously uninstalled, unrelated-looking
  plugin — adopt it anyway?") and must affirmatively authorize adoption before binding
  proceeds. There is **no silent automatic bind** on an unsigned match or a
  publisher-string-only match — `publisher` alone is a self-declared, non-cryptographic
  field and cannot carry the weight of an identity proof.

Absent a verified-signature match (a) or explicit operator consent (b), install is refused
with a clear identity-mismatch error rather than silently succeeding into someone else's
retained data.

**Signing is optional today, not mandated (T5 round-2 correction — the round-1 text's
"cryptographically matches" language implied ADR-004 already requires signing; it does
not).** ADR-004's manifest requires only `sourceUrl` and `publisher`; `signature` is
optional (`provenance` §Decision, verified "+signature if present" at load time — ADR-004
Rule 3). ADR-024 §9's own trust ladder sequences `signing/provenance` **after** the
capability sandbox (Rung 2) — meaning verified signing infrastructure is not load-bearing
anywhere in the system yet, including here. This guard is written to degrade gracefully
around that fact rather than claim a guarantee it cannot deliver: until signed artifacts
are common, track (a) will rarely fire and track (b)'s explicit operator consent is the
load-bearing path — that is the intended, honest behavior, not a residual gap. Track (a)
strengthens automatically as plugin-signing adoption grows, with no further ADR change
required, and formally graduates in force at the same ADR-024 §4 Rung 2 milestone named in
§0's Open item.

### 7. Writes go through a typed, core-owned repository only — *advisory until isolation*

Plugin table **writes** use a **typed, core-owned repository** — **no raw write SQL**.
This preserves ADR-022's single write chokepoint, its append-only revision journal, and
its hooks (and carries the ADR-024 `pluginId` attribution stamp). A raw write path would
be an **invariant break**, not a preference; a commerce plugin loses nothing because its
writes are CRUD-shaped. *(Per §0, Tier-3 can bypass the repository until isolation.)*
*(Per §3's tier matrix (T6), this repository is a code-invoked API: Tier-1 plugins have
no executable code, never call it, and never hold `dataModule`.)*

### 8. Reads may be raw, but authorizer-sandboxed — *advisory until isolation*

Plugin **reads** may be **raw `SELECT`s** (manifest-declared named queries preferred),
scoped to `p_{pluginId}__*` plus core-published read views, and **bounded by
`sqlite3_set_authorizer` + `PRAGMA query_only` + a progress-handler timeout**. This gives
commerce-grade joins / recursive CTEs / window functions / faceting **without** a bespoke
ORM, while containing the runtime surface (lock storms, full scans, malformed statements).
*(Codex's one narrow hold-out preferred typed-only reads; the authorizer + query_only +
timeout bound was judged sufficient to admit raw reads. Per §0, Tier-3 can bypass the
authorizer until isolation.)* *(Per §3's tier matrix (T6): manifest-declared named
queries and raw `SELECT`s are both executed by a plugin's **code** — Tier-1 has none, so
it never reaches this surface either.)*

### 9. Never-brick means "recoverable to a working state," not zero data loss

Restore is honest, not magical: on rollback core **re-snapshots first**, then restores,
and **names the exact discarded write window** to the operator. "Never-brick" =
*always recoverable to a working state*, **not** *zero data loss under every rollback*.
Recoverability half.

**Crash during the forensic re-snapshot itself (T3-residual, folds round-2 audit finding —
internal + Codex, 2-way convergence; agy independently judged this already safe with no
change needed, and the Coordinator agrees it is non-blocking either way — this is a
one-sentence clarification, not a new mechanism):** the forensic re-snapshot above is
best-effort and journaled, not a precondition for recovery — if a crash interrupts it, boot
recovery still restores the pre-DDL snapshot per §2's phase journal (the mandatory restore
path fires regardless of what happens to this optional re-snapshot), and the
discarded-write-window disclosure above is reported from that same journal entry.

### 10. The data-migration gap is closed by a constrained transform DSL + backfill jobs

Schema evolution that must move data uses a **small, constrained transform DSL**
(`SELECT`-old → `UPSERT`-new, **in-namespace only**, pure row-local) plus **bounded,
resumable, core-run backfill jobs**. The DSL is deliberately tiny; the escape valve is a
post-migration **app-level backfill through the typed write API (§7)** — not
migration-logic smuggling into the DSL.

### 11. Reversibility primitive is a file copy by default (not CoW)

The default reversibility mechanism is the whole-file snapshot (§4). CoW shadow-tables are
a deferred large-DB optimization. Restated here because it is the seam v1 must not close.

### 12. v1 ships seams only — build the engine against real demand

Do **not** build the reconciliation engine in v1. v1 commits only the load-bearing,
hard-to-retrofit seams:
- the reserved `p_{pluginId}__*` **table namespace**;
- a **`dataModule` manifest key** (recognized, and **rejected with a clear "data-tier
  coming later" error** until the engine ships);
- **stable, globally-unique plugin IDs**;
- **snapshot/restore that already covers unknown future plugin data** (whole-file);
- a **site-wide journaled migration timeline** (core's own, extended to admit plugin
  entries later);
- an **SDK data seam** a scoped repo can slot into.

The ext-bag (ADR-022) remains the v1 plugin data surface; ADR-003's manual tier-promotion
is the interim bridge. Ship the engine v-next **against a concrete demand plugin**, not
speculatively.

## Consequences

- **The ceiling in ADR-022 §Open / TODO §6 is resolved** — as a designed, sequenced path,
  not as "build it now." Commerce/directory plugins have a first-class future without v1
  taking on the reconciliation engine's risk.
- **Never-brick survives the concession** because it was never about *whether* plugin
  tables exist — it is about *who executes and reverses schema change*. Core keeps both.
- **The ADR-022 write chokepoint is preserved** through typed-only writes (§7) — plugin
  table mutations are attributable (ADR-024 `pluginId` stamp) and revisioned, same as
  entries.
- **The security story is honestly staged (§0):** recoverability is real today for every
  operation that enters core's migration path; a Tier-3 plugin's own direct DB
  connection is carved out as advisory — same force as access-control — until ADR-024
  §4 Rung 2 (capability sandbox) ships. Do not conflate the two in docs, marketing, or
  the capability consent UI.
- **Rejected alternatives:** per-plugin `ATTACH`ed database files (Candidate C3) — kills
  core↔plugin joins and FKs; kept only as an isolation *fallback*. "No plugin tables ever"
  (C4) — correct v1 *scope*, wrong as permanent *doctrine*. Raw plugin *writes* — endorsed
  by no voice; an invariant break.

## Open

- **Owed before "commerce-grade" is a claim:** a **faceted-catalog benchmark (~50k
  products)** on end-user SQLite — measuring how far the ext-bag (ADR-022) alone carries
  before the reconciliation engine is worth building. This is the sibling of ADR-022's
  owed 100k-entry benchmark and ADR-024's owed catalog-demand audit.
- **CoW shadow-table threshold** (§11): the exact DB-size cutoff and the WAL-manipulation
  design are deferred to when a real large-DB plugin exists.
- **Transform-DSL surface** (§10): the DSL's exact grammar is designed-now / frozen only
  when the engine is built; it must stay non-Turing-complete and bounded-cost (inherits
  ADR-022's expression-totality amendment).
- **The whole access-control half graduates from advisory → enforced only when ADR-024
  §4 (per-site `utilityProcess` Rung 1 + capability sandbox Rung 2) ships.** Re-review
  this ADR's §0 at that milestone.
- **The §0 Tier-3 recoverability carve-out (T1) graduates at the same milestone.** Once
  Rung 2 ships, a Tier-3 plugin process can no longer open a second raw connection to the
  site's `content.db`, and the recoverability half's "unconditional" claim extends to
  cover Tier-3 without qualification. Until then, track it as the same
  advisory-until-Rung-2 caveat as the access-control half — not a separate, open-ended
  risk.
- **T2-residual** (the "equivalent host-level IPC lock" alternative's crash-safety wording)
  remains deferred/advisory — non-blocking per both round-3 externals, owed whenever that
  alternative is actually implemented rather than before ACCEPTED. See "Debate + Audit
  record" below for the full round-3 closure.

## Debate + Audit record

2-round swarm debate, tight convergence (combined ~0.88). R1 (blind): all four voices
independently reached the core-mediated declarative mechanism (Candidate 1) and rejected
both "no tables ever" as doctrine and per-plugin ATTACH as primary. Two forks surfaced:
the capability gate (agy "safe-by-construction, no gate" 0.90 vs Codex "gate for
blast-radius" 0.82 vs Fable/Primary "consent as UX") and raw SQL (Codex + Fable
independently raised that declarative DDL alone is insufficient — the ongoing read/write
path must also be core-mediated). R2 (informed): the gate went **unanimous** — agy
conceded the blast-radius argument (0.90→0.95, explicit position change) and Fable
reframed "consent is UX" → "the capability record is the enforcement anchor"; raw SQL
resolved to **typed-writes + authorizer-sandboxed reads** (writes 4/4; sandboxed raw
reads 3/4, Codex holding typed-only reads). N1 (never-brick = recoverable, not
zero-loss), N2 (transform DSL + backfill jobs), and the file-snapshot reversibility
primitive were unanimous with refinements. The **split-finalize disposition** (§0) is
ADR-024's roadmap-debate correction of this debate's earlier "pause ADR-023." R2
confidences: agy 0.95, Codex 0.86, Fable 0.85, Primary ~0.85. Full trace:
`.local-artifacts/swarm-consensus/runs/20260708T162852Z-plugin-extensibility-ceiling/consensus-report.md`.

**Round-1 external audit** (`TM-adr023-dataModule-001`, risk_tier=high, floor 8.5), run
2026-07-11, **endorsed the core-mediated direction but returned FAIL**: internal
Security-persona verifier **5.0** (1 critical blocker — Tier-3 defeats the "unconditional"
recoverability claim), Codex `gpt-5.5` **6.5** (4 blockers: B-001 Tier-3 recoverability
precondition, B-002 crash-mid-DDL state machine, B-003 disk-headroom formula, B-004
plugin-identity registry; 1 non-blocking high, H-001 Tier-1 ambiguity), agy/Gemini 3.1
Pro **6.5** (4 blockers: F1 snapshot/restore concurrency-quiescing, F2 disk headroom, F3
crash-recovery lock, F4 retained-data hijack via ID reuse). All three independently
scored below the 8.5 floor and returned `blocking_gate: FAIL`; none disputed the
architecture's *shape* — the namespace scheme, the typed-write chokepoint, the
retain-on-uninstall/purge split, and the advisory-vs-enforced honesty instinct in §0
were all explicitly endorsed as sound and are unchanged by this revision. The disposition
table (`proposed-fixes.md`) converged seven items, all folded above as normative text:
**T1** Tier-3 direct-SQL-connection DDL bypass (internal + Codex, 2-way convergence) —
§0/§4 now narrow "unconditional" to core-mediated DDL and carve out Tier-3's own
connection as advisory-only until ADR-024 §4 Rung 2 ships; **T2** snapshot/restore
concurrency-quiescing (agy-only, Coordinator-endorsed after checking the SQLite
backup-API-vs-file-copy-restore distinction against the internal verifier's initial
dismissal) — §4 now specifies an exclusive cross-process lock held snapshot-through-
restore; **T3** crash-mid-DDL recovery (internal + Codex + agy, 3-way convergence) — §2
now specifies a durable `PREPARED_SNAPSHOT → DDL_IN_PROGRESS → VERIFYING →
COMMITTED/ROLLED_BACK` phase-marker journal with mandatory boot-time restore-or-complete;
**T4** disk-headroom preflight (internal + Codex + agy, 3-way convergence) — §3 now
specifies a `>1.5x current DB+WAL size` fail-closed formula, disclosed at
capability-consent; **T5** plugin-ID reuse / namespace hijack (internal + Codex + agy,
3-way convergence, both external auditors independently proposed near-identical
publisher/signing-based fixes) — §5/§6 now specify permanent ID retirement plus a
publisher-verified-or-explicit-consent adoption guard; **T6** Tier-1 `dataModule`
ambiguity (internal + Codex, 2-way convergence, correctly classified non-blocking by
both) — §3/§7/§8 now scope `dataModule` to Tier-2/Tier-3 only; **T7** the §0 citation of
"ADR-024 §4 Tier-2 isolation" was imprecise (internal-only, independently verified
against ADR-024 §4's own Rung 1 / Rung 2 split) — corrected to "ADR-024 §4 Rung 2
(capability sandbox)" throughout. No disagreement was raised with any auditor's finding;
the only judgment call was the Coordinator siding with agy over its own internal
verifier's initial (narrower) framing of T2. Full trace: audit report
`ADS-project-knowledge/.local-artifacts/external-audit/runs/20260711T045742Z-external-audit-report.md`,
proposed fixes
`ADS-project-knowledge/.local-artifacts/external-audit/proposed-fixes/20260711T045742Z/proposed-fixes.md`.

**Round-2 external audit** (`TM-adr023-dataModule-001`, diff-only re-audit against the
round-1 Prior-Round Disposition Ledger), run 2026-07-11, **confirmed 6 of 7 round-1
findings genuinely fixed with real mechanisms but returned FAIL**: internal Security-
persona verifier **7.0** (1 hard blocker — T5 still-gap), Codex `gpt-5.5` **8.0** (1
blocker — R2-B-001/T5; 2 non-blocking mediums — R2-M-001 IPC-lock crash-safety wording,
R2-M-002 §9 crash-during-forensic-re-snapshot), agy/Gemini 3.1 Pro **5.0** (2 blockers —
F-T5-PHANTOM-CRYPTO/T5 still-gap, F-WAL-RESTORE-CORRUPTION/T8 new). All three
independently scored below the 8.5 floor and returned `blocking_gate: FAIL`. **T1, T4,
T6, T7 confirmed genuinely fixed by all three reviewers; T2 and T3 confirmed fixed for the
concurrency/crash-recovery mechanisms they were originally scoped to address** (agy
separately identified T8 as a distinct, adjacent gap in the same area — not a T2
regression). **T5 was not actually fixed**: all three reviewers independently re-derived
that ADR-004 leaves the manifest `signature` field optional (only `sourceUrl`/`publisher`
are required) and that ADR-024 §9's trust ladder sequences `signing/provenance`
**after** the capability sandbox (Rung 2) — meaning the round-1 §5/§6 "cryptographic
match" language claimed a guarantee the cited mechanisms cannot currently deliver, the
same overclaim shape as round-1's original T1 finding. **T8 (new, single-auditor,
Coordinator-endorsed):** the restore step's plain file copy did not clear the DDL
attempt's own leftover `content.db-wal`/`content.db-shm` sidecar files, so a subsequent
SQLite open could replay stale WAL frames against the restored (older) snapshot and
corrupt it — T2's exclusive lock closed the *concurrent-connection* desync vector but not
this distinct *sequential* one. This revision folds: **T5 (revised)** — §5/§6 now use a
two-track fail-closed rule (verified same-key signature required for silent automatic
rebinding; anything else, including an unsigned match or a publisher-string-only match,
falls to the existing explicit operator-consent path) and no longer imply ADR-004 already
mandates signing; **T8** — §4's restore step now requires deleting/resetting the
`content.db-wal`/`content.db-shm` sidecar files before releasing the exclusive lock;
**T3-residual** — §9 now states that a crash during the optional forensic re-snapshot
does not block or alter the mandatory pre-DDL restore path, which fires from §2's phase
journal regardless (2-way convergence, internal + Codex; agy independently judged this
already safe with no change needed — the Coordinator sided with the 2-1 majority that a
one-sentence clarification was still worth adding, agreeing with all three that it is
non-blocking either way). **T2-residual** (Codex R2-M-001 + internal Finding 3, 2-way
convergence, advisory/medium, non-blocking) — the "equivalent host-level IPC lock"
alternative's crash-safety wording — remains **deferred, not addressed this pass**; it is
lower priority than T5/T8/T3-residual and out of scope for this revision. No disagreement
was raised with either external auditor's blocker-tier finding. Full trace: audit report
`ADS-project-knowledge/.local-artifacts/external-audit/runs/20260711T052258Z-external-audit-report.md`,
proposed fixes
`ADS-project-knowledge/.local-artifacts/external-audit/proposed-fixes/20260711T052258Z/proposed-fixes.md`.

**Round-3 diff-only re-audit** (`TM-adr023-dataModule-001`, same Prior-Round Disposition
Ledger — T5/T8/T3-residual/T2-residual), run 2026-07-11, **returned a clean PASS with zero
findings from either external**: Codex `gpt-5.5` xhigh **9.0**, agy Gemini 3.1 Pro High
**10.0** — both clear the 8.5 floor with wide margin. **T5, T8, and T3-residual were all
independently reverified as genuinely resolved by both auditors**; Codex additionally
re-checked the ADR-004/ADR-024 §9 citations directly against those files' current text
rather than trusting the packet's restatement. **T2-residual remains deferred and
non-blocking**, unchanged from round 2 — both auditors independently reasoned that an
unreleased IPC lock produces a lockout (availability risk), not corruption, since T8's
safety only requires the lock exclude concurrent access during restore+cleanup, which it
does regardless of that lock's own crash-recovery story. This round's synthesis was
recovered from preserved raw auditor offloads after a connection failure interrupted the
prior session mid-write-up (the raw evidence itself — both full auditor responses — was
never in question, only the formal report). **Coordinator closed this round without a
fresh internal-verifier pass**: round-2's internal review (7.0) already drove the T5/T8
fixes; two independent externals then re-verified them at 9.0/10.0 with zero findings,
making a third internal pass over an already-resolved, twice-externally-confirmed surface
process overhead rather than risk reduction. **ADR-023 is ACCEPTED.** Full round-3 trace:
`ADS-project-knowledge/.local-artifacts/external-audit/runs/20260711T054512Z-external-audit-report.md`
(raw: `.local-artifacts/external-audit/offloads/20260711T054512Z/`).
