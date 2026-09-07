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

## 1. Codex claim verification (priority 1)

### D-04 — stale created-project row authorizes deletion of a replacement directory
_(pending)_

### D-05 — Delete erases a project while Start is opening it
_(pending)_

### Sweep — authz against stale / attacker-influenceable record (INV-05 shape)
_(pending)_

## 2. Codex `pending` commits (priority 2)
_(pending)_

## 3. Rest of window (priority 3)
_(pending)_

## 4. Findings (severity-ordered, filled as found)
_(none yet)_

## 5. Open questions for the owner
_(none yet)_

## 6. Commit ledger (all 243)
_(pending — filled incrementally)_
