Code Inspection(Review): Personas used: code-inspection + security + tdd.

Reviewed branch snapshots only. No tests, builds, installs, servers, or metrics were run.

| Sev | repo:file:line | Problem | Concrete fix |
|---|---|---|---|
| HIGH | `tovu:apps/website/src/server/runtime/composition/modules/site-search.ts:7` | Production imports `@jini-ai/search`, but neither manifest nor lockfile declares it. A clean installation cannot resolve the application’s imports. | Publish the required Jini packages, then declare and lock compatible versions in Tovu. |
| HIGH | `tovu:apps/website/src/server/runtime/composition/modules/site-search.ts:238` | Plugin activation is checked only during boot loading. Disabling Meilisearch afterward leaves its cached provider operational, continuing vendor queries and content uploads. Context resolution at line 203 checks registration only. | Recheck durable activation before provider calls and revoke cached contributions when disabled. Test disabling an already-running search provider. |
| HIGH | `tovu:content/agent-plugins/meilisearch/providers/meilisearch.mjs:410` | Revision comparison reads processed documents, then queues an unconditional replacement. Queue tombstone revision 5, then upsert revision 3 before completion: both pass the read check, and revision 3 resurrects the document. “One writer” does not serialize concurrent indexer calls or pending tasks. | Serialize revision decisions and writes through task completion with durable coordination, or use backend revision-conditional writes. Add overlapping-write conformance cases. |
| HIGH | `jini:packages/search/src/indexer.ts:191` | An old task’s completion unconditionally replaces bookkeeping. If revision 2 becomes pending while reconciliation awaits revision 1, the older completion overwrites revision 2’s task and status. A subsequent revision-2 failure then has no tracked retry. Tovu’s SQL upsert is unconditional too (`index-state-store.ts:93`). | Settle rows using compare-and-swap against the observed revision and task identity. Test an event arriving while reconciliation is awaiting a task. |
| MEDIUM | `jini:packages/search/src/contract.ts:228` | Index-name normalization is lossy: `site-a` and `site_a` produce identical names; long identifiers sharing the retained prefix also collide. Dropping one site’s generation can delete another site’s index. | Derive names from a collision-resistant digest of the complete identity tuple; retain the generation distinctly. Add collision assertions. |
| MEDIUM | `jini:packages/search/src/indexer.ts:244` | Reconciliation applies its limit before excluding exhausted failures. With 50 oldest rows at `maxAttempts`, every default sweep selects and skips those same rows, permanently starving later pending/unknown work. | Exclude exhausted failures before limiting, or paginate through candidates. Test exhausted rows followed by actionable work. |
| MEDIUM | `jini:packages/search/src/indexer.ts:294` | The result of `dropIndex` is discarded and bookkeeping deleted even after rejection or an indeterminate outcome. The replaced target leaves the active/building pointers, so maintenance never retries cleanup; old vendor content remains indefinitely. | Persist a cleanup job until deletion is confirmed, including recovery after unavailable credentials/providers. |
| MEDIUM | `tovu:apps/website/src/features/site-search/cms-document-source.ts:10` | HTML-page edits emit no indexing event. The advertised maintenance backfill cannot repair edits after its watermark is complete: `jini:packages/search/src/indexer.ts:303` skips that source forever. Search retains removed text until a manual rebuild. | Emit the existing update event from successful HTML writes, or provide an incremental rescan mechanism. Test an edit after initial backfill finishes. |
| MEDIUM | `jini:packages/search/src/testkit/conformance.ts:302` | The isolation case changes index name alongside site, so index isolation masks missing site/workspace filtering. The kit also never exercises `query.filters`, and its matching fixtures cannot reject a provider that substitutes the shared term for every nonempty query. Such broken implementations can pass the owner’s required kit. **F4.3/F4.4/F6.2.** | Test mixed tenants within one index, typed matching/nonmatching field filters, and unrelated query text. Add deliberate broken-provider checks for each. |
| LOW | `tovu:apps/website/src/features/site-search/settings.ts:27` | New public helpers violate the required object-boundary signature: `isSearchProviderId(value)` takes a scalar; `toNowIso` and `isRowLive` have similar violations (`cms-document-source.ts:57`). | Use `(requiredObj, optionalObj = {})` and update callers. |
| LOW | `tovu:content/agent-plugins/meilisearch/providers/meilisearch.mjs:272` | Task waiting reaches directly for `setTimeout`, without an injected sleep/timer port. This violates the explicit dependency-injection rule and forces timing tests onto real timers. | Supply a sleep port through provider context, defaulted at composition. |

**Rules check**

- Plugins never import each other: **OK**.
- Generic code in Jini; CMS-specific bindings in Tovu: **OK** for the reviewed boundaries.
- `(requiredObj, optionalObj = {})` signatures: **violated** — `tovu:apps/website/src/features/site-search/settings.ts:27`.
- Dependencies injected as ports: **violated** — `tovu:content/agent-plugins/meilisearch/providers/meilisearch.mjs:272`.
- React components receive data through props: **OK** — no changed React components.
- Cyclomatic complexity ≤10: **unverified** — mechanical measurement was prohibited.
- Existing “why” comments preserved: **OK** — no explanatory rationale removed.
- ADR-066 TypeScript migrations only: **OK** — `tovu:apps/website/src/platform/db/migrations/0023_search_index.ts:36`; no new Drizzle migration.
- No data loss: **violated for derived search state** — `jini:packages/search/src/indexer.ts:191`; no CMS-source deletion found.
- `// TEMP: replaced by shared helper`: **OK** — none found in the diff.

Filter values are quoted and escaped; browser responses contain no provider credentials. The serving gate precedes search registration at this tip. The requested architecture chapters and project-memory file were absent from the reviewed Tovu snapshot.

**Verdict: NOT MERGEABLE** — clean-install resolution, plugin revocation, and revision/deletion consistency have verified blockers.
