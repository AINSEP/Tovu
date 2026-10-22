import assert from "node:assert/strict";
import test from "node:test";

import { buildPublishBackstopPorts } from "../publish-backstop-ports.js";

/** The backstop's raw-row and audit ports exist only over a SQLite content kernel, and the site
 * file port only with a site binding; blobs and the file-blob index are always passed through. */
test("a non-SQLite kernel and no site binding get no raw row, audit or file ports", () => {
  const blobStore = {} as never;
  const fileBlobIndex = {} as never;
  const ports = buildPublishBackstopPorts({ contentKernel: { dialect: "postgres" } as never, blobStore, fileBlobIndex });
  assert.equal("rows" in ports, false);
  assert.equal("audit" in ports, false);
  assert.equal("files" in ports, false);
  assert.equal(ports.blobs, blobStore);
  assert.equal(ports.fileBlobIndex, fileBlobIndex);
  assert.deepEqual([ports.fileRollbacks, ports.inverses], [[], []]);
  assert.equal(new Set(ports.coveredTables).size, ports.coveredTables.length);
  assert.equal(new Set(ports.coveredRoots).size, ports.coveredRoots.length);
});
