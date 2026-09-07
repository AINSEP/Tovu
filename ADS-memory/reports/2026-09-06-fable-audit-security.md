# Fable audit — SECURITY lens — window 4b89cd09..efc6847e

- Auditor: Fable 5.1 (subagent `fable-security`), dispatched 2026-09-07 00:01 local
- Audit HEAD (frozen): `efc6847ed4490d0f57cd94d16b8cf46a6489a88a`
- Window: `4b89cd09..efc6847e` — 243 commits, all 2026-09-06
- Skills loaded: `AI-Dev-Shop/agents/security/skills.md`
- Mode: read-only. No tests, builds, typechecks, servers. Commit cadence: every ~5 min.
- Already fixed, NOT re-reported: J01, MI-01, MI-02, chat-run death path (`f682eff2`).
- Off limits: `apps/admin/src/features/menus/MenuEditor.*`.

Status legend: **CONFIRMED** = traced reachable path from untrusted input to sink, caller named. **PLAUSIBLE** = inferred, path not fully traced. **REFUTED** = codex claim did not survive reading the code.

## 0. Progress log (append-only, newest last)

- 00:01 — report created, first commit.
- 00:12 — desktop read at frozen SHA: `project-delete-guard.cjs`, `project-ipc.cjs`, `main.cjs`, `desktop-auth.cjs`, `tovu-server.cjs`, `keyed-serializer.cjs`, `preload.mts`, `site-registry.cjs` (partial). D-04/D-05 verdicts below.

## 1. Codex claim verification (priority 1)

### D-04 — stale created-project row authorizes deletion of a replacement directory
**CONFIRMED (code read at efc6847e). Severity: High** (irreversible data loss; the guard's own doc claims it "fails CLOSED" on anything it cannot prove, and it does not prove this).

- `apps/desktop/src/project-ipc.cjs:151-167` `handleDelete(id)`: `row = readTrackedProjects().find(siteDir === id)`; if `mayEraseProjectDirectory(row, {repoRoot})` → `fsp.rm(id, {recursive:true, force:true})`.
- `apps/desktop/src/project-delete-guard.cjs:104-108` `mayEraseProjectDirectory`: tests ONLY (a) `row.origin === "created"` and (b) real-path containment outside `repoRoot`. Nothing consults the live directory: no marker check (`content.db`/`config.json`), no inode/dev identity, no workspaceId compare against the row. The row is the sole authority and the row is a path string in `desktop-projects.json`.
- Attack/loss path (operator-driven, no external attacker needed): create site A at `/x/a` (row: created) → move A elsewhere → place site B (or any files) at `/x/a` → the card for `/x/a` still shows (`readSiteName` reads B's `config.json`, so the card is even titled with B's name and `deleteErasesFiles: true`) → confirm delete → B is erased. B was never created by this app.
- Same shape as INV-05: the authorization is made against a stored record that no longer denotes the thing it names.
- Not mitigated by `rescanProjects` — discovery only adds rows; it never re-validates or downgrades an existing `created` row (see `adoptDiscoveredProjects`, to be confirmed in §1 sweep).

### D-05 — Delete erases a project while Start is opening it
**CONFIRMED (code read). Severity: Medium** (needs the operator to click Start then Delete inside the ≤60 s boot window; effect is a `tovu serve` child left running over an rm'd directory plus an `openSites` entry with no tracked row).

- `handleStart` (`project-ipc.cjs:205-211`) enters `deps.serializer.run(id, …)`; `handleDelete` (`:151-167`) never touches `deps.serializer` — `serializer` appears exactly once in the file, in `handleStart`.
- `main.cjs:569-576` `openSiteServer`: `openSites.set(siteDir, …)` only AFTER `await startSiteBackend()` (spawn + boot line wait, up to `DEFAULT_READY_TIMEOUT_MS = 60_000`, + boot-token redeem). During that window `openSites.get(id)` is `undefined`, so `handleDelete` skips `server.stop()`, untracks the row, and `rm -rf`s the directory the child is booting in. Startup then completes and publishes `{server}` into `openSites` and a crash-safety row into `open-sites.json` (`recordSiteOpened`, `main.cjs:472`).
- Reverse ordering also holds: `handleStart` validates the row OUTSIDE the serialized fn, so a delete landing between validation and `openSiteServer` starts a server for an untracked (and, for a `created` row, erased) directory.
- The `handleDelete` doc comment ("The server is stopped … BEFORE the directory is removed, so `content.db` is never unlinked out from under a live handle") is false for this interleaving.

### D-05 — Delete erases a project while Start is opening it
_(pending)_

### Sweep — authz against stale / attacker-influenceable record (INV-05 shape)
_(pending)_

## 2. Codex `pending` commits (priority 2)
_(pending)_

## 3. Rest of window (priority 3)
_(pending)_

## 4. Findings (severity-ordered, filled as found)

| ID | Sev | Status | Where | One line |
|---|---|---|---|---|
| SEC-01 (=D-04) | High | CONFIRMED | `apps/desktop/src/project-delete-guard.cjs:104-108`, `project-ipc.cjs:164-166` | Erase authorized by a stale path-keyed row; live directory identity never checked |
| SEC-02 (=D-05) | Medium | CONFIRMED | `apps/desktop/src/project-ipc.cjs:151-167` vs `:205-211`; `main.cjs:569-576` | Delete bypasses the per-site serializer Start uses; rm under a booting child |


## 5. Open questions for the owner
_(none yet)_

## 6. Commit ledger (all 243)
_(pending — filled incrementally)_
