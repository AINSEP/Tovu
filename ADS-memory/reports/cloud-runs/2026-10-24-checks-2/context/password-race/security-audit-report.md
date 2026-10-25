Security(Direct): **Persona: Security**, selected to trace authentication, recovery, browser trust boundaries, and consent handling.

Audited the live source on `restructure/apps-website-phased`, HEAD `beeab39be49231a2afb8cd03222c1f5cb1dc9c9e`. **One High finding.** No files changed or production requests sent.

**1. HIGH — An in-flight password change can overwrite a later recovery/change after its session is revoked**

**VERIFIED:** Read in code and reproduced deterministically with the real password service and in-memory repositories. Production race timing is **INFERRED**.

Affected code:

- [password-auth.ts:158](/Users/la/Programming/Tovu/apps/website/src/features/members/password-auth.ts:158): session and current-password authorization happen before hashing.
- [password-auth.ts:113](/Users/la/Programming/Tovu/apps/website/src/features/members/password-auth.ts:113): after hashing, only member status is rechecked; authorization is not revalidated.
- [password-auth.ts:116](/Users/la/Programming/Tovu/apps/website/src/features/members/password-auth.ts:116): the password write commits before revocation and profile saving.
- [repo.ts:168](/Users/la/Programming/Tovu/apps/website/src/features/members/repo.ts:168): the SQL password update has no expected-password/cutoff condition and does not join the complete password lifecycle transaction.

**Attack scenario:** An attacker possessing a member session and the current password starts `/password/set`. While that request hashes its replacement password, the victim changes or resets their password, revoking the attacker’s session. The earlier request resumes, overwrites the victim’s new password, and only subsequently fails because its profile cutoff is stale. That failure does not undo the password write. The attacker can sign in using their replacement password.

Observed reproduction:

```text
Victim change completed: password=victim-new; attacker session invalid
Attacker request resumed: profile conflict error; password=attacker-new
```

The reset workflow shares this persistence helper.

**Minimal fix:** After hashing, use the existing member lifecycle lock and one transaction to revalidate the presenting session/current credential—or reset authorization and cutoff—then atomically write the password, revoke sessions, and update the profile. Reject stale authorization before any credential write. A profile conflict must roll back the password update.

**Verification:** Add interleaving tests where a victim’s change/reset completes while an attacker’s earlier password request is hashing; assert the earlier request cannot alter credentials afterward. High-severity authentication fix requires human review before shipping.

**Checked and fine**

- **OIDC auto-link — VERIFIED:** `email_verified` must be boolean `true`; authoritative email requires the pinned provider’s configured domain or hosted-domain claim. Other addresses require an emailed code before first anonymous linking. Existing links resolve by issuer/subject. [oidc-login.ts:143](/Users/la/Programming/Tovu/apps/website/src/features/member-login/oidc-login.ts:143), [link-policy.ts:35](/Users/la/Programming/Tovu/apps/website/src/features/member-login/link-policy.ts:35)
- **CSRF — VERIFIED:** Member mutations share an Origin guard; absent-Origin requests require JSON. OIDC `/start` refuses `Sec-Fetch-Site: cross-site` before issuing a binding cookie. [deps.ts:104](/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/routes/members/deps.ts:104), [oidc-start.ts:34](/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/routes/members/oidc-start.ts:34)
- **Redirects/fragments — VERIFIED:** Member return paths reject external/protocol-relative URLs, backslashes and encoded separators; OIDC returns to fixed paths. The script removes credential fragments before requests. [member-auth-script.ts:95](/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/http/site/member-auth-script.ts:95)
- **Sessions/cookies — VERIFIED:** Sign-in mints a fresh bearer; storage receives its digest. Member cookies use `Secure`, `HttpOnly`, `SameSite=Lax`; logout revokes the session. OIDC bindings have scoped cookies and reject duplicate names. [complete-sign-in.ts:20](/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/routes/members/complete-sign-in.ts:20), [write-service.ts:445](/Users/la/Programming/Tovu/apps/website/src/features/members/write-service.ts:445)
- **Enumeration — VERIFIED:** Password failures share a generic response and hash verification, including dummy verification for missing/passwordless accounts. Sign-in/forgot responses precede address lookup and delivery. [password-auth.ts:32](/Users/la/Programming/Tovu/apps/website/src/features/members/password-auth.ts:32), [forgot-password.ts:17](/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/routes/members/forgot-password.ts:17)
- **Challenges/rate limits — VERIFIED:** Fifteen-minute expiry, purpose checks, atomic single-use consumption, and five reserved code attempts. Separate IP/email counters protect issuance/password login. [write-service.ts:357](/Users/la/Programming/Tovu/apps/website/src/features/members/write-service.ts:357), [repo.ts:474](/Users/la/Programming/Tovu/apps/website/src/features/members/repo.ts:474)
- **OIDC state/JWT — VERIFIED:** Browser/member/configuration-bound sealed state, nonce, PKCE and pinned issuer/JWKS validation calls. Tests rejected tampering, expiry, wrong binding, signature, issuer, audience and nonce. [oidc-login.ts:166](/Users/la/Programming/Tovu/apps/website/src/features/member-login/oidc-login.ts:166)
- **SSRF — VERIFIED at host boundary:** Bundled provider admission controls endpoint selection; outbound transport denies private addresses and redirects. [providers.ts:103](/Users/la/Programming/Tovu/apps/website/src/features/member-login/providers.ts:103), [deps.ts:2177](/Users/la/Programming/Tovu/apps/website/src/server/runtime/composition/deps.ts:2177)
- **XSS/secrets — VERIFIED in scoped paths:** Dynamic member/error/provider text uses `textContent`; workspace script input is encoded. Auth failures discard upstream diagnostics; public-site authentication mail captures redact bodies. [member-auth-script.ts:216](/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/http/site/member-auth-script.ts:216), [capture.repo.ts:72](/Users/la/Programming/Tovu/apps/website/src/features/mail/capture.repo.ts:72)
- **Site consent — VERIFIED wiring and isolated handler behavior:** Foreign, opaque and missing origins were rejected without receipt writes; an external return URL became `/`. Cookie flags were secure. Host wiring adds rate limiting and unpredictable receipt IDs. [site-consent.ts:76](/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/middleware/site-consent.ts:76)

**Validation and limits:** All **105 selected tests passed**. The race reproduction and consent probes used memory only. Jini dependency internals and deployed configuration were outside the `apps/**` source audit; session/reset-token CSPRNG entropy is therefore **INFERRED** from the delegated `NodeSessionTokens` implementation, rather than independently source-verified.
