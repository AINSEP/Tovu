/**
 * @file F9 (Stryker L15 s3-compatible targets 76.3 %): the 4xx/5xx boundary on every failing request
 * (499 → 400, 500 → 502), the managed-manifest shape guards one clause at a time, the verify-before-
 * delete rules (never delete the manifest itself, a share artifact, a current key, or a key without
 * recorded provenance), the diverged-key preview at 3/4 keys, the share-key/header/verify regexes per
 * anchor, and the per-provider hosting guidance. Scripted signing client; nothing opens a socket.
 */
import assert from "node:assert/strict";
import test from "node:test";

import target from "../targets/s3-compatible.mjs";

class DeployError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const CREDENTIAL = { accessKeyId: "id", bucket: "b", region: "us-east-1", publicUrl: "https://cdn.example.test/", token: "secret", endpoint: "https://s3.example.test" };
const OBJECT = (key) => `https://s3.example.test/b/${key}`;
const MANIFEST = OBJECT(".tovu/managed-keys.json");
const SHARE_KEY = `_share/${"a".repeat(64)}/site.tovu.zip`;

function kitWith(respond, extra = {}) {
  const sent = [];
  const kit = {
    DeployError,
    timeouts: { QUICK: 100 },
    checkDeploymentUrl: async () => ({ reachable: true, statusCode: 200 }),
    createSigV4Client() {
      return {
        async fetch(url, init) { sent.push({ method: init.method, url, headers: init.headers }); return respond(init.method, url, init); },
        async sign(url, init) { return { url, headers: { authorization: "signed" }, method: init.method }; },
      };
    },
    ...extra,
  };
  return { kit, sent };
}
const publish = (kit, files = [{ file: "index.html", data: "x" }]) => target.create({ credential: CREDENTIAL, kit }).publish({ files });
const manifestBody = (value) => new Response(JSON.stringify(value), { status: 200, headers: { etag: '"m1"' } });
const isDeployError = (message, status) => (error) => error instanceof DeployError && error.status === status && error.message.startsWith(message);

// ---------------------------------------------------------------------------------------------
// 4xx vs 5xx at the boundary, for every request that can fail
// ---------------------------------------------------------------------------------------------

for (const [status, expected] of [[499, 400], [500, 502]]) {
  test(`HTTP ${status} maps to DeployError ${expected} on upload, manifest read, delete and manifest write`, async () => {
    // upload
    await assert.rejects(publish(kitWith((method) => (method === "PUT" ? new Response("", { status }) : new Response(null, { status: 404 }))).kit),
      isDeployError(`Failed to upload 'index.html' to S3-compatible storage: HTTP ${status}`, expected));
    // manifest read
    await assert.rejects(publish(kitWith((method, url) => (url === MANIFEST ? new Response("", { status }) : new Response(null, { status: 200, headers: { etag: '"e"' } }))).kit),
      isDeployError(`Failed to read the Tovu-managed object manifest — cannot confirm which keys this target previously owned: HTTP ${status}`, expected));
    // delete of a verified-stale key
    await assert.rejects(publish(kitWith((method, url) => {
      if (url === MANIFEST) return manifestBody({ version: 2, keys: [{ key: "old.html", etag: '"o"' }] });
      if (method === "HEAD") return new Response(null, { status: 200, headers: { etag: '"o"' } });
      if (method === "DELETE") return new Response("", { status });
      return new Response(null, { status: 200, headers: { etag: '"e"' } });
    }).kit), isDeployError(`Failed to delete stale object 'old.html' from S3-compatible storage: HTTP ${status}`, expected));
    // manifest write
    await assert.rejects(publish(kitWith((method, url) => {
      if (url === MANIFEST) return method === "GET" ? new Response(null, { status: 404 }) : new Response("", { status });
      return new Response(null, { status: 200, headers: { etag: '"e"' } });
    }).kit), isDeployError(`Failed to update the Tovu-managed object manifest: HTTP ${status}`, expected));
  });
}

// ---------------------------------------------------------------------------------------------
// Manifest shape guards (each clause alone fails the whole publish, never "zero prior keys")
// ---------------------------------------------------------------------------------------------

test("an unrecognised manifest shape fails the publish: unknown version, a null entry, v1 with a non-string key", async () => {
  for (const body of [{ version: 3, keys: [] }, { version: 2, keys: [null] }, { version: 2, keys: [{ key: 5 }] }, { version: 1, keys: ["a", 7] }, null]) {
    const { kit, sent } = kitWith((method, url) => (url === MANIFEST ? manifestBody(body) : new Response(null, { status: 200, headers: { etag: '"e"' } })));
    await assert.rejects(publish(kit), isDeployError("The Tovu-managed object manifest did not match a recognized shape", 502), JSON.stringify(body));
    assert.equal(sent.some((r) => r.method === "DELETE"), false);
    assert.equal(sent.some((r) => r.method === "PUT" && r.url === MANIFEST), false, "the old record is never overwritten");
  }
});

