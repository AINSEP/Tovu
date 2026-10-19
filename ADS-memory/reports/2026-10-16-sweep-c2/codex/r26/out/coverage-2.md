TDD(Direct): Chose the TDD persona for coverage gap test design. Added five tests using the existing Pages harness.

**CHANGED FILES:**

- [/Users/la/Programming/Tovu/apps/website/src/features/pages/__tests__/tool-registrations.test.ts](/Users/la/Programming/Tovu/apps/website/src/features/pages/__tests__/tool-registrations.test.ts)

**PER FILE:** Current source numbering; reported locations differ from this tree.

- `newsletter/campaign.ts`: Existing exhaustive 196-case matrix exercises every status/tier combination. No duplicate tests added.
- `newsletter/subscriptions.ts`: Existing tests exercise save, unsubscribe, batch limits, partial failures, and consent revocation. No additions.
- `newsletter/repo.rows.ts`: Existing contract/dialect suites exercise mappings and update projections; `repo.rows.test.ts` checks revision decoding. No additions.
- `pages/tool-registrations.ts`: New tests exercise negative-version rejection at lines 93–94, unclosed-region refusal at 211–215, and the no-regions branch at 218. Each verifies the error message and unchanged persisted row.
- `sites/tool-registrations.ts`: Existing suites exercise duplication, create/switch, gates, rejection classification, default dependencies, and list/get behavior. No additions.
- `pages/agent-tools.ts`: Existing catalog tests exercise the installed marker vocabulary. Remaining static fallbacks are listed below.

**UNREACHABLE:**

- [pages/agent-tools.ts:78](/Users/la/Programming/Tovu/apps/website/src/features/pages/agent-tools.ts:78): Generic placeholder fallback—every installed marker with a target key has a configured placeholder.
- [pages/agent-tools.ts:80](/Users/la/Programming/Tovu/apps/website/src/features/pages/agent-tools.ts:80): Missing-note arm—every installed non-collection marker has a note.

Both retained unchanged for the owner’s decision; no fake tests or exclusions added.

**NOT DONE:**

Tests, typecheck, builds, package scripts, and coverage were not run, as instructed. **100% coverage is unverified.** The verifier must include the existing campaign characterization, subscriptions, repository contract/dialect, Pages, and Sites suites. No commits or git-state changes were made.
