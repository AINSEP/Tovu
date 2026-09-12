/**
 * @file Desktop sign-in: the shell arrives at a site's admin already authenticated, so the operator
 * never meets a login form for a server this app started on their own machine.
 *
 * **This is not a bypass.** `apps/website`'s admin gate is real — a revocable server-side `sessions`
 * row and RBAC evaluated by `authorize()` on every route — and none of that changes. The shell
 * redeems a single-use boot token for an ordinary session, over loopback, against a child process
 * it spawned itself.
 *
 * **There is no password here, and nothing is stored.** An earlier version of this module minted a
 * per-site owner password, sealed it with Electron's `safeStorage` and kept it next to the site's
 * database. That is gone, for two independent reasons. It only ever worked for sites this shell
 * itself seeded, because it depended on being the thing that chose the password — every
 * pre-existing site folder still showed a login form, which is exactly the outcome the product
 * decision ruled out. And `safeStorage` proved unusable here: `isEncryptionAvailable()` returned
 * TRUE and the subsequent store still failed with a blocking native modal ("A keychain cannot be
 * found to store 'tovu-desktop Key'"), which on an Electron app freezes the whole automation
 * channel as well as the user. **Do not reintroduce OS credential storage in this shell.** The
 * availability check is not proof the Keychain will work.
 *
 * The boot token replaces all of it: minted by the CHILD at boot, for one launch, never written to
 * disk, redeemed exactly once, then dead. The parent learns it over the child's own stdout pipe —
 * private to these two processes — rather than through the environment, because an env block is
 * readable from the process list by anything running as this user.
 *
 * **Three properties enforced in code rather than assumed:**
 *
 * 1. *Never over a network.* {@link assertLoopbackAdminUrl} refuses any origin whose host is not a
 *    loopback literal, and refuses any non-`http:` scheme, immediately before the token is sent.
 *    The server proves it independently at its own route rather than trusting this.
 * 2. *One cookie jar per site.* Cookies ignore port, so `127.0.0.1:3001` and `127.0.0.1:3002` share
 *    a jar by default — site A's session cookie would be sent to site B's server, and B's redeem
 *    would overwrite A's. {@link sitePartition} gives every site its own Electron session
 *    partition. This is a correctness requirement of multi-site, not a hardening nicety.
 * 3. *Fail open to the login form, never to a broken window.* A missing, spent, or rejected token
 *    reports and the caller loads the admin anyway, where the ordinary login screen is waiting. No
 *    retry loop, no blank window, no fabricated session.
 */
import crypto from "node:crypto";
import path from "node:path";

/** The owner account this shell seeds and logs in as. **Must stay Tovu's own default owner
 *  username** (`features/identity/wiring.ts:120`) — see this file's header for the measured reason
 *  a different one breaks the agent daemon on any already-seeded site. */
const DESKTOP_OWNER_USERNAME = "admin";

/** Tovu's boot-token redemption route (`registerAuthRoutes`, `dev-auth.ts`). */
const BOOT_SESSION_PATH = "/api/admin/v1/auth/boot-session";

/** Tovu's session-logout route (`registerAuthRoutes`, `dev-auth.ts`). Revokes whatever session the
 *  caller's cookie proves, and is a no-op (still `200`) when there is none — see `dev-auth.ts`'s own
 *  handler, which clears the cookie unconditionally regardless of whether a token was present. */
const LOGOUT_PATH = "/api/admin/v1/auth/logout";

/** Tovu's own "who am I" route (`registerAuthRoutes`, `dev-auth.ts:429`) — `200` with the principal
 *  when the caller's session cookie proves a live session, `401 UNAUTHENTICATED` when it does not.
 *  The 401 is what makes it usable as a validity probe; a route that answered `200 {user: null}`
 *  would be indistinguishable from success and the probe would be worthless. Duplicated as a
 *  literal for the same reason {@link BOOT_SESSION_PATH} is. */
const SESSION_PROBE_PATH = "/api/admin/v1/auth/me";

/** The session cookie's name. Must match `dev-auth.ts`'s own `SESSION_COOKIE` — duplicated here
 *  rather than imported for the same reason {@link BOOT_SESSION_PATH} is a literal and not an
 *  import: this directory stays self-contained (see `main.js`'s header), so nothing under
 *  `apps/website/` has to change, or even be resolvable, for this shell to build. */
const SESSION_COOKIE_NAME = "tovu_session";

/** Hosts a spawned-by-us server can legitimately be reached on. `localhost` is excluded on purpose:
 *  it is a NAME, resolvable through `/etc/hosts` or DNS to somewhere else entirely, and this shell
 *  always knows the literal address its own child bound. */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "[::1]"]);