test("a v2 entry with an empty or non-string etag has no provenance: preserved as diverged, never HEAD-verified", async () => {
  for (const etag of ["", 5]) {
    const { kit, sent } = kitWith((method, url) => {
      if (url === MANIFEST) return method === "GET" ? manifestBody({ version: 2, keys: [{ key: "old.html", etag }] }) : new Response(null, { status: 200 });
      return new Response(null, { status: 200, headers: { etag: '"live"' } });
    });
    const result = await publish(kit);
    assert.deepEqual(sent.filter((r) => r.method === "HEAD" || r.method === "DELETE"), [], JSON.stringify(etag));
    assert.match(result.statusMessage, /1 previously-managed key\(s\) were preserved .*: old\.html\./);
  }
});

// ---------------------------------------------------------------------------------------------
// Verify-before-delete
// ---------------------------------------------------------------------------------------------

test("never deleted even with a matching live etag: the manifest key itself, a share artifact, a key in this export", async () => {
  const keys = [".tovu/managed-keys.json", SHARE_KEY, "index.html"].map((key) => ({ key, etag: '"same"' }));
  const { kit, sent } = kitWith((method, url) => {
    if (url === MANIFEST) return method === "GET" ? manifestBody({ version: 2, keys }) : new Response(null, { status: 200 });
    return new Response(null, { status: 200, headers: { etag: '"same"' } });
  });
  const result = await publish(kit);
  assert.deepEqual(sent.filter((r) => r.method === "DELETE" || r.method === "HEAD"), []);
  assert.equal(result.statusMessage, "Reachable.");
});

test("a v1 key (no recorded etag) is diverged without a HEAD, even when a HEAD would report no etag", async () => {
  const { kit, sent } = kitWith((method, url) => {
    if (url === MANIFEST) return method === "GET" ? manifestBody({ version: 1, keys: ["legacy.html"] }) : new Response(null, { status: 200 });
    if (method === "HEAD") return new Response(null, { status: 200 });
    return new Response(null, { status: 200, headers: { etag: '"e"' } });
  });
  const result = await publish(kit);
  assert.equal(sent.some((r) => r.method === "HEAD"), false);
  assert.match(result.statusMessage, /1 previously-managed key\(s\) were preserved .*: legacy\.html\./);
});

test("only a key whose live etag equals the recorded one is deleted; a changed or unreadable one is kept", async () => {
  const keys = [{ key: "stale.html", etag: '"s"' }, { key: "changed.html", etag: '"c"' }, { key: "gone.html", etag: '"g"' }];
  const live = { [OBJECT("stale.html")]: '"s"', [OBJECT("changed.html")]: '"other"' };
  const { kit, sent } = kitWith((method, url) => {
    if (url === MANIFEST) return method === "GET" ? manifestBody({ version: 2, keys }) : new Response(null, { status: 200 });
    if (method === "HEAD") return live[url] === undefined ? new Response(null, { status: 404 }) : new Response(null, { status: 200, headers: { etag: live[url] } });
    return new Response(null, { status: 200, headers: { etag: '"e"' } });
  });
  const result = await publish(kit);
  assert.deepEqual(sent.filter((r) => r.method === "DELETE").map((r) => r.url), [OBJECT("stale.html")]);
  assert.match(result.statusMessage, /1 previously-managed key\(s\) were preserved .*: changed\.html\.$/);
});

test("the diverged preview names 3 keys plainly, and adds ', ...' only past 3", async () => {
  for (const [count, tail] of [[3, "k0, k1, k2."], [4, "k0, k1, k2, ...."]]) {
    const keys = Array.from({ length: count }, (_, i) => `k${i}`);
    const { kit } = kitWith((method, url) => {
      if (url === MANIFEST) return method === "GET" ? manifestBody({ version: 1, keys }) : new Response(null, { status: 200 });
      return new Response(null, { status: 200, headers: { etag: '"e"' } });
    });
    const result = await publish(kit);
    assert.ok(result.statusMessage.startsWith(`Reachable. ${count} previously-managed key(s) were preserved`), result.statusMessage);
    assert.ok(result.statusMessage.endsWith(`: ${tail}`), result.statusMessage);
  }
});

// ---------------------------------------------------------------------------------------------
// Share artifacts: key regex per anchor, header allow-list per anchor, verify conjuncts one by one
// ---------------------------------------------------------------------------------------------

