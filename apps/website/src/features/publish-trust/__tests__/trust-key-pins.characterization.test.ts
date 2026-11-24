import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { deriveInstallationId, derivePublishSigningKey, verifyPublishSignature } from "@jini-ai/cms/publish/trust/keys";
import { mintPublishSession, verifyPublishSession } from "../session.js";
import { createFixedKeyring } from "./support/fixed-keyring.js";

/**
 * @file Pinned bytes for every key path of the publishing trust code.
 *
 * These are characterization tests written BEFORE the trust code is split or moved. Each one names
 * the check it guards and was shown to fail when that check is changed (the mutation table is in
 * `cloud-results/publish-p0.md`). The pinned values are not arbitrary: an installed site's identity,
 * its signing key and its session MAC are all DERIVED, so a changed purpose string, length or
 * derivation input does not fail loudly — it silently gives every install a new identity and breaks
 * every existing connection. Only a byte pin can see that.
 */

const SITE_KEY_HEX = "0b".repeat(32);
const WORKSPACE = "ws-pin";
const TARGET_ORIGIN = "https://dest.example";

/** The installation id the fixed keyring gives `WORKSPACE`. 16 bytes, base64url. */
const PINNED_INSTALLATION_ID = "M1tMc8XzZE7tdgMu70hQZQ";
/** The Ed25519 public key for (`PINNED_INSTALLATION_ID`, `TARGET_ORIGIN`, generation 1). */
const PINNED_PUBLIC_KEY = "xhb7t91QM_vTtKjYYLw1qvL6UTcuQwqTwISAkDqAFYI";
/** Ed25519 is deterministic, so the signature over the message "m" is a fixed value too. */
const PINNED_SIGNATURE = "pAnk_cEL2FbOcY3I7P0U0pdM27u144pQkvwL6F_gXfch8dchcj2iapfpAeRxq7AoXdR6xwdJkqSwBza1wBnKDQ";
/** The MAC half of the session token minted below. */
const PINNED_SESSION_MAC = "7NoDs2-aZd2sVEg3ElNrAZgi-ib4S2ULqy0wTF06-PQ";

function signingKeyFor(overrides: { targetOrigin?: string; generation?: number; workspaceId?: string } = {}) {
  const { keyring, derives } = createFixedKeyring({ siteKeyHex: SITE_KEY_HEX });
  return derivePublishSigningKey({
    keyring,
    workspaceId: overrides.workspaceId ?? WORKSPACE,
    sourceInstallationId: PINNED_INSTALLATION_ID,
    targetOrigin: overrides.targetOrigin ?? TARGET_ORIGIN,
    generation: overrides.generation ?? 1,
  }).then((key) => ({ key, derives }));
}

test("T-K1: the installation id is the pinned 16-byte value for a fixed site key", async () => {
  const { keyring, derives } = createFixedKeyring({ siteKeyHex: SITE_KEY_HEX });

  const id = await deriveInstallationId({ keyring, workspaceId: WORKSPACE });

  assert.equal(id, PINNED_INSTALLATION_ID);
  assert.equal(Buffer.from(id, "base64url").length, 16);
  assert.deepEqual(derives, [{ workspaceId: WORKSPACE, purpose: "publish-trust-installation-id", info: "self" }]);
});

test("T-K1: another workspace on the same site key gets another installation id", async () => {
  const { keyring } = createFixedKeyring({ siteKeyHex: SITE_KEY_HEX });

  assert.notEqual(await deriveInstallationId({ keyring, workspaceId: "ws-other" }), PINNED_INSTALLATION_ID);
});

test("T-K2: the signing key is the pinned public key and signature for a fixed site key", async () => {
  const { key, derives } = await signingKeyFor();

  assert.equal(key.publicKeyB64u, PINNED_PUBLIC_KEY);
  assert.equal(key.sign({ message: "m" }), PINNED_SIGNATURE);
  assert.deepEqual(derives, [{
    workspaceId: WORKSPACE,
    purpose: "publish-trust-signing-key",
    info: `${PINNED_INSTALLATION_ID}:${TARGET_ORIGIN}:v1`,
  }]);
});

