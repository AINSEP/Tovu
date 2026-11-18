import assert from "node:assert/strict";
import test from "node:test";
import { MASKED_IDENTIFIER_ROWS } from "@jini-ai/core/text/masked-identifier-rows";
import { describeDelegatedInternalError, type ToolFailureRecord } from "../tool-recovery-preset.js";

/** A vendor-shaped credential that the host's `redactSecretShapes` blanks. */
const VENDOR_KEY = "sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
/** Rows 1, 2, 4 and 5: names that come from a registry, a schema or an envelope. Row 3 is a caller's own value and is S6's other source. */
const NAME_ROWS = MASKED_IDENTIFIER_ROWS.filter(({ row }) => row !== 3);

function describeThrown({ text }: { text: string }) {
  const records: ToolFailureRecord[] = [];
  const answer = describeDelegatedInternalError(
    { context: { source: "delegated-tool-execute", runId: "run-1", toolId: "shot_page", correlationId: "corr-1", error: new Error(text) } },
    { mintErrorId: () => "ERR-0000-0000-0000-0001", onFailure: record => records.push(record) },
  );
  return { answer, records };
}

for (const { row, text, keeps } of NAME_ROWS) {
  test(`the host's secret redaction leaves row ${row} untouched (${keeps.join(", ")})`, () => {
    const { answer, records } = describeThrown({ text });
    assert.equal(answer, `Error ERR-0000-0000-0000-0001: ${text}`);
    assert.equal(records.length, 1);
    assert.equal(records[0]?.redactions, 0);
  });
}

test("a vendor key in the same message is blanked while the row's names stay", () => {
  const row = NAME_ROWS.find(({ row: number }) => number === 2);
  assert.ok(row);
  const { answer, records } = describeThrown({ text: `${row.text}; key ${VENDOR_KEY}` });
  assert.equal(answer.includes(VENDOR_KEY), false);
  assert.ok(answer.includes("dismissCookieBanners"));
  assert.equal(records[0]?.redactions, 1);
  assert.equal(records[0]?.message.includes(VENDOR_KEY), false);
});
