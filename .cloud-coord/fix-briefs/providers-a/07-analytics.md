Code Inspection(Review): Personas used: code-inspection, security, tdd.

| Sev | repo:file:line | Problem | Concrete fix |
|---|---|---|---|
| HIGH | Tovu:`apps/website/src/features/analytics/jini-adapters.ts:3` | Imports new Jini exports, but `package-lock.json:2826` still pins analytics **0.2.1**. Jini lists forwarding as unreleased. A clean install cannot obtain the new exports from the sibling source branch. | Publish the changed Jini packages, then update Tovu’s dependency minimums and lockfile. |
| HIGH | Jini:`packages/analytics/src/forwarding.ts:59` | Vendor projection copies `path` unchanged. Ingestion only removes query/fragment (`ingest.ts:523`), so `/users/alice@example.com` reaches the vendor despite the PII-free contract. | Apply a shared path privacy check before forwarding; cover literal and encoded identifiers with regression tests. |
| HIGH | Jini:`packages/analytics/src/forwarding.ts:167`; Tovu:`apps/website/src/features/analytics/jini-adapters.ts:50` | Arbitrary thrown messages reach logs unchanged. A forwarder exception containing its credential or hit payload leaks that data. Constructor failures are also logged verbatim in Tovu’s `forwarding.ts:99`. | Log fixed failure codes and provider IDs; discard untrusted exception text. Test with sentinel credentials and PII. |
| MEDIUM | Jini:`packages/analytics/src/forwarding.ts:62` | `eventProps` retains the primary hit’s object reference, and line 200 shares one projection across vendors. A vendor modifying nested properties changes the `LocalBufferSink` record and other vendors’ input. | Deep-copy the projection separately for each vendor. Test mutations against the primary record and another vendor’s received hit. |
| MEDIUM | Tovu:`apps/website/src/features/agent-plugins/analytics-provider-registry.ts:81` | Contributions omit read/import recovery policies. The shared loader propagates unhandled file-read faults; `Promise.all` at line 109 then discards healthy forwarders and hooks together. This violates per-plugin failure isolation. | Supply the existing loader’s per-plugin recovery policies and test an unreadable manifest alongside healthy contributions. |
| MEDIUM | Tovu:`apps/website/src/features/analytics/forwarding.ts:36` | Provider TTL caching is reusable platform behavior implemented in Tovu, contrary to the binding Jini-first ownership rule. It depends entirely on injected, product-neutral ports. | Move the cache mechanism into Jini; retain Tovu’s site-specific bindings. |
| MEDIUM | Tovu:`apps/website/src/features/agent-plugins/analytics-provider-registry.ts:60`; Jini:`packages/core/src/provider-registry.ts:200` | New public APIs violate the required two-object signature: the parser accepts a scalar, and result factories omit the optional object. | Use `(requiredObj, optionalObj = {})` and update callers. |
| MEDIUM | Tovu:`apps/website/src/features/analytics/__tests__/forwarding.test.ts:51` | The test promises no plugin loading but never asserts `calls.load`. The unconditional load at production line 70 survives every assertion. This matches **F6.1**; neighboring tests do not verify that guarantee. | Short-circuit forwarding resolution for `"local"` before loading providers, and assert `calls.load === 0`. |

**Rules check**

- Plugins never import each other: **OK** in reviewed changes.
- Generic code lives in Jini: **violated** — Tovu `forwarding.ts:36`.
- Two-object API signatures: **violated** — Tovu `analytics-provider-registry.ts:60`; Jini `provider-registry.ts:200`.
- Dependencies injected as ports: **OK** in reviewed additions.
- React components receive data through props: **OK / N/A** — no component changes.
- Cyclomatic complexity ≤10: **OK by manual inspection of new functions**; mechanical measurement not run.
- Existing “why” comments preserved: **OK** — changed sink rationale is updated in place.
- Schema changes use ADR-066 TypeScript migrations: **OK / N/A** — no schema changes.
- No data loss: **violated for the Jini memory primary** — mutable alias at `forwarding.ts:62`.
- `// TEMP: replaced by shared helper`: **OK** — none added.

Tests, builds, and metrics were not run, as instructed; reported coverage remains unverified. Architecture chapters 13/14 and the governance ADR index were unavailable at the reviewed Tovu tip.

**Verdict: MERGEABLE AFTER FIXES** — dependency integration, PII handling, logging, and isolation defects require correction before merge.
