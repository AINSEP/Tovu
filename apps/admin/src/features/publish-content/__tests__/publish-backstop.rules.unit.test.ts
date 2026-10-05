import { describe, expect, it } from "vitest";
import { backstopPlanRows, backstopRunFromSearch, destinationUndoHref, parseBackstopRow, rowAddress } from "../hooks/publish-backstop.rules";
import type { BackstopPlan } from "../hooks/publish-backstop-port.hooks";

/**
 * The pure rules behind "send by hand": what counts as a row address the server may be asked
 * for, where the undo link points, which `?backstopRun=` values are honoured, and what the review
 * table shows. Every expected value is a literal from the contract, not from these functions.
 */

describe("parseBackstopRow", () => {
  it("accepts an identifier table with a scalar JSON key and sorts the key's columns", () => {
    expect(parseBackstopRow({ table: "p_banner", pk: '{"slot":"top","id":7,"weight":1.5}' }))
      .toEqual({ table: "p_banner", pk: { id: 7, slot: "top", weight: 1.5 } });
    expect(Object.keys(parseBackstopRow({ table: "t", pk: '{"b":"2","a":"1"}' })!.pk)).toEqual(["a", "b"]);
  });

  it.each([
    ["a table that is not an identifier", "1table", '{"id":"x"}'],
    ["a table with SQL in it", "p_banner;drop", '{"id":"x"}'],
    ["a key that is not JSON", "t", "{id: x}"],
    ["a JSON null", "t", "null"],
    ["a JSON scalar", "t", '"x"'],
    ["a JSON array", "t", '["x"]'],
    ["an empty key object", "t", "{}"],
    ["a column that is not an identifier", "t", '{"bad-col":"x"}'],
    ["a __proto__ column", "t", '{"__proto__":"x"}'],
    ["a boolean value", "t", '{"id":true}'],
    ["an object value", "t", '{"id":{"nested":1}}'],
    ["an unsafe integer", "t", '{"id":9007199254740993}'],
    ["a non-finite number", "t", '{"id":1e400}'],
  ])("refuses %s", (_label, table, pk) => {
    expect(parseBackstopRow({ table, pk })).toBeNull();
  });

  it("keeps a safe integer at the boundary and a finite fraction", () => {
    expect(parseBackstopRow({ table: "t", pk: '{"id":9007199254740991}' })).toEqual({ table: "t", pk: { id: 9007199254740991 } });
    expect(parseBackstopRow({ table: "t", pk: '{"id":0.25}' })).toEqual({ table: "t", pk: { id: 0.25 } });
  });
});

describe("rowAddress", () => {
  it("joins the table and the key's JSON with a colon", () => {
    expect(rowAddress({ row: { table: "p_banner", pk: { id: "one" } } })).toBe('p_banner:{"id":"one"}');
  });
});

describe("destinationUndoHref", () => {
  it("points at the destination admin, under its base path, carrying only the run id", () => {
    expect(destinationUndoHref({ baseUrl: "https://live.example/site", runId: "run-1" })).toBe("https://live.example/site/admin/?backstopRun=run-1");
    expect(destinationUndoHref({ baseUrl: "http://live.example/", runId: "r" })).toBe("http://live.example/admin/?backstopRun=r");
  });

  it.each([
    ["an unparseable URL", "not a url"],
    ["a non-HTTP scheme", "ftp://live.example/"],
    ["a URL carrying a username", "https://admin@live.example/"],
    ["a URL carrying a password", "https://:secret@live.example/"],
  ])("refuses %s", (_label, baseUrl) => {
    expect(destinationUndoHref({ baseUrl, runId: "run-1" })).toBeNull();
  });
});

describe("backstopRunFromSearch", () => {
  it("returns a well-formed run id", () => {
    expect(backstopRunFromSearch({ search: "?tab=x&backstopRun=run_A-9" })).toBe("run_A-9");
    expect(backstopRunFromSearch({ search: `?backstopRun=${"a".repeat(128)}` })).toBe("a".repeat(128));
  });

  it.each([
    ["no parameter", "?tab=x"],
    ["an empty value", "?backstopRun="],
    ["a value with a slash", "?backstopRun=../run"],
    ["a value over 128 characters", `?backstopRun=${"a".repeat(129)}`],
  ])("ignores %s", (_label, search) => {
    expect(backstopRunFromSearch({ search })).toBeUndefined();
  });
});

describe("backstopPlanRows", () => {
  const t = (key: string) => `«${key}»`;
  const plan: BackstopPlan = {
    logId: "log-1", entities: [], skipped: [],
    plan: { planId: "p", planHash: "h", details: { refused: false, refusalReason: null, rows: [
      { entityType: "raw-row", entityId: "a", outcome: "applied", writes: true, reason: null },
      { entityType: "raw-row", entityId: "b", outcome: "skipped", writes: false, reason: "same" },
      { entityType: "raw-row", entityId: "c", outcome: "applied", writes: true, reason: null },
      { entityType: "raw-file", entityId: "d", outcome: "applied", writes: true, reason: null },
    ] }, backstopPreview: [
      { entityType: "raw-row", entityId: "a", before: { title: "Old" }, after: { title: "New" }, unavailableReason: null },
      { entityType: "raw-row", entityId: "b", before: null, after: { title: "Made" }, unavailableReason: null },
      { entityType: "raw-row", entityId: "c", before: { title: "x" }, after: { title: "y" }, unavailableReason: "Live row is locked" },
      // Same id, other type: must not be matched to row d.
      { entityType: "raw-row", entityId: "d", before: 1, after: 2, unavailableReason: null },
    ] },
  };

  it("pairs each plan row with its own preview and labels it", () => {
    const rows = backstopPlanRows({ plan, t });
    expect(rows.map(({ key, status, before, after }) => ({ key, status, before, after }))).toEqual([
      { key: "raw-row:a", status: "«Will send»", before: '{\n  "title": "Old"\n}', after: '{\n  "title": "New"\n}' },
      { key: "raw-row:b", status: "«Skipped»", before: "«Does not exist»", after: '{\n  "title": "Made"\n}' },
      { key: "raw-row:c", status: "«Will send»", before: "Live row is locked", after: '{\n  "title": "y"\n}' },
      { key: "raw-file:d", status: "«Will send»", before: "«Live values unavailable; update live first.»", after: "«Live values unavailable; update live first.»" },
    ]);
    expect(rows[1]).toMatchObject({ entityType: "raw-row", entityId: "b", outcome: "skipped", writes: false, reason: "same" });
  });

  it("is empty with no plan, no inner plan, or no preview list", () => {
    expect(backstopPlanRows({ plan: null, t })).toEqual([]);
    expect(backstopPlanRows({ plan: { logId: null, entities: [], skipped: [] }, t })).toEqual([]);
    const noPreview: BackstopPlan = { ...plan, plan: { ...plan.plan!, backstopPreview: undefined } };
    expect(backstopPlanRows({ plan: noPreview, t }).map((row) => row.before)).toEqual(Array(4).fill("«Live values unavailable; update live first.»"));
  });
});
