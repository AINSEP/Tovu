# ADR-045: Backups / Recovery admin screen

- Status: **PROPOSED** — emerged from the same 3-round swarm `/debate` as ADR-043/044 (2026-07-14).
  Converged closely across all three participants and all three rounds — no persistent disagreement.
  **Has NOT been through `/audit-work`.**
- Date: 2026-07-14
- Extends: **ADR-041** (Storage/Timeline) — this ADR does not redesign ADR-041's backend primitive
  (`db-ops` port, restore points, the `plan→confirm→execute` gateway, the sidecar `ops/` journal); it
  designs the Recovery admin *screen* as a consumer of that already-decided primitive, closing the one
  question ADR-041 itself left open ("Backups and Recovery are sibling faces… not the same screen" —
  ADR-041 §1 — without specifying that second screen's information architecture).
- Relates: ADR-021 (identity/authorization — permission gates, composite actor identity)

## Context

ADR-041 designed the backend primitive for site migration, snapshots, and restore, but deliberately left
the Recovery/Backups screen's actual UX unspecified beyond "it is a sibling of the Storage Timeline, not
the same screen." This ADR designs that screen.

## Decision

### 1. Two separate screens, not tabs

**Storage** (`/admin/storage`, `storage.read`/`storage.migrate`) is the read-first Timeline ADR-041
already describes, plus the one forward-migrate write action. **Recovery** (`/admin/recovery`,
`backup.create`/`backup.restore`) is a distinct screen for restore-point management and execution. This
was unanimous and unambiguous across all three debate participants: ADR-041 §1 explicitly forecloses
tabs, and the risk profiles are genuinely different — Storage is read + forward-only (low-to-moderate
risk); Recovery is destructive and reverse-gear (human confirmation token required for every actor,
including the owner, per ADR-041 §6). A tab one click away from a casual read view invites exactly the
muscle-memory mis-click a restore must never allow.

### 2. Recovery's information architecture centers on the discarded-write-window disclosure

The single most important element of the Recovery screen is a **blocking, itemized disclosure of
exactly what a restore would discard** (per ADR-041 §5's global `storage_write_watermark`), shown and
explicitly acknowledged **before** the confirmation token is minted — not a footnote, not summarized into
a reassuring one-liner. "Never-brick" means *recoverable to a working state*, not *zero data loss*
(ADR-023 §9 / ADR-041 §5) — so the operator's single most consequential decision is accepting a named
loss window, and the screen's entire structure should serve that decision, not bury it.

### 3. Screen structure

```
[ CAPABILITY / STATUS BAR ]  costClass: cheap|expensive|unavailable · in-flight operation? (blocking)

[ RESTORE POINTS LIST ]  newest-first
    each row: timestamp · trigger (pre-migration auto | manual | template upgrade)
              · captured schema (version+tag) · size · costClass
              · "what restoring here would discard" summary

[ SELECTED RESTORE POINT -> RESTORE FLOW ]
    Step 1  plan()               -> preview target schema, quiesceIntegrity note, cost/disk estimate
    Step 2  DISCARDED-WINDOW DISCLOSURE (load-bearing, blocking)
            "Restoring loses N writes since <time>: X entries, Y change-sets,
             Z sessions, W plugin-table rows." + explicit acknowledge checkbox
    Step 3  confirm()             -> mint human token (every actor, including owner); re-authorize
    Step 4  execute()             -> blocking, non-dismissable progress panel reflecting the live
             state machine (QUIESCING -> SNAPSHOTTING -> RESTORING -> RESTORED|RESTORE_FAILED)
    Step 5  completion            -> deep-link back to the Storage Timeline (the incident thread closes)
```

### 4. Capability- and state-aware degraded modes

- **`costClass: unavailable`** — restore points render as read-only markers; the primary action is
  replaced by a runbook pointer, never a dead "Restore" button (matches ADR-041 §2's "no attestation
  override").
- **Operation in flight** — both Storage and Recovery enter a blocking "operation in progress" mode; no
  second concurrent restore/migrate can start; progress is read live from the sidecar journal's state
  machine, not assumed from a one-shot API response (so a page refresh mid-restore doesn't lose state).
- **`PENDING_MIGRATION` boot state** (ADR-041 §10) — admin reachable, public serving refused; Recovery is
  the natural landing target for the deep-link envelope; a prominent degraded-state banner drives the
  operator toward the interactive plan→confirm→execute flow.
- **`migration.interrupted` on boot** (ADR-041 §3 crash reconciliation) — the interrupted run surfaces at
  the top of Recovery with the single unblock action; the screen is explicit that this is "a real,
  accepted downtime vector" (ADR-041's own words), not a bug to apologize for.

### 5. Deep-link wiring

Consumes ADR-041 §7's `StorageContextEnvelope` unchanged: Site-Health storage card → Storage Timeline
(mints the incident correlation id) → Recovery restore (pre-focused, discarded-window preview shown
before any confirm step) → back to Timeline on completion. Every id inside the envelope is untrusted and
re-looked-up server-side by Recovery on arrival — the envelope carries display continuity only, per
ADR-041's own rule that authority never travels in a deep link.

## Rejected alternatives (converged)

- **Recovery as a tab within the Storage Timeline screen.** Rejected — ADR-041 §1 explicitly forecloses
  this, and collapsing a destructive, human-token-gated action into a read-first timeline invites
  accidental clicks a restore must never allow.
- **Folding this into the pre-ADR-041 sitemap's separate `/admin/backups` (export/restore) and
  `/admin/database` (schema/data browser) entries as-is.** Rejected — those entries predate ADR-041 and
  carry the "Database console" category error ADR-041's own debate explicitly rejected. Recovery
  supersedes `/admin/backups`; the ADR-041 §8 Tier-3 read-only browser (redaction-mandatory, off by
  default) is the only piece of `/admin/database` that survives, and it lives under Storage, not as its
  own section.
- **Letting an agent hold a direct restore lever.** Rejected — mandated against by ADR-041 §6: an agent
  asking to "roll back" receives a routing envelope only; the actual restore requires a human
  confirmation token for every actor, with no exception.

## Failure modes

- **Operator confirms a restore without grasping the loss window.** The highest-stakes UX failure in
  this whole feature. Mitigated by making the discarded-window disclosure a blocking, itemized,
  acknowledge-to-proceed panel — not a summary — shown before the token is even minted; the forensic
  re-snapshot ADR-041 §3/§5 takes before restoring means even a regretted restore is itself reversible.
- **Stale or forged deep-link envelope drives a restore against the wrong target.** Mitigated by
  ADR-041 §7's mandatory server-side re-lookup of every envelope id and `execute()`'s `PLAN_STALE`
  rejection on any plan/live-state mismatch — the screen renders only server-recomputed values at
  confirm time, never the envelope's carried values.
- **A crashed restore leaves the restore lock permanently held.** An availability failure, not a
  corruption one. Mitigated by ADR-041's boot reconciliation completing-or-restoring on next boot;
  Recovery surfaces the interrupted-run unblock path rather than an indefinitely spinning progress bar.

## Consequences

- Recovery becomes the single most consequential, most carefully-designed screen in the admin — every
  future affordance added to it should be weighed against whether it could make a restore easier to
  trigger by accident, not just easier to use.
- The discarded-window disclosure may read as alarming rather than reassuring to some operators — ADR-041
  itself already names this as an accepted consequence of honesty over false comfort.
- `/admin/backups` and `/admin/database` (pre-ADR-041 sitemap entries) are superseded; any existing
  reference to them in planning docs should be updated to point here and to ADR-041.

## Open Questions

- Findability of Recovery from Storage — this ADR keeps them in one shared nav group with adjacent
  wording ("Storage" / "Recovery") rather than a single friction-added affordance on the Timeline; if
  user testing shows operators can't find Recovery, revisit.
- Whether a lighter-weight "quick restore" path should exist for the common `costClass: cheap` case, or
  whether the full plan→confirm→execute ceremony should always be uniform regardless of cost — this ADR
  defaults to uniform ceremony (no shortcut), consistent with ADR-041's "no attestation override" stance.

## Process Note

Converged across all three participants and all three debate rounds — no Coordinator tie-break was
needed for this topic, unlike ADR-043.
