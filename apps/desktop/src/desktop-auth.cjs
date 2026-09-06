/**
 * @file Desktop sign-in: the shell arrives at a site's admin already authenticated, so the operator
 * never meets a login form for a server this app started on their own machine.
 *
 * **This is not a bypass, and it does not touch the server.** `apps/website`'s admin gate
 * (`server/inbound/admin-http/dev-auth.ts`) is real — argon2id password verification against the
 * `users` table, a revocable server-side `sessions` row per login, and RBAC evaluated by
 * `authorize()` on every route. Nothing here weakens any of that. The shell simply performs an
 * ordinary `POST /api/admin/v1/auth/login` as an ordinary owner principal, over loopback, against a
 * child process it spawned itself, and lets the resulting session cookie land in that window's own
 * cookie jar. The browser-served admin is bit-for-bit unaffected because no server file changed.
 *
 * **Scope: this covers sites the shell SEEDS, which is every site it creates. It does not cover a
 * site folder that was already seeded by someone else** — that one still shows the login form, and
 * the fallback below is what makes that outcome tidy rather than broken.
 *
 * An earlier version of this file tried to cover already-seeded sites too, by seeding a SEPARATE
 * owner username (`tovu-desktop`) instead of Tovu's default `admin`. `seedIdentity`'s early return
 * is keyed on the owner username (`seed.js:178-185`), so on paper a new username mints a second
 * owner on any site. **Running it proved otherwise and the idea is abandoned:** past that early
 * return, `seedIdentity` goes on to `seedBuiltinRoleWithPolicy`, which re-INSERTs the built-in roles
 * and dies `UNIQUE constraint failed: roles.workspace_id, roles.name` on any site that already has
 * them. That rejection propagates to the boot-readiness gate, and the observable damage is worse
 * than a login form: `[cli/serve] a boot-readiness promise rejected — not starting the agent
 * daemon`. Seeding a non-default owner username onto an existing install is a latent defect in
 * `@jini-ai/cms` itself, not something to route around from here — reported separately.
 *
 * So the username stays Tovu's own default. On a site with no owner yet the shell's password seeds
 * it and login succeeds; on a site that already has one, `seedIdentity` takes its early return, no
 * boot is harmed, login answers 401, and the operator sees the ordinary login form.
 *
 * **Why not the default password.** `wiring.ts:121` falls back to a `DEFAULT_OWNER_PASSWORD` when
 * `TOVU_ADMIN_PASSWORD` is unset. Reusing it would mean shipping one identical credential in every
 * install, and `features/identity/default-credential-exposure.ts` exists precisely to scan for that
 * literal appearing anywhere it should not. Every site gets its own 256-bit random password
 * instead, minted here and never leaving this machine.
 *
 * **Three properties that must hold, each enforced below rather than assumed:**
 *
 * 1. *Never over a network.* {@link assertLoopbackAdminUrl} refuses any origin whose host is not a
 *    loopback literal, and refuses `https:`/any non-`http:` scheme. The password is only ever sent
 *    to a port this shell learned from its own child's boot line.
 * 2. *One cookie jar per site.* Cookies ignore port, so `127.0.0.1:3001` and `127.0.0.1:3002` share
 *    a jar by default — site A's session cookie would be sent to site B's server, and B's login
 *    would overwrite A's. {@link sitePartition} gives every site its own Electron session partition.
 *    This is a correctness requirement of multi-site, not a hardening nicety.
 * 3. *Fail open to the login form, never to a broken window.* If login does not succeed for any
 *    reason, {@link signInDesktopSession} reports it and the caller loads the admin anyway, where
 *    the operator sees the ordinary login screen. No retry loop, no blank window, no silent failure.
 *
 * **Where the password lives, and why it is NOT in `userData`.** It sits in the site dir itself, as
 * `.tovu-desktop-auth.json` (0600), beside the `content.db` it unlocks. The first version of this
 * put it under `userData` and that was wrong in two ways, both found by running the thing rather
 * than reading it. Durability: the seeded credential lives in the site's OWN database, so a
 * `userData` reset (a new machine, a cleared profile, a fresh test home) orphans it permanently —
 * the shell would mint a new password forever and `seedIdentity`, idempotent on the username, would
 * never apply it, leaving that site un-loginable by the desktop path with no way back. Portability:
 * a site folder copied to another machine keeps working. The file's own LOCATION is its binding to
 * the site, which is also why nothing here re-checks a path recorded inside it — doing so would
 * break the moment an operator renamed their site folder, a perfectly ordinary thing to do.
 *
 * **Encryption is defense-in-depth here, not the control.** `safeStorage` is used when the OS
 * offers it, and the file falls back to 0600 plaintext when it does not — which is the case for any
 * unpackaged run with no login keychain (measured: `isEncryptionAvailable()` is `true` under a real
 * macOS `HOME` and `false` under a scratch one, which is exactly how the E2E suite runs). That
 * fallback is acceptable because of what the secret actually guards: an owner login to a
 * LOOPBACK-ONLY server, for a site whose entire contents sit unencrypted in `content.db` in this
 * same directory, readable by this same OS user. Anyone who can read this file can already read the
 * database it protects, so storing it here adds no exposure the directory did not already have.
 * What `safeStorage` still buys, when present, is that a backup or a cloud-sync copy of the folder
 * carries ciphertext rather than a live credential — worth having, not worth failing closed over.
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

/** The owner account this shell seeds and logs in as. **Must stay Tovu's own default owner
 *  username** (`features/identity/wiring.ts:120`) — see this file's header for the measured reason
 *  a different one breaks the agent daemon on any already-seeded site. */
