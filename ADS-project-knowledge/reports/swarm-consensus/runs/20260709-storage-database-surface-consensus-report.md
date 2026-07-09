# Swarm Consensus Report — Tovu "Storage / Database" admin surface

- **Date:** 2026-07-09
- **Mode:** `/debate` · 3 rounds (R1 blind → R2 informed rebuttal → R3 design [3a produce + 3b cross-review])
- **min_confidence:** 0.90 · **Topic:** design the "Database" admin section (todos.md → Admin Section Spec Sweep)
- **Outcome:** Architecture **unanimously endorsed**; **not ADR-ready as-merged** — 3 blockers + 6 must-fix
  text changes + notes to fold first. Feeds → `/audit-work` → new ADR (next free number, check ADR-INDEX).

## The Swarm

| Participant | Model | Access | R1 conf | R2 conf | R3a conf | R3b verdict |
|---|---|---|---|---|---|---|
| **Primary** | Opus 4.8 (host) | coordinator | 0.70→0.88 | — | — | — |
| **Fable** | in-host subagent | reads repo/ADRs | 0.85 | 0.91 | 0.85 | ENDORSE-WITH-CHANGES (0.72→0.90 post-fix) |
| **Codex** | gpt-5.5, reasoning=high | reads repo/ADRs | 0.88 | 0.92 | 0.90 | BLOCK (0.72 post-fix) |
| **Gemini** | Gemini 3.1 Pro (High) via `agy` | packet-only | 0.92 | 0.95 | 0.93 | ENDORSE-WITH-CHANGES (0.85) |

## Dispatch Diagnostics

- Model proof: smoke-tested this session (codex gpt-5.5 + agy Gemini 3.1 Pro High returned markers); artifact
  `reports/swarm-consensus/smoke-tests/2026-07-09T223455Z-cli-smoke-test.json`.
- Codex/Fable given repo read access (design within accepted ADRs); agy packet-only. All background peer
  launches stdin-guarded (`< /dev/null`). Packets in `.local-artifacts/swarm-consensus/context/CTX-database-*`.

## The Decision (locked R1–R2, unanimous)

**Do not build a "Database" page.** Build **"Storage"** — a read-first surface whose centerpiece is a
**Timeline** rendering the never-brick ledger (migrations, snapshots, index provisions, template upgrades,
each anchored to a restore point; drift banner on top). **One write op: "migrate this site forward now,"
snapshot-anchored — no rollback verb** (migrations are forward-only, ADR-015 §3; the only reverse gear is
snapshot restore, a Recovery action). **Never:** raw row edit (category error vs the write chokepoint /
authorize / append-only revisions), free-form SQL console (v1), database-first mode (C5, conflicts ADR-012).
Pure health **merges into the planned Site Health surface**. Optional raw read-only browser = **Tier-3**,
off by default. Layering: thin **Tier-2 `db-ops` library** → **Tier-5 admin screen** → optional Tier-3
browser. **Backups + Recovery are sibling faces over one shared snapshot primitive.**

## Synthesis — the merged design (D1–D6)

Full spec: `.local-artifacts/swarm-consensus/context/CTX-database-admin-section-2026-07-09-R3b-merged.md`.
- **D1 `db-ops` port + restore points:** dialect-neutral port above the ADR-015 line. `costClass:
  cheap|expensive|unavailable`. **cheap → one-click; expensive → confirm must acknowledge cost (in plan
  hash); unavailable → migrate refused.** SQLite = online-backup whole-file copy; Postgres = `pg_dump -Fc`
  + **blue/green schema repoint** (never in-place); PITR = `external` marker only. **No attestation override.**
- **D2 migrate-forward + human-confirm:** two-phase gateway command `plan → confirm(mint single-use,
  plan-hash-bound token; user-only) → execute`; execute recomputes plan, `PLAN_STALE` on mismatch;
  authorize() fail-closed before idempotency (ADR-021 §2). Agent executes only with a **delegator-minted**
  token. Persisted `migration_runs` state machine + **boot crash-reconciliation**.
- **D3 ledger + exemption:** append-only `storage_ledger` (ADR-023 §12 seam made real). Site-scope exemption
  grounded in **ADR-007 Decision 2** + `scope` CHECK + `SiteScoped` brand types + enumerated
  `SITE_SCOPE_EXEMPT_TABLES` read by the ADR-007 contract suite.
- **D4 tools + permissions:** `storage.read` / `storage.migrate` / `backup.create` / `backup.restore`;
  reads free to agents; write token-gated; **restore is a Recovery tool, not a Storage tool** (agent gets a
  routing envelope, never a lever); enforcement = ADR-014 filter → authorize() → grant∩delegator → token.
- **D5 deep-link:** one **unsigned, untrusted** `StorageContextEnvelope`; every surface re-authorizes +
  recomputes drift on arrival. **Context flows, authority never does.** 3-face split gating condition MET.
- **D6 Tier-3 browser:** **(b) strengthened — no SQL surface;** `describeTables()`/`readRows()` over the
  **ADR-022 bounded expression language**, core injects workspace filtering.

**Fork resolutions (all three ACCEPT):** D1 degrade/block-no-attestation · D5 unsigned envelope · D6
read-views-not-SQL.

## Decision Ledger — punch-list to fold BEFORE the ADR

