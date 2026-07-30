# Red-Team Findings: site-install-dir

- Feature: FEAT-003-site-install-dir
- Spec version: 1.0.0
- Spec hash: sha256:d8a65a90f1249a8380bbeafb8827b2a44ab1ea101e18e502b8e405c927c67465
- Red-Team completed: 2026-07-07T04:35:00Z
- Red-Team agent: Claude Opus 4.8 (persona `AI-Dev-Shop/agents/red-team/skills.md` loaded this session)
- Finding count: 0 BLOCKING · 5 ADVISORY · 1 CONSTITUTION_FLAG

---

## BLOCKING Findings

None. Init/serve ordering is deterministic, the exit-code registry disambiguates shared codes, and the commit-marker discipline is sound. Cleared for Software Architect. ADVISORY items below are for human decision.

---

## ADVISORY Findings

### RT-001
- Severity: ADVISORY
- Category: contradiction
- Location: behavior.spec.md §2 BR-06 (and errors.spec.md §4 `SITE_NEWER_THAN_RUNTIME` row) — **fallout of the R1 Drizzle revision**
- Description: R1 moved migrations onto Drizzle in `feature.spec.md` (REQ-05) and `state.spec.md` (§5/§7), but `behavior.spec.md` BR-06 still says "bump `schemaVersion` only AFTER **`runMigrations`** completes," and errors.spec.md §4 still says the guard "compares to the **runtime constant**." The package now describes two migration mechanisms across files — an internal contradiction the DoD's F-02 consistency claim doesn't actually hold post-R1.
- Suggested resolution: Spec-Agent cleanup (I will apply with the RT-cleanup batch): BR-06 → "after Drizzle `migrate()` completes"; errors.spec §4 → "compares `.site-meta.json.schemaVersion` to the runtime's bundled-migration count." No behavior change.

### RT-002
- Severity: ADVISORY
- Category: ambiguity
- Location: BR-05 serve step (3), errors.spec.md §2 (`SITE_DIR_INVALID` vs `SITE_CORRUPT`)
- Description: Step (3) maps "`content.db` present + openable" to `SITE_DIR_INVALID` (missing) or `SITE_CORRUPT` (locked). It does not say which code a **present-but-not-a-valid-SQLite-file** `content.db` gets (truncated/garbage file, not locked). That's a distinct third case from "missing" and "locked."
- Suggested resolution: Add the case explicitly — a present-but-unopenable (non-lock) `content.db` → `SITE_CORRUPT` (integrity), reserving `SITE_DIR_INVALID` for missing/absent. State it in BR-05 step (3) and errors.spec §4.

### RT-003
- Severity: ADVISORY
- Category: missing-failure-mode
- Location: BR-01 init steps 4–7 (filesystem writes)
- Description: Init performs several filesystem writes (dirs, `config.json`, `content.db`, seed) but no EC covers a mid-write OS failure — `ENOSPC` (disk full), `EACCES` (permission denied), or `EROFS` (read-only fs). BR-01 says "any step 4–7 fails ⇒ remove everything created," but the cleanup itself can fail under the same conditions (e.g., permission denied on rmdir).
- Suggested resolution: Add an EC: init write failure (ENOSPC/EACCES) ⇒ `INTERNAL` (exit 1) after best-effort cleanup; if cleanup also fails, the error message must name the partial dir so the user can remove it manually (the commit marker is still absent, so `serve` will still refuse it — the invariant holds even if cleanup is partial).

### RT-004
- Severity: ADVISORY
- Category: missing-failure-mode
- Location: BR-07 (SIGINT/SIGTERM shutdown)
- Description: Graceful shutdown "stops accepting connections, closes the db handle, exits 0" but doesn't address in-flight requests. Because the db is synchronous better-sqlite3 (a request's write either completed or hadn't started before `close()`), the risk is low — but closing the handle while a synchronous transaction is on the stack is unspecified.
- Suggested resolution: State that shutdown waits for the current synchronous request to return before `close()` (trivially true for better-sqlite3's sync model), or accept and document the assumption. Low risk; worth one sentence for the desktop-host integration (ADR-011) which may send signals aggressively.

### RT-005
- Severity: ADVISORY
- Category: missing-failure-mode
- Location: REQ-05 / state.spec.md §7 — `schemaVersion` as bundled-migration **count** (post-R1 / ADR-015)
- Description: The compatibility guard compares the site's `schemaVersion` to the runtime's **count** of bundled Drizzle migrations. Count is a weak version key: two runtime builds (a fork, or a hotfix branch) could each bundle 3 migrations whose 3rd migration differs. Equal counts would falsely pass `SITE_NEWER_THAN_RUNTIME`, then Drizzle's `migrate()` could apply a divergent migration or no-op incorrectly.
- Suggested resolution: Compare against the **latest migration id/tag** from `drizzle/meta/_journal.json`, not the count (or store the latest applied migration tag in `.site-meta.json` instead of an integer). Safe for a single linear lineage in v1, but the desktop host distributing multiple runtime builds (ADR-011) is exactly where lineages diverge — worth fixing before that lands. Note in ADR-015's consequences.

---

## CONSTITUTION_FLAG Findings

### RT-006
- Severity: CONSTITUTION_FLAG
- Category: constitution
- Article: Article I — Library-First
- Location: REQ-09, Constitution table Article I ("CLI uses Node built-ins, no CLI framework at two commands")
- Description: The no-CLI-framework call is correct for `init`/`serve`, but the surface is about to grow: SPEC-005 adds `tovu plugin build`, `tovu dev --plugin`, and `tovu hooks list`, and OQ-01 adds `tovu build`. A hand-rolled argv parser across 5–6 subcommands with flags is exactly where "custom where a library exists" (commander/yargs) starts to bite.
- Architect note: Prepare an Article I note: keep hand-rolled for the two v1 commands, but define the growth trigger (≥4 subcommands or the first subcommand with non-trivial flag parsing) at which a CLI library is adopted — so the decision is deliberate, not defaulted, when SPEC-005 lands.

---

## Routing Decision

`0` BLOCKING findings. **Spec cleared for Software Architect dispatch.**

RT-001 is R1 cleanup the Spec Agent will apply. RT-002 and RT-005 change a contract detail and are worth a human glance (RT-005 especially, since it affects the ADR-015 compatibility story). RT-003/004/006 are low-risk / Architect-preparation.