const DESKTOP_OWNER_USERNAME = "admin";

/** Tovu's login route (`registerAuthRoutes`, `dev-auth.ts`). The one ungated admin route. */
const LOGIN_PATH = "/api/admin/v1/auth/login";

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

/** The per-site credential file, beside the `content.db` it unlocks. See this file's header for
 *  why it lives here rather than under `userData`. */
function credentialFilePath(siteDir) {
  return path.join(siteDir, ".tovu-desktop-auth.json");
}

/** Envelope version, so a future format change can be detected rather than mis-parsed. */
const CREDENTIAL_ENVELOPE_VERSION = 1;

/**
 * Wrap a password for storage, encrypting when the OS offers it.
 * @returns {{v: number, enc: "safeStorage"|"plain", value: string}}
 * @complexity O(n) in the password length.
 */
function sealCredential(safeStorage, password) {
  if (safeStorage.isEncryptionAvailable()) {
    return {
      v: CREDENTIAL_ENVELOPE_VERSION,
      enc: "safeStorage",
      value: safeStorage.encryptString(password).toString("base64"),
    };
  }
  return { v: CREDENTIAL_ENVELOPE_VERSION, enc: "plain", value: password };
}

/**
 * Unwrap a stored envelope, or `null` when it is absent, malformed, from a future version, or
 * sealed by a keychain this machine cannot open (a folder copied from another machine).
 * @complexity O(n) in the stored value's length.
 */
function openCredential(safeStorage, envelope) {
  if (envelope?.v !== CREDENTIAL_ENVELOPE_VERSION) return null;
  if (envelope.enc === "plain") return typeof envelope.value === "string" ? envelope.value : null;
  if (envelope.enc !== "safeStorage" || !safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(Buffer.from(envelope.value, "base64"));
  } catch {
    return null;
  }
}

/**
 * The stored password for `siteDir`, or `null` when there is none this machine can read.
 *
 * @param {{safeStorage: object}} deps
 * @param {string} siteDir
 * @returns {string | null}
 * @complexity O(1) beyond the file read.
 */
function readStoredCredential(deps, siteDir) {
  let envelope;
  try {
    envelope = JSON.parse(fs.readFileSync(credentialFilePath(siteDir), "utf8"));
  } catch {
    // Absent, unreadable, or not JSON — all equivalent to "no credential", and re-minting is safe.
    return null;
  }
  return openCredential(deps.safeStorage, envelope);
}