**🛑 BLOCKERS (paragraph-sized fixes, not architecture changes):**
- **B1 — out-of-band ops journal.** `storage_ledger`/`migration_runs`/`restore_points` sit *inside*
  `content.db`, which restore reverts → the Timeline erases the very incident it exists to narrate, and boot
  can't append `migration.interrupted` if the DB won't open. **Move the operational record to a sidecar
  journal in the install-dir + a crash-safe restore marker; the in-DB ledger mirrors it.** *(Codex B1 +
  Fable G2 — independently converged; ADR-023 §4/§9.)*
- **B2 — SPEC-003 serve-time auto-migrate side door.** `SERVE_SITE` (state.spec ~L71) forward-migrates on
  boot with **no plan/confirm/snapshot** — the entire D2 ceremony is bypassable by restarting under a newer
  runtime. **Reconcile: route serve-time migration through the same snapshot-anchored path (explicit no-token
  boot policy) OR refuse-and-surface-pending, amending SPEC-003.** *(Fable G1.)*
- **B3 — composite actor identity.** Principals are `(workspace_id, id)` (ADR-021 §4); ledger had only
  `actor_id`/`delegated_by`. **Add composite actor identity (or globally-unique principal ids).** *(Codex B2.)*

**⚠️ MUST-FIX text before ADR:**
- **M1 — index.provision vs "snapshot before *every* DDL" (ADR-023 §4).** Expression-index provisioning
  carries no restore point (defensible: ADR-022 §3 non-mutating) — but the ADR must **explicitly amend/narrow
  ADR-023 §4** as a carve-out, not diverge silently. Also index build must be `CONCURRENTLY` on Postgres or it
  write-locks. *(Codex H3 + agy + Fable G7.)*
- **M2 — authorize at confirm-time,** not only execute (mint token only with `storage.migrate` already
  authorized; re-check at execute). *(Codex H4.)*
- **M3 — quiesce residual closure = ADR-024 §4 **rung-2** (capability sandbox), not rung-1** (utilityProcess
  alone still lets a plugin open content.db). The honesty clause currently over-claims. *(Fable G3.)*
- **M4 — `revisionSeqAtQuiesce` must be a global watermark,** not a scalar over ADR-022 §4b's *per-entry*
  sequence; and the discarded-window disclosure must enumerate **sessions + identity/authz + plugin-table
  writes**, not just entry revisions. *(Fable G4.)*
- **M5 — sensitive-table redaction** in `describeTables()`/`readRows()`: `users`/`api_keys`/`sessions` hold
  hashes readable by any `storage.read` holder. *(Fable G5 + Codex M6.)*
- **M6 — Postgres blue/green CUTOVER phase** in the D2 state machine (D1 says blue/green, D2 models in-place).
  *(agy.)*

**📝 Notes-in-ADR:**
- ADR-007 exemption: state the ADR **extends Decision 2's hatch** to ports/tables (Decision 2 covers *events*
  only) — don't claim ADR-007 pre-declared it. *(Codex M5 + Fable G6.)*
- D6 is a **hardening choice, not "required by ADR-023"** (§8 permits sandboxed raw SELECT). *(Codex M6.)*
- Boot-reconciliation trades MTTR for safety (a downtime vector) — acknowledge. *(agy.)*
- `backup.create` needs a named tool/surface; envelope ids need an "untrusted, re-looked-up server-side"
  clause; `siteId ↔ workspaceId` is SPEC-003 OQ-04.
- **Hardening backlog:** boot crash-reconciliation (in D2); dry-run migration on a throwaway clone (agy);
  scheduled restore-drill that proves never-brick (Codex).

**Known residual (record as a limitation):** quiesce is best-effort — a Tier-3 in-process plugin can write
around it (ADR-024 blast radius); "0 discarded" holds only for chokepoint-visible writes; ledger records
`quiesceIntegrity:'chokepoint-only'` when any Tier-3 plugin is enabled; closes fully at ADR-024 §4 rung-2.

## Final Recommendation

The **architecture is settled and unanimously endorsed** — build "Storage" as specified in D1–D6 with the
fork resolutions. It is **not ADR-ready until B1–B3 + M1–M6 are folded** (all bounded text fixes). Next per
the `debate → audit → ADR` process: fold the punch-list into a design-v2, run `/audit-work` on it, then write
the ADR (next free number; relates to ADR-003/007/012/015/021/022/023/024; amends ADR-023 §4 for index DDL;
amends SPEC-003 SERVE_SITE). Confidence post-fix: ~0.90 (Fable), 0.85 (agy), 0.72→ADR-ready (Codex).

## Debate Trace (why positions moved)

- **R1 (blind):** all four independently rejected C4-edit + C5, chose C1+C2-read core; Codex/agy/Fable each
  *independently* proposed renaming away from "Database." Fable (files) caught ADR-023=PROPOSED + no-rollback +
  Tier-5 framing.
- **R2 (informed):** all accepted the 3 corrections; confidence rose (agy 0.92→0.95). Converged on "Storage"
  name + merge health into Site Health. Fable flagged human-confirm exists in no file, portability is
  aspiration, ledger has 4 sources + workspaceId tension → became R3's design agenda.
- **R3a (design):** three concrete designs; Fable's the spine; forks = D1 block-vs-degrade, D6 gate-vs-readviews.
- **R3b (cross-review):** Codex BLOCK (in-DB ledger + composite identity); Fable found the SPEC-003 serve-time
  bypass Codex missed + confirmed the in-DB-ledger blocker independently; agy caught the blue/green state-machine
  gap. All three accepted the fork resolutions. The feedback round converted a plausible design into an
  audit-grade one.
