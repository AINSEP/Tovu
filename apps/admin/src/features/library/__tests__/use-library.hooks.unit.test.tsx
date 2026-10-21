import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { publishContentRefresh, resetContentRefreshBus } from "@/lib/content-refresh-bus";
import { createFakeLibraryPort, fakeDocument } from "../hooks/library-dependencies.hooks";
import type { LibraryPort } from "../hooks/library-port.hooks";
import { useLibrary, useWiredLibrary } from "../hooks/use-library.hooks";
import { LIBRARY_MAX_BYTES } from "../rules";

/**
 * @file `useLibrary`'s controller contract beyond the screen-level suite in `Library.unit.test.tsx`:
 * every per-file refusal message, the one-at-a-time upload queue, clearing finished rows, preview
 * races (a closed or replaced preview never repaints), rename/Trash failure and in-flight guards,
 * uploader names, list errors, refresh-bus reloads, and the production wiring in `useWiredLibrary`.
 */

function wrapper({ children }: { children: ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

const english = (key: string) => key;

function renderController(port: LibraryPort) {
  return renderHook(() => useLibrary({ port, locale: "en", t: english }), { wrapper });
}

/** A promise the test settles by hand, to hold a port call in flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A `File` whose reported size is `size` without allocating that many bytes. */
function sizedFile(name: string, size: number): File {
  const file = new File(["x"], name);
  Object.defineProperty(file, "size", { value: size });
  return file;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetContentRefreshBus();
});

describe("useLibrary uploads", () => {
  it("names each refusal on its own row without sending it", () => {
    const port = createFakeLibraryPort();
    const { result } = renderController(port);
    act(() => result.current.addFiles([
      sizedFile("huge.pdf", LIBRARY_MAX_BYTES + 1),
      sizedFile("deck.key", 0),
      sizedFile("blank.md", 0),
    ]));
    expect(result.current.uploads.map((row) => [row.name, row.status, row.error])).toEqual([
      ["huge.pdf", "failed", "Larger than 10 MiB."],
      ["deck.key", "failed", "Folder package: in Pages/Keynote, save as a single file, then upload again."],
      ["blank.md", "failed", "This file is empty."],
    ]);
    expect(port.calls).toEqual([]);
  });

  it("queues files added while an upload is running and sends them after it, in order", async () => {
    const port = createFakeLibraryPort();
    const first = deferred<void>();
    const upload = port.uploadDocument;
    let held = true;
    port.uploadDocument = async (input) => {
      if (held) {
        held = false;
        await first.promise;
      }
      return upload(input);
    };
    const { result } = renderController(port);
    act(() => result.current.addFiles([new File(["a"], "a.md")]));
    await waitFor(() => expect(result.current.uploads[0]?.status).toBe("uploading"));
    act(() => result.current.addFiles([new File(["b"], "b.md")]));
    expect(result.current.uploads.find((row) => row.name === "b.md")?.status).toBe("waiting");
    await act(async () => first.resolve());
    await waitFor(() => expect(result.current.uploadedCount).toBe(2));
    expect(port.calls).toEqual(["upload:a.md", "upload:b.md"]);
  });

  it("Clear list drops finished and failed rows but keeps the one still uploading", async () => {
    const port = createFakeLibraryPort();
    const gate = deferred<void>();
    const upload = port.uploadDocument;
    port.uploadDocument = async (input) => {
      if (input.filename === "slow.md") await gate.promise;
      return upload(input);
    };
    const { result } = renderController(port);
    act(() => result.current.addFiles([new File(["x"], "virus.exe"), new File(["s"], "slow.md")]));
    await waitFor(() => expect(result.current.uploads.find((row) => row.name === "slow.md")?.status).toBe("uploading"));
    act(() => result.current.clearUploads());
    expect(result.current.uploads.map((row) => row.name)).toEqual(["slow.md"]);
    await act(async () => gate.resolve());
    await waitFor(() => expect(result.current.uploadedCount).toBe(1));
    act(() => result.current.clearUploads());
    expect(result.current.uploads).toEqual([]);
  });
});

describe("useLibrary previews", () => {
  it("opens a download-only document without loading anything", () => {
    const port = createFakeLibraryPort();
    const { result } = renderController(port);
    const doc = fakeDocument("report.docx");
    act(() => result.current.openPreview(doc));
    expect(result.current.preview).toMatchObject({ item: doc, kind: "download", loading: false, error: null });
    expect(port.calls).toEqual([]);
  });

  it("shows the port's failure on the preview", async () => {
    const port = createFakeLibraryPort();
    port.readDocumentText = async () => { throw new Error("text unavailable"); };
    const { result } = renderController(port);
    act(() => result.current.openPreview(fakeDocument("a.txt")));
    await waitFor(() => expect(result.current.preview).toMatchObject({ loading: false, error: "text unavailable" }));
  });

  it("does not repaint a text preview that was closed before its text arrived", async () => {
    const port = createFakeLibraryPort();
    const text = deferred<{ text: string; truncated: boolean }>();
    port.readDocumentText = () => text.promise;
    const { result } = renderController(port);
    act(() => result.current.openPreview(fakeDocument("a.txt")));
    act(() => result.current.closePreview());
    await act(async () => text.resolve({ text: "late", truncated: false }));
    expect(result.current.preview).toBeNull();
  });

  it("does not build a blob URL for a PDF preview replaced before its bytes arrived", async () => {
    const createObjectURL = vi.fn(() => "blob:never");
    URL.createObjectURL = createObjectURL;
    const port = createFakeLibraryPort();
    const bytes = deferred<Blob>();
    port.fetchDocumentBlob = () => bytes.promise;
    const { result } = renderController(port);
    act(() => result.current.openPreview(fakeDocument("guide.pdf")));
    const other = fakeDocument("report.docx");
    act(() => result.current.openPreview(other));
    await act(async () => bytes.resolve(new Blob(["%PDF"])));
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(result.current.preview?.item).toBe(other);
  });
});

describe("useLibrary rename", () => {
  it("does nothing when no row is being edited", async () => {
    const port = createFakeLibraryPort({ documents: [fakeDocument("notes.md")] });
    const { result } = renderController(port);
    await waitFor(() => expect(result.current.documents).toHaveLength(1));
    act(() => result.current.rename.setDraft("Valid name"));
    await act(() => result.current.rename.save());
    expect(port.calls).toEqual([]);
  });

  it("ignores a second save while the first is still pending", async () => {
    const port = createFakeLibraryPort({ documents: [fakeDocument("notes.md")] });
    const gate = deferred<void>();
    const rename = port.renameDocument;
    port.renameDocument = async (target, input) => {
      await gate.promise;
      return rename(target, input);
    };
    const { result } = renderController(port);
    await waitFor(() => expect(result.current.documents).toHaveLength(1));
    act(() => result.current.rename.start(result.current.documents![0]!));
    act(() => result.current.rename.setDraft("Renamed"));
    let firstSave!: Promise<void>;
    act(() => { firstSave = result.current.rename.save(); });
    await waitFor(() => expect(result.current.rename.saving).toBe(true));
    await act(() => result.current.rename.save());
    await act(async () => {
      gate.resolve();
      await firstSave;
    });
    expect(port.calls).toEqual(["rename:doc-notes.md:Renamed"]);
  });

  it("keeps the row in edit mode and shows the refusal when the rename fails", async () => {
    const port = createFakeLibraryPort({ documents: [fakeDocument("notes.md")] });
    port.renameDocument = async () => { throw new Error("name taken"); };
    const { result } = renderController(port);
    await waitFor(() => expect(result.current.documents).toHaveLength(1));
    act(() => result.current.rename.start(result.current.documents![0]!));
    act(() => result.current.rename.setDraft("Other"));
    await act(() => result.current.rename.save());
    expect(result.current.rowError).toBe("name taken");
    expect(result.current.rename.editingId).toBe("doc-notes.md");
  });

  it("Cancel leaves edit mode without saving", async () => {
    const port = createFakeLibraryPort({ documents: [fakeDocument("notes.md")] });
    const { result } = renderController(port);
    await waitFor(() => expect(result.current.documents).toHaveLength(1));
    act(() => result.current.rename.start(result.current.documents![0]!));
    expect(result.current.rename).toMatchObject({ editingId: "doc-notes.md", draft: "notes" });
    act(() => result.current.rename.cancel());
    expect(result.current.rename.editingId).toBeNull();
    expect(port.calls).toEqual([]);
  });
});

describe("useLibrary Trash", () => {
  it("closes the preview of the document it just trashed", async () => {
    const port = createFakeLibraryPort({ documents: [fakeDocument("report.docx")] });
    const { result } = renderController(port);
    await waitFor(() => expect(result.current.documents).toHaveLength(1));
    const doc = result.current.documents![0]!;
    act(() => result.current.openPreview(doc));
    await act(() => result.current.trash(doc));
    expect(result.current.preview).toBeNull();
    expect(result.current.notice).toBe("Moved to Trash.");
  });

  it("keeps an unrelated preview open after a trash", async () => {
    const port = createFakeLibraryPort({ documents: [fakeDocument("report.docx"), fakeDocument("other.docx")] });
    const { result } = renderController(port);
    await waitFor(() => expect(result.current.documents).toHaveLength(2));
    const [first, second] = [result.current.documents![0]!, result.current.documents![1]!];
    act(() => result.current.openPreview(second));
    await act(() => result.current.trash(first));
    expect(result.current.preview?.item).toBe(second);
  });

  it("shows the refusal and clears the in-flight row when Trash fails", async () => {
    const port = createFakeLibraryPort({ documents: [fakeDocument("notes.md")] });
    port.trashDocument = async () => { throw new Error("locked"); };
    const { result } = renderController(port);
    await waitFor(() => expect(result.current.documents).toHaveLength(1));
    await act(() => result.current.trash(result.current.documents![0]!));
    expect(result.current.rowError).toBe("locked");
    expect(result.current.notice).toBeNull();
    expect(result.current.trashingId).toBeNull();
  });

  it("ignores a second Trash while one is in flight", async () => {
    const port = createFakeLibraryPort({ documents: [fakeDocument("a.md"), fakeDocument("b.md")] });
    const gate = deferred<void>();
    const trash = port.trashDocument;
    port.trashDocument = async (id) => {
      await gate.promise;
      return trash(id);
    };
    const { result } = renderController(port);
    await waitFor(() => expect(result.current.documents).toHaveLength(2));
    const [a, b] = [result.current.documents![0]!, result.current.documents![1]!];
    let firstTrash!: Promise<void>;
    act(() => { firstTrash = result.current.trash(a); });
    expect(result.current.trashingId).toBe(a.id);
    await act(() => result.current.trash(b));
    await act(async () => {
      gate.resolve();
      await firstTrash;
    });
    expect(port.calls).toEqual([`trash:${a.id}`]);
  });
});

describe("useLibrary list, uploaders and refresh", () => {
  it("names uploaders from the users list", async () => {
    const port = createFakeLibraryPort();
    port.listUsers = async () => ({ users: [{ principalId: "p-1", username: "ada" }] });
    const { result } = renderController(port);
    await waitFor(() => expect(result.current.userNames.get("p-1")).toBe("ada"));
  });

  it("works without a users listing (rows then show raw principal ids)", async () => {
    const port = createFakeLibraryPort({ documents: [fakeDocument("notes.md")] });
    delete port.listUsers;
    const { result } = renderController(port);
    await waitFor(() => expect(result.current.documents).toHaveLength(1));
    expect(result.current.userNames.size).toBe(0);
  });

  it("reports a list failure", async () => {
    const port = createFakeLibraryPort();
    port.listDocuments = async () => { throw new Error("offline"); };
    const { result } = renderController(port);
    await waitFor(() => expect(result.current.listError).toBe("offline"));
    expect(result.current.documents).toBeUndefined();
  });

  it("re-reads the list when the assistant announces a media change", async () => {
    const port = createFakeLibraryPort();
    const listDocuments = vi.fn(port.listDocuments);
    port.listDocuments = listDocuments;
    const { result } = renderController(port);
    await waitFor(() => expect(result.current.documents).toEqual([]));
    port.items.push(fakeDocument("agent.md"));
    act(() => publishContentRefresh(["media"]));
    await waitFor(() => expect(result.current.documents?.map((doc) => doc.id)).toEqual(["doc-agent.md"]));
    expect(listDocuments.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("builds the authenticated download URL through the port", () => {
    const { result } = renderController(createFakeLibraryPort());
    expect(result.current.downloadUrl(fakeDocument("a.md"))).toBe("/api/admin/v1/workspaces/workspace-local/media/doc-a.md/original");
  });
});

describe("useWiredLibrary", () => {
  it("reads documents through the real admin API and translates with the admin locale", async () => {
    const doc = fakeDocument("wired.md");
    const fetchFake = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes("/media?kind=document") ? { media: [doc] } : url.includes("/users") ? { users: [] } : {};
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchFake);
    const { result } = renderHook(() => useWiredLibrary(), { wrapper });
    await waitFor(() => expect(result.current.documents?.map((item) => item.id)).toEqual([doc.id]));
    expect(result.current.locale).toBe("en");
    expect(result.current.t("Upload")).toBe("Upload");
    expect(fetchFake.mock.calls.some(([input]) => String(input).includes("/media?kind=document"))).toBe(true);
  });
});
