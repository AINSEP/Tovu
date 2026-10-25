# S2 handoff contracts

Binding inputs: `google-login-design.md` amended by `OPUS-REVIEW.md`, plus the owner’s 2026-10-24 custom-domain code decision. Only this directory is S2-owned.

## S4 preset

`providers.ts` reads the shape currently shipped in `content/agent-plugins/google-login/tovu-login-providers.json`: `{schemaVersion:1, providers:[{id,label,issuer,authorizationEndpoint,tokenEndpoint,jwksUri,scopes,signingAlgorithm,clientAuthentication,pkce,credentialLabel,credentialCardTarget,authoritativeEmailDomains,hostedDomainClaim}]}`. S256, RS256, client_secret_post and exactly openid/email/profile are required in v1. Domain authority stays plugin data. The pinned issuer's nonempty hosted-domain claim establishes Workspace mailbox authority, including email aliases.

`loadBundledLoginProviders({sourceRoot})` must receive the product-owned `content/agent-plugins` root. `loadLoginProviders({workspaceId,loadContributions,bundledProviders})` requires the boot-bound lifecycle loader; it explicitly requires activation and compares installed presets with shipped pins. No installed/workspace root may be passed as `sourceRoot`.

## S3 protocol and linking

`beginOidcLogin({deps,input:{workspaceId,providerId,connectMemberId?}})` returns `{authorizationUrl,expiresAt,browserBinding,returnPath:'/account'}`. Set the 43-character binding in an HttpOnly Secure SameSite=Lax callback-path cookie, max-age 600. Callback clears it even on failure. Reject duplicate cookies. Never accept binding from query/state.

`OidcLoginDeps` supplies clock, randomBytesFn, guarded httpPorts, site sealer/keyring, origin registry, and fresh resolveProvider/resolveClient functions. Provider lookup reloads admission via `loadLoginProviders`; credential lookup calls `resolveLoginCredentials`. `hasLoginCredentials` permits provider-list filtering without opening secrets.

`completeOidcLogin({deps,input:{workspaceId,providerId,browserBinding,params:{state,code?,error?},connectMemberId?}})` returns `{identity,startedAt,authenticatedAt,connectMemberId?,returnPath:'/account'}`. Start and callback pass a connectMemberId ONLY from a currently validated member session; missing/different member on callback fails the state binding. For sign-in both omit it. `startedAt` comes from validated sealed state. Errors expose only `MemberLoginError.code`.

`resolveFederatedIdentity({deps,input:{workspaceId,identity,startedAt,connectMemberId?,emailProof?:{challengeId,code},userAgent?,ip?}})` returns `{kind:'signed_in',result:{member,session,rawSessionToken}}` or `{kind:'email_verification_required',email,providerId}`. Identity/startedAt/intent must come from protocol completion or a server-authenticated continuation, never JSON claims supplied by a visitor.

The link deps extend `MembersWriteServiceDeps` with S1’s `identities:MemberExternalIdentityRepoPort` and kernel-bound `transaction`/`lockKey` functions. ALL adapters must use the same kernel. Lock order is `members:external-identities:<workspaceId>` then `trash:member:<workspaceId>:<memberId>`; S3 unlink takes the same locks. A marker is retained; only signed-in connect sets `allowRelink:true`.

## Custom-domain continuation — S3 integration required

No link/session is issued when the first association needs email proof. `requestLoginEmailProof({deps,input:{workspaceId,email}})` calls the existing sign-in challenge/mail owner and returns its challenge handle. Retain the validated identity/intent/start time using `sealLoginEmailContinuation({deps,input:{workspaceId,providerId,connectMemberId?,browserBinding},login})`. On code submission call `openLoginEmailContinuation({deps,input:{workspaceId,providerId,connectMemberId?,browserBinding,continuation}})` before `resolveFederatedIdentity` with that retained input plus `emailProof`. The continuation expires ten minutes after the original start and binds to the same browser, member intent, provider and current client. Keep its binding in an HttpOnly Secure SameSite=Lax cookie scoped to the code submission endpoint; clear the original callback cookie as usual. Do not redeem the provider code twice, trust a visitor-supplied identity, or add a login-attempt table. Proof consumption uses `completeSignIn`, outside the link transaction so failed attempts cannot roll back the guessing limit; its intermediate session is immediately revoked. Link/session effects remain atomic. This continuation’s HTTP/UI route is outside S2’s file scope and was raised to the Coordinator.

The existing linked issuer/subject bypasses first-link inbox proof even if email changes. A signed-in connect needs no emailed code (it is not an auto-link) and verifies the member's email only when the Google address matches it. Disabled/trashed members, stale redirects after credential revocation, foreign connects and unlink markers fail closed.

## Reuse / review

Reuse: plugin trust and loading — lifecycle contribution loader plus bundled source catalog; protocol — existing `@jini-ai/oauth` begin/complete/validate and sealed-state codec; credentials — custom credential store; member creation — `createMember`; inbox proof — `completeSignIn`; session minting — `issueMemberSession`. No Jini code, dependencies, tokens, attempt tables or provider-specific core branches added. Generic glue stays in Tovu under the binding review’s extraction deferral.

## Validation handoff

ESLint passes with both cyclomatic and cognitive limits of 10; the scoped member-login and members suites pass (Opus check, 2026-10-24). No full typecheck was run (review assigns that to PR CI). Central runner commands, from the Tovu root:

```bash
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks --test-concurrency=1 "apps/website/src/features/member-login/**/*.test.ts" "apps/website/src/features/members/__tests__/*.test.ts"
npx eslint --rule 'complexity: ["error", 10]' --rule 'sonarjs/cognitive-complexity: ["error", 10]' apps/website/src/features/member-login
```

The member suite command includes existing password/code/reset/set-password regression coverage. New S2 protocol tests use real AES-GCM, real RSA signatures and Jini validation against a hermetic token/JWKS transport; transaction tests use SQLite and PGlite. A real Google smoke check and S3/U1 continuation route/UI integration remain central-runner responsibilities.
