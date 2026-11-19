# L12 — single-call consumers (3 edges, I + S) — one repo (Tovu), Codex-ready; merge before L15

- `deployments/static-publish/publish-consent.ts:1,10` (`deploymentRefusal`) → the consent-readiness
  deps carry `refuse(problems)`; composition passes consent's `deploymentRefusal`.
- `mail-status/use-readiness.ts:24,114` (`evaluateLaunchGate` + types) → readiness deps
  `evaluateLaunchGate` (required), types declared locally as the subset passed/read.
- `member-login/link-service.ts:5-7` → one **required** `members` port on `MemberLoginLinkDeps`
  (`:11`) with **all five** operations the file calls (judge 3 F10), under their own names and signatures:
  `completeSignIn` (`:78`), `createMember` (`:124`, including the optional `{ deferCreatedNotification: true }`),
  `issueMemberSession` (`:126`, including `{ userAgent, ip }`), `notifyMemberCreated` (`:144`, not awaited),
  and `requestSignInLink` (`:170`). Call sites change only to `deps.members.<name>(...)`.
  **Preserved exactly:** the proof error mapping (whatever `completeSignIn` throws at `:78` is
  handled by today's code unchanged), `requestLoginEmailProof`'s translation of any
  `requestSignInLink` failure to `MemberLoginError({ code: "LOGIN_UNAVAILABLE" })` (`:169-173`), and
  the notification order: create with the notification deferred, link the identity, then
  `notifyMemberCreated`. `requestLoginEmailProof(required)` reads the port as
  `required.deps.members.requestSignInLink`. Its callers already pass `deps: deps.links`
  (`server/inbound/public-http/routes/members/oidc-callback.ts:51`), so they are unchanged.
  The record types (`MemberExternalIdentityRepoPort`, `MemberSignInResult`, `MembersWriteServiceDeps`,
  `MemberExternalIdentityRecord`, `MemberRecord`) become local subsets of the members read.
  **Binding:** where `links: MemberLoginLinkDeps` is built for `oidc-deps.ts:14`, in
  `server/runtime/composition/modules/members.ts`. Set `members` to the five functions from
  `#src/features/members/index`. Fixtures: `features/member-login/__tests__/link-service{,.dialects}.test.ts`
  pass the real functions. L15 must not edit `modules/members.ts` (its row 9 does not), and L12 merges first.

**Characterization (named risks):** *publish proceeds without consent readiness* →
**new** `features/deployments/static-publish/__tests__/publish-consent.unit.test.ts` (no test imports `publish-consent.ts` on the tip; pin: consent unavailable → refusal, no publish started); *newsletter/confirmation readiness
differs* → `features/mail-status/__tests__/delivery-visibility.unit.test.ts`, `server/runtime/composition/__tests__/site-mailer.unit.test.ts`; *OIDC sign-in creates duplicate
members or skips the created notification* → `features/member-login/__tests__/link-service{,.dialects}.test.ts`
plus one composed-deps case through `modules/members.ts`.

**Verify:** INDEX-v4 § Gate — run by the verifier on parent and candidate; the executor runs nothing. Named test files = the characterization files above plus the list at the end of this sheet.

Base: Tovu `2d82735a` (integ/merge-3 tip). Expected edge removals: `designs/arch-120/v4/edges/L12.txt` (every line absent from the candidate's `check:architecture` output). Every source line/kind/symbol origin: `facts/edges.v3.tsv` rows with lane `L12`.

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

#### Named test files (verifier runs them; every `*.test.ts` that imports a changed source file or a moved symbol's old home; AST index of the tip): 4 files

```text
  apps/website/src/features/mail-status/__tests__/delivery-visibility.unit.test.ts
  apps/website/src/features/member-login/__tests__/link-service.dialects.test.ts
  apps/website/src/features/member-login/__tests__/link-service.test.ts
  apps/website/src/server/runtime/composition/__tests__/site-mailer.unit.test.ts
```
The verifier runs every file above plus the new characterization tests this sheet names, on the parent and on the candidate (INDEX-v4 § Gate).