test("T-K2: target origin, generation and workspace each change the signing key", async () => {
  const otherOrigin = await signingKeyFor({ targetOrigin: "https://other.example" });
  const otherGeneration = await signingKeyFor({ generation: 2 });
  const otherWorkspace = await signingKeyFor({ workspaceId: "ws-other" });

  const keys = [PINNED_PUBLIC_KEY, otherOrigin.key.publicKeyB64u, otherGeneration.key.publicKeyB64u, otherWorkspace.key.publicKeyB64u];
  assert.equal(new Set(keys).size, 4);
});

test("T-K2: a signature made for one destination does not verify under the key of another", async () => {
  const forOther = await signingKeyFor({ targetOrigin: "https://other.example" });

  assert.equal(verifyPublishSignature({ publicKeyB64u: PINNED_PUBLIC_KEY, message: "m", signatureB64u: PINNED_SIGNATURE }), true);
  assert.equal(verifyPublishSignature({ publicKeyB64u: PINNED_PUBLIC_KEY, message: "m", signatureB64u: forOther.key.sign({ message: "m" }) }), false);
});

test("T-D4: the session MAC is the pinned value, keyed by purpose, workspace and info", async () => {
  const { keyring, derives } = createFixedKeyring({ siteKeyHex: SITE_KEY_HEX });

  const minted = await mintPublishSession(
    {
      deps: { keyring, workspaceId: WORKSPACE, clock: { nowIso: () => "2026-11-16T00:00:00.000Z" } },
      input: { sourceInstallationId: PINNED_INSTALLATION_ID, targetInstallationId: "dest-install", capabilities: ["publish_content.apply"], generation: 1 }
    }
  );

  assert.equal(minted.token.split(".")[1], PINNED_SESSION_MAC);
  assert.deepEqual(derives, [{ workspaceId: WORKSPACE, purpose: "publish-trust-session-key", info: "session-hmac" }]);
});

test("T-D4b: a wrong MAC over a payload that cannot be parsed is refused for the MAC, not the payload", async () => {
  const { keyring } = createFixedKeyring({ siteKeyHex: SITE_KEY_HEX });
  const unparsable = Buffer.from("{not json", "utf8").toString("base64url");

  const verdict = await verifyPublishSession(
    {
      deps: { keyring, workspaceId: WORKSPACE, clock: { nowIso: () => "2026-11-16T00:00:00.000Z" } },
      input: { token: `${unparsable}.${PINNED_SESSION_MAC}`, expectedAudience: "dest-install" }
    }
  );

  assert.deepEqual(verdict, { ok: false, reason: "session token signature is invalid" });
});

/**
 * T-D4c. Constant time cannot be proven by a result test: a plain string compare returns the same
 * answers. So this guard reads the source. It fails unless the MAC comparison is `timingSafeEqual`
 * over two buffers whose lengths were compared first, and it fails if any line of the file compares
 * a MAC with `===` or `!==`.
 */
test("T-D4c: the session MAC is compared with timingSafeEqual on equal-length buffers, never with ===", () => {
  const source = readFileSync(fileURLToPath(new URL("../session.ts", import.meta.url)), "utf8");
  const start = source.indexOf("function macMatches(");
  assert.notEqual(start, -1, "session.ts must define macMatches");
  const body = source.slice(start, source.indexOf("\n}\n", start));

  assert.match(body, /return presented\.length === expected\.length && timingSafeEqual\(presented, expected\);/);
  assert.match(body, /const presented = Buffer\.from\(presentedMac, "base64url"\);/);
  assert.match(body, /const expected = Buffer\.from\(expectedMac, "base64url"\);/);

  const macIdentifier = String.raw`\b\w*[mM]ac\w*\b`;
  const plainCompare = new RegExp(`${macIdentifier}\\s*[!=]==?|[!=]==?\\s*${macIdentifier}`);
  const offending = source.split("\n").filter((line) => !line.trimStart().startsWith("*") && plainCompare.test(line));
  assert.deepEqual(offending, []);
  assert.equal(source.split("macMatches(").length - 1, 2, "macMatches has one definition and one call site");
});
