/**
 * @file Coverage for `desktop-auth.cjs`.
 *
 * The security-relevant assertions here are the negative ones. `assertLoopbackAdminUrl` is the only
 * thing standing between "the shell logs into a server it started" and "the shell posts an owner
 * password at an arbitrary host", so it is tested against the specific inputs that would defeat a
 * naive check — a hostname that merely CONTAINS a loopback literal, a userinfo prefix, a redirect
 * to a public address — not just at one happy path and one obvious reject.
 *
 * `signInDesktopSession` is exercised against a fake `net` rather than a real server: what needs
 * proving in a unit test is that a non-200 becomes `{ok:false}` instead of throwing (the caller
 * falls through to the login form on that branch) and that `useSessionCookies` is actually
 * requested (without it Chromium never STORES the cookie, and the whole mechanism silently
 * no-ops while every visible signal still looks fine). The real end-to-end proof is the
 * `admin comes up authenticated` case in `development/e2e/desktop-shell.spec.ts`.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");

const {
  DESKTOP_OWNER_USERNAME,
  assertLoopbackAdminUrl,
  sitePartition,
  ensureSiteCredential,
  readStoredCredential,
  signInDesktopSession,
} = require("./desktop-auth.cjs");

/** A `safeStorage` stand-in. Reversible rather than encrypting, which is what lets a test assert on
 *  what was actually sealed; the binding check under test is in the plaintext, not in the cipher. */
function fakeSafeStorage(available = true) {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (text) => Buffer.from(`sealed:${text}`, "utf8"),
    decryptString: (buf) => {
      const raw = buf.toString("utf8");
      if (!raw.startsWith("sealed:")) throw new Error("not sealed by this store");
      return raw.slice("sealed:".length);
    },
  };
}

// --------------------------------------------------------------------------
// assertLoopbackAdminUrl — the network guard
// --------------------------------------------------------------------------

test("accepts the loopback origins a spawned child actually binds", () => {
  for (const url of ["http://127.0.0.1:3001/admin/", "http://127.0.0.1:65535/", "http://[::1]:3001/admin/"]) {
    assert.doesNotThrow(() => assertLoopbackAdminUrl(url), `expected ${url} to be accepted`);
  }
});

test("refuses every non-loopback host, including ones that merely LOOK loopback", () => {
  const hostile = [
    "http://evil.example.com/admin/",
    // Contains the loopback literal as a substring — defeats a naive `includes()` check.
    "http://127.0.0.1.evil.example.com/admin/",
    "http://not-127.0.0.1/admin/",
    // Userinfo makes the real host the part AFTER the `@`.
    "http://127.0.0.1@evil.example.com/admin/",
    // A NAME, not an address: resolvable through /etc/hosts or DNS to anywhere.
    "http://localhost:3001/admin/",
    // Public addresses, including one on a private LAN.
    "http://10.0.0.5:3001/admin/",
    "http://192.168.1.10:3001/admin/",
    "http://0.0.0.0:3001/admin/",
  ];
  for (const url of hostile) {
    assert.throws(() => assertLoopbackAdminUrl(url), /desktop sign-in refused/, `expected ${url} to be refused`);
  }
});

test("refuses non-http schemes and unparseable input", () => {
  for (const url of ["https://127.0.0.1:3001/", "file:///etc/passwd", "ftp://127.0.0.1/", "not a url"]) {
    assert.throws(() => assertLoopbackAdminUrl(url), /desktop sign-in refused/, `expected ${url} to be refused`);
  }
});

// --------------------------------------------------------------------------
// sitePartition — one cookie jar per site
// --------------------------------------------------------------------------

test("every site dir gets its own partition, and the same dir always gets the same one", () => {
  const a = sitePartition("/sites/alpha");
  const b = sitePartition("/sites/beta");
  assert.notEqual(a, b);
  assert.equal(a, sitePartition("/sites/alpha"));
  // Path-equivalent spellings must not produce two jars for one site.
  assert.equal(a, sitePartition("/sites/./alpha"));
  assert.match(a, /^persist:tovu-site-[0-9a-f]{32}$/);
});

test("the partition name does not leak the operator's directory layout", () => {
  assert.equal(sitePartition("/Users/someone/Secret Client Work/site").includes("Secret"), false);
});

