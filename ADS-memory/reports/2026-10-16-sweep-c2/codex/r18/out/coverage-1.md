TDD(Direct): Loaded the TDD persona for behavior-focused coverage tests. Changed tests only.

**CHANGED FILES:**

- /Users/la/Programming/Tovu/apps/website/src/contracts/core/__tests__/unit/assistant-run-events.activity.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/contracts/core/__tests__/unit/chat-delete-grant.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/post/__tests__/post.schedule-featured.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/custom-credentials/__tests__/auth-failure-diagnostic.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/credential-safety/__tests__/probes-and-cards.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/external-mcp/__tests__/unit/operations-tools.unit.test.ts

**PER FILE:**

| Source | Cases added or existing coverage reviewed |
|---|---|
| `assistant-run-events.ts` | Forwarding helpers, terminal copy, SSE decoding, daemon IDs, and supplied carry branch. Reported lines 6/12 are blank in current source. |
| `chat-delete-grant.ts` | Missing/null admin destinations, ordinary tools, missing reader, awaited approval, fresh reads, and revocation propagation. |
| `scheduled-publish.ts` | Missing/null schedules, go-live boundary, display-date fallback, every comparator outcome, and fixed-clock output. |
| `assistant-permanent-deletes-policy.ts` | Both forbidden tools, ordinary tools, and enabled/granted combinations for every eligible delete. |
| `analytics/config.settings.ts` | Unchanged: existing tests already exercise all identified conditional outcomes, including malformed values and fallbacks. |
| `credential-recovery.ts` | Invalid URL, unrelated errors, independent rotation signals, absent/partial diagnostics, and verification outcomes. |
| `destination-exchange.ts` | Missing/unrelated resources, non-save results, failure messages, localization, stored hints, and missing/unreadable storage. |
| `operations-tools.ts` | Nullish input, missing/non-string/oversized IDs, trimming, maximum length, and contributor wiring. |

**UNREACHABLE:** None identified.

**NOT DONE:** Tests, typecheck, builds, and coverage were not run, as instructed. The verifying agent must confirm 100% and reconcile analytics’ previously measured gaps. No git state changes were made.
