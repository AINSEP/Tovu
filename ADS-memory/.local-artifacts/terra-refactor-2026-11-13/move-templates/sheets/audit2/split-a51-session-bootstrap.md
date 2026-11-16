# SPLIT-A51: session bootstrap (initial-session read, probe/redeem/end decisions, loopback guard) -> `@jini-ai/user-management/session-bootstrap` (templates T-SPLIT, T-MOVE; AUTH PATH, Opus review of every slice)

Written 2026-11-16 against Tovu `integ/wave-b` (`../code`) and Jini `integ/wave-b` (`/home/user/Jini`). Row `audit2:A51`. The listed precondition "audit:B04 (server half, row-167 wave)": audit2 `B04` is the website THEME engine (`features/theme/*`, cms) and shares no file or symbol with this row; the "server half" the row means is the boot-token/local-owner ROUTES in `apps/website/src/server/inbound/admin-http/dev-auth.ts`, which this sheet does NOT touch. Judged independent: no blocker. Execute after wave B merge only because `apps/desktop/src/main/index.ts` is edited by untangle R11 (wave D): text-anchored edit below.

Tier: S1 Sonnet + **Opus review (every decision/guard)**, S2 Sonnet (admin), S3 Sonnet (desktop) + Opus review. est. executor tokens ≈ 36k (S1 18k, S2 8k, S3 10k). No Chrome look required; one manual owed: local-owner auto sign-in on `localhost` and a desktop site window reopen (both unchanged behaviour).

## Findings that change the audit row
1. **Row names `readInitialSession/ensureSession` map to real code**: admin `readInitialAdminSession`/`tryLocalOwnerSession` (`apps/admin/src/lib/local-owner-signin.ts:19-46`) and desktop `ensureSiteSession` (`desktop-auth.ts:384-398`: probe, then redeem only when the probe fails). Both are the same decision shape: "if an identity read succeeds, keep it; else try ONE local bootstrap; else fall back to the ordinary login". Two sheets' worth of transport differ (browser `fetch` via `api.*` vs Electron `net.request` with `useSessionCookies`), so the transport is a PORT and the decisions move.
2. **Four moves, nothing else:** (a) `readInitialSession<T>` + the "try bootstrap, swallow rejection, return null" step; (b) `ensureSession` decision (probe/redeem, `{authenticated, redeemed}`); (c) `assertLoopbackHttpUrl` (guard: parseable, `http:`, host in {`127.0.0.1`, `::1`, `[::1]`}; `localhost` excluded on purpose: a NAME, not a literal); (d) the drained status-request flow shape for redeem/probe/end over a `SessionTransport` port. `redeemBootSession` (:207), `hasValidSession` (:325), `endSiteSession` (:414) keep their Electron-specific request construction in Tovu as the transport adapter.
3. **STAYS in Tovu (confirmed):** route constants (`BOOT_SESSION_PATH`, `LOGOUT_PATH`, `SESSION_PROBE_PATH`), `SESSION_COOKIE_NAME`, `DESKTOP_OWNER_USERNAME`, `sitePartition` (partition namespace `persist:tovu-site-`), `armDesktopOwnerSignIn` (header name `X-Tovu-Desktop-Owner-SignIn`, capability format `^[a-f0-9]{64}$`, the two route names), `isLocalOwnerSignInHost` (admission policy: `localhost`/`127.0.0.1`/`[::1]`), the long safeStorage/keychain rationale (Tovu history). `desktop-mcp-http.ts:4` imports `assertLoopbackAdminUrl`: repointed to the Jini guard.
4. **The two loopback allow-lists are DIFFERENT and stay different** (security parity): browser admission `isLocalOwnerSignInHost` allows the name `localhost` (a browser origin check); the desktop guard forbids it (a literal the shell itself bound). The Jini guard is the desktop one only; the browser admission is injected as `admit`.
5. **Hard auth rules the Jini code must keep, each pinned by a test:** never retry a refused bootstrap; never read identity after a refused bootstrap; the original error (the 401) is rethrown when the bootstrap is refused; `onBootstrapped` fires ONLY after a successful identity read following bootstrap; `redeem` is never called when the probe says valid (713 live session rows incident: `desktop-auth.ts:365-371`); the loopback guard runs BEFORE the credential is put on the wire and REJECTS (async), never throws synchronously.

