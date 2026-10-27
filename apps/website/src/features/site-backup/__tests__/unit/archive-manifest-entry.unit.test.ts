/** Bug (Opus check 2026-10-26): a Library document whose slug is "manifest" exports as
 * media/manifest.json, and the import's wrapper detection then counts it as a second manifest. */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { AgentPluginArchiveEntry, AgentPluginArchiveReaderPort } from "@jini-ai/agent-plugins/lifecycle";
import { bufferArchiveMedia } from "../../archive-media.js";
import { scanArchiveMetadata } from "../../import-verifier-inventory.js";

const json = Buffer.from('{"name":"price list"}');
const file = (entryPath: string, bytes: Buffer): AgentPluginArchiveEntry => ({ kind: "file", entryPath, declaredSize: bytes.length, async *openReadStream() { yield bytes; } });

test("a root archive whose JSON document exports as media/manifest.json still has exactly one manifest", async () => {
  const ledger = { sizes: [], buffered: [] };
  const [copy] = await bufferArchiveMedia({
    sources: [{ id: "doc", slug: "manifest", kind: "document", workspaceId: "ws", originalFilename: "manifest.json", storageKey: "doc", sha256: createHash("sha256").update(json).digest("hex") }],
    blobStore: { sizeOf: async () => json.length, get: async () => json },
    imageTransformer: { transform: async () => assert.fail("documents are never transformed") },
    ledger,
  });
  assert.equal(copy!.path, "media/manifest.json");
  const items = [file("manifest.json", Buffer.from("{}")), file(copy!.path, json), file("content.db", Buffer.from("db"))];
  const reader: AgentPluginArchiveReaderPort = { async *entries() { yield* items; } };
  const scan = await scanArchiveMetadata({ archive: Buffer.alloc(0), reader });
  assert.equal(scan.wrapper, "");
  assert.equal(scan.manifestBytes.toString(), "{}");
});
