/**
 * @file Witness for combine-10 A7 / combine-11 B1 (O3): every `*.dialects.test.ts` real-Postgres
 * section shares one `TOVU_CHAT_TEST_POSTGRES_URL` database and TRUNCATEs all four `ai_chat.*`
 * tables per make, so two test processes running at once wiped each other's rows mid-test. A
 * section must hold the shared real-Postgres chat database exclusively until it releases it; a
 * second holder (another connection, as another process would use) waits.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { holdRealPostgresChatDatabase } from "./chat-dialect-matrix.js";

const connectionString = process.env.TOVU_CHAT_TEST_POSTGRES_URL;

test("a second real-Postgres chat section waits until the first releases the shared database", { skip: connectionString === undefined && "TOVU_CHAT_TEST_POSTGRES_URL is not set" }, async () => {
  const first = await holdRealPostgresChatDatabase({ connectionString: connectionString! });
  let secondHeld = false;
  const second = holdRealPostgresChatDatabase({ connectionString: connectionString! }).then(held => { secondHeld = true; return held; });
  try {
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(secondHeld, false, "a second section must not start while the first still holds the shared database");
  } finally {
    await first.release();
    const held = await second;
    assert.equal(secondHeld, true, "the waiting section starts once the first releases");
    await held.release();
  }
});
