import { File as NativeFile } from "node:buffer";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useSkillInstall } from "../use-skill-install.hooks";
import { captureSkillDrop } from "../skill-drop";
afterEach(() => vi.unstubAllGlobals());
const md = (new NativeFile(["---\nname: dropped-skill\ndescription: Drop test.\n---\nUse me."], "SKILL.md") as unknown as File);
function entry(file: File, fullPath: string) { return { name: file.name, fullPath, isFile: true, isDirectory: false, file: (resolve: (file: File) => void) => resolve(file) }; }
function directory(files: unknown[]) { return { name: "skill", fullPath: "/skill", isDirectory: true, isFile: false, createReader: () => { let read = false; return { readEntries: (resolve: Function) => { resolve(read ? [] : files); read = true; } }; } }; }
it("a chat folder drop preserves references, asks before installing and uses the common API", async () => {
  const requests: unknown[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url, init) => { expect(url).toBe("/api/admin/v1/workspaces/workspace-local/skills"); expect(init.method).toBe("POST"); requests.push(JSON.parse(init.body)); return Response.json({ skill: {} }); }));
  const { result } = renderHook(() => useSkillInstall());
  const root = directory([entry(md, "/skill/SKILL.md"), entry((new NativeFile(["reference"], "check.md") as unknown as File), "/skill/references/check.md")]);
  const preventDefault = vi.fn(), stopPropagation = vi.fn();
  const event = { dataTransfer: { items: [{ kind: "file", webkitGetAsEntry: () => root, getAsFile: () => null }], files: [], types: ["Files"] }, preventDefault, stopPropagation };
  await act(async () => { expect(captureSkillDrop({ event: event as never, proposeFiles: result.current.proposeFiles, fallback: vi.fn() })).toBe(true); });
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
  const event = { dataTransfer: { items: [], files: [(new NativeFile(["photo"], "photo.png") as unknown as File)], types: ["Files"] }, preventDefault: vi.fn(), stopPropagation: vi.fn() };
  expect(captureSkillDrop({ event: event as never, proposeFiles: propose, fallback })).toBe(false);
  expect(event.preventDefault).not.toHaveBeenCalled();
  const root = directory([entry((new NativeFile(["notes"], "notes.md") as unknown as File), "/folder/notes.md")]);
  const folderEvent = { ...event, dataTransfer: { items: [{ kind: "file", webkitGetAsEntry: () => root, getAsFile: () => null }], files: [], types: ["Files"] } };
  await act(async () => { captureSkillDrop({ event: folderEvent as never, proposeFiles: propose, fallback }); });
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


it("a folder too big to be a skill, with no SKILL.md seen, keeps the host's folder action instead of a skill error", async () => {
  // Owner 2026-10-27: a large assets folder dropped on the chat must reach the folder handler (path
  // or paste hint), not report "Skill folder has too many entries".
  const root = directory(Array.from({ length: 600 }, (_, i) => entry(new NativeFile(["x"], `a${i}.png`) as unknown as File, `/assets/a${i}.png`)));
  const onError = vi.fn(), proposeFiles = vi.fn(), fallback = vi.fn();
  const event = dropEvent(root);
  await act(async () => { expect(captureSkillDrop({ event: event as never, proposeFiles, fallback }, { onError })).toBe(true); });
  await waitFor(() => expect(fallback).toHaveBeenCalledTimes(1));
  expect(event.preventDefault).toHaveBeenCalledTimes(1);
  expect(onError).not.toHaveBeenCalled();
  expect(proposeFiles).not.toHaveBeenCalled();
});

it.each(["site.zip", "agent.zip", "skill.zip", "SKILL.md"])("file-only %s drops reach the skill-aware attachment uploader", name => {
  const event = { dataTransfer: { items: [], files: [(new NativeFile(["file"], name) as unknown as File)], types: ["Files"] }, preventDefault: vi.fn(), stopPropagation: vi.fn() };
  const propose = vi.fn();
  expect(captureSkillDrop({ event: event as never, proposeFiles: propose, fallback: vi.fn() })).toBe(false);
  expect(propose).not.toHaveBeenCalled();
  expect(event.preventDefault).not.toHaveBeenCalled();
});

