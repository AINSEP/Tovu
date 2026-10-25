Code Inspection(Review): Personas used: code-inspection, security, TDD.

Static review of the specified branch tips only. No files changed or tests/builds run; reported coverage remains unverified.

| Sev | repo:file:line | Problem | Concrete fix |
|---|---|---|---|
| HIGH | `Jini:packages/devops/src/dns/plan.ts:221` | Address replacement runs even for TXT/MX-only requirements. With an existing apex A record and a new SPF requirement, `desired` addresses are empty and lines 127–129 generate an A deletion. Instructions expose that deletion to the operator. | Skip address replacement when no address requirement exists. Add a regression proving SPF/MX additions preserve A/AAAA records. |
| HIGH | `Jini:packages/devops/src/dns/plan.ts:127` | Destructive changes ignore `managedBy`. Foreign or unowned records become deletes, and same-type updates replace their entire value set at line 135. | Preserve foreign/unknown records and return an ownership blocker instead of destructive changes. Test `managedBy: 'other'` and absent ownership. |
| MEDIUM | `Jini:packages/devops/src/dns/manual.ts:30` | Inventory is called complete despite omitting supported NS/SRV types. Parsing also silently drops unreadable values at line 106. Consequently, existing NS/SRV records and unrecognized CAA data can disappear from planning. The test at `__tests__/manual-registry.test.ts:45` explicitly expects malformed answers to produce a complete inventory—catalog **F4.6**. | Read supported types needed for conflict detection; treat unrepresentable answers as incomplete. Correct the test and cover NS/SRV coexistence. |
| MEDIUM | `Tovu:apps/website/src/features/domain-dns/dns-changes.ts:117` | Only requirement record names are inventoried. A CAA restriction at `example.com` is never fetched for an A requirement at `www.example.com`, so Jini’s ancestor CAA check sees no restriction and returns no blocker. | Fetch applicable ancestor CAA sets, resolving their authoritative zones, and test inherited restrictions through the real orchestration. |
| MEDIUM | `Tovu:apps/website/src/server/runtime/composition/authoritative-dns.ts:89` | `queryNs` uses the recursive bootstrap resolver, although its port promises the parent’s delegation. Cached or child-published NS data can select stale servers and cause verification to stop as propagated after a registrar change. | Implement parent-authoritative delegation lookup; test differing parent, child, and cached NS sets. |
| MEDIUM | `Jini:packages/devops/src/dns/verify.ts:76` | One matching answer marks a record propagated. An A RRset containing both the required IP and an obsolete IP passes, despite some traffic reaching the obsolete destination. Multiple SPF records similarly pass when one matches. | Verify complete address RRsets and enforce SPF cardinality. Add matching-plus-stale and duplicate-SPF scenarios. |
| MEDIUM | `Tovu:apps/website/src/features/domain-dns/dns-changes.ts:109` | The zone is chosen solely from `hostname`; requirement names are never checked against it. An unrelated name or delegated child is then queried and rendered against the wrong zone. | Resolve and validate authority for every requirement name; reject mixed-zone requests or produce separate zone plans. |
| MEDIUM | `Tovu:apps/website/src/features/domain-dns/binding.repo.ts:67` | An unconditional upsert replaces both requirements and status after asynchronous DNS reads. A slow background verification can overwrite requirements saved by a newer `dns_verify` invocation. | Use versioned compare-and-swap persistence and discard/retry stale observations. Test overlapping sweep and explicit verification with deferred DNS responses. |
| MEDIUM | `Jini:packages/devops/src/dns/records.ts:51` | AAAA values are only lowercased. Equivalent expanded and compressed IPv6 addresses compare unequal, producing unnecessary updates and verification that never propagates. | Canonicalize validated IPv6 values before comparison; test equivalent textual representations. |
| MEDIUM | `Tovu:apps/website/src/server/runtime/composition/authoritative-dns.ts:71` | The reusable Node DNS resolver lives in Tovu, violating the dispatch’s Jini-first owner rule. Its behavior contains no CMS-specific requirement. | Move the resolver into a Jini package and keep Tovu composition thin, injecting any host-specific policy. |
| MEDIUM | `Jini:packages/devops/src/dns/records.ts:19` | Exported `isMxValue(value)` takes a positional value and lacks the required two-object public signature. | Change the public boundary to the mandated object arguments and update callers. |

**Rules check**

- Plugins never import each other: **OK** in the reviewed DNS hunks.
- Generic code in Jini; site-specific code in Tovu: **violated** — `Tovu:apps/website/src/server/runtime/composition/authoritative-dns.ts:71`.
- Public signatures `(requiredObj, optionalObj = {})`: **violated** — `Jini:packages/devops/src/dns/records.ts:19`.
- Dependencies injected as ports: **OK** — `Tovu:apps/website/src/features/domain-dns/dns-changes.ts:58`.
- React receives data through props: **OK**, no DNS React changes.
- Cyclomatic complexity ≤10: **OK by manual inspection of new DNS functions**; no mechanical metrics run.
- Existing “why” comments preserved: **OK** in the reviewed hunks.
- Schema changes through ADR-066 TypeScript migrations: **OK** — `Tovu:apps/website/src/platform/db/migrations/0024_domain_bindings.ts:33`; no new Drizzle migration.
- No data loss: **violated** — `Jini:packages/devops/src/dns/plan.ts:127`; `Tovu:apps/website/src/features/domain-dns/binding.repo.ts:67`.
- No unflagged `// TEMP: replaced by shared helper`: **OK**, none found in scope.

**Verdict: MERGEABLE AFTER FIXES.** Destructive planning, incomplete inventory, and false propagation results make the current DNS guidance unsafe.
