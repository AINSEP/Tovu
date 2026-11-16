import { isValidElement } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@/__tests__/fetch-query-render";
import type { InstalledSkill, SkillFiles } from "../api";

const listSkillFiles = vi.fn();
vi.mock("../api", async (importOriginal) => ({ ...(await importOriginal<typeof import("../api")>()), listSkillFiles: (...args: unknown[]) => listSkillFiles(...args) }));

import { useSkillFilesModal } from "../use-skill-files.hooks";

afterEach(() => listSkillFiles.mockReset());

const skill = { toolId: "skill_a", name: "Alpha" } as InstalledSkill;
const files: SkillFiles = {
  toolId: "skill_a", truncated: false,
  limits: { maxFiles: 200, maxEntries: 2000, maxFileBytes: 524288, maxTotalBytes: 4194304 },
  files: [
    { relativePath: "SKILL.md", sizeBytes: 5, content: "Rules", omitted: null },
    { relativePath: "references/a.md", sizeBytes: 1, content: "A", omitted: null },
  ],
};

it("is null while no skill is selected and reads nothing", () => {
  const { result } = renderHook(() => useSkillFilesModal({ skill: null, onClose: vi.fn() }));
  expect(result.current).toBeNull();
  expect(listSkillFiles).not.toHaveBeenCalled();
});

it("builds modal props for the selected skill: untranslated title and subtitle by default, files, and select wiring", async () => {
  listSkillFiles.mockResolvedValue(files);
  const onClose = vi.fn();
  const { result } = renderHook(() => useSkillFilesModal({ skill, onClose }));
  await waitFor(() => expect(result.current?.files).toHaveLength(2));
  expect(listSkillFiles).toHaveBeenCalledWith({ toolId: "skill_a" });
  expect(result.current?.title).toBe("Alpha skill files");
  expect(result.current?.subtitle).toBe("Read-only view of this skill's files; nothing runs from this screen.");
  expect(result.current?.handlePrefix).toBe("skill-file");
  expect(result.current?.onClose).toBe(onClose);
  expect(result.current?.headerExtras).toBeUndefined();
  expect(result.current?.selectedFile?.relativePath).toBe("SKILL.md");
  act(() => result.current!.onSelectFile("references/a.md"));
  expect(result.current?.selectedFile).toEqual({ relativePath: "references/a.md", content: "A" });
});

it("puts the failure notice in the modal header when the files cannot be read", async () => {
  listSkillFiles.mockRejectedValue(new Error("Permission denied"));
  const { result } = renderHook(() => useSkillFilesModal({ skill, onClose: vi.fn() }));
  await waitFor(() => expect(isValidElement(result.current?.headerExtras)).toBe(true));
  expect(result.current?.status).toEqual({ text: "Permission denied", role: "alert" });
  expect(result.current?.files).toEqual([]);
});

it("uses the supplied translator for the title", async () => {
  listSkillFiles.mockResolvedValue(files);
  const { result } = renderHook(() => useSkillFilesModal({ skill, onClose: vi.fn() }, { t: key => key === "{name} skill files" ? "Archivos de {name}" : key }));
  await waitFor(() => expect(result.current?.files).toHaveLength(2));
  expect(result.current?.title).toBe("Archivos de Alpha");
});