## Guards (blobs at integ/wave-b)
```
tovu_files:
  - apps/admin/src/lib/local-owner-signin.ts | blob 72111370781b7c3caabc84630addeae8ae6fea0d | keep-reduced
  - apps/desktop/src/desktop-auth.ts | blob 56574dad8af8be340bc8b338b6259939d7bb1e57 | keep-reduced
tovu_tests (parity guards; keep, edit only imports):
  - apps/admin/src/lib/__tests__/local-owner-signin.unit.test.ts | blob 9a662739a0a925f8b4ee7827cbd795655712841e
  - apps/desktop/src/desktop-auth.test.ts | blob 0eb66e1d36090cf0e4a431d51e6dc824e2e44d47 (339 lines)
  - apps/desktop/src/desktop-auth-streams.test.ts | blob 7b51cd5dee64f97dbbaaa2830e203d1f981d5cc1 (103 lines)
tovu_importers:
  - apps/admin/src/App.hooks.ts | blob 503b576605de8b8c54d011c52b02ad637d3fbfb4 | :29 imports readInitialAdminSession (unchanged name)
  - apps/admin/src/App.session.ts | blob 5215ceb173dfbf5a77759a9b4db27808e2513e72 | :6 same
  - apps/desktop/src/main/index.ts | :150 imports armDesktopOwnerSignIn, redeemBootSession, sitePartition, ensureSiteSession, endSiteSession (unchanged names)
  - apps/desktop/src/project-ipc.ts:48 sitePartition; apps/desktop/src/desktop-mcp-http.ts:4 assertLoopbackAdminUrl
jini_guards:
  - packages/user-management/package.json | blob 441edd24c2eaea5777b43becdfc23c0ffb94230e
  - packages/user-management/src/session-bootstrap/ must not exist; `rg -n "readInitialSession|ensureSession|assertLoopbackHttpUrl" packages --glob '!**/dist/**'` prints nothing
```
Census: `rg -n "tryLocalOwnerSession|readInitialAdminSession|assertLoopbackAdminUrl|ensureSiteSession|hasValidSession" apps --glob '!**/node_modules/**' -g '*.ts' -g '*.tsx'`: the lists above plus tests; any other = STOP.

## Ports and signatures (Jini `packages/user-management/src/session-bootstrap/`)
```ts
export interface SessionBootstrapPorts<T> {
  /** Reads the ordinary identity; rejects when unauthenticated. */
  readonly me: (required: Record<string, never>, optional?: Record<string, never>) => Promise<T>;
  /** Performs the ONE guarded local bootstrap; resolves when a session now exists, rejects when refused. */
  readonly bootstrap: (required: Record<string, never>, optional?: Record<string, never>) => Promise<unknown>;
  /** The host's admission policy (e.g. which hostnames may even attempt a local bootstrap). */
  readonly admit: (required: Record<string, never>, optional?: Record<string, never>) => boolean;
  /** True only for the host's "no session" error (Tovu: ApiError 401 code UNAUTHENTICATED). */
  readonly isUnauthenticated: (required: { error: unknown }, optional?: Record<string, never>) => boolean;
}
export function readInitialSession<T>(required: SessionBootstrapPorts<T>, optional: { onBootstrapped?: () => void } = {}): Promise<T>;
export function ensureSession(
  required: { probe: () => Promise<boolean>; redeem: () => Promise<boolean> }, optional: Record<string, never> = {},
): Promise<{ authenticated: boolean; redeemed: boolean }>;
export function assertLoopbackHttpUrl(required: { url: string }, optional: { message?: (required: { reason: 'invalid' | 'scheme' | 'host'; detail: string }, optional?: Record<string, never>) => string } = {}): URL;
```
`assertLoopbackHttpUrl`'s default messages are neutral (`"loopback guard refused: ..."`); Tovu passes `message` to keep its exact `desktop sign-in refused: ...` strings (the desktop tests assert them). The drained-status flow (finding 2d) is NOT given a Jini function in this sheet: the three Electron flows each keep their request code; moving them would need a `SessionTransport` port whose only implementation is Tovu's, which fails the "two consumers" test for a generic port. Documented non-move.

```
id: SPLIT-A51-1 .. SPLIT-A51-3
feature: session bootstrap
jini_target: user-management src/session-bootstrap/{read-initial.ts,ensure.ts,loopback.ts,index.ts}; package.json exports "./session-bootstrap" + jini.entries "./session-bootstrap": "universal"; README line
changeset: @jini-ai/user-management: minor | "session-bootstrap: initial-session read with one guarded local bootstrap, probe-then-redeem decision, loopback URL guard"
```

