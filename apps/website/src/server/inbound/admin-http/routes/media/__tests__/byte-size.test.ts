import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { resolveMediaByteSizes } from "../byte-size.js";

type Required = Parameters<typeof resolveMediaByteSizes>[0];

/** Owner's 2026-10-04 decision: stat only the supplied batch, bounded to eight lookups. */
test("media sizes visit only returned distinct hashes and keep eight original-blob lookups in flight", async () => {
  const hashes = Array.from({ length: 19 }, (_, index) => `hash-${index}`);
  const lookups: string[] = [];
  const keys: string[] = [];
  let active = 0;
  let peak = 0;
  const deps = {
    workspaceId: "returned-workspace",
    assetBlobRepo: {
      findByHash: async ({ workspaceId, sha256 }: { workspaceId: string; sha256: string }) => {
        assert.equal(workspaceId, "returned-workspace");
        lookups.push(sha256);
        active++;
        peak = Math.max(peak, active);
        await setImmediate();
        return { storageKey: `original/${sha256}` };
      },
    },
    blobStore: {
      sizeOf: async ({ storageKey }: { storageKey: string }) => {
        keys.push(storageKey);
        await setImmediate();
        active--;
        return 13;
      },
      get: async () => { throw new Error("sizes must never download payloads"); },
    },
  } as unknown as Required["deps"];
  const media = [...hashes, hashes[0]!].map((sha256) => ({ source: { sha256 } }));
  const result = await resolveMediaByteSizes({ deps, media });
  assert.equal(peak, 8);
  assert.equal(active, 0);
  assert.deepEqual(lookups.toSorted(), hashes.toSorted());
  assert.deepEqual(keys.toSorted(), hashes.map((hash) => `original/${hash}`).toSorted());
  assert.deepEqual([...result.values()], Array(19).fill(13));
});

test("media sizes preserve zero and isolate missing rows, missing files, and storage errors", async () => {
  const hashes = ["zero", "missing-row", "missing-file", "stat-error", "repo-error", "healthy"];
  const deps = {
    workspaceId: "ws",
    assetBlobRepo: {
      findByHash: async ({ sha256 }: { sha256: string }) => {
        if (sha256 === "missing-row") return null;
        if (sha256 === "repo-error") throw new Error("repo unavailable");
        return { storageKey: sha256 };
      },
    },
    blobStore: {
      sizeOf: async ({ storageKey }: { storageKey: string }) => {
        if (storageKey === "stat-error") throw new Error("permission denied");
        if (storageKey === "missing-file") return null;
        return storageKey === "zero" ? 0 : 13;
      },
    },
  } as unknown as Required["deps"];
  const media = hashes.map((sha256) => ({ source: { sha256 } }));
  const sizes = await resolveMediaByteSizes({ deps, media });
  assert.deepEqual(hashes.map((hash) => sizes.get(hash)), [0, null, null, null, null, 13]);
});

test("older blob adapters report null without payload or repository I/O; empty pages do nothing", async () => {
  let lookups = 0;
  let downloads = 0;
  const deps = {
    workspaceId: "ws",
    assetBlobRepo: { findByHash: async () => { lookups++; throw new Error("unnecessary repo I/O"); } },
    blobStore: { get: async () => { downloads++; throw new Error("unnecessary payload I/O"); } },
  } as unknown as Required["deps"];
  const media = [{ source: { sha256: "unknown" } }];
  assert.deepEqual([...await resolveMediaByteSizes({ deps, media })], [["unknown", null]]);
  assert.deepEqual([...await resolveMediaByteSizes({ deps, media: [] })], []);
  assert.equal(lookups, 0);
  assert.equal(downloads, 0);
});
