REVIEW r62t-rev-ex5b COMPLETE

## `codex/sec4-jini` (`22b390df2`) — FIX

With the Tovu host options, the status, generate, import, and both start-fresh calls match the pinned Tovu methods, paths, and request bodies. Stock Jini defaults are preserved. The status projection drops raw-key fields, and Tovu’s authenticated reveal path stays unchanged.

1. `packages/admin/src/security/adapters/http.ts:85` — Replace the truthiness check for `envVarName` with `r.envVarName !== undefined`. Tovu’s client preserves a supplied empty string, and SEC-4 requires keeping the field when present. Update `packages/admin/src/security/__tests__/http.test.ts:149` to expect `envVarName: ''` while still asserting that the injected secret fields are dropped.
2. `packages/admin/src/security/adapters/memory.ts:58` — When a successful write produces an active file-backed status, omit `envVarName`, `invalid`, and `reason` from the new status. The spread currently carries the previous environment source and rejection metadata into the active status. Extend `packages/admin/src/security/__tests__/memory.test.ts:102` to cover a successful import from a seeded invalid environment status.
3. `packages/admin/src/security/__tests__/http.test.ts:154` — Add the secrecy regression required by P9-SEC §1b. Drive a configured import through the root-key controller with a fixture key echoed in the transport refusal, then retry successfully. Assert that the displayed error, projected status and result, and console output exclude the fixture key. Keep the existing assertion that the adapter preserves the typed refusal.
4. `.changeset/p9-sec-4.md:2` — Change `@jini-ai/admin` from `minor` to `patch` and update `cloud-results/sec4-jini.md` to match. P9-SEC §1b inherits the P9 §1 patch rule, and SEC-4 specifies no override.

## `codex/ex3-c0b-jini` (`a34ea2194`) — APPROVE

Both prior fixes are present. `packages/core/src/__tests__/site-key.unit.test.ts:74` checks all five non-reveal response DTOs, including optional `hex` keys, and has a reveal control. `cloud-results/ex3-c0b-jini.md:34` requires two-way type equality alongside the existing runtime server-union comparison.

## `codex/ex2-holds-jini` (`11d47b476`)

- **RT-1 — APPROVE.** `.changeset/rt1-retire-sqlite.md:13` names all three type owners and retains the runtime migration paths. `packages/capability-providers/src/unsafe-reference/db.ts:9` points to `SqliteDbProvider`, which implements `DbProvider`.
- **RT-2 — APPROVE.** `scripts/__tests__/injection-exceptions.q2.test.ts:59` pins the source violation, and the scanner assertion verifies `export-from` for `@jini-ai/db/sqlite`. `packages/db/src/core/ports.ts:10` points to `@jini-ai/db/core` and preserves the R12 explanation. The inventory in `cloud-results/ex2-holds-jini.md:27` matches the pinned Tovu tree, with zero removed-shim consumers and six files using the retained outbox.
- **C-contracts-core-1 — APPROVE.** `.changeset/core-extension-capability-vocabulary.md:2` now uses `patch`.
- **C026 — APPROVE for Jini.** The three allowlist entries and the `Picker projection` wording change remain Tovu follow-ups.

Static review only. No files were changed and no tests, mutations, builds, installs, or type-checks were run. The SEC-4 builder report records XP3 as unverified because the declaration baseline was unavailable.
