import { afterEach, describe, expect, it, vi } from "vitest";

import { readAgentsSnapshot, writeAgentsSnapshot } from "../shell-collaborators";

/**
 * @file The host composition of Jini's `createAssistantAgentsSnapshot`: the real shared snapshot
 * under the host's pre-move key (literal here, so a drifted key fails the corrupt-entry cases).
 */
const STORAGE_KEY = "tovu.admin.assistant-agents.v1";

describe("assistant agents snapshot", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("round-trips a live list", () => {
    writeAgentsSnapshot({ agents: [{ id: "claude", name: "Claude Code", models: [{ id: "opus", label: "Opus" }] }] });

    expect(readAgentsSnapshot()).toEqual([{ id: "claude", name: "Claude Code", models: [{ id: "opus", label: "Opus" }] }]);
  });

  it("persists under the host's pre-move key, so inventories stored before the move still load", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ id: "codex", name: "Codex" }]));
    expect(readAgentsSnapshot()).toEqual([{ id: "codex", name: "Codex" }]);

    writeAgentsSnapshot({ agents: [{ id: "claude", name: "Claude Code" }] });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")).toEqual([{ id: "claude", name: "Claude Code" }]);
  });

  it("reads undefined when nothing is stored", () => {
    expect(readAgentsSnapshot()).toBeUndefined();
  });

  it("does not store an empty list over a useful one", () => {
    writeAgentsSnapshot({ agents: [{ id: "claude", name: "Claude Code" }] });
    writeAgentsSnapshot({ agents: [] });

    expect(readAgentsSnapshot()).toEqual([{ id: "claude", name: "Claude Code" }]);
  });

  it.each([
    ["corrupt JSON", "{not json"],
    ["a non-array", JSON.stringify({ id: "claude" })],
    ["an empty array", "[]"],
    ["an entry without a string id/name", JSON.stringify([{ id: "claude", name: "Claude Code" }, { id: 7 }])],
    ["a null entry", JSON.stringify([{ id: "claude", name: "Claude Code" }, null])],
    ["a bare-string entry", JSON.stringify(["claude"])],
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

    expect(() => writeAgentsSnapshot({ agents: [{ id: "claude", name: "Claude Code" }] })).not.toThrow();
  });
});
