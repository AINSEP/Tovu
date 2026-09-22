import { describe, expect, it } from "vitest";

import { formatByteSize } from "../rules";

/**
 * @file `formatByteSize` — the Media grid card's file-size text (owner ask, 2026-09-21: "have the
 * size of the media asset ... on the card"). See that function's own doc for the unit-base and
 * decimal-place reasoning this file asserts against.
 */

describe("formatByteSize", () => {
  it("formats a sub-1KB byte count with no unit conversion, rounded, no decimal", () => {
    expect(formatByteSize({ bytes: 823 })).toBe("823 B");
    expect(formatByteSize({ bytes: 0 })).toBe("0 B");
  });

  it("formats a KB-range count with no decimal, rounded to the nearest whole KB", () => {
    // 820 * 1024 = 839,680 bytes.
    expect(formatByteSize({ bytes: 839_680 })).toBe("820 KB");
    // 1023 bytes rounds down to 1 KB, not up into the next unit.
    expect(formatByteSize({ bytes: 1023 * 1024 })).toBe("1023 KB");
  });

  it("formats an MB-range count with exactly one decimal", () => {
    // 9.5 * 1024 * 1024 = 9,961,472 bytes.
    expect(formatByteSize({ bytes: 9_961_472 })).toBe("9.5 MB");
    // A whole-MB value still shows one decimal (not dropped) so "10.0 MB" and "9.5 MB" both read
    // consistently at this unit, matching the function's own doc on why MB/GB never round to zero
    // decimals.
    expect(formatByteSize({ bytes: 10 * 1024 * 1024 })).toBe("10.0 MB");
  });

  it("formats a GB-range count with exactly one decimal", () => {
    // 1.2 * 1024 * 1024 * 1024 = 1,288,490,188.8 -> rounds to 1,288,490,189 bytes.
    expect(formatByteSize({ bytes: 1_288_490_189 })).toBe("1.2 GB");
  });

  it("crosses each unit boundary at exactly 1024, not 1000", () => {
    expect(formatByteSize({ bytes: 1024 })).toBe("1 KB");
    expect(formatByteSize({ bytes: 1024 * 1024 })).toBe("1.0 MB");
    expect(formatByteSize({ bytes: 1024 * 1024 * 1024 })).toBe("1.0 GB");
  });

  it("uses the given locale's decimal separator via Intl.NumberFormat, not a hardcoded '.'", () => {
    // German locale formats the decimal separator as ',' — proves the format is NOT a hand-rolled
    // string template, which would ignore `locale` entirely.
    expect(formatByteSize({ bytes: 9_961_472 }, { locale: "de-DE" })).toBe("9,5 MB");
  });

  it("defaults to en-US formatting when no locale option is given", () => {
    expect(formatByteSize({ bytes: 9_961_472 })).toBe(formatByteSize({ bytes: 9_961_472 }, { locale: "en-US" }));
  });
});
