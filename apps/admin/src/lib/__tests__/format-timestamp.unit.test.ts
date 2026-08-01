import { expect, test } from "vitest";

import { formatTimestamp } from "../format-timestamp";

/**
 * @file `formatTimestamp` — pins the exact output the ~11 call sites this consolidates
 * (`x.slice(0, 16).replace("T", " ")`, audit cross-cutting finding #4) already produced, so the
 * migration to a shared helper is provably a no-op on rendered output.
 */

test("formats a standard ISO timestamp as 'YYYY-MM-DD HH:MM'", () => {
  expect(formatTimestamp("2026-08-01T10:30:00.000Z")).toBe("2026-08-01 10:30");
});

test("trailing seconds/milliseconds/zone suffix are dropped, not just the Z", () => {
  expect(formatTimestamp("2026-08-01T10:30:45+05:30")).toBe("2026-08-01 10:30");
});

test("a timestamp with no sub-minute precision at all is unaffected", () => {
  expect(formatTimestamp("2026-08-01T10:30")).toBe("2026-08-01 10:30");
});
