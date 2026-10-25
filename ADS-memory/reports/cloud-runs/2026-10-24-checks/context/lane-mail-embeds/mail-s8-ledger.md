# Mail engine shard 8 handoff — 2026-10-24

Programmer(Execution): Programmer persona loaded for the behavior-preserving host cutover.

Current objective: implementation complete; central runtime/parity verification and published-package adoption remain pending. Do not run tests, install packages, edit Jini, change dependency versions, commit, or modify concurrent work under this dispatch.

Inputs: canonical mail-engine-to-jini.md (SHA-256 0816c7fd9462337b841e2a2de4358a61cc52c7576783ef8de19f57cf0c31d130), binding mail-engine-to-jini-OPUS-REVIEW.md (919a03795181cbe4d3ef67df836b0a5430c2ffd8ac956b295dcedecc482c4b51), current linked jini-int2 platform mail source/types, architecture chapters 13/14, Programmer persona and project memory. The review wins; no separate spec/ADR was produced, as it directs.

## Freeze and scope

The first source check was `git diff c0e4943c5 --` the ten files listed below excluding ports.ts and the new test. Exit 0, empty output. `git log` confirms c0e4943c5 is the shard-1 post-sign-in parity commit. No drift needed porting; no Jini edits. The later committed-base comparison also included ports.ts and mail-provider-catalog.ts and was empty.

Own implementation files:

- apps/website/src/server/runtime/boot/{resolve-mailer,mail-delivery-policy,mail-domain-read,mail-status-cache,sender-domain-verification}.ts
- apps/website/src/platform/mail/{adapter-module,mail-status,ports,provider-error,purpose-gate-probe,sender-domain-verification}.ts
- apps/website/src/server/runtime/boot/__tests__/mail-engine-adoption.unit.test.ts (new)
- ADS-memory/.local-artifacts/tovu-to-jini-extract/SURVEY.md (three-line ownership note)

The current working tree contains many other concurrent changes. None were edited or reverted by this job. In particular, chat/ask-choice, provider catalog/configuration, account-token resolution, HTTP implementation, Resend plugin, manifests/lockfile, mail SQL repositories and parity goldens are outside this change. Scoped git diff confirms the latter preserved paths are unchanged.

## Delivered behavior and ownership decisions

Tovu's resolver now supplies Jini's host ports: explicit settings (`write({setting})` unwraps to the existing positional write), metadata-only readFact, original credential rows for DTO projection, vault decryption, trusted catalog, host copy, provider construction and account resolution. The readFact projection maps vaultRecord.revision to vaultRevision, preserving id:revision:updatedAt fingerprints. Jini owns resolution, ordered metadata/key reads, invalidation generations, single-flight, TTL/status, sender verdicts and domain requirements. All ResolvedMailer controls remain available in the old Tovu call shape.

The delivery wrapper delegates to Jini, injecting unchanged Tovu resendPolicyFor (members => never), existing readTestMode and observe ports. Existing toJiniMailer/toTovuMailer translate mail shapes. No new HTTP adapter: the original resolver and sender-verification cast expressions are retained, and mail-provider-catalog.ts remains byte-identical. Jini passes the positional host HTTP client through to the plugin.

Domain-read/cache/provider-error modules re-export Jini. Shared status, verdict, approval and option contracts use Jini types. Tovu plugin adapter interfaces retain the two host ABIs and inherit only Jini's domainReadConnection property; directly aliasing the complete Jini adapter would break plugin callers. The purpose probe calls isPurposeGateOpen, validates mode at construction as before, and preserves async true/false/throw behavior. DISCARDING_MAILER remains exported solely for public compatibility with the unchanged delivery-visibility tests.

Existing why comments stay with their Jini owners or host bindings (fingerprint ordering, metadata faults, plugin ABI, account isolation, indexed keys, sign-in resend, and diagnostics after delivery). No generic runtime owner was added to Tovu. The existing createPolicyMailer shared-key batch follow-up remains separate, as the review requires.

Reuse: resolver/status/domain behavior; searched Tovu boot/mail and linked Jini mail exports/contracts/source; used Jini createResolvedMailer, createSenderDomainVerification, readMailDomain, createTtlCache, safeMailProviderText and credentialSecrets; owner record binding review changes 2/3/8/9.
Reuse: delivery/gate behavior; inspected Tovu delivery wrapper, composition/site-mailer, mail ABI converters, Jini delivery-wrapper/policy/purpose-scoped-mailer, and real Resend create/domain calls; used Jini createMailPolicyWrapper and isPurposeGateOpen plus existing toJiniMailer/toTovuMailer; owner record binding review changes 4–7. No dependency or provider implementation was copied.

## Verification evidence

