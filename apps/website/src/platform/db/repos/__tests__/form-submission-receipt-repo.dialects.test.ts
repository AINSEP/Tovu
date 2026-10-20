import "../../../site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { test } from "node:test";

import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { SqlFormSubmissionReceiptRepo } from "../form-submission-receipt-repo.js";
import type { ContentKernel } from "../../content-kernel.js";

/** @file Form destination import receipts on SQLite and PGlite (migration 0018). */

describeEachDialect(
  "form submission remote receipts",
  { tables: ["form_submission_remote_receipts"], make: (kernel: ContentKernel) => ({ kernel, repo: new SqlFormSubmissionReceiptRepo(kernel) }) },
  (make) => {
    const receipt = { workspaceId: "w", destinationKey: "host:https://a.example", remoteId: "r1", submissionId: "s1", importedAt: "2026-10-19T12:00:00.000Z" };

    test("the first claim records the receipt; a repeat for the same key is refused without an error", async () => {
      const { repo } = make();
      assert.equal(await repo.claim(receipt), true);
      assert.equal(await repo.claim({ ...receipt, submissionId: "s2" }), false);
      assert.equal(await repo.claim({ ...receipt, destinationKey: "host:https://b.example" }), true, "another destination is another row");
      assert.equal(await repo.claim({ ...receipt, workspaceId: "w2" }), true);
    });

    test("a refused claim inside a transaction leaves the transaction usable and rolls back with it", async () => {
      const { kernel, repo } = make();
      await repo.claim(receipt);
      const inner = await kernel.transaction(async () => [await repo.claim(receipt), await repo.claim({ ...receipt, remoteId: "r2" })]);
      assert.deepEqual(inner, [false, true]);
      await assert.rejects(kernel.transaction(async () => { await repo.claim({ ...receipt, remoteId: "r3" }); throw new Error("rollback"); }), /rollback/);
      assert.equal(await repo.claim({ ...receipt, remoteId: "r3" }), true, "the rolled-back receipt was not kept");
    });
  }
);
