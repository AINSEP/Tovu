import { afterEach, describe, expect, it, vi } from "vitest";

import { readAgentsSnapshot, writeAgentsSnapshot } from "../assistant-agents-snapshot";

const STORAGE_KEY = "tovu.admin.assistant-agents.v1";

describe("assistant agents snapshot", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("round-trips a live list", () => {
    writeAgentsSnapshot([{ id: "claude", name: "Claude Code", models: [{ id: "opus", label: "Opus" }] }]);

    expect(readAgentsSnapshot()).toEqual([{ id: "claude", name: "Claude Code", models: [{ id: "opus", label: "Opus" }] }]);
  });

  it("reads undefined when nothing is stored", () => {
    expect(readAgentsSnapshot()).toBeUndefined();
  });

  it("does not store an empty list over a useful one", () => {
    writeAgentsSnapshot([{ id: "claude", name: "Claude Code" }]);
    writeAgentsSnapshot([]);

    expect(readAgentsSnapshot()).toEqual([{ id: "claude", name: "Claude Code" }]);
  });

  it.each([
    ["corrupt JSON", "{not json"],
    ["a non-array", JSON.stringify({ id: "claude" })],
    ["an empty array", "[]"],
    ["an entry without a string id/name", JSON.stringify([{ id: "claude", name: "Claude Code" }, { id: 7 }])],
  ])("reads undefined for %s", (_label, raw) => {
    localStorage.setItem(STORAGE_KEY, raw);

    expect(readAgentsSnapshot()).toBeUndefined();
  });

  it("reads undefined, without throwing, when storage itself throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    expect(readAgentsSnapshot()).toBeUndefined();
  });

  it("writes nothing, without throwing, when storage itself throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    expect(() => writeAgentsSnapshot([{ id: "claude", name: "Claude Code" }])).not.toThrow();
  });
});
