import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
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
import { createFakeLibraryPort, fakeDocument } from "../hooks/library-dependencies.hooks";
import { useLibrary, type LibraryController } from "../hooks/use-library.hooks";
import { t as libraryT } from "../library-i18n";
import { libraryFileProblem, LIBRARY_MAX_BYTES } from "../rules";

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

  it("shows an empty state with an Upload documents action", async () => {
    renderLibrary(createFakeLibraryPort(), "documents");
    expect(await screen.findByText("No documents yet.")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Upload documents" })).toBeInTheDocument();
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

  it("hides the empty state's upload action without media.upload", async () => {
    renderLibrary(createFakeLibraryPort({ permissions: ["media.read"] }), "documents");
    expect(await screen.findByText("No documents yet.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Upload documents" })).not.toBeInTheDocument());
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
    "Library", "Content", "Upload", "Documents", "Private documents the assistant can read. Visitors never see them.",
    "Drop documents here, or click to browse", "Markdown, text, PDF, Word, CSV or JSON · up to 10 MiB each", "Uploads",
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
