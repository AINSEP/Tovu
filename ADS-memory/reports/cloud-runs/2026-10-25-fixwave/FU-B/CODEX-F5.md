Code Inspection(Review): Personas loaded: Code Inspection + Refactor, for test integrity and behavior preservation.

Reviewed F5 through `3eb7436e`.

- **Medium — incomplete bug fix:** `packages/analytics/src/ingest.ts:441` discards fields after the second `/`. Thus malformed `excludedIpRanges: ["10.0.0.0/0/24"]` still produces a zero mask and drops every IPv4 visitor. This pre-existing variant remains in the rewritten parser. **Smallest fix:** require exactly two slash-separated fields and add an ingest regression asserting acceptance for this malformed range.
- **Low — timing-dependent test (F7.1):** `packages/agent-plugins/src/lifecycle/__tests__/unit/error-codes-and-grammar.unit.test.ts:62` checks only that elapsed time exceeds 15 ms. An incorrectly shortened timer can pass when scheduling delays resume the test late. **Smallest fix:** control `node:timers/promises`, assert the requested delay is forwarded, and verify settlement through controlled resolution.

Both extractions preserve behavior. The empty/negative-prefix analytics bug is real, and its regression test was committed before the fix. No other substantive test weaknesses or resource leaks identified in the diff; owner-approved behaviors are untouched.

Static review only; no edits, tests, or servers run.