function dropEvent(root: unknown) {
  return { dataTransfer: { items: [{ kind: "file", getAsFile: () => null, webkitGetAsEntry: () => root }] },
    preventDefault: vi.fn(), stopPropagation: vi.fn() };
}

it("snapshots a non-skill folder before forwarding it to the attachment handler", async () => {
  const file = new NativeFile(["notes"], "notes.md") as unknown as File;
  const root = directory([entry(file, "/folder/notes.md")]);
  const event = dropEvent(root);
  const fallback = vi.fn(saved => {
    expect(saved.dataTransfer.files).toEqual([]);
    expect(saved.dataTransfer.types).toEqual([]);
    expect(saved.dataTransfer.items[0].getAsFile()).toBeNull();
    expect(saved.dataTransfer.items[0].webkitGetAsEntry()).toBe(root);
    saved.preventDefault(); saved.stopPropagation();
  });
  await act(async () => { captureSkillDrop({ event: event as never, proposeFiles: vi.fn(), fallback }); });
  await waitFor(() => expect(fallback).toHaveBeenCalledTimes(1));
  expect(event.preventDefault).toHaveBeenCalledTimes(1);
  expect(event.stopPropagation).toHaveBeenCalledTimes(1);
});

it("ignores text items, missing entries, and legacy drops without native item lists", () => {
  const proposeFiles = vi.fn(), fallback = vi.fn();
  for (const dataTransfer of [{}, { items: [
    { kind: "string", getAsFile: () => { throw new Error("not a file"); } },
    { kind: "file", getAsFile: () => md },
    { kind: "file", getAsFile: () => null, webkitGetAsEntry: () => null },
  ] }]) {
    const event = { dataTransfer, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    expect(captureSkillDrop({ event: event as never, proposeFiles, fallback })).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
  }
  expect(proposeFiles).not.toHaveBeenCalled();
  expect(fallback).not.toHaveBeenCalled();
});

it("walks nested batches, ignores unsupported entries, and strips leading path slashes", async () => {
  const nested = directory([entry(md, "///skill/nested/SKILL.md")]);
  const ignored = { name: "other", fullPath: "/other", isFile: false, isDirectory: false };
  const root = { ...directory([]), createReader: () => {
    const batches = [[ignored], [nested], []];
    return { readEntries: (resolve: (entries: unknown[]) => void) => resolve(batches.shift()!) };
  } };
  const proposeFiles = vi.fn(async () => {}), fallback = vi.fn();
  await act(async () => { captureSkillDrop({ event: dropEvent(root) as never, proposeFiles, fallback }); });
  await waitFor(() => expect(proposeFiles).toHaveBeenCalledExactlyOnceWith([md], ["skill/nested/SKILL.md"]));
  expect(fallback).not.toHaveBeenCalled();
});

it.each([
  [new Error("directory unreadable"), "directory unreadable"],
  ["private driver payload", "Could not read skill folder."],
])("reports a safe folder-read failure for %s", async (failure, message) => {
  const root = { ...directory([]), createReader: () => ({
    readEntries: (_resolve: Function, reject: (error: unknown) => void) => reject(failure),
  }) };
  const onError = vi.fn(), proposeFiles = vi.fn(), fallback = vi.fn();
  await act(async () => { captureSkillDrop({ event: dropEvent(root) as never, proposeFiles, fallback }, { onError }); });
  await waitFor(() => expect(onError).toHaveBeenCalledExactlyOnceWith(message));
  expect(proposeFiles).not.toHaveBeenCalled();
  expect(fallback).not.toHaveBeenCalled();
});

it("consumes a folder-read rejection when no error presenter is installed", async () => {
  const root = directory([{ ...entry(md, "/skill/SKILL.md"),
    file: (_resolve: Function, reject: (error: Error) => void) => reject(new Error("unreadable file")),
  }]);
  const proposeFiles = vi.fn(), fallback = vi.fn();
  await act(async () => { captureSkillDrop({ event: dropEvent(root) as never, proposeFiles, fallback }); });
  expect(proposeFiles).not.toHaveBeenCalled();
  expect(fallback).not.toHaveBeenCalled();
});

it.each(["entries", "depth", "files", "bytes"])("refuses folders exceeding the %s limit without forwarding a partial proposal", async limit => {
  let root: unknown;
  // Each oversized folder shows a SKILL.md before the limit hits: without one it is not a skill and
  // falls back to the folder handler instead (see the "too big to be a skill" case above).
  if (limit === "entries") root = directory([entry(md, "/skill/SKILL.md"), ...Array.from({ length: 512 }, () => ({ isFile: false, isDirectory: false }))]);
  if (limit === "depth") {
    root = directory([]);
    for (let depth = 0; depth < 17; depth++) root = directory([root]);
    root = directory([entry(md, "/skill/SKILL.md"), root]);
  }
  if (limit === "files") root = directory(Array.from({ length: 257 }, () => entry(md, "/skill/SKILL.md")));
  if (limit === "bytes") root = directory([entry(md, "/skill/SKILL.md"),
    entry(new NativeFile([new Uint8Array(8 * 1024 * 1024)], "big.bin") as unknown as File, "/skill/big.bin")]);
  const onError = vi.fn(), proposeFiles = vi.fn(), fallback = vi.fn();
  await act(async () => { captureSkillDrop({ event: dropEvent(root) as never, proposeFiles, fallback }, { onError }); });
  await waitFor(() => expect(onError).toHaveBeenCalledExactlyOnceWith(
    limit === "entries" || limit === "depth" ? "Skill folder has too many entries or is too deep." : "Choose up to 256 files, 8 MiB total."));
  expect(proposeFiles).not.toHaveBeenCalled();
  expect(fallback).not.toHaveBeenCalled();
});

it("reports installation proposal failures through the same error presenter", async () => {
  const onError = vi.fn(), fallback = vi.fn();
  await act(async () => { captureSkillDrop({ event: dropEvent(directory([entry(md, "/skill/SKILL.md")])) as never,
    proposeFiles: async () => { throw new Error("proposal refused"); }, fallback }, { onError }); });
  await waitFor(() => expect(onError).toHaveBeenCalledExactlyOnceWith("proposal refused"));
  expect(fallback).not.toHaveBeenCalled();
});

it.each(["entries", "depth", "files", "bytes"])("accepts a folder exactly at the %s limit", async limit => {
  let root = directory([entry(md, "/skill/SKILL.md")]);
  let expectedFiles = [md];
  if (limit === "entries") root = directory([
    ...Array.from({ length: 510 }, () => ({ name: "ignored", fullPath: "/ignored", isFile: false, isDirectory: false })),
    entry(md, "/skill/SKILL.md"),
  ]);
  if (limit === "depth") for (let depth = 0; depth < 15; depth++) root = directory([root]);
  if (limit === "files") {
    expectedFiles = Array.from({ length: 256 }, () => md);
    root = directory(expectedFiles.map(file => entry(file, "/skill/SKILL.md")));
  }
  if (limit === "bytes") {
    const remaining = new NativeFile([new Uint8Array(8 * 1024 * 1024 - md.size)], "data.bin") as unknown as File;
    expectedFiles = [md, remaining];
    root = directory([entry(md, "/skill/SKILL.md"), entry(remaining, "/skill/data.bin")]);
  }
  const onError = vi.fn(), fallback = vi.fn(), proposeFiles = vi.fn(async (_files: readonly File[], _paths?: readonly string[]) => {});
  await act(async () => { captureSkillDrop({ event: dropEvent(root) as never, proposeFiles, fallback }, { onError }); });
  await waitFor(() => expect(proposeFiles).toHaveBeenCalledTimes(1));
  expect(proposeFiles.mock.calls[0]?.[0]).toEqual(expectedFiles);
  expect(onError).not.toHaveBeenCalled();
  expect(fallback).not.toHaveBeenCalled();
});
