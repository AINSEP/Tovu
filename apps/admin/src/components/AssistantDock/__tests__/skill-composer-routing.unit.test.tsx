import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { resolveSkillsAvailable, useSkillAwareAttachmentUploader } from "../hooks/AssistantDock.hooks";

describe("skill-aware attachment routing", () => {
  it("returns ordinary attachment results unchanged", async () => {
    const attachments = [{ name: "notes.txt", path: "attachment:notes", kind: "file" as const }];
    const uploadAttachments = vi.fn(async () => attachments);
    const proposeFiles = vi.fn(async () => {});
    const { result } = renderHook(() => useSkillAwareAttachmentUploader({ uploadAttachments, proposeFiles }));
    const files = [new File(["notes"], "notes.txt")];
    await expect(result.current(files)).resolves.toBe(attachments);
    expect(uploadAttachments).toHaveBeenCalledWith(files);
    expect(proposeFiles).not.toHaveBeenCalled();
  });

  it.each(["SKILL.md", "package.zip", "PACKAGE.ZIP"])("proposes the entire batch containing %s before attachment upload", async name => {
    const uploadAttachments = vi.fn(async () => []);
    const proposeFiles = vi.fn(async () => {});
    const { result } = renderHook(() => useSkillAwareAttachmentUploader({ uploadAttachments, proposeFiles }));
    const files = [new File(["reference"], "guide.md"), new File(["skill"], name)];
    await expect(result.current(files)).resolves.toEqual([]);
    expect(proposeFiles).toHaveBeenCalledWith(files);
    expect(uploadAttachments).not.toHaveBeenCalled();
  });

  it("propagates an ordinary upload rejection", async () => {
    const failure = new Error("Upload unavailable");
    const uploadAttachments = vi.fn(async () => { throw failure; });
    const { result } = renderHook(() => useSkillAwareAttachmentUploader({ uploadAttachments, proposeFiles: vi.fn() }));
    await expect(result.current([new File(["notes"], "notes.txt")])).rejects.toBe(failure);
  });

  it("uses the current proposal callback after rerender", async () => {
    const uploadAttachments = vi.fn(async () => []);
    const first = vi.fn(async () => {}), second = vi.fn(async () => {});
    const { result, rerender } = renderHook(({ proposeFiles }) => useSkillAwareAttachmentUploader({ uploadAttachments, proposeFiles }), { initialProps: { proposeFiles: first } });
    const original = result.current;
    rerender({ proposeFiles: first });
    expect(result.current).toBe(original);
    rerender({ proposeFiles: second });
    const files = [new File(["skill"], "SKILL.md")];
    await result.current(files);
    expect(second).toHaveBeenCalledWith(files);
    expect(first).not.toHaveBeenCalled();
  });
});

describe("runtime skill availability", () => {
  it.each([
    { executionMode: "byok" as const, selectedAgentId: "aider", agents: [{ id: "aider", supportsTools: false }], expected: true },
    { executionMode: "local-cli" as const, selectedAgentId: "aider", agents: [{ id: "aider", supportsTools: false }], expected: false },
    { executionMode: "local-cli" as const, selectedAgentId: "claude", agents: [{ id: "aider", supportsTools: false }, { id: "claude", supportsTools: true }], expected: true },
    { executionMode: "local-cli" as const, selectedAgentId: "claude", agents: [{ id: "claude" }], expected: true },
    { executionMode: "local-cli" as const, selectedAgentId: "claude", agents: undefined, expected: true },
  ])("resolves $executionMode / $selectedAgentId to $expected", ({ expected, ...input }) => {
    expect(resolveSkillsAvailable(input)).toBe(expected);
  });
});