// --------------------------------------------------------------------------
// credential store — lives in the SITE DIR, not userData
// --------------------------------------------------------------------------

/** A site dir on disk, since the store's location IS its binding to the site. */
function siteDir(label) {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-desktop-auth-")), label);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

test("mints a password once and returns the same one on every later call", () => {
  const deps = { safeStorage: fakeSafeStorage(), env: {} };
  const dir = siteDir("alpha");
  const first = ensureSiteCredential(deps, dir);
  assert.equal(typeof first, "string");
  assert.ok(first.length >= 40, `expected a 256-bit base64url password, got ${first.length} chars`);
  assert.equal(ensureSiteCredential(deps, dir), first);
});

test("two sites never share a password", () => {
  const deps = { safeStorage: fakeSafeStorage(), env: {} };
  assert.notEqual(ensureSiteCredential(deps, siteDir("alpha")), ensureSiteCredential(deps, siteDir("beta")));
});

test("stores beside the site's own database, NOT under userData", () => {
  const dir = siteDir("alpha");
  ensureSiteCredential({ safeStorage: fakeSafeStorage(), env: {} }, dir);
  assert.equal(fs.existsSync(path.join(dir, ".tovu-desktop-auth.json")), true);
});

test("the stored file is not world-readable", () => {
  const dir = siteDir("alpha");
  ensureSiteCredential({ safeStorage: fakeSafeStorage(), env: {} }, dir);
  const mode = fs.statSync(path.join(dir, ".tovu-desktop-auth.json")).mode & 0o777;
  assert.equal(mode, 0o600, `expected 0600, got ${mode.toString(8)}`);
});

test("still mints and stores when the OS offers no encryption — the fallback is deliberate", () => {
  // Regression: the first version returned null here, so the whole feature silently no-opped on
  // every unpackaged run (`isEncryptionAvailable()` is false with no login keychain) and the E2E
  // suite could never exercise it. See this module's header for why 0600 plaintext is acceptable.
  const dir = siteDir("alpha");
  const deps = { safeStorage: fakeSafeStorage(false), env: {} };
  const password = ensureSiteCredential(deps, dir);
  assert.equal(typeof password, "string");
  assert.equal(ensureSiteCredential(deps, dir), password, "must read its own unencrypted envelope back");

  const envelope = JSON.parse(fs.readFileSync(path.join(dir, ".tovu-desktop-auth.json"), "utf8"));
  assert.equal(envelope.enc, "plain");
});

test("encrypts when the OS does offer it, so a synced copy of the folder carries no live secret", () => {
  const dir = siteDir("alpha");
  const password = ensureSiteCredential({ safeStorage: fakeSafeStorage(), env: {} }, dir);
  const raw = fs.readFileSync(path.join(dir, ".tovu-desktop-auth.json"), "utf8");
  assert.equal(JSON.parse(raw).enc, "safeStorage");
  assert.equal(raw.includes(password), false, "the plaintext password must not appear in the file");
});

test("SURVIVES a site-folder rename — the trap that made a path binding wrong", () => {
  // The store is inside the dir it belongs to, so its location is the binding. Recording an
  // absolute path inside it and re-checking that path would break here, and a site that fails this
  // is un-loginable forever: `seedIdentity` is idempotent on the username, so a freshly minted
  // replacement password can never take effect.
  const deps = { safeStorage: fakeSafeStorage(), env: {} };
  const original = siteDir("alpha");
  const password = ensureSiteCredential(deps, original);

  const renamed = path.join(path.dirname(original), "renamed-site");
  fs.renameSync(original, renamed);

  assert.equal(readStoredCredential(deps, renamed), password);
  assert.equal(ensureSiteCredential(deps, renamed), password, "must not mint a second password");
});

test("a folder sealed on another machine reads as absent rather than throwing", () => {
  const dir = siteDir("alpha");
  ensureSiteCredential({ safeStorage: fakeSafeStorage(), env: {} }, dir);
  // Same envelope, a keychain that cannot open it — what a copied folder looks like.
  const foreign = {
    isEncryptionAvailable: () => true,
    encryptString: (t) => Buffer.from(t),
    decryptString: () => {
      throw new Error("cannot decrypt: sealed by another keychain");
    },
  };
  assert.equal(readStoredCredential({ safeStorage: foreign, env: {} }, dir), null);
});

test("a corrupt, absent, or future-version store reads as absent rather than throwing", () => {
  const deps = { safeStorage: fakeSafeStorage(), env: {} };
  const dir = siteDir("alpha");
  assert.equal(readStoredCredential(deps, dir), null);

  const file = path.join(dir, ".tovu-desktop-auth.json");
  fs.writeFileSync(file, "{ not json");
  assert.equal(readStoredCredential(deps, dir), null);

  fs.writeFileSync(file, JSON.stringify({ v: 99, enc: "plain", value: "pw" }));
  assert.equal(readStoredCredential(deps, dir), null);
});

// --------------------------------------------------------------------------
// signInDesktopSession
// --------------------------------------------------------------------------

/** Minimal Electron `net` stand-in that answers with `statusCode` and records the request options. */
function fakeNet(statusCode) {
  const calls = [];
  return {
    calls,
    request(options) {
      calls.push(options);
      const request = new EventEmitter();
      request.setHeader = () => {};
      request.write = (body) => {
        request.body = body;
      };
      request.end = () => {
        const response = new EventEmitter();
        response.statusCode = statusCode;
        request.emit("response", response);
        queueMicrotask(() => response.emit("end"));
      };
      return request;
    },
  };
}

const SIGN_IN_INPUT = {
  session: { id: "fake" },
  adminUrl: "http://127.0.0.1:3001/admin/",
  username: DESKTOP_OWNER_USERNAME,
  password: "pw",
};

test("a 200 login reports success", async () => {
  assert.deepEqual(await signInDesktopSession({ ...SIGN_IN_INPUT, net: fakeNet(200) }), { ok: true, status: 200 });
});

test("a 401 RESOLVES as not-ok rather than throwing — the caller falls through to the login form", async () => {
  const result = await signInDesktopSession({ ...SIGN_IN_INPUT, net: fakeNet(401) });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
});

test("requests useSessionCookies, without which Chromium would never STORE the cookie", async () => {
  const net = fakeNet(200);
  await signInDesktopSession({ ...SIGN_IN_INPUT, net });
  assert.equal(net.calls[0].useSessionCookies, true);
  assert.equal(net.calls[0].session, SIGN_IN_INPUT.session);
  assert.equal(net.calls[0].url, "http://127.0.0.1:3001/api/admin/v1/auth/login");
  assert.equal(net.calls[0].method, "POST");
});

test("refuses to put the password on the wire for a non-loopback admin url", async () => {
  const net = fakeNet(200);
  await assert.rejects(
    () => signInDesktopSession({ ...SIGN_IN_INPUT, adminUrl: "http://evil.example.com/admin/", net }),
    /desktop sign-in refused/,
  );
  assert.deepEqual(net.calls, [], "no request may be made at all");
});

test("an operator's exported TOVU_ADMIN_PASSWORD is used as-is and never written to disk", () => {
  // The child seeds with whatever this returns, so ignoring an exported password would seed a site
  // the operator could not then log into by hand. Regression: an earlier version instead treated an
  // ambient value as a reason to SKIP the credential entirely, which seeded `admin` with the
  // operator's password while the shell went on to log in with a different one — a guaranteed 401.
  const dir = siteDir("alpha");
  const deps = { safeStorage: fakeSafeStorage(), env: { TOVU_ADMIN_PASSWORD: "operator-chosen" } };
  assert.equal(ensureSiteCredential(deps, dir), "operator-chosen");
  assert.equal(fs.existsSync(path.join(dir, ".tovu-desktop-auth.json")), false);
});

test("an empty TOVU_ADMIN_PASSWORD is treated as unset, not as a password", () => {
  const dir = siteDir("alpha");
  const deps = { safeStorage: fakeSafeStorage(), env: { TOVU_ADMIN_PASSWORD: "" } };
  assert.ok(ensureSiteCredential(deps, dir).length >= 40);
});

test("the seeded owner username stays Tovu's own default", () => {
  // A different username sends `seedIdentity` past its early return into re-inserting the built-in
  // roles, which dies UNIQUE and takes the agent daemon down with it on any already-seeded site.
  // Measured, not theorised — see desktop-auth.cjs's header.
  assert.equal(DESKTOP_OWNER_USERNAME, "admin");
});