- No tests executed, including the newly written tests. No runtime self-validation or coverage run: explicitly forbidden by the dispatch. No live mail/network used.
- Unmodified-tree server typecheck: `node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit --pretty false` exited 0.
- Final production and new-test files passed ESLint with complexity <=10 and sonarjs/cognitive-complexity <=10 (exit 0). No complexity suppression added.
- `git diff --check` passed. The shard-1 parity file remains byte-identical; golden expectations were not regenerated or weakened.
- Post-edit server typecheck exited 2 on six errors exclusively outside this mail change: ask-choice-tool.ts missing questionAnswerLabel/questionAnswerText/SURFACE_QUESTION_META_KEY exports and AcceptedChatInput.surfaceUri; agent-daemon-server.ts string vs literal mcp-ui; composition/deps.ts undefined defaultBundledSourceRoot. All are in concurrently edited files; no mail diagnostics.
- Scoped adoption-test typecheck (`tsconfig.adoption.json` beside this ledger) exited 2 with the four ask-choice-tool.ts diagnostics through transitive dependencies; no adoption/mail diagnostics. Do not treat this as a green typecheck.
- The platform package symlink was already linked to ../../../jini-int2/packages/platform. No install/relink/version bump was needed or performed. Published-package validation remains the release gate and is not proven by local links.

Adoption tests added: direct re-export ownership, real Resend positional POSTs and indexed batches, members resend policy reaching ledger reserve, domain forbidden fallback to the plugin-declared account origin, no cross-workspace requirements access, sending-key isolation after domain reads, unwrapped initialization write, and invalidate immediately refusing further sign-in delivery. Existing parity/lifecycle/policy/account-token suites retain redaction, rotation, approval drift, capture refusal, single-flight and account authorization cases.

Architecture audit: PASS for inspected change boundaries (Jini ownership, host ports, original plugin HTTP casts, vendor plugin isolation, no SQL/migrations). GOV-ADR-003 was consulted for platform scope; no DDL is generated. No ownership deviation. Runtime acceptance remains unverified.

Function quality outcome: INCONCLUSIVE for runtime acceptance because tests were explicitly deferred; no unresolved static findings, zero Critical/High findings.

| Unit | Disposition | Findings | Local fix attempted |
| --- | --- | --- | --- |
| createResolvedMailer host binding | NO_RECORDED_FINDINGS | none in static review | engine lifecycle removed; converters reused |
| readCredentialFact | NO_RECORDED_FINDINGS | none in static review | vault revision explicitly projected; metadata-only |
| unconfiguredMessage | NO_RECORDED_FINDINGS | none in static review | legacy product copy unchanged; object boundary |
| createMailPolicyWrapper binding | NO_RECORDED_FINDINGS | none in static review | Jini wrapper owns policy/limiter/observer lifetime |
| sender-verification binding | NO_RECORDED_FINDINGS | none in static review | original HTTP cast retained |
| createMailPurposeGateProbe | NO_RECORDED_FINDINGS | none in static review | construction-time mode validation retained |

Zero-findings skepticism: rechecked field/variable meanings, vault revision mapping, settings write shape/receiver, both ABI directions, async probe failures, invalidation/control surface, observer/resend option shapes, and account credential isolation. No new collection fan-out, cache, retry loop, implicit dependency, or provider branch. readCredentialFact retains one workspace-list O(c) scan; all other new bindings are O(1). The unchanged parseSmtpEndpoint positional scalar and callback/port signatures are intentional public-compatibility exceptions to the two-object convention. Inline documentation was updated on the changed bindings. Aggregate evidence is written in adoption/parity tests but remains unexecuted.

## Next actions — central validation only

Run from the Tovu clone after concurrent dependency/type fixes settle:

```sh
node --import tsx --test --experimental-test-module-mocks --test-concurrency=1 \
  apps/website/src/server/runtime/boot/__tests__/{mail-engine-adoption,mail-engine-parity,resolve-mailer,resolve-mailer-lifecycle,mail-delivery-policy,mail-status-cache,mail-plugin-account-token}.unit.test.ts \
  apps/website/src/server/runtime/boot/__tests__/sender-domain-verification.test.ts \
  apps/website/src/server/runtime/composition/__tests__/site-mailer.unit.test.ts \
  "apps/website/src/platform/mail/__tests__/**/*.test.ts" \
  "apps/website/src/features/mail-status/**/*.test.ts" \
  "apps/website/src/features/domain-dns/__tests__/mail-dns-status.test.ts" \
  "apps/website/src/features/members/**/*.test.ts" \
  "apps/website/src/server/__tests__/routes/member*.test.ts" \
  "apps/website/src/server/__tests__/routes/members-public*.test.ts" \
  "apps/website/src/server/inbound/admin-http/routes/settings/__tests__/mail-cache-invalidation.unit.test.ts" \
  "content/agent-plugins/resend/__tests__/*.test.mjs"
```

Jini engine regression, from its clone (no Jini edits made here):

```sh
pnpm --dir /Users/la/Programming/tovu-integration-clones/jini-int2 --filter @jini-ai/platform exec vitest run --maxWorkers=2 --minWorkers=1 src/mail
```

Then run the published-package typecheck/release gate after the owner publishes and adopts the intended version. Suggested next assignee: dispatching Coordinator / central TestRunner. Rollback is reverting only the listed mail cutover files; no data migration or credential re-entry is involved. No commit or push was attempted.