/**
 * Throw unless `adminUrl` names a plain-HTTP loopback origin.
 *
 * The guard that makes "impossible to authenticate anything reached over a network" a property of
 * the code rather than of the caller's good behaviour. Checked immediately before the credential is
 * put on the wire, not at some earlier layer that a future call site could skip.
 *
 * @param {string} adminUrl
 * @returns {URL} the parsed origin, for the caller to build its request from.
 * @throws {Error} when the url is unparseable, not `http:`, or not a loopback literal.
 * @complexity O(1).
 */
function assertLoopbackAdminUrl(adminUrl) {
  let parsed;
  try {
    parsed = new URL(adminUrl);
  } catch {
    throw new Error(`desktop sign-in refused: ${adminUrl} is not a valid URL.`);
  }
  if (parsed.protocol !== "http:") {
    throw new Error(`desktop sign-in refused: ${parsed.protocol}// is not plain-HTTP loopback.`);
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error(`desktop sign-in refused: ${parsed.hostname} is not a loopback address.`);
  }
  return parsed;
}

/**
 * A stable, filesystem-safe Electron session-partition name for one site dir.
 *
 * Hashed rather than derived from the path so the name cannot collide with Electron's partition
 * syntax (`persist:` prefix, `/` separators) and does not leak the operator's directory layout into
 * a partition directory name under `userData`.
 *
 * @param {string} siteDir absolute site directory.
 * @returns {string} e.g. `persist:tovu-site-1f3c…`
 * @complexity O(n) in the path length.
 */
function sitePartition(siteDir) {
  const digest = crypto.createHash("sha256").update(path.resolve(siteDir)).digest("hex").slice(0, 32);
  return `persist:tovu-site-${digest}`;
}

/**
 * Redeem a boot token over loopback so the resulting session cookie lands in `deps.session`'s own
 * cookie jar.
 *
 * `net.request` with `useSessionCookies: true` is what makes this work without any manual
 * `Set-Cookie` parsing or `cookies.set()` call: the request goes through Chromium's network stack
 * bound to that session, so the response's cookie is stored exactly as it would be for a real
 * navigation — including the `Secure` attribute, which Chromium accepts over loopback because
 * `127.0.0.1` is a trustworthy origin. Dropping `useSessionCookies` makes this whole mechanism a
 * silent no-op while every other signal still looks healthy, so a test is pinned to it.
 *
 * Never throws for an auth outcome. A 401 is an ordinary answer (a spent token, a server that
 * minted none), and the caller's job is then to show the login form.
 *
 * @param {object} deps
 * @param {{request: Function}} deps.net Electron's `net` module (injectable test seam).
 * @param {object} deps.session the Electron `Session` whose cookie jar receives the cookie.
 * @param {string} deps.adminUrl the child's own reported admin URL.
 * @param {string} deps.bootToken the single-use token the child emitted on its stdout.
 * @returns {Promise<{ok: boolean, status?: number, reason?: string}>}
 * @throws {Error} (as a rejection) only when `adminUrl` is not a loopback origin — a wiring bug,
 *   never an auth outcome.
 * @complexity O(1) — one request.
 */
async function redeemBootSession(deps) {
  // `async` so the loopback guard REJECTS rather than throwing synchronously. A Promise-returning
  // function that can also throw before returning its promise is a trap for any caller using
  // `.catch()`, and this particular throw is the security guard.
  const origin = assertLoopbackAdminUrl(deps.adminUrl);
  const body = JSON.stringify({ token: deps.bootToken });

  return new Promise((resolve) => {
    const request = deps.net.request({
      method: "POST",
      url: new URL(BOOT_SESSION_PATH, origin.origin).toString(),
      session: deps.session,
      useSessionCookies: true,
    });
    request.setHeader("Content-Type", "application/json");

    request.on("response", (response) => {
      // Drained rather than parsed: nothing here needs the body, and an undrained response holds
      // the socket open.
      response.on("data", () => {});
      response.on("end", () =>
        resolve(
          response.statusCode === 200
            ? { ok: true, status: 200 }
            : { ok: false, status: response.statusCode, reason: `boot-session responded ${response.statusCode}` },
        ),
      );
    });
    request.on("error", (error) => resolve({ ok: false, reason: error.message }));

    request.write(body);
    request.end();
  });
}

