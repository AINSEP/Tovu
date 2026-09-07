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
const crypto = require("node:crypto");
const path = require("node:path");

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

/** The session cookie's name. Must match `dev-auth.ts`'s own `SESSION_COOKIE` — duplicated here
 *  rather than imported for the same reason {@link BOOT_SESSION_PATH} is a literal and not an
 *  import: this directory stays self-contained (see `main.cjs`'s header), so nothing under
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
 * Checked BEFORE minting a fresh boot token so a site already authenticated from a previous launch
 * does not mint and redeem another one: {@link sitePartition} gives every site a `persist:`-prefixed
 * partition, so its cookies survive an app restart, and a still-valid one sitting unused in the jar
 * is exactly what let 30-day sessions pile up one per launch (713 live rows found in one site's
 * database) with no reuse and no revocation. Matched by NAME only, never by URL/port: this shell
 * allocates a fresh port for the child on every launch, and Chromium keys a cookie by host, not port
 * (see this file's header, property 2) — a port-scoped lookup would never match the very cookie this
 * check exists to find.
 *
 * A cookie present here is not proof the session is still valid server-side (it could have been
 * revoked early by {@link endSiteSession} racing a crash, or the site's database could have been
 * reset out from under it) — only that trying it is worth skipping the mint for. A stale cookie fails
 * exactly like a missing one: the admin's own session check 401s and the ordinary login screen shows,
 * the same fail-open contract every other branch in this file already keeps.
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

module.exports = {
  BOOT_SESSION_PATH,
  LOGOUT_PATH,
  assertLoopbackAdminUrl,
  sitePartition,
  redeemBootSession,
  hasActiveSessionCookie,
  endSiteSession,
};
