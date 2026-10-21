import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { api } from "@/lib/api";
import { ADMIN_PANELS } from "@/panels";
import { translateAdminNavLabel } from "@/lib/admin-nav-i18n";
import { COMMON_I18N } from "@/lib/i18n-common";
import { Library, documentMenuItems, markdownFrameDocument } from "../Library";
import { resolveLibraryTabId } from "../Library.hooks";
import {
  createApiLibraryPort,
  createFakeLibraryPort,
  defaultLibraryPort,
  fakeDocument,
  type LibraryApiClient,
  type LibraryFetch,
} from "../hooks/library-dependencies.hooks";
import { useLibrary, type LibraryController, type LibraryPreviewState, type LibraryUploadRow } from "../hooks/use-library.hooks";
import { t as libraryT } from "../library-i18n";
import { libraryFileProblem, LIBRARY_ACCEPT, LIBRARY_MAX_BYTES } from "../rules";

/**
 * @file The Library admin page: sidebar registration beside Media, the Upload/Documents `?tab=`
 * tabs, upload through the document endpoint, list/rename/Trash wiring, permission hiding, safe
 * previews, and every new string translated in all 21 admin locales.
 */

const LOCALES = ["es", "id", "de", "zh-CN", "zh-TW", "pt-BR", "ru", "fa", "ar", "ja", "ko", "pl", "hu", "fr", "uk", "tr", "th", "it", "hi", "ur", "bn"];
const ALL = ["media.read", "media.upload", "media.update", "media.delete"];

