Code Inspection(Review Mode): Personas used: code-inspection + security + tdd.

Static review of Tovu `e07b1dd2` and Jini `ddc1e606`. No files changed or tests run; reported coverage remains unverified. References below are branch-tip lines.

| Sev | repo:file:line | Problem | Concrete fix |
|---|---|---|---|
| HIGH | Jini:packages/core/src/provider-registry.ts:145 | `contribute()` calls validation without catching exceptions. A throwing validator or provider getter escapes through `contributeProviders()`, violating the promised plugin refusal policy and potentially aborting boot. | Catch failures at the plugin registration boundary, record an `invalid_provider` refusal, and continue. Test a throwing validator followed by a valid contribution. Preserve core’s throwing policy. |
| HIGH | Jini:packages/agent-plugins/src/lifecycle/provider-contribution.ts:57 | The contribution wrapper inherits propagating read/import/validation failures unless callers supply recovery policies. Its “every failure is a refusal” promise is false. The test at `lifecycle/__tests__/provider-contribution.test.ts:80` explicitly expects rejection, encoding the wrong contract (F4.6). | Provide safe per-plugin read recovery and per-descriptor exception handling by default. Verify one broken contribution does not prevent later contributions loading. |
| HIGH | Tovu:apps/website/src/server/runtime/composition/webhook-delivery-worker.ts:138 | After one second, `stop()` returns while delivery continues. Shutdown can then close storage beneath the batch. Claims are persisted as `delivering`, and `platform/db/repos/webhook-repo.ts:227` only selects `pending`, so interrupted deliveries remain stranded permanently. | Propagate cancellation, settle active work and release unattempted claims before storage closes. Add expired-claim recovery with stable delivery IDs and ownership fencing. Test shutdown and restart against persistent storage. |
| MEDIUM | Tovu:apps/website/src/server/runtime/composition/webhook-delivery-worker.ts:171 | The single-flight worker supplies no total request deadline. Jini’s delivery request sets only `timeoutMs` (`packages/integrations/src/webhooks/delivery.ts:331`), which the guarded transport treats as socket inactivity. A receiver that keeps trickling data can monopolize the worker and delay every other delivery. | Add a bounded `totalDeadlineMs` and shutdown signal to webhook requests through the existing guarded client. Test a continuously active, slow response. |
| MEDIUM | Jini:packages/agent-plugins/src/lifecycle/provider-contribution.ts:11 | The new unconditional import requires `core/provider-registry`, but agent-plugins still permits core `^0.4.3` (`packages/agent-plugins/package.json:137`). Those allowed older cores lack this export; importing the lifecycle barrel can fail before any provider is loaded. | Raise peer and development dependency minimums to the first core release containing this subpath, and release core first. |
| MEDIUM | Tovu:apps/website/src/platform/mail/sender-identity.ts:64; apps/website/src/server/runtime/composition/webhook-delivery-worker.ts:112 | The sender resolver and generic scheduling/single-flight lifecycle are reusable platform behavior implemented in Tovu. This violates the binding **Jini First** owner rule. | Move reusable behavior into Jini with injected ports. Keep Tovu’s setting reads, fallback identities, egress policy and serving wiring as adapters. |
| MEDIUM | Jini:packages/core/src/provider-registry.ts:46, :200 | The frozen public methods and result constructors omit the required second optional object. Convention-compliant calls such as `providerOk({ value }, {})` fail TypeScript checking. | Add the reserved optional-object parameter to these public boundaries before freezing the contract. |
| MEDIUM | Tovu, **email-dns branch**:apps/website/src/features/agent-plugins/mail-adapter-registry.ts:142, :212 | V1 manifests accept hyphenated IDs, then submit them unchanged to the underscore-only registry. Previously valid adapters such as `my-mail` are refused. The test at `__tests__/unit/mail-provider-contribution.unit.test.ts:93` accepts this compatibility loss. | Preserve legacy public IDs through a collision-checked registry-key alias, including selection and credential lookup. Test successful delivery through a legacy ID. |

**Branch comparison**

All four comparison branches already contain byte-identical copies of both shared helper files.

| Branch | Compatibility result |
|---|---|
| storage | Uses the shared registry and `s3_compatible`; no helper-shape mismatch found. Inherits the exception-policy gaps above. |
| mediagen | Already maps legacy IDs to underscore registry keys while preserving public IDs (`Jini:packages/integrations/src/media-providers/dispatch/media-provider-registry.ts:47`). Its outer load catch drops the entire plugin batch on a loader exception (`Tovu:apps/website/src/features/media-generation/media-provider-registry.ts:60`). |
| analytics | Uses the shared registry, context and result types. Both contribution definitions omit recovery policies (`Tovu:apps/website/src/features/agent-plugins/analytics-provider-registry.ts:81`), inheriting the loader failure problem. |
| email-dns | Mail and DNS already use the shared types and registry. The remaining concrete migration mismatch is the V1 mail ID grammar described above. |

The webhook SSRF path uses HTTPS-only policy, rejects private addresses, pins resolved peers and follows no redirects. Persistent enqueue deduplication and atomic claiming exist; interrupted-claim recovery is the missing reliability boundary.

**Rules check**

- Plugins never import each other: **OK** in reviewed changes.
- Generic code in Jini; site-specific adapters in Tovu: **violated** — sender resolver and worker lifecycle locations above.
- APIs use `(requiredObj, optionalObj = {})`: **violated** — Jini `provider-registry.ts:46`, `:200`.
- Dependencies injected as ports: **OK** in the new logic.
- React components receive data through props: **OK** — no React changes.
- Cyclomatic complexity ≤10: **OK by manual inspection of new functions**; metrics were not executed.
- Existing “why” comments preserved: **OK** in reviewed diffs.
- Schema changes only through ADR-066 TypeScript migrations: **OK** — no schema changes in this diff.
- No data loss: **violated** — webhook shutdown can strand durable claims.
- No unflagged `// TEMP: replaced by shared helper`: **OK** — none found.

**Verdict: MERGEABLE AFTER FIXES** — plugin failures can escape the refusal boundary, and routine webhook shutdown can permanently strand deliveries.
