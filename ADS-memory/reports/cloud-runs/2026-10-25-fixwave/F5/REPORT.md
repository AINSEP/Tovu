# F5 — Jini fix wave: Stryker L10 + RUN 2 (agent-plugins, cms plugin-export) — INTERIM

> Interim (22:33Z): Stryker after-runs in progress; final numbers will replace this header.

## 0. SOURCE BUG FOUND AND FIXED (top)
**`@jini-ai/analytics` `ipMatchesRange`: a malformed excluded-IP range excluded every visitor.**
`"10.0.0.0/"` → `Number("") === 0` and `"10.0.0.0/-1"` → `prefix <= 0` were both read as `/0`, so one typo in the operator's `excludedIpRanges` setting silently dropped ALL analytics hits (Tovu stores that list with `toStringArray`, no validation). Failing test **aec57645** → fix **2bdd4d6d** (prefix must be 1–2 digits, 0–32; `/ 8`, `/33`, `/-1`, `/` now never match; every valid range unchanged; analytics 168/168).