function wrapper({ children }: { children: ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

const english = (key: string) => key;

function renderLibraryHook(port: ReturnType<typeof createFakeLibraryPort>) {
  return renderHook(() => useLibrary({ port, locale: "en", t: english }), { wrapper });
}

function renderLibrary(port: ReturnType<typeof createFakeLibraryPort>, tabId: string | null) {
  function useHook(): LibraryController {
    return useLibrary({ port, locale: "en", t: english });
  }
  return render(<Library tabId={tabId} useLibraryHook={useHook} />, { wrapper });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Library panel registration", () => {
  it("is a Content sidebar item directly after Media, gated by media.read", () => {
    const ids = ADMIN_PANELS.map((panel) => panel.id);
    const library = ADMIN_PANELS.find((panel) => panel.id === "library");
    expect(ids.indexOf("library")).toBe(ids.indexOf("media") + 1);
    expect(library?.nav).toMatchObject({ label: "Library", group: "Content" });
    expect(library?.anyOfPermissions).toEqual(["media.read"]);
  });

  it("passes ?tab= through to the page", () => {
    const library = ADMIN_PANELS.find((panel) => panel.id === "library")!;
    const element = library.render({ view: null, params: {}, query: new URLSearchParams("tab=documents") }) as ReactElement;
    expect(element.type).toBe(Library);
    expect(element.props).toMatchObject({ tabId: "documents" });
  });

  it("translates the sidebar label in every locale", () => {
    for (const locale of LOCALES) expect(translateAdminNavLabel({ locale, key: "Library" })).not.toBe("Library");
  });
});

describe("Library tabs", () => {
  it("lands on Upload and falls back to it for an unknown tab", () => {
    expect(resolveLibraryTabId(null)).toBe("upload");
    expect(resolveLibraryTabId("nope")).toBe("upload");
    expect(resolveLibraryTabId("documents")).toBe("documents");
  });

  it("renders the Upload and Documents tabs, Upload first", async () => {
    renderLibrary(createFakeLibraryPort(), null);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([expect.stringContaining("Upload"), expect.stringContaining("Documents")]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByTestId("file-dropzone-zone")).toBeInTheDocument();
  });

  it("shows the documents list on ?tab=documents with name, type, size, date and Unknown uploader", async () => {
    const port = createFakeLibraryPort({ documents: [fakeDocument("notes.md", { byteSize: 2048 })] });
    renderLibrary(port, "documents");
    const table = await screen.findByRole("table");
    expect(within(table).getByRole("button", { name: "notes.md" })).toBeInTheDocument();
    expect(within(table).getByText("MD")).toBeInTheDocument();
    expect(within(table).getByText("2.0 KB")).toBeInTheDocument();
    expect(within(table).getByText("Unknown")).toBeInTheDocument();
  });

  it("shows a small empty state with no card", async () => {
    renderLibrary(createFakeLibraryPort(), "documents");
    const empty = await screen.findByText("No documents yet.");
    expect(empty.closest(".card")).toBeNull();
  });

  it("Documents is only the list: no upload button and no drop zone", async () => {
    renderLibrary(createFakeLibraryPort({ documents: [fakeDocument("notes.md")] }), "documents");
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Upload documents" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("file-dropzone-zone")).not.toBeInTheDocument();
    expect(screen.queryByText("Do not load any sensitive keys, tokens, or secrets here.")).not.toBeInTheDocument();
  });

  it("shows the no-secrets warning below the file types on Upload", async () => {
    renderLibrary(createFakeLibraryPort(), "upload");
    await screen.findByTestId("file-dropzone-zone");
    const types = screen.getByText("Documents: Markdown, text, PDF, Word, Excel, PowerPoint, Pages, Keynote, RTF, CSV, JSON · up to 10 MiB each");
    const warning = screen.getByText("Do not load any sensitive keys, tokens, or secrets here.");
    expect(warning).toBeInTheDocument();
    expect(types.compareDocumentPosition(warning) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("puts an Upload documents button above the drop zone on the Upload tab", async () => {
    renderLibrary(createFakeLibraryPort(), "upload");
    const button = await screen.findByRole("button", { name: "Upload documents" });
    const zone = await screen.findByTestId("file-dropzone-zone");
    expect(button.compareDocumentPosition(zone) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("Upload documents opens the drop zone's own file picker", async () => {
    renderLibrary(createFakeLibraryPort(), "upload");
    const input = (await screen.findByTestId("file-dropzone-zone")).querySelector("input[type=file]") as HTMLInputElement;
    const click = vi.spyOn(input, "click").mockImplementation(() => {});
    await userEvent.click(await screen.findByRole("button", { name: "Upload documents" }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(input).toHaveAttribute("multiple");
    expect(input.getAttribute("accept")).toBe(LIBRARY_ACCEPT);
  });

  it("uploads files dropped on the Upload tab's zone", async () => {
    const port = createFakeLibraryPort();
    renderLibrary(port, "upload");
    const zone = await screen.findByTestId("file-dropzone-zone");
    fireEvent.drop(zone, { dataTransfer: { items: [], files: [new File(["# hi"], "dropped.md", { type: "text/markdown" })] } });
    expect(await screen.findByRole("button", { name: "View in Documents" })).toBeInTheDocument();
    expect(port.calls).toEqual(["upload:dropped.md"]);
  });
});

describe("Library upload", () => {
  it("refuses unsupported, empty and oversized files before any request", () => {
    expect(libraryFileProblem({ name: "a.exe", size: 10 })).toBe("type");
    expect(libraryFileProblem({ name: "a.md", size: 0 })).toBe("empty");
    expect(libraryFileProblem({ name: "a.pdf", size: LIBRARY_MAX_BYTES + 1 })).toBe("size");
    expect(libraryFileProblem({ name: "A.DOCX", size: LIBRARY_MAX_BYTES })).toBeNull();
  });

  it("uploads each accepted file through the document port, one at a time, and lists it", async () => {
    const port = createFakeLibraryPort();
    const { result } = renderLibraryHook(port);
    act(() => result.current.addFiles([
      new File(["# hi"], "notes.md", { type: "text/markdown" }),
      new File(["x"], "virus.exe"),
      new File(["plain"], "readme.txt", { type: "text/plain" }),
    ]));
    await waitFor(() => expect(result.current.uploadedCount).toBe(2));
    expect(port.calls).toEqual(["upload:notes.md", "upload:readme.txt"]);
    expect(result.current.uploads.find((row) => row.name === "virus.exe")).toMatchObject({ status: "failed", error: "This file type isn't supported." });
    await waitFor(() => expect(result.current.documents?.map((doc) => doc.originalFilename).sort()).toEqual(["notes.md", "readme.txt"]));
  });

  it("shows a server refusal on that file's row", async () => {
    const port = createFakeLibraryPort();
    port.uploadDocument = async () => { throw new Error("document bytes do not have a PDF signature"); };
    const { result } = renderLibraryHook(port);
    act(() => result.current.addFiles([new File(["nope"], "fake.pdf")]));
    await waitFor(() => expect(result.current.uploads[0]).toMatchObject({ status: "failed", error: "document bytes do not have a PDF signature" }));
  });

  it("offers View in Documents after an upload", async () => {
    const port = createFakeLibraryPort();
    renderLibrary(port, "upload");
    const input = (await screen.findByTestId("file-dropzone-zone")).querySelector("input[type=file]") as HTMLInputElement;
    await userEvent.upload(input, new File(["# hi"], "notes.md", { type: "text/markdown" }));
    expect(await screen.findByRole("button", { name: "View in Documents" })).toBeInTheDocument();
    expect(port.calls).toEqual(["upload:notes.md"]);
  });

  it("api.uploadDocument posts kind=document to the media endpoint", async () => {
    const fetchFake = vi.fn(async () => new Response(JSON.stringify({ media: fakeDocument("a.md") }), { status: 201, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchFake);
    await api.uploadDocument({ filename: "a.md", dataBase64: "IyBoaQ==" });
    const [url, init] = fetchFake.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/workspaces\/workspace-local\/media$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ filename: "a.md", dataBase64: "IyBoaQ==", kind: "document" });
  });

  it("api.listDocuments asks for kind=document", async () => {
    const fetchFake = vi.fn(async () => new Response(JSON.stringify({ media: [] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchFake);
    await api.listDocuments();
    expect(String((fetchFake.mock.calls[0] as unknown as [string])[0])).toMatch(/\/media\?kind=document$/);
  });
});

describe("Library rename and Trash", () => {
  it("renames the display stem and keeps the extension", async () => {
    const port = createFakeLibraryPort({ documents: [fakeDocument("notes.md")] });
    const { result } = renderLibraryHook(port);
    await waitFor(() => expect(result.current.documents).toHaveLength(1));
    act(() => result.current.rename.start(result.current.documents![0]!));
    act(() => result.current.rename.setDraft("  Meeting notes "));
    await act(() => result.current.rename.save());
    expect(port.calls).toEqual(["rename:doc-notes.md:Meeting notes"]);
    await waitFor(() => expect(result.current.documents?.[0]?.displayFilename).toBe("Meeting notes.md"));
    expect(result.current.rename.editingId).toBeNull();
  });

  it("will not save an empty or slash-containing name", async () => {
    const port = createFakeLibraryPort({ documents: [fakeDocument("notes.md")] });
    const { result } = renderLibraryHook(port);
    await waitFor(() => expect(result.current.documents).toHaveLength(1));
    act(() => result.current.rename.start(result.current.documents![0]!));
    act(() => result.current.rename.setDraft("a/b"));
    expect(result.current.rename.invalid).toBe(true);
    await act(() => result.current.rename.save());
    expect(port.calls).toEqual([]);
  });

  it("moves a document to Trash and drops it from the list", async () => {
    const port = createFakeLibraryPort({ documents: [fakeDocument("notes.md"), fakeDocument("b.txt")] });
    const { result } = renderLibraryHook(port);
    await waitFor(() => expect(result.current.documents).toHaveLength(2));
    await act(() => result.current.trash(result.current.documents!.find((doc) => doc.id === "doc-notes.md")!));
    expect(port.calls).toEqual(["trash:doc-notes.md"]);
    await waitFor(() => expect(result.current.documents?.map((doc) => doc.id)).toEqual(["doc-b.txt"]));
    expect(result.current.notice).toBe("Moved to Trash.");
    act(() => result.current.dismissNotice());
    expect(result.current.notice).toBeNull();
  });

  it("shows Moved to Trash as a toast with Open Trash, not a banner above the tabs", async () => {
    const dismissNotice = vi.fn();
    const port = createFakeLibraryPort();
    function useHook(): LibraryController {
      return { ...useLibrary({ port, locale: "en", t: english }), notice: "Moved to Trash.", dismissNotice };
    }
    const { container } = render(<Library tabId="documents" useLibraryHook={useHook} />, { wrapper });
    const toast = await screen.findByRole("status");
    expect(toast).toHaveClass("jini-toast");
    expect(toast).toHaveTextContent("Moved to Trash.");
    expect(container.querySelector(".library-notice")).toBeNull();
    await userEvent.click(within(toast).getByRole("button", { name: "Open Trash" }));
    expect(window.location.pathname).toMatch(/\/trash$/);
    await userEvent.click(within(toast).getByRole("button", { name: "Dismiss" }));
    expect(dismissNotice).toHaveBeenCalled();
  });

  it("the Trash toast dismisses itself", () => {
    vi.useFakeTimers();
    try {
      const dismissNotice = vi.fn();
      const port = createFakeLibraryPort();
      function useHook(): LibraryController {
        return { ...useLibrary({ port, locale: "en", t: english }), notice: "Moved to Trash.", dismissNotice };
      }
      render(<Library tabId="documents" useLibraryHook={useHook} />, { wrapper });
      act(() => vi.advanceTimersByTime(10_000));
      expect(dismissNotice).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Library permissions", () => {
  it("hides upload without media.upload", async () => {
    renderLibrary(createFakeLibraryPort({ permissions: ["media.read"] }), "upload");
    expect(await screen.findByText("You don't have permission to upload documents.")).toBeInTheDocument();
    expect(screen.queryByTestId("file-dropzone-zone")).not.toBeInTheDocument();
  });

  it("offers Rename only with media.update and Move to Trash only with media.delete", async () => {
    const port = createFakeLibraryPort({ permissions: ["media.read"] });
    const { result } = renderLibraryHook(port);
    await waitFor(() => expect(result.current.permissions.known).toBe(true));
    const doc = fakeDocument("notes.md");
    expect(documentMenuItems(doc, result.current).map((item) => item.key)).toEqual(["preview", "download"]);
    const full = renderLibraryHook(createFakeLibraryPort({ permissions: ALL })).result;
    await waitFor(() => expect(full.current.permissions.known).toBe(true));
    expect(documentMenuItems(doc, full.current).map((item) => item.key)).toEqual(["preview", "download", "rename", "trash"]);
    expect(documentMenuItems(fakeDocument("report.docx"), full.current).map((item) => item.key)).toEqual(["download", "rename", "trash"]);
  });

  it("hides the Upload documents button without media.upload", async () => {
    renderLibrary(createFakeLibraryPort({ permissions: ["media.read"] }), "upload");
    expect(await screen.findByText("You don't have permission to upload documents.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Upload documents" })).not.toBeInTheDocument();
  });
});

describe("Library previews never run document content", () => {
  it("renders Markdown with raw HTML escaped inside a scriptless, network-blocked frame", async () => {
    const port = createFakeLibraryPort({ documents: [fakeDocument("notes.md")], texts: { "doc-notes.md": "# Title\n\n<script>alert(1)</script>" } });
    renderLibrary(port, "documents");
    await userEvent.click(await screen.findByRole("button", { name: "notes.md" }));
    const frame = await screen.findByTitle("notes.md");
    expect(frame.tagName).toBe("IFRAME");
    expect(frame.getAttribute("sandbox")).toBe("");
    const srcdoc = frame.getAttribute("srcdoc") ?? "";
    expect(srcdoc).toContain("<h1>Title</h1>");
    expect(srcdoc).not.toContain("<script>");
    expect(srcdoc).toContain("default-src 'none'");
  });

  it("shows text escaped, not as markup", async () => {
    const port = createFakeLibraryPort({ documents: [fakeDocument("a.txt")], texts: { "doc-a.txt": "<b>bold?</b>" } });
    renderLibrary(port, "documents");
    await userEvent.click(await screen.findByRole("button", { name: "a.txt" }));
    expect(await screen.findByText("<b>bold?</b>")).toBeInTheDocument();
  });

  it("shows a PDF through an application/pdf <object>, not a sandboxed iframe Chrome blocks", async () => {
    URL.createObjectURL = vi.fn(() => "blob:fake-pdf");
    URL.revokeObjectURL = vi.fn();
    renderLibrary(createFakeLibraryPort({ documents: [fakeDocument("guide.pdf")] }), "documents");
    await userEvent.click(await screen.findByRole("button", { name: "guide.pdf" }));
    const viewer = await screen.findByTitle("guide.pdf");
    expect(viewer.tagName).toBe("OBJECT");
    expect(viewer.getAttribute("type")).toBe("application/pdf");
    expect(viewer.getAttribute("data")).toBe("blob:fake-pdf");
    expect(vi.mocked(URL.createObjectURL).mock.calls[0]?.[0]).toMatchObject({ type: "application/pdf" });
  });

  it("frame document carries a CSP that blocks scripts and network", () => {
    const doc = markdownFrameDocument("<p>x</p>", { text: "black", link: "blue", border: "gray" });
    expect(doc).toContain(`content="default-src 'none'; style-src 'unsafe-inline'"`);
  });
});

describe("Library translations", () => {
  const KEYS = [
    "Do not load any sensitive keys, tokens, or secrets here.",
    "Library", "Content", "Upload", "Documents", "Private documents the assistant can read. Visitors never see them.",
    "Drop documents here, or click to browse", "Documents: Markdown, text, PDF, Word, Excel, PowerPoint, Pages, Keynote, RTF, CSV, JSON · up to 10 MiB each", "Uploads",
    "Waiting…", "Uploading…", "Uploaded", "Upload failed.", "This file type isn't supported.", "Larger than 10 MiB.",
    "This file is empty.", "View in Documents", "Clear list", "You don't have permission to upload documents.",
    "Loading documents…", "Couldn't load documents.", "No documents yet.",
    "Upload Markdown, text, PDF, Word, CSV or JSON files for the assistant to read.", "Upload documents", "Type", "Size",
    "Upload date", "Uploaded by", "Unknown", 'Actions for "{title}"', "Preview", "Download", "Rename", "Move to Trash",
    "Moving…", "Moved to Trash.", "Open Trash", "Move to Trash failed.", "New name", "Rename failed.", "Close",
    "Loading preview…", "Preview failed.", "No preview for this file type. Download it to open it.",
    "Showing the first 64 KB. Download the file to see all of it.", "Cancel", "More", "Name", "Save", "Saving…",
  ];

  it.each(LOCALES)("%s translates every Library string", (locale) => {
    const missing = KEYS.filter((key) => !(key in (libraryT.dictionary[locale] ?? {})) && !(key in (COMMON_I18N[locale] ?? {})));
    expect(missing).toEqual([]);
    // COMMON_I18N owns Cancel/More/Name/Save/Saving… (German "Name" is spelled like English).
    for (const key of KEYS.filter((k) => !(k in (COMMON_I18N[locale] ?? {})))) expect(libraryT({ locale, key })).not.toBe(key);
    expect(libraryT({ locale, key: 'Actions for "{title}"' })).toContain("{title}");
  });
});

/**
 * A hand-built controller for the markup-only branches: every field is plain data or a recording
 * callback, so each test sets exactly the state it is about (a saving rename, a failed upload row,
 * a preview in a given phase) without driving the real hook into it.
 */
function stubController(overrides: Partial<LibraryController> = {}): LibraryController & { calls: string[] } {
  const calls: string[] = [];
  const base: LibraryController = {
    documents: [],
    listError: null,
    permissions: { known: true, canUpload: true, canRename: true, canTrash: true },
    userNames: new Map(),
    uploads: [],
    uploadedCount: 0,
    addFiles: (files) => calls.push(`addFiles:${files.map((file) => `${file.name}(${file.size})`).join(",")}`),
    clearUploads: () => calls.push("clearUploads"),
    rename: {
      editingId: null,
      draft: "",
      setDraft: (draft) => calls.push(`setDraft:${draft}`),
      start: (item) => calls.push(`rename.start:${item.id}`),
      cancel: () => calls.push("rename.cancel"),
      save: async () => {
        calls.push("rename.save");
      },
      saving: false,
      invalid: false,
    },
    trash: async (item) => {
      calls.push(`trash:${item.id}`);
    },
    trashingId: null,
    rowError: null,
    notice: null,
    dismissNotice: () => calls.push("dismissNotice"),
    preview: null,
    openPreview: (item) => calls.push(`openPreview:${item.id}`),
    closePreview: () => calls.push("closePreview"),
    downloadUrl: (item) => `/download/${item.id}`,
    t: english,
    locale: "en",
  };
  return Object.assign({ ...base, ...overrides }, { calls });
}

function renderStub(controller: LibraryController, tabId: string | null) {
  return render(<Library tabId={tabId} useLibraryHook={() => controller} />, { wrapper });
}

function uploadRow(name: string, status: LibraryUploadRow["status"], error: string | null = null): LibraryUploadRow {
  return { key: `k-${name}`, name, size: 2048, status, error };
}

function previewState(overrides: Partial<LibraryPreviewState> = {}): LibraryPreviewState {
  return {
    item: fakeDocument("notes.md"),
    kind: "markdown",
    loading: false,
    error: null,
    text: null,
    html: null,
    pdfUrl: null,
    truncated: false,
    ...overrides,
  };
}

describe("Library production port (createApiLibraryPort)", () => {
  function recordingClient(): LibraryApiClient & { calls: string[] } {
    const calls: string[] = [];
    const doc = fakeDocument("a.md");
    return {
      calls,
      listDocuments: async () => {
        calls.push("listDocuments");
        return { media: [doc] };
      },
      uploadDocument: async (input) => {
        calls.push(`uploadDocument:${input.filename}:${input.dataBase64}`);
        return { media: doc };
      },
      updateMedia: async (target, patch) => {
        calls.push(`updateMedia:${target.id}:${JSON.stringify(patch)}`);
        return { media: doc };
      },
      trashMedia: async (id) => {
        calls.push(`trashMedia:${id}`);
        return { media: doc };
      },
      readDocumentText: async (target) => {
        calls.push(`readDocumentText:${target.id}`);
        return { text: "hello", truncated: true };
      },
      mediaOriginalUrl: (id) => `/original/${id}`,
      me: async () => {
        calls.push("me");
        return { effectivePermissions: ["media.read"] };
      },
      listUsers: async () => {
        calls.push("listUsers");
        return { users: [{ principalId: "p1", username: "ada" }] };
      },
    };
  }

  it("maps every port method onto its API endpoint, passing only the title on rename", async () => {
    const client = recordingClient();
    const port = createApiLibraryPort({ client, fetchFn: async () => ({ ok: true, status: 200, blob: async () => new Blob() }) });
    expect((await port.listDocuments()).media).toHaveLength(1);
    await port.uploadDocument({ filename: "a.md", dataBase64: "eA==" });
    await port.renameDocument({ id: "d1" }, { title: "New" });
    await port.trashDocument("d2");
    expect(await port.readDocumentText({ id: "d3" })).toEqual({ text: "hello", truncated: true });
    expect(port.documentDownloadUrl("d4")).toBe("/original/d4");
    expect(await port.me()).toEqual({ effectivePermissions: ["media.read"] });
    expect(await port.listUsers?.()).toEqual({ users: [{ principalId: "p1", username: "ada" }] });
    expect(client.calls).toEqual([
      "listDocuments",
      "uploadDocument:a.md:eA==",
      'updateMedia:d1:{"title":"New"}',
      "trashMedia:d2",
      "readDocumentText:d3",
      "me",
      "listUsers",
    ]);
  });

  it("fetches a document's original bytes with same-origin credentials", async () => {
    const requests: Array<[string, RequestInit]> = [];
    const bytes = new Blob(["%PDF"], { type: "application/pdf" });
    const fetchFn: LibraryFetch = async (url, init) => {
      requests.push([url, init]);
      return { ok: true, status: 200, blob: async () => bytes };
    };
    const port = createApiLibraryPort({ client: recordingClient(), fetchFn });
    expect(await port.fetchDocumentBlob("d9")).toBe(bytes);
    expect(requests).toEqual([["/original/d9", { credentials: "same-origin" }]]);
  });

  it("rejects with the HTTP status when the original download fails", async () => {
    const port = createApiLibraryPort({
      client: recordingClient(),
      fetchFn: async () => ({ ok: false, status: 403, blob: async () => new Blob() }),
    });
    await expect(port.fetchDocumentBlob("d9")).rejects.toThrow("download failed (403)");
  });

  it("the default port reads the page's fetch at call time and targets the real original route", async () => {
    const fetchFake = vi.fn(async () => new Response("bytes", { status: 200 }));
    vi.stubGlobal("fetch", fetchFake);
    const blob = await defaultLibraryPort.fetchDocumentBlob("doc 1");
    expect(await blob.text()).toBe("bytes");
    const [url, init] = fetchFake.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(api.mediaOriginalUrl("doc 1"));
    expect(init).toEqual({ credentials: "same-origin" });
  });
});

describe("Library fake port honours the port contract", () => {
  it("rejects a rename or Trash of an unknown document", async () => {
    const port = createFakeLibraryPort();
    await expect(port.renameDocument({ id: "missing" }, { title: "x" })).rejects.toThrow("not found");
    await expect(port.trashDocument("missing")).rejects.toThrow("not found");
  });

  it("renames a document with no original filename to the bare title", async () => {
    const port = createFakeLibraryPort({ documents: [fakeDocument("README", { originalFilename: null })] });
    const { media } = await port.renameDocument({ id: "doc-README" }, { title: "Read me" });
    expect(media.displayFilename).toBe("Read me");
  });

  it("answers empty text for a document with no seeded text, and an extensionless filename keeps itself as the title", async () => {
    const port = createFakeLibraryPort();
    expect(await port.readDocumentText({ id: "nothing" })).toEqual({ text: "", truncated: false });
    expect(fakeDocument("LICENSE").title).toBe("LICENSE");
    expect(await port.listUsers?.()).toEqual({ users: [] });
    expect(port.documentDownloadUrl("d1")).toBe("/api/admin/v1/workspaces/workspace-local/media/d1/original");
    expect((await port.fetchDocumentBlob("d1")).type).toBe("application/pdf");
  });
});

describe("Library page states", () => {
  it("shows a row error as an alert above the tabs", () => {
    renderStub(stubController({ rowError: "Rename failed." }), "documents");
    expect(screen.getByRole("alert")).toHaveTextContent("Rename failed.");
  });

  it("shows the list error instead of the table", () => {
    renderStub(stubController({ listError: "Couldn't load documents." }), "documents");
    expect(screen.getByText("Couldn't load documents.")).toHaveClass("notice", "error");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows a loading notice until the list arrives", () => {
    renderStub(stubController({ documents: undefined }), "documents");
    expect(screen.getByText("Loading documents…")).toBeInTheDocument();
  });

  it("switching tabs navigates to that ?tab=", async () => {
    renderStub(stubController(), "upload");
    await userEvent.click(screen.getByRole("tab", { name: /Documents/ }));
    expect(`${window.location.pathname}${window.location.search}`).toMatch(/\/library\?tab=documents$/);
  });
});

describe("Library upload tab rows", () => {
  it("labels each row by status, spins only while uploading, and alerts only on failure", () => {
    const controller = stubController({
      uploads: [
        uploadRow("a.md", "waiting"),
        uploadRow("b.md", "uploading"),
        uploadRow("c.md", "done"),
        uploadRow("d.md", "failed", "document bytes do not have a PDF signature"),
        uploadRow("e.md", "failed"),
      ],
      uploadedCount: 1,
    });
    const { container } = renderStub(controller, "upload");
    const rows = within(screen.getByRole("list", { name: "Uploads" })).getAllByRole("listitem");
    expect(rows.map((row) => row.querySelector(".library-upload-status")?.textContent)).toEqual([
      "Waiting…",
      "Uploading…",
      "Uploaded",
      "document bytes do not have a PDF signature",
      "Upload failed.",
    ]);
    expect(container.querySelectorAll(".library-spinner")).toHaveLength(1);
    expect(rows[1]!.querySelector(".library-spinner")).not.toBeNull();
    expect(screen.getAllByRole("alert").map((el) => el.textContent)).toEqual([
      "document bytes do not have a PDF signature",
      "Upload failed.",
    ]);
    expect(rows[0]).toHaveTextContent("2.0 KB");
  });

  it("shows no list and no actions before anything was added", () => {
    renderStub(stubController(), "upload");
    expect(screen.queryByRole("list", { name: "Uploads" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear list" })).not.toBeInTheDocument();
  });

  it("hides the actions while rows are still in flight", () => {
    renderStub(stubController({ uploads: [uploadRow("a.md", "waiting"), uploadRow("b.md", "uploading")] }), "upload");
    expect(screen.queryByRole("button", { name: "Clear list" })).not.toBeInTheDocument();
  });

  it("offers only Clear list when every finished upload failed, and Clear list clears", async () => {
    const controller = stubController({ uploads: [uploadRow("a.md", "failed", "nope")], uploadedCount: 0 });
    renderStub(controller, "upload");
    expect(screen.queryByRole("button", { name: "View in Documents" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear list" }));
    expect(controller.calls).toEqual(["clearUploads"]);
  });

  it("View in Documents switches to the Documents tab", async () => {
    renderStub(stubController({ uploads: [uploadRow("a.md", "done")], uploadedCount: 1 }), "upload");
    await userEvent.click(screen.getByRole("button", { name: "View in Documents" }));
    expect(`${window.location.pathname}${window.location.search}`).toMatch(/\/library\?tab=documents$/);
  });

  it("shows the upload controls while permissions are still unknown", () => {
    renderStub(stubController({ permissions: { known: false, canUpload: false, canRename: false, canTrash: false } }), "upload");
    expect(screen.getByRole("button", { name: "Upload documents" })).toBeInTheDocument();
  });
});

describe("Library drop of macOS packages", () => {
  /** A `DataTransferItem` stand-in: what `webkitGetAsEntry()` and `getAsFile()` answer for one dropped thing. */
  function droppedItem(entry: { isDirectory: boolean; name: string } | undefined, file: File | null) {
    return { ...(entry === undefined ? {} : { webkitGetAsEntry: () => entry }), getAsFile: () => file };
  }

  function dropZoneHost(): HTMLElement {
    return screen.getByTestId("file-dropzone-zone").parentElement!;
  }

  it("uploads a dropped .key/.pages directory as one empty file and keeps the other dropped files", () => {
    const controller = stubController();
    renderStub(controller, "upload");
    fireEvent.drop(dropZoneHost(), {
      dataTransfer: {
        items: [
          droppedItem({ isDirectory: true, name: "Deck.key" }, null),
          droppedItem({ isDirectory: true, name: "Essay.PAGES" }, new File(["x"], "Essay.PAGES")),
          droppedItem({ isDirectory: false, name: "notes.md" }, new File(["# hi"], "notes.md")),
          droppedItem(undefined, new File(["abc"], "plain.txt")),
          droppedItem({ isDirectory: true, name: "folder" }, null),
        ],
        files: [],
      },
    });
    // The package's own `getAsFile()` (Essay.PAGES, 1 byte) is dropped in favour of the empty
    // stand-in, so its internals never upload; items with no file at all are skipped.
    expect(controller.calls).toEqual(["addFiles:Deck.key(0),Essay.PAGES(0),notes.md(4),plain.txt(3)"]);
  });

  it("leaves an ordinary drop to the drop zone itself", () => {
    const controller = stubController();
    renderStub(controller, "upload");
    fireEvent.drop(dropZoneHost(), {
      dataTransfer: { items: [droppedItem({ isDirectory: false, name: "a.md" }, new File(["a"], "a.md"))], files: [] },
    });
    // No package: the capture handler does nothing, and the zone's own handler reads `files` (empty here).
    expect(controller.calls).toEqual([]);
  });

  it("tolerates a drop whose dataTransfer has no items list", () => {
    const controller = stubController();
    renderStub(controller, "upload");
    fireEvent.drop(dropZoneHost(), { dataTransfer: { files: [] } });
    expect(controller.calls).toEqual([]);
  });
});

describe("Library documents table actions", () => {
  const doc = fakeDocument("notes.md");

  it("each menu item runs its own action", () => {
    const controller = stubController({ documents: [doc] });
    const items = documentMenuItems(doc, controller);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      controller.calls.push(`anchor:${this.getAttribute("href")}:${this.rel}:${this.hasAttribute("download")}:${this.isConnected}`);
    });
    for (const item of items) item.onSelect?.();
    expect(click).toHaveBeenCalledTimes(1);
    expect(controller.calls).toEqual([
      "openPreview:doc-notes.md",
      "anchor:/download/doc-notes.md:noopener:true:true",
      "rename.start:doc-notes.md",
      "trash:doc-notes.md",
    ]);
    // The temporary anchor is removed again once the download started.
    expect(document.querySelector('a[href="/download/doc-notes.md"]')).toBeNull();
  });

  it("the name button opens the preview", async () => {
    const controller = stubController({ documents: [doc] });
    renderStub(controller, "documents");
    await userEvent.click(screen.getByRole("button", { name: "notes.md" }));
    expect(controller.calls).toEqual(["openPreview:doc-notes.md"]);
  });

  it("shows Moving… in place of the menu for the row being trashed", () => {
    renderStub(stubController({ documents: [doc], trashingId: doc.id }), "documents");
    expect(screen.getByText("Moving…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: 'Actions for "notes.md"' })).not.toBeInTheDocument();
  });
});

describe("Library rename field", () => {
  const doc = fakeDocument("notes.md");

  function renameController(rename: Partial<LibraryController["rename"]> = {}) {
    const controller = stubController({ documents: [doc] });
    controller.rename = { ...controller.rename, editingId: doc.id, draft: "notes", ...rename };
    return controller;
  }

  it("edits the stem beside the fixed extension; Enter saves, Escape cancels, other keys do neither", () => {
    const controller = renameController();
    renderStub(controller, "documents");
    const input = screen.getByRole("textbox", { name: "New name" });
    expect(input).toHaveValue("notes");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(screen.getByText(".md")).toHaveClass("library-rename-ext");
    fireEvent.change(input, { target: { value: "minutes" } });
    fireEvent.keyDown(input, { key: "a" });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(controller.calls).toEqual(["setDraft:minutes", "rename.save", "rename.cancel"]);
  });

  it("Save and Cancel buttons call the controller", async () => {
    const controller = renameController();
    renderStub(controller, "documents");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(controller.calls).toEqual(["rename.save", "rename.cancel"]);
  });

  it("marks an invalid name and disables Save", () => {
    renderStub(renameController({ invalid: true }), "documents");
    expect(screen.getByRole("textbox", { name: "New name" })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });

  it("shows Saving… and disables both buttons while saving", () => {
    renderStub(renameController({ saving: true }), "documents");
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});

describe("Library preview dialog", () => {
  function renderPreview(preview: LibraryPreviewState) {
    const controller = stubController({ documents: [preview.item], preview });
    renderStub(controller, "documents");
    return controller;
  }

  it("shows the loading phase", () => {
    renderPreview(previewState({ loading: true }));
    expect(screen.getByText("Loading preview…")).toBeInTheDocument();
  });

  it("shows a preview error", () => {
    renderPreview(previewState({ error: "Preview failed." }));
    expect(screen.getByText("Preview failed.")).toHaveClass("notice", "error");
  });

  it.each([
    ["Markdown whose HTML has not arrived", { kind: "markdown" as const, html: null }],
    ["text whose source has not arrived", { kind: "text" as const, text: null }],
    ["a PDF without a blob URL", { kind: "pdf" as const, pdfUrl: null }],
    ["a download-only document", { kind: "download" as const, item: fakeDocument("report.docx") }],
  ])("falls back to the no-preview note for %s", (_label, overrides) => {
    renderPreview(previewState(overrides));
    expect(screen.getByText("No preview for this file type. Download it to open it.")).toHaveClass("library-preview-none");
    expect(screen.queryByTitle(/\./)).toBeNull();
  });

  it("notes a truncated preview, and only then", () => {
    renderPreview(previewState({ kind: "text", text: "abc", truncated: true }));
    expect(screen.getByText("Showing the first 64 KB. Download the file to see all of it.")).toBeInTheDocument();
  });

  it("offers the download link and the file's type and size in the header", () => {
    renderPreview(previewState({ kind: "text", text: "abc", item: fakeDocument("notes.md", { byteSize: 2048 }) }));
    const dialog = screen.getByRole("dialog", { name: "notes.md" });
    expect(within(dialog).getByRole("link", { name: "Download" })).toHaveAttribute("href", "/download/doc-notes.md");
    expect(within(dialog).getByText("MD · 2.0 KB")).toBeInTheDocument();
    expect(screen.queryByText("Showing the first 64 KB. Download the file to see all of it.")).not.toBeInTheDocument();
  });

  it("closes on Escape, the close button and a backdrop click, but not on other keys or clicks inside", async () => {
    const controller = renderPreview(previewState({ kind: "text", text: "abc" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "a" });
    fireEvent.click(within(dialog).getByText("abc"));
    expect(controller.calls).toEqual([]);
    fireEvent.keyDown(dialog, { key: "Escape" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    fireEvent.click(dialog.parentElement!);
    expect(controller.calls).toEqual(["closePreview", "closePreview", "closePreview"]);
  });

  it("colours the Markdown frame from the admin theme's text, --link and --border", () => {
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      color: "rgb(1, 2, 3)",
      getPropertyValue: (name: string) => ({ "--link": " #00f ", "--border": " #ccc " })[name] ?? "",
    } as unknown as CSSStyleDeclaration);
    renderPreview(previewState({ kind: "markdown", html: "<p>x</p>" }));
    const srcdoc = screen.getByTitle("notes.md").getAttribute("srcdoc") ?? "";
    expect(srcdoc).toContain("color:rgb(1, 2, 3)");
    expect(srcdoc).toContain("a{color:#00f}");
    expect(srcdoc).toContain("border:1px solid #ccc");
  });

  it("falls back to the text colour for links when --link is unset", () => {
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      color: "rgb(1, 2, 3)",
      getPropertyValue: () => "",
    } as unknown as CSSStyleDeclaration);
    renderPreview(previewState({ kind: "markdown", html: "<p>x</p>" }));
    const srcdoc = screen.getByTitle("notes.md").getAttribute("srcdoc") ?? "";
    expect(srcdoc).toContain("a{color:rgb(1, 2, 3)}");
    expect(srcdoc).toContain("border:1px solid GrayText");
  });

  it("falls back to system colours when the theme exposes none", () => {
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      color: "",
      getPropertyValue: () => "",
    } as unknown as CSSStyleDeclaration);
    renderPreview(previewState({ kind: "markdown", html: "<p>x</p>" }));
    const srcdoc = screen.getByTitle("notes.md").getAttribute("srcdoc") ?? "";
    expect(srcdoc).toContain("color:CanvasText");
    expect(srcdoc).toContain("a{color:LinkText}");
    expect(srcdoc).toContain("border:1px solid GrayText");
  });
});