/**
 * Whether `deps.session`'s cookie jar already carries a session cookie for this site.
 *
 * A site already authenticated from a previous launch must not redeem another token:
 * {@link sitePartition} gives every site a `persist:`-prefixed
 * partition, so its cookies survive an app restart, and a still-valid one sitting unused in the jar
 * is exactly what let 30-day sessions pile up one per launch (713 live rows found in one site's
 * database) with no reuse and no revocation. Matched by NAME only, never by URL/port: this shell
 * allocates a fresh port for the child on every launch, and Chromium keys a cookie by host, not port
 * (see this file's header, property 2) — a port-scoped lookup would never match the very cookie this
 * check exists to find.
 *
 * A cookie present here is not proof the session is still valid server-side, and **this function
 * must never be used as if it were** — that was DS-01. The old doc here claimed a stale cookie
 * "fails exactly like a missing one: the ordinary login screen shows". It shows, but it is not an
 * equivalent outcome, and the difference is the finding. A login form is exactly what the boot
 * token exists to spare this operator: they were never given a password, because this shell does
 * not mint one (it passes no `desktopCredential`, so the SITE's own seeding decides — see
 * `features/identity/wiring.ts`, whose `ownerPassword` falls back to `DEFAULT_OWNER_PASSWORD` when
 * `TOVU_ADMIN_PASSWORD` is unset, and whose seed does not rotate an owner that already exists). A
 * credential that works therefore EXISTS; it is a build-time default this app has never shown them.
 * And the only automatic recovery (`endSiteSession` on quit) is wired solely to `openSiteWindow`'s `closed` event —
 * which the sites home `<webview>` path never reaches. A stale cookie there survives every relaunch and
 * re-forces that same manual login on a site the app itself just opened.
 *
 * So this is now strictly the CHEAP NEGATIVE inside {@link hasValidSession}: "is there even a
 * cookie worth asking the server about". Ask {@link hasValidSession} for the real answer.
 *
 * @param {object} deps
 * @param {{cookies: {get: Function}}} deps.session the Electron `Session` to inspect.
 * @returns {Promise<boolean>}
 * @complexity O(1) — one cookie-store lookup.
 */
async function hasActiveSessionCookie(deps) {
  const cookies = await deps.session.cookies.get({ name: SESSION_COOKIE_NAME });
  return cookies.length > 0;
}

/**
 * Whether this site's cookie jar carries a session the SERVER still honours — asked of the server,
 * not inferred from the jar.
 *
 * **DS-01, and the distinction is the whole finding.** {@link hasActiveSessionCookie} answers
 * "is there a cookie", which `main.js` used to treat as "is there a session": it set
 * `emitBootToken: !alreadyAuthenticated` and skipped {@link redeemBootSession} entirely. A cookie
 * whose server-side row is gone — a restore-point rollback, a stale-session cleanup, any
 * server-side revoke this shell did not perform itself — then produced a 401 admin with **no boot
 * token minted**, and therefore a login form for a password this operator was never told (see
 * {@link hasActiveSessionCookie} for where the working credential actually comes from: the site's
 * own seeding default, not this shell). The in-file claim that the operator simply "meets the ordinary login
 * screen" assumed a recovery that the sites home path cannot reach: `endSiteSession` is wired only to
 * `openSiteWindow`'s `closed` event, so for a site opened from the Projects grid the stale cookie
 * is never cleared and every later launch repeats the same skip. Not a hard lockout — the seeding
 * default does work — but a dead end for anyone who has only ever used this app. That is why
 * presence is not good enough.
 *
 * The cookie check runs FIRST as a cheap negative: a brand-new partition has no cookie, and a
 * request that could only ever answer 401 is a round trip on the critical path of every first site
 * open.
 *
 * `useSessionCookies: true` is load-bearing exactly as it is in {@link redeemBootSession} — without
 * it the probe is made as an anonymous caller and reports 401 for a perfectly healthy session,
 * which would mint and redeem a fresh token on every single open and rebuild the 30-day-session
 * pile-up this whole mechanism exists to prevent. A test is pinned to it.
 *
 * Fails to `false`, never rejects, for any transport outcome — same fail-open contract as every
 * other branch in this file. "Cannot confirm" and "not authenticated" both mean "mint a token and
 * try", which costs one unused single-use token and never costs the operator their way in.
 *
 * @param {object} deps
 * @param {{request: Function}} deps.net Electron's `net` module (injectable test seam).
 * @param {object} deps.session the Electron `Session` whose cookie jar is being asked about.
 * @param {string} deps.adminUrl the site's own admin URL.
 * @returns {Promise<boolean>}
 * @throws {Error} (as a rejection) only when `adminUrl` is not a loopback origin — a wiring bug,
 *   never an auth outcome. Checked before the cookie lookup so that bug surfaces even for a site
 *   with an empty jar.
 * @complexity O(1) — one cookie lookup plus at most one request.
 */
async function hasValidSession(deps) {
  const origin = assertLoopbackAdminUrl(deps.adminUrl);
  if (!(await hasActiveSessionCookie(deps))) return false;

  return new Promise((resolve) => {
    const request = deps.net.request({
      method: "GET",
      url: new URL(SESSION_PROBE_PATH, origin.origin).toString(),
      session: deps.session,
      useSessionCookies: true,
    });

    request.on("response", (response) => {
      // Drained rather than parsed — see `redeemBootSession`'s identical comment. Only the STATUS
      // is the answer here; the principal in the body is not this shell's business.
      response.on("data", () => {});
      response.on("end", () => resolve(response.statusCode === 200));
    });
    request.on("error", () => resolve(false));

    request.end();
  });
}

