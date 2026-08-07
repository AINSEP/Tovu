import { describe, expect, it } from "vitest";

import { actionLabel, orEmpty, sortIssuesBySeverity } from "../rules";
import type { SeoIssue } from "../../../lib/api";

/**
 * @file Pure-logic coverage for `features/seo/rules.ts` — `sortIssuesBySeverity` is the whole
 * module.
 */

function issue(code: string, severity: SeoIssue["severity"]): SeoIssue {
  return { code, severity, message: `${code} message` };
}

describe("sortIssuesBySeverity", () => {
  it("orders error before warning before info", () => {
    const issues = [issue("i1", "info"), issue("w1", "warning"), issue("e1", "error")];
    expect(sortIssuesBySeverity(issues).map((i) => i.code)).toEqual(["e1", "w1", "i1"]);
  });

  it("sorts an unrecognized severity last, after info, rather than throwing", () => {
    const issues = [
      issue("u1", "unknown-severity" as SeoIssue["severity"]),
      issue("i1", "info"),
      issue("e1", "error"),
    ];
    expect(sortIssuesBySeverity(issues).map((i) => i.code)).toEqual(["e1", "i1", "u1"]);
  });

  it("preserves relative order between issues of the same severity (stable sort)", () => {
    const issues = [issue("e1", "error"), issue("e2", "error"), issue("e3", "error")];
    expect(sortIssuesBySeverity(issues).map((i) => i.code)).toEqual(["e1", "e2", "e3"]);
  });

  it("returns an empty array for an empty input", () => {
    expect(sortIssuesBySeverity([])).toEqual([]);
  });

  it("does not mutate the array passed in", () => {
    const issues = [issue("i1", "info"), issue("e1", "error")];
    const original = [...issues];
    sortIssuesBySeverity(issues);
    expect(issues).toEqual(original);
  });

  it("returns a new array, not the same reference", () => {
    const issues = [issue("e1", "error")];
    expect(sortIssuesBySeverity(issues)).not.toBe(issues);
  });
});

describe("orEmpty", () => {
  it("returns the value unchanged when set", () => {
    expect(orEmpty("hello")).toBe("hello");
  });

  it("returns '' for undefined", () => {
    expect(orEmpty(undefined)).toBe("");
  });

  it("does not fall back for an explicit empty string", () => {
    expect(orEmpty("")).toBe("");
  });
});

describe("actionLabel", () => {
  it("returns the pending label while pending", () => {
    expect(actionLabel(true, "Saving…", "Save")).toBe("Saving…");
  });

  it("returns the idle label when not pending", () => {
    expect(actionLabel(false, "Saving…", "Save")).toBe("Save");
  });
});
