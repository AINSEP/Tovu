import { act, render, renderHook, screen } from "@/__tests__/render-with-jini-kits";
import { describe, expect, it, vi } from "vitest";
import { createElement, createRef, type DragEvent } from "react";
import { ChatPane, type ChatPaneComposerHandle } from "@jini-ai/chat/react";
import type { ChatTransport } from "@jini-ai/chat/core";
import type { FolderDropPort } from "@jini-ai/admin/screens/fs-files/folder-drop-port";
import { useFolderDrop } from "@jini-ai/admin/screens/fs-files/use-folder-drop.hooks";

import { folderDropDeps, nativeFolderPickerDeps } from "../fs-files-api";
import { ApiError } from "@/lib/admin-http/request";

it("reads the host tovuFiles bridge at render and recognizes the existing picker 409", () => {
  const readBridge = vi.fn(() => ({ getPathForFile: () => "/site" }));
  Object.defineProperty(window, "tovuFiles", { configurable: true, get: readBridge });
  const { unmount } = renderHook(() => useFolderDrop({ composerHandle: fakeComposerHandle() }, folderDropDeps));
  expect(readBridge).toHaveBeenCalled();
  expect(nativeFolderPickerDeps.isDialogAlreadyOpen(new ApiError({ message: "open", status: 409 }))).toBe(true);
  expect(nativeFolderPickerDeps.isDialogAlreadyOpen(new ApiError({ message: "refused", status: 403 }))).toBe(false);
  unmount();
  Reflect.deleteProperty(window, "tovuFiles");
});

/**
 * @file Wire tests of the host's `folderDropDeps` binding of `@jini-ai/admin`'s `useFolderDrop`: the
 * real admin API calls, and a drop into the real `ChatPane` composer. The hook's own behavior is
 * covered by `@jini-ai/admin`'s `use-folder-drop.hooks.unit.test.ts`.
 */

/** Flushes pending microtasks without advancing any timer. */
async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
}

/** A minimal `DragEvent` stand-in — only `dataTransfer`/`preventDefault`/`stopPropagation` are ever
 *  read by `handleDropCapture`. */
function fakeDropEvent(dataTransfer: DataTransfer): DragEvent<HTMLElement> {
  return { dataTransfer, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as DragEvent<HTMLElement>;
}

/** Folder drag items whose files `getPathForFile` resolves to `paths`. */
function folderDataTransfer(paths: readonly string[]): { dataTransfer: DataTransfer; port: FolderDropPort } {
  const files = paths.map((_, i) => ({ id: `f${i}` }) as unknown as File);
  const items = files.map(() => ({ kind: "file", webkitGetAsEntry: () => ({ isDirectory: true }) as unknown as FileSystemEntry }) as unknown as DataTransferItem);
  const dataTransfer = { items, files } as unknown as DataTransfer;
  const byFile = new Map(files.map((file, i) => [file, paths[i] as string]));
  return { dataTransfer, port: { getPathForFile: (file) => byFile.get(file) ?? "" } };
}

function fakeComposerHandle(): { current: ChatPaneComposerHandle | null } {
  return { current: { insertText: vi.fn(), addFolders: vi.fn() } as unknown as ChatPaneComposerHandle };
}

describe("folderDropDeps — the real admin API", () => {
  it("reads and sets the custom root through the real admin API when no seams are injected", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${new URL(String(url), "http://localhost").pathname}${init?.body ? ` ${String(init.body)}` : ""}`);
      const body = init?.method === "PUT" ? { path: "/Users/x/site" } : { path: null };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }));
    try {
      const composerHandle = fakeComposerHandle();
      const { dataTransfer, port } = folderDataTransfer(["/Users/x/site"]);
      const { result } = renderHook(() => useFolderDrop({ composerHandle }, { ...folderDropDeps, getPort: () => port }));
      await act(async () => {
        result.current.handleDropCapture(fakeDropEvent(dataTransfer));
      });
      for (let i = 0; i < 5 && result.current.notice === null; i++) await flushMicrotasks();
      expect(result.current.notice).toMatchObject({ kind: "confirmation", path: "/Users/x/site" });
      expect(calls).toEqual([
        "GET /api/admin/v1/workspaces/workspace-local/fs-files/custom-root",
        'PUT /api/admin/v1/workspaces/workspace-local/fs-files/custom-root {"path":"/Users/x/site"}',
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("useFolderDrop — real ChatPane composer", () => {
  it.each([false, true])("keeps dropped folder chips without editing text when the root write fails=%s", async (fails) => {
    const composerHandle = createRef<ChatPaneComposerHandle>();
    const { dataTransfer, port } = folderDataTransfer(["/Users/x/one", "/Users/x/two"]);
    const transport: ChatTransport = {
      async startRun() { throw new Error("this test never sends"); },
      async reattachRun() {},
      async fetchRunStatus() { return null; },
      async stopRun() {},
    };
    const setCustomRoot = fails
      ? vi.fn().mockRejectedValue(new Error("write failed"))
      : vi.fn().mockResolvedValue({ path: "/Users/x/two" });
    const { result } = renderHook(() => useFolderDrop({ composerHandle }, {
      ...folderDropDeps, getPort: () => port, setCustomRoot, getCustomRoot: vi.fn().mockResolvedValue({ path: null }),
    }));
    render(createElement(ChatPane, {
      transport, composerHandle, initialDraft: "Inspect",
      agents: [{ id: "codex", name: "Codex", available: true }],
    }));

    await act(async () => result.current.handleDropCapture(fakeDropEvent(dataTransfer)));

    expect(screen.getByRole("textbox")).toHaveValue("Inspect");
    expect(screen.getByRole("button", { name: "Folders (2)" })).toBeInTheDocument();
    expect(setCustomRoot).toHaveBeenCalledWith("/Users/x/two");
    expect(result.current.notice?.kind).toBe(fails ? "error" : "confirmation");
  });
});

it("keeps the server's custom-root failure code without treating non-text payloads as diagnostics", () => {
  const error = new ApiError({ message: "Invalid path", status: 400 }, {
    code: "INVALID_PATH", body: { error: { path: "/private/site" } },
  });
  expect(folderDropDeps.readFailure(error)).toEqual({ code: "INVALID_PATH", message: "" });
  expect(folderDropDeps.readFailure(new Error("network unavailable"))).toBeNull();
});
