# Feature-specific review gate reconciliation

Software Architect + Spec (Direct): written evidence reconciliation for TRIAGE s3-23 / s3-25 / s3-30 (original TODO lines 1107, 1115, 1143).

Date: 2026-10-17. Inputs: the three pipeline ledgers, SPEC-003 verification packet, historical CR-003 and SEC-003 reports, ADR-047 and its index row, and the July widgets external audit. Source observations below are confined to final source under `apps/**`; Jini internals, historical source versions, and generated output are not audited. Tests and network/audit commands were not run. No new accepted result is asserted.

## SPEC-003 — a report exists; acceptance is still unproven

The TODO premise that inspection/security have never run is contradicted by:

- `ADS-memory/reports/code-review/CR-003-site-install-dir-2026-07-28.md:10`: **CHANGES REQUIRED**. Required findings CR-R01–08, with an architecture routing request for theme precedence/recovery placement and missing integration proof.
- `ADS-memory/reports/security/SEC-003-site-install-dir-2026-07-28.md:7`: **one High**, with explicit sign-off required before shipping; SEC-003-01 names default credentials plus all-interface binding. The report’s §Overall threat assessment retains that ship gate.

These are historical failed results, not a current review. The verification packet’s July PASS certifies the earlier test run, not closure of subsequent inspection/security findings.

Current-source checks establish why copying the old findings verbatim as present defects would also be wrong:

| Historical issue | Current source evidence | Disposition |
|---|---|---|
| CR-R01 / SEC-003-03: cwd-based theme/upload paths | `apps/website/src/cli/commands/serve.ts:282` supplies target-relative uploadsDir; `:286` supplies target-relative themesDir. | Original wiring is changed. Needs the corresponding foreign-cwd/move-path integration result before closing. |
| CR-R03: missing shared boot lifecycle | `apps/website/src/cli/commands/serve.ts:322` invokes runBootLifecycle(buildBootModules(...)). | Missing-call premise no longer holds; ordering/recovery correctness is not certified here. |
| SEC-003-01 / 06: all-interface default listener | `apps/website/src/server/runtime/boot/bind-host.ts:50` declares 127.0.0.1 default; serve resolves the host and passes it to listen, with a non-loopback warning (`serve.ts:351`, `:405`). | Default-listener premise is changed. Credential/readiness behavior and explicit LAN opt-in still require current security review. |
| CR-R02 / 04 / 05 and SEC-003-02 / 04 / 05 | Package layout/assets, post-serve proof, corrupt metadata, override guards and terminal output have no fresh accepted dispositions located in this pass. | Unverified; do not mark fixed from neighboring changes or old test counts. |
| CR-R06–08 | Assessment/complexity records were review-process findings. | Reassess under the governing current inspection rules; do not silently carry an obsolete raw complexity threshold forward as a new finding. |

**Item 1107 NOT DONE:** written review reconciliation delivered, but a current full inspection/security acceptance would require a fresh scoped evidence packet and disposition of the historical findings. Docs-only work cannot substitute for that proof.

## Three-feature ledger outcomes

| Feature | Code Inspection evidence | Security evidence | Accepted current gate |
|---|---|---|---|
| SPEC-003 | July CR-003, CHANGES REQUIRED | July SEC-003, one High | Not established |
| SPEC-005 | No feature-specific implementation inspection result located in code-review/security report filenames; amendment Red-Team is recorded in its own ledger | No matching feature-specific accepted security result located | Not established |
| SPEC-006 | Existing Red-Team is spec review, not implementation inspection; combined amendment review now records a hash blocker | No matching feature-specific accepted implementation security result located | Not established |

The broad `ADS-memory/reports/audit/2026-08-02-03-sunday-monday-code-security-review.md` is identified by the TODO, but cannot be promoted to three accepted feature gates without exact scope, spec/hash binding, finding dispositions and an accepting reviewer. No claim is made that missing filename matches prove no review ever occurred.

Ledger notes now distinguish **historical failed**, **not located**, and **not accepted**, with evidence links. **Item 1115 NOT DONE:** record reconciliation is complete; accepted per-feature results for 005/006 and current acceptance for 003 remain unavailable.

## ADR-047 — preserve the failed audit gate

`ADS-memory/reports/external-audit/runs/20260721T171409Z-adr047-widgets-external-audit-report.md:383` records FAIL: Codex 6.8 / agy 6.0, both below the medium-risk 8.5 floor, plus validated blockers. Its disposition covers missing embed mutation service, reference retraction, read accessors, dual-adapter tests, bounded recent entries, resolver-id dispatch and permission-denial tests. `ADS-memory/reports/architecture/ADR-INDEX.md:60` explicitly says NOT Accepted despite shipped code.

Current tests exist at `apps/website/src/features/widgets/__tests__/integration/embed-service.integration.test.ts` and `embed-service.post-host.integration.test.ts`; their existence is not execution evidence or audit acceptance. Widget behavior now crosses package boundaries; a replacement audit scope must be explicit before inspecting Jini internals (this job’s audit scope is apps only).

**Item 1143 NOT DONE:** required external audit cannot run under the dispatch’s no-network/no-CLI-review-command restrictions, and source/test existence does not resolve the score floor or independent acceptance. ADR status is untouched. Coordinator should construct a current full-state audit packet, map each of the seven prior dispositions to final source and executed evidence, resolve any owner decisions, and commission the required external audit. Preserve the original failure and record the new verdict separately; any residual-risk acceptance must be explicitly made by the owner.

## Handoff

Output: evidence corrections, current source observations and accurate ledger notes. Risk: neither a historical failure nor a small present-source observation proves today’s whole feature safe. Suggested next assignee: Coordinator for a current verification packet and bounded Code Inspection / Security dispatches; independent external auditors for ADR-047. No test run, build, typecheck, dev server, benchmark, network command, commit or push was performed.
