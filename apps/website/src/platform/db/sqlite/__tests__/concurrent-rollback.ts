import assert from "node:assert/strict";

import { contentKernel } from "../../content-kernel.js";

/**
 * @file Test helper: run a repo write while ANOTHER async context holds a content-db transaction
 * open, then roll that one back. A write on the kernel's own transaction waits its turn and
 * survives; a synchronous Drizzle `db.transaction()` became a savepoint inside the open `BEGIN` and
 * was rolled back with it.
 */

const tick = () => new Promise((resolve) => setImmediate(resolve));

export async function writeDuringOthersRollback<T>(db: Parameters<typeof contentKernel>[0], write: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const other = contentKernel(db).transaction(async () => {
    await gate;
    throw new Error("the other caller rolls back");
  });
  await tick();
  const mine = write();
  await tick();
  release();
  await assert.rejects(other, /the other caller rolls back/);
  return mine;
}
