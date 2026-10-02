import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSkillFiles } from "../use-skill-files.hooks";
import type { SkillFiles } from "../api";

const listing: SkillFiles = {
  toolId: "skill_example", truncated: false,
  limits: { maxFiles: 200, maxEntries: 2000, maxFileBytes: 524288, maxTotalBytes: 4194304 },
  files: [
    { relativePath: "README.md", sizeBytes: 4, content: "Read", omitted: null },
    { relativePath: "SKILL.md", sizeBytes: 5, content: "Rules", omitted: null },
    { relativePath: "references/check.md", sizeBytes: 5, content: "Check", omitted: null },
  ],
};
const t = (key: string) => key;

describe("useSkillFiles", () => {
  it("loads files, opens SKILL.md first and permits selecting references", async () => {
    const read = vi.fn().mockResolvedValue(listing);
    const { result } = renderHook(() => useSkillFiles({ toolId: listing.toolId, read, t }));
    expect(result.current.status).toEqual({ text: "Loading skill files…", role: "status" });
    await waitFor(() => expect(result.current.files).toHaveLength(3));
    expect(read).toHaveBeenCalledWith(listing.toolId);
    expect(result.current.selectedFile).toEqual({ relativePath: "SKILL.md", content: "Rules" });
    expect(result.current.status).toBeNull();
    act(() => result.current.selectFile("references/check.md"));
    expect(result.current.selectedFile?.content).toBe("Check");
    act(() => result.current.selectFile("unknown.md"));
    expect(result.current.selectedFile?.relativePath).toBe("SKILL.md");
  });

  it("shows failures with no files or selected content", async () => {
    const read = vi.fn().mockRejectedValue(new Error("Permission denied"));
    const { result } = renderHook(() => useSkillFiles({ toolId: listing.toolId, read, t }));
    await waitFor(() => expect(result.current.status).toEqual({ text: "Permission denied", role: "alert" }));
    expect(result.current.files).toEqual([]);
    expect(result.current.selectedFile).toBeNull();
  });

  it("discards stale reads and resets selection when inspecting another skill", async () => {
    let resolveFirst!: (value: SkillFiles) => void;
    const read = vi.fn((id: string) => id === "first" ? new Promise<SkillFiles>(resolve => { resolveFirst = resolve; }) : Promise.resolve(listing));
    const { result, rerender } = renderHook(({ toolId }) => useSkillFiles({ toolId, read, t }), { initialProps: { toolId: "first" } });
    rerender({ toolId: "second" });
    await waitFor(() => expect(result.current.files).toHaveLength(3));
    await act(async () => resolveFirst({ ...listing, files: [] }));
    expect(result.current.files).toHaveLength(3);
    act(() => result.current.selectFile("references/check.md"));
    rerender({ toolId: "third" });
    expect(result.current.files).toEqual([]);
    await waitFor(() => expect(result.current.selectedFile?.relativePath).toBe("SKILL.md"));
  });

  it("avoids requests when closed and reports empty and capped listings", async () => {
    const read = vi.fn().mockResolvedValue({ ...listing, files: [], truncated: true });
    const { result, rerender } = renderHook(({ toolId }) => useSkillFiles({ toolId, read, t }), { initialProps: { toolId: null as string | null } });
    expect(read).not.toHaveBeenCalled();
    rerender({ toolId: "empty" });
    await waitFor(() => expect(result.current.status?.text).toBe("No files to show for this skill."));
    expect(result.current.listNotice).toBe("Some files are not listed: this package is larger than the viewer's limits.");
  });
});
