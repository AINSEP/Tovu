import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useSkillInstall } from "../use-skill-install.hooks";
import { captureSkillDrop } from "../skill-drop";
afterEach(() => vi.unstubAllGlobals());
const md = new File(["---\nname: dropped-skill\ndescription: Drop test.\n---\nUse me."], "SKILL.md");
function entry(file: File, fullPath: string) { return { name: file.name, fullPath, isFile: true, isDirectory: false, file: (resolve: (file: File) => void) => resolve(file) }; }
function directory(files: ReturnType<typeof entry>[]) { return { name: "skill", fullPath: "/skill", isDirectory: true, isFile: false, createReader: () => { let read = false; return { readEntries: (resolve: Function) => { resolve(read ? [] : files); read = true; } }; } }; }
it("a chat folder drop preserves references, asks before installing and uses the common API", async () => {
  const requests: unknown[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url, init) => { expect(url).toBe("/api/admin/v1/workspaces/workspace-local/skills"); expect(init.method).toBe("POST"); requests.push(JSON.parse(init.body)); return Response.json({ skill: {} }); }));
  const { result } = renderHook(() => useSkillInstall());
  const root = directory([entry(md, "/skill/SKILL.md"), entry(new File(["reference"], "check.md"), "/skill/references/check.md")]);
  const preventDefault = vi.fn(), stopPropagation = vi.fn();
  const event = { dataTransfer: { items: [{ kind: "file", webkitGetAsEntry: () => root, getAsFile: () => null }], files: [], types: ["Files"] }, preventDefault, stopPropagation };
  await act(async () => { expect(captureSkillDrop(event as never, result.current.proposeFiles, vi.fn())).toBe(true); });
  await waitFor(() => expect(result.current.pending).toEqual({ files: [{ path: "skill/SKILL.md", contentBase64: btoa(awaitText) }, { path: "skill/references/check.md", contentBase64: btoa("reference") }] }));
  expect(requests).toEqual([]);
  expect(preventDefault).toHaveBeenCalledTimes(1);
  expect(stopPropagation).toHaveBeenCalledTimes(1);
  await act(async () => { await result.current.confirm(); });
  expect(requests).toEqual([{ confirmed: true, files: [{ path: "skill/SKILL.md", contentBase64: btoa(awaitText) }, { path: "skill/references/check.md", contentBase64: btoa("reference") }] }]);
});
const awaitText = "---\nname: dropped-skill\ndescription: Drop test.\n---\nUse me.";
it("ordinary files fall through, and non-skill folders preserve the existing folder handler", async () => {
  const fallback = vi.fn();
  const propose = vi.fn();
  const event = { dataTransfer: { items: [], files: [new File(["photo"], "photo.png")], types: ["Files"] }, preventDefault: vi.fn(), stopPropagation: vi.fn() };
  expect(captureSkillDrop(event as never, propose, fallback)).toBe(false);
  expect(event.preventDefault).not.toHaveBeenCalled();
  const root = directory([entry(new File(["notes"], "notes.md"), "/folder/notes.md")]);
  const folderEvent = { ...event, dataTransfer: { items: [{ kind: "file", webkitGetAsEntry: () => root, getAsFile: () => null }], files: [], types: ["Files"] } };
  await act(async () => { captureSkillDrop(folderEvent as never, propose, fallback); });
  await waitFor(() => expect(fallback).toHaveBeenCalledTimes(1));
  expect(propose).not.toHaveBeenCalled();
});
it("cancelling a chat file proposal persists nothing", async () => {
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  const { result } = renderHook(() => useSkillInstall());
  await act(async () => { await result.current.proposeFiles([md]); });
  expect(result.current.pending).not.toBeNull();
  act(() => result.current.cancel());
  expect(result.current.pending).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});


it("browser directories remain on Jini's folder-expanding attachment path", () => {
  const root = directory([entry(new File(["notes"], "notes.md"), "/folder/notes.md")]);
  const event = { dataTransfer: { items: [{ kind: "file", getAsFile: () => null, webkitGetAsEntry: () => root }], files: [], types: ["Files"] }, preventDefault: vi.fn(), stopPropagation: vi.fn() };
  expect(captureSkillDrop(event as never, vi.fn(), vi.fn(), vi.fn(), false)).toBe(false);
  expect(event.preventDefault).not.toHaveBeenCalled();
});