test("share keys are anchored at both ends: prefix or suffix junk is refused before any request", async () => {
  const { kit, sent } = kitWith(() => new Response(null, { status: 200 }));
  const store = target.createArtifactStore({ credential: CREDENTIAL, kit });
  for (const key of [`x${SHARE_KEY}`, `${SHARE_KEY}.exe`, `${SHARE_KEY}\n`, `_share/${"a".repeat(63)}/site.tovu.zip`, `_share/${"a".repeat(64)}/-site.tovu.zip`, `_share/${"a".repeat(64)}/${"s".repeat(81)}.tovu.zip`]) {
    await assert.rejects(store.upload({ key, bytes: new Uint8Array([1]), headers: {} }), isDeployError("Invalid share artifact key.", 400), JSON.stringify(key));
  }
  assert.deepEqual(sent, []);
  await store.upload({ key: `_share/${"a".repeat(64)}/${"s".repeat(80)}.tovu.zip`, bytes: new Uint8Array([1]), headers: {} });
  assert.equal(sent.length, 1);
});

test("only exact content-type / content-disposition / cache-control names are persisted on a share upload", async () => {
  const { kit, sent } = kitWith(() => new Response(null, { status: 200 }));
  const store = target.createArtifactStore({ credential: CREDENTIAL, kit });
  await store.upload({ key: SHARE_KEY, bytes: new Uint8Array([1]), headers: { "Cache-Control": "no-store", "Content-Disposition": "attachment", "x-cache-control": "1", "cache-control-extra": "1", "X-Robots-Tag": "none" } });
  assert.deepEqual(Object.keys(sent[0].headers).sort(), ["Cache-Control", "Content-Disposition", "Content-Type"]);
});

test("verify(present) needs status 200 AND exact length AND no-store AND an attachment disposition", async () => {
  const url = `https://cdn.example.test/${SHARE_KEY}`;
  const good = { status: 200, headers: { "content-length": "3", "cache-control": "no-store", "content-disposition": "attachment; filename=x" } };
  const cases = [
    [good, true],
    [{ ...good, headers: { ...good.headers, "content-disposition": "attachment" } }, true],
    [{ ...good, status: 203 }, false],
    [{ ...good, headers: { ...good.headers, "content-length": "4" } }, false],
    [{ ...good, headers: { ...good.headers, "cache-control": "no-store, max-age=0" } }, false],
    [{ ...good, headers: { ...good.headers, "content-disposition": "inline; attachment" } }, false],
    [{ ...good, headers: { ...good.headers, "content-disposition": "attachments" } }, false],
  ];
  for (const [answer, expected] of cases) {
    const { kit } = kitWith(() => new Response(null, { status: 500 }), { fetch: async () => new Response(null, answer) });
    const store = target.createArtifactStore({ credential: CREDENTIAL, kit });
    assert.equal(await store.verify({ key: SHARE_KEY, url, present: true, bytes: 3 }), expected, JSON.stringify(answer));
  }
});

// ---------------------------------------------------------------------------------------------
// Hosting guidance: only AWS gets the public-read bucket policy, scoped to exactly this bucket
// ---------------------------------------------------------------------------------------------

test("AWS and Wasabi guidance carry a GetObject-only public-read policy for exactly this bucket; no other provider has one", () => {
  const POLICY = { Version: "2012-10-17", Statement: [{ Sid: "PublicReadGetObject", Effect: "Allow", Principal: "*", Action: "s3:GetObject", Resource: "arn:aws:s3:::my-bucket/*" }] };
  const cases = [
    ["", "aws", 3, [POLICY]], ["https://s3.wasabisys.com", "wasabi", 1, [POLICY]],
    ["https://a.r2.cloudflarestorage.com", "cloudflare-r2", 1, []], ["https://s3.us-west.backblazeb2.com", "backblaze-b2", 1, []],
    ["https://nyc3.digitaloceanspaces.com", "digitalocean-spaces", 1, []], ["https://minio.example", "minio", 1, []], ["https://storage.example", "generic", 1, []],
  ];
  for (const [endpoint, provider, stepCount, policies] of cases) {
    const setup = target.hostingSetup({ fields: { bucket: "my-bucket", region: "us-east-1", endpoint } });
    assert.equal(setup.provider, provider);
    assert.equal(setup.steps.length, stepCount, provider);
    assert.deepEqual(setup.steps.filter((step) => step.consoleJson !== undefined).map((step) => JSON.parse(step.consoleJson)), policies, provider);
    for (const step of setup.steps) assert.ok(step.title.length > 0 && step.description.length > 0, provider);
    assert.equal(typeof setup.warning, "string", provider);
  }
});