/**
 * The password for `siteDir`: an operator's exported `TOVU_ADMIN_PASSWORD` if there is one,
 * otherwise the stored per-site secret, otherwise a freshly minted and persisted 256-bit one.
 *
 * Unlike the first version of this module, it never returns `null` for want of OS encryption — the
 * plaintext fallback is deliberate and its rationale is in this file's header. It DOES return
 * `null` when the site dir cannot be written to, since a password that was handed to the child as
 * `TOVU_ADMIN_PASSWORD` but not recorded would seed an owner nobody can ever log in as again.
 *
 * @returns {string | null}
 * @complexity O(1) beyond the file read/write.
 */
function ensureSiteCredential(deps, siteDir) {
  // An operator who exported `TOVU_ADMIN_PASSWORD` chose their own owner password; that is the one
  // the child will seed with whatever this function returns, so returning anything else would seed
  // a site the operator then could not log into by hand. Used as-is and NOT written to disk — it is
  // already durable wherever they set it, and copying someone's exported secret into a new file is
  // not this module's business.
  const ambient = deps.env?.TOVU_ADMIN_PASSWORD;
  if (typeof ambient === "string" && ambient.length > 0) return ambient;

  const existing = readStoredCredential(deps, siteDir);
  if (existing !== null) return existing;

  const password = crypto.randomBytes(32).toString("base64url");
  try {
    fs.writeFileSync(
      credentialFilePath(siteDir),
      JSON.stringify(sealCredential(deps.safeStorage, password), null, 2),
      { mode: 0o600 },
    );
  } catch (error) {
    console.log(`tovu desktop: could not record a desktop credential in ${siteDir} (${error.message}).`);
    return null;
  }
  return password;
}

/**
 * Log in over loopback so the session cookie lands in `deps.session`'s own cookie jar.
 *
 * `net.request` with `useSessionCookies: true` is what makes this work without any manual
 * `Set-Cookie` parsing or `cookies.set()` call: the request goes through Chromium's network stack
 * bound to that session, so the response's cookie is stored exactly as it would be for a real
 * navigation — including the `Secure` attribute, which Chromium accepts over loopback because
 * `127.0.0.1` is a trustworthy origin.
 *
 * Never throws for an auth outcome. A 401 is an ordinary answer here (a site already seeded with a
 * different owner, an expired store), and the caller's job is then to show the login form.
 *
 * @param {object} deps
 * @param {{request: Function}} deps.net Electron's `net` module (injectable test seam).
 * @param {object} deps.session the Electron `Session` whose cookie jar receives the cookie.
 * @param {string} deps.adminUrl the child's own reported admin URL.
 * @param {string} deps.username
 * @param {string} deps.password
 * @returns {Promise<{ok: boolean, status?: number, reason?: string}>}
 * @throws {Error} (as a rejection) only when `adminUrl` is not a loopback origin — a wiring bug,
 *   never an auth outcome.
 * @complexity O(1) — one request.
 */
async function signInDesktopSession(deps) {
  // `async` so the loopback guard REJECTS rather than throwing synchronously. A Promise-returning
  // function that can also throw before returning its promise is a trap for any caller using
  // `.catch()` instead of `try`/`await`, and this particular throw is the security guard.
  const origin = assertLoopbackAdminUrl(deps.adminUrl);
  const body = JSON.stringify({ username: deps.username, password: deps.password });

  return new Promise((resolve) => {
    const request = deps.net.request({
      method: "POST",
      url: new URL(LOGIN_PATH, origin.origin).toString(),
      session: deps.session,
      useSessionCookies: true,
    });
    request.setHeader("Content-Type", "application/json");

    request.on("response", (response) => {
      // The body is drained rather than parsed: nothing here needs it, and an undrained response
      // holds the socket open.
      response.on("data", () => {});
      response.on("end", () =>
        resolve(
          response.statusCode === 200
            ? { ok: true, status: 200 }
            : { ok: false, status: response.statusCode, reason: `login responded ${response.statusCode}` },
        ),
      );
    });
    request.on("error", (error) => resolve({ ok: false, reason: error.message }));

    request.write(body);
    request.end();
  });
}

module.exports = {
  CREDENTIAL_ENVELOPE_VERSION,
  DESKTOP_OWNER_USERNAME,
  LOGIN_PATH,
  assertLoopbackAdminUrl,
  sitePartition,
  credentialFilePath,
  readStoredCredential,
  ensureSiteCredential,
  signInDesktopSession,
};