## SPLIT-A51-1 — Jini (commit 1, Opus review)
0. Branch rule; blobs; guard `rg` prints nothing.
1. Tests first (all cases of the two Tovu test files for these functions rewritten with fakes, PLUS the auth rules of finding 5): `readInitialSession`: me ok -> returned, no bootstrap call; me rejects with `isUnauthenticated` false (e.g. a 500) -> rethrown, bootstrap NEVER called; unauthenticated + `admit()` false -> original error rethrown, bootstrap not called; unauthenticated + bootstrap rejects -> original error rethrown, `me` called exactly once total (no identity read after a refused bootstrap), `onBootstrapped` not called; unauthenticated + bootstrap ok + second `me` rejects -> original error rethrown, `onBootstrapped` NOT called; success -> returns the second `me` value, `onBootstrapped` called once, after it. `ensureSession`: probe true -> `{authenticated:true, redeemed:false}` and `redeem` never called (spy); probe false + redeem true/false -> `{authenticated, redeemed:true}`; a rejecting probe propagates (parity: Tovu's `hasValidSession` resolves false on transport errors, so the REJECT path is the host's bug: pin that `ensureSession` does not swallow). `assertLoopbackHttpUrl`: `http://127.0.0.1:3001`, `http://[::1]:1`, `http://::1`? (invalid URL -> `invalid`); `https://127.0.0.1` -> scheme; `http://localhost` -> host; `http://192.168.1.2` -> host; `http://127.0.0.1.evil.test` -> host; userinfo `http://a@127.0.0.1` is ACCEPTED by `new URL` (parity: the credential-in-origin check lives in `armDesktopOwnerSignIn`, which stays Tovu); returns the parsed URL.
2. Code: three small files; functions ≤ 25 lines, complexity ≤ 8, `(required, optional = {})`. No `fetch`, no `process`, no `electron`, no `ApiError`. Doc comments carry the neutral "why" (a refused bootstrap leaves the ordinary login in charge; one bootstrap per initial read, never retried; redeeming creates a fresh long-lived session so it is conditional on a failed probe).
3. package.json export + entries, README, changeset. Checks COMMON 2-9: `rg -n -i "tovu|desktop|electron|admin|owner|cookie" packages/user-management/src/session-bootstrap` prints nothing (tests use `host`, `session`).
4. Commit `feat(user-management/session-bootstrap): initial-session read, probe-then-redeem, loopback guard`.

## SPLIT-A51-2 — Tovu admin (commit 2, Sonnet; after S1)
`local-owner-signin.ts` (edit): keep `isLocalOwnerSignInHost` and the `LocalOwnerSessionPort<T>` interface (public names used by `App.*`); `readInitialAdminSession` becomes
```ts
export function readInitialAdminSession<T>(required: { hostname: string; port: LocalOwnerSessionPort<T> }, optional: { onLocalSignIn?: () => void } = {}): Promise<T> {
  const { hostname, port } = required;
  return readInitialSession<T>({
    me: () => port.me(), bootstrap: () => port.signInLocalOwner({}), admit: () => isLocalOwnerSignInHost({ hostname }),
    isUnauthenticated: ({ error }) => error instanceof ApiError && error.status === 401 && error.code === "UNAUTHENTICATED",
  }, { ...(optional.onLocalSignIn ? { onBootstrapped: optional.onLocalSignIn } : {}) });
}
```
`tryLocalOwnerSession` is deleted if `rg -n tryLocalOwnerSession apps` shows only its own file and test (else STOP); the unit test is edited to the survivors (keep every behavioural assertion; the `tryLocalOwnerSession` cases move to Jini: record counts). Commit `refactor(admin): initial session read on @jini-ai/user-management/session-bootstrap`.

## SPLIT-A51-3 — Tovu desktop (commit 3, Sonnet + Opus review; after S1; independent of S2)
`desktop-auth.ts` (edit): `assertLoopbackAdminUrl` becomes `({ adminUrl }) => assertLoopbackHttpUrl({ url: adminUrl }, { message: ({ reason, detail }) => ... })` with a `message` map reproducing the three existing strings byte-for-byte (`desktop sign-in refused: ${adminUrl} is not a valid URL.` / `${parsed.protocol}// is not plain-HTTP loopback.` / `${parsed.hostname} is not a loopback address.`: `detail` carries adminUrl, protocol, hostname respectively); the exported name stays (`desktop-mcp-http.ts:4` and `armDesktopOwnerSignIn` call it). `ensureSiteSession` body -> `ensureSession({ probe: () => hasValidSession({ net: deps.net, session: deps.session, adminUrl: deps.adminUrl }), redeem: deps.redeem }, {})`. Everything else untouched. Tests: `desktop-auth.test.ts` and `desktop-auth-streams.test.ts` run UNCHANGED (they assert the exact refusal strings and the no-redeem-when-valid property): record that no assertion changed. Commit `refactor(desktop): loopback guard and probe-then-redeem decision from @jini-ai/user-management/session-bootstrap`.

## untangle overlap
- R11 (sidecar, wave D) and the A41/A42 desktop rows edit `apps/desktop/src/main/index.ts`: this sheet does NOT edit it (names unchanged), so no ordering constraint beyond "Jini first".
- C9c (kit for user-management/react) is unrelated (A61).
- The server-side routes (`dev-auth.ts`, `local-boot-session`, `reset-owner`) belong to the row-167 user-management server wave and are not touched.

## STOP specific to this sheet
- Any desktop-auth test string or order assertion changes.
- `tryLocalOwnerSession` has a consumer outside its own file/test.
- The Jini guard would need the name `localhost` to pass an existing Tovu test (it must stay refused).
