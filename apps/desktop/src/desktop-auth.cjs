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

module.exports = {
  BOOT_SESSION_PATH,
  assertLoopbackAdminUrl,
  sitePartition,
  redeemBootSession,
};
