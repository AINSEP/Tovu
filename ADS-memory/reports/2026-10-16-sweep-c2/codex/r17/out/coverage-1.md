TDD(Direct): Selected the TDD persona for behavior-focused coverage gap filling.

Changed tests only. No tests, typechecks, builds, coverage, package scripts, commits, or git mutations ran.

**CHANGED FILES:**

```text
/Users/la/Programming/Tovu/apps/admin/src/features/security/__tests__/use-site-key.unit.test.tsx
/Users/la/Programming/Tovu/apps/admin/src/features/settings/hooks/__tests__/use-external-mcp-admissions.unit.test.tsx
/Users/la/Programming/Tovu/apps/admin/src/hooks/__tests__/use-admin-execution-credential.hooks.test.ts
/Users/la/Programming/Tovu/apps/admin/src/__tests__/unit/sidebar-labels.unit.test.tsx
/Users/la/Programming/Tovu/apps/website/src/features/external-mcp/__tests__/unit/built-in-connections.unit.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/plugins/__tests__/snapshot.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/publish-trust/__tests__/grant-backstop.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/site-backup/__tests__/plan-store.unit.test.ts
```

**PER FILE:** Coverage targets below are based on source inspection; execution is pending.

- `use-site-key.hooks.ts`: lines 151–153 through real wired-port loading and Spanish translation; added missing-hex, concurrent-action guards, pre-load generation, and failed-refresh cases.
- `use-external-mcp-admissions.hooks.ts`: line 80 through wired permissions loading; line 252 through rejected restart; added refusal-without-reason fallback.
- `use-admin-execution-credential.hooks.ts`: validation message/fallback, other API errors, ordinary errors, and unknown rejection. Replaced the existing API module mock with a fetch-boundary fake.
- `use-cms-sidebar-label-tooltips.hooks.ts`: line 30 restoring an original title; missing sidebar, href, label, and empty-text branches.
- `built-in-connections.ts`: absent/malformed/non-array/mixed roster inputs; exact membership, missing IDs, and ownership decoration without input mutation.
- `snapshot.ts`: existing tests already exercise special-path and URI conditionals. Strengthened real snapshot-content assertions and added successful/idempotent discard.
- `connect.ts`: config without a URL, unchanged reconnect, connect/disconnect provisioning refusals, and repeated disconnect. Refusals assert the stored document remains unchanged.
- `plan-store.ts`: default clock/TTL/cap/UUID behavior and empty eviction-loop exit with zero configured capacity.

**UNREACHABLE:** None identified.

**NOT DONE:** Execution and measured confirmation of 100% line, branch, and function coverage remain with the verifying agent. Read-only whitespace checks passed.
