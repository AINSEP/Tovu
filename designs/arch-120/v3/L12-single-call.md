# L12 — single-call consumers (3 edges, I + S)

- `deployments/static-publish/publish-consent.ts:1,10` (`deploymentRefusal`) → the consent-readiness
  deps carry `refuse(problems)`; composition passes consent's `deploymentRefusal`.
- `mail-status/use-readiness.ts:24,114` (`evaluateLaunchGate` + types) → readiness deps
  `evaluateLaunchGate` (required), types declared locally as the subset passed/read.
- `member-login/link-service.ts:5-7` → one **required** `members` port on the link-service deps:
  `{ completeSignIn, createMember, issueMemberSession, notifyMemberCreated }` (exactly the four
  called at `:78,124,126,144`; `requestSignInLink` only if rg shows a call) built in
  `server/runtime/composition/modules/members.ts`; record types become local subsets.

**Characterization (named risks):** *publish proceeds without consent readiness* →
**new** `features/deployments/static-publish/__tests__/publish-consent.unit.test.ts` (no test imports `publish-consent.ts` on the tip; pin: consent unavailable → refusal, no publish started); *newsletter/confirmation readiness
differs* → `features/mail-status/__tests__/delivery-visibility.unit.test.ts`, `server/runtime/composition/__tests__/site-mailer.unit.test.ts`; *OIDC sign-in creates duplicate
members or skips the created notification* → `features/member-login/__tests__/link-service{,.dialects}.test.ts`
plus one composed-deps case through `modules/members.ts`.

**Gates:** shared gate, `LANE=L12`.

Base: Tovu `2d82735a` (integ/merge-3 tip). Edge list for G2: `designs/arch-120/v3/edges/L12.txt`. Every source line/kind/symbol origin: `facts/edges.v3.tsv` rows with lane `L12`.

---

### Inventory (TypeScript-AST reverse-import index of tip `2d82735a`, all of `apps/website/src`, prod + tests)

#### Edges
- `deployments/static-publish/publish-consent.ts` -> `consent/service.ts` [I] deploymentRefusal -> consent readiness port
- `mail-status/use-readiness.ts` -> `newsletter/index.ts` [I] evaluateLaunchGate -> readiness deps
- `member-login/link-service.ts` -> `members/index.ts` [I+S] members write ops -> LinkServiceDeps.members port; record types local

#### Exact importers of each changed source file (callers that construct/pass its deps, and tests)
- `features/deployments/static-publish/publish-consent.ts`
    - prod: features/deployments/publish-agent-tools.ts, features/deployments/static-publish/domain-publish-tool.ts
    - tests: 
- `features/mail-status/use-readiness.ts`
    - prod: features/mail-status/delivery-tool-registrations.ts, server/inbound/admin-http/routes/system/mail-activity.ts
    - tests: features/mail-status/__tests__/delivery-visibility.unit.test.ts, server/runtime/composition/__tests__/site-mailer.unit.test.ts
- `features/member-login/link-service.ts`
    - prod: features/member-login/index.ts
    - tests: features/member-login/__tests__/link-service.dialects.test.ts, features/member-login/__tests__/link-service.test.ts

#### G5 suites — exact (every `*.test.ts` that imports a changed source file or a moved symbol's old home; AST index of the tip): 4 files

```
SUITES="
  apps/website/src/features/mail-status/__tests__/delivery-visibility.unit.test.ts
  apps/website/src/features/member-login/__tests__/link-service.dialects.test.ts
  apps/website/src/features/member-login/__tests__/link-service.test.ts
  apps/website/src/server/runtime/composition/__tests__/site-mailer.unit.test.ts
"
```
Add the new characterization tests named above to `SUITES`. Barrel-importing suites (`*/index.ts` homes) are large by nature; run them all — G5 is the lane's behaviour net.