/**
 * Make sure this site's cookie jar carries a session that works — reusing the existing one when the
 * server still honours it, and redeeming a boot token when it does not.
 *
 * This is the decision `main.js` used to make inline, and making it inline is how DS-01 happened:
 * `startSiteBackend` asked {@link hasActiveSessionCookie} BEFORE spawning the child, and passed
 * `emitBootToken: !alreadyAuthenticated`. Two things follow from that ordering, and both are wrong.
 * The check could only ever be about the JAR, because there is no server to ask yet. And the answer
 * was baked into a spawn ARGUMENT, so a wrong guess could not be revised once the server was up —
 * no token had been minted, and the only thing left was a login form for a password this shell
 * never issued.
 *
 * The fix is to stop deciding before there is anything to ask. `main.js` now always passes
 * `--emit-boot-token`, and this function decides AFTER the server is answering. An emitted token
 * that turns out to be unnecessary is inert: single-use, process-scoped, never written to disk, and
 * simply dies with the child. What must stay conditional is the REDEEM — every redemption creates a
 * fresh 30-day session, and redeeming unconditionally is precisely what left 713 live rows in one
 * site's database.
 *
 * @param {object} deps
 * @param {{request: Function}} deps.net Electron's `net` module.
 * @param {object} deps.session the Electron `Session` for this site's partition.
 * @param {string} deps.adminUrl the site's own admin URL.
 * @param {() => Promise<boolean>} deps.redeem redeems the boot token and reports whether it worked
 *   — `main.js`'s `authenticateSiteSession`, which owns the token and its own logging. Injected
 *   rather than called directly so this decision is testable without a real child process.
 * @returns `{authenticated, redeemed}` — `redeemed` says whether a token was actually spent, which
 *   is the fact worth reporting; `authenticated: false` means the caller should expect the ordinary
 *   login form, never that a session was fabricated.
 * @complexity O(1) — at most one probe plus one redeem.
 */
async function ensureSiteSession(deps) {
  if (await hasValidSession({ net: deps.net, session: deps.session, adminUrl: deps.adminUrl })) {
    return { authenticated: true, redeemed: false };
  }
  return { authenticated: await deps.redeem(), redeemed: true };
}

/**
 * End whatever session `deps.session`'s cookie jar is currently carrying for this site, so a closed
 * window's session does not outlive the window by up to 30 days.
 *
 * Mirrors {@link redeemBootSession}'s shape and its "never throws for an auth outcome" contract: a
 * session that was already gone, already expired, or never existed answers exactly like one that was
 * just revoked (the route always answers `200`), so the caller never has to branch on which case this
 * is. Only a genuinely non-loopback `adminUrl` rejects, which should never happen since callers only
 * ever pass a site's own spawned-child `adminUrl`.
 *
 * @param {object} deps
 * @param {{request: Function}} deps.net Electron's `net` module (injectable test seam).
 * @param {object} deps.session the Electron `Session` whose cookie the logout call reads and clears.
 * @param {string} deps.adminUrl the site's own admin URL, same shape {@link redeemBootSession} takes.
 * @returns {Promise<{ok: boolean, status?: number, reason?: string}>}
 * @throws {Error} (as a rejection) only when `adminUrl` is not a loopback origin — a wiring bug,
 *   never an auth outcome.
 * @complexity O(1) — one request.
 */
async function endSiteSession(deps) {
  const origin = assertLoopbackAdminUrl(deps.adminUrl);

  return new Promise((resolve) => {
    const request = deps.net.request({
      method: "POST",
      url: new URL(LOGOUT_PATH, origin.origin).toString(),
      session: deps.session,
      useSessionCookies: true,
    });

    request.on("response", (response) => {
      // Drained rather than parsed — see `redeemBootSession`'s identical comment.
      response.on("data", () => {});
      response.on("end", () =>
        resolve(
          response.statusCode === 200
            ? { ok: true, status: 200 }
            : { ok: false, status: response.statusCode, reason: `logout responded ${response.statusCode}` },
        ),
      );
    });
    request.on("error", (error) => resolve({ ok: false, reason: error.message }));

    request.end();
  });
}

export {
  BOOT_SESSION_PATH,
  LOGOUT_PATH,
  assertLoopbackAdminUrl,
  sitePartition,
  redeemBootSession,
  hasActiveSessionCookie,
  hasValidSession,
  ensureSiteSession,
  endSiteSession,
};
