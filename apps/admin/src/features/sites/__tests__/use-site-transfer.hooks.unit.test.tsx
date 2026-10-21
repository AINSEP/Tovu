import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { ApiError } from "@/lib/api";
import { resetAssistantDockBus, subscribeToAssistantDockRequests } from "@/lib/assistant-dock-bus";
import { resetAssistantPromptBus, useAssistantPromptRequests } from "@/lib/assistant-prompt-bus";
import {
  createFakeSiteTransferPort,
  defaultSiteTransferPort,
  type SiteImport,
  type SiteShare,
} from "../hooks/site-transfer-dependencies.hooks";
import { liveImportPrompt, useSiteExport, useSiteImport, validShareLink, validWebsiteAddress } from "../hooks/use-site-transfer.hooks";

/**
 * @file The Export Site / Import Site controllers, driven against `createFakeSiteTransferPort`, plus
 * the live port's request shapes (the upload re-type and the form-encoded owner password are the
 * two places this adapter departs from plain JSON).
 */

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

const t = (key: string): string => key;

function share(overrides: Partial<SiteShare> = {}): SiteShare {
  return {
    shareId: "share-1",
    file: "mingjie-2026-10-18.tovu.zip",
    bytes: 2048,
    url: "https://example.com/s/abc",
    status: "active",
    createdAt: "2026-10-18T10:00:00.000Z",
    downloadUrl: "/api/admin/v1/workspaces/w/site-shares/share-1/download",
    ...overrides,
  };
}

function siteImport(overrides: Partial<SiteImport> = {}): SiteImport {
  return { importId: "import-1", source: { url: "https://example.com/s/abc" }, newSiteName: "mingjie-copy", state: "needs-owner", createdAt: "2026-10-18T11:00:00.000Z", ...overrides };
}

afterEach(() => {
  resetAssistantPromptBus();
  resetAssistantDockBus();
  vi.unstubAllGlobals();
});

describe("site transfer port", () => {
  it("the fake rejects every write it was not given", async () => {
    const port = createFakeSiteTransferPort();
    await expect(port.createShare({})).rejects.toThrow("createShare was not expected");
    await expect(port.revokeShare({ shareId: "x" })).rejects.toThrow("revokeShare was not expected");
    await expect(port.uploadImportZip({ file: new Blob() })).rejects.toThrow("uploadImportZip was not expected");
    await expect(port.startImport({ url: "https://example.com" })).rejects.toThrow("startImport was not expected");
    await expect(port.completeImportOwner({ importId: "i", adminPassword: "p" })).rejects.toThrow("completeImportOwner was not expected");
    await expect(port.listShares()).resolves.toEqual({ shares: [] });
    await expect(port.listImports()).resolves.toEqual({ imports: [] });
  });

  const base = "/api/admin/v1/workspaces/workspace-local";
  it.each([
    { name: "listShares", run: () => defaultSiteTransferPort.listShares(), path: "/site-shares", method: "GET", contentType: undefined, body: undefined },
    { name: "createShare", run: () => defaultSiteTransferPort.createShare({}), path: "/site-shares", method: "POST", contentType: undefined, body: "{}" },
    { name: "createShare poll", run: () => defaultSiteTransferPort.createShare({ jobId: "job-1" }), path: "/site-shares", method: "POST", contentType: undefined, body: JSON.stringify({ jobId: "job-1" }) },
    { name: "revokeShare", run: () => defaultSiteTransferPort.revokeShare({ shareId: "a/b" }), path: "/site-shares/a%2Fb", method: "DELETE", contentType: undefined, body: undefined },
    { name: "listImports", run: () => defaultSiteTransferPort.listImports(), path: "/site-imports", method: "GET", contentType: undefined, body: undefined },
    { name: "startImport", run: () => defaultSiteTransferPort.startImport({ url: "https://example.com/s/abc" }), path: "/site-imports", method: "POST", contentType: undefined, body: JSON.stringify({ url: "https://example.com/s/abc" }) },
    { name: "uploadImportZip", run: () => defaultSiteTransferPort.uploadImportZip({ file: new Blob(["PK"], { type: "application/x-zip-compressed" }) }), path: "/site-imports/uploads", method: "POST", contentType: "application/zip", body: "PK" },
    { name: "completeImportOwner", run: () => defaultSiteTransferPort.completeImportOwner({ importId: "import-1", adminPassword: "a b&c" }), path: "/site-imports/import-1/owner", method: "POST", contentType: "application/x-www-form-urlencoded", body: "adminPassword=a+b%26c" },
  ])("the live $name binding sends the route's request shape", async ({ run, path, method, contentType, body }) => {
    const seen: Array<{ url: string; method: string; contentType: string | undefined; body: string | undefined }> = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const raw = init?.body;
      seen.push({ url, method: init?.method ?? "GET", contentType: headers.get("Content-Type") ?? undefined, body: raw instanceof Blob ? await raw.text() : (raw as string | undefined) });
      return Response.json({ ok: true });
    });
    await run();
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe(`${base}${path}`);
    expect(seen[0]!.method).toBe(method);
    expect(seen[0]!.body).toBe(body);
    if (contentType) expect(seen[0]!.contentType).toBe(contentType);
  });

  it("the download href is the share's admin zip route", () => {
    expect(defaultSiteTransferPort.shareDownloadHref(share({ shareId: "s 1" }))).toBe("/api/admin/v1/workspaces/workspace-local/site-shares/s%201/download");
  });
});

describe("useSiteExport", () => {
  it("shows a flat server refusal through the live export port", async () => {
    const message = "Share refused: 'targets/cloudflare-pages.mjs' contains credential-shaped content. <plain text>";
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? Response.json({ code: "SECRET_IN_CONTENT", message }, { status: 400 })
        : Response.json({ shares: [] }));
    const { result } = renderHook(() => useSiteExport({ port: defaultSiteTransferPort, t }), { wrapper });
    await act(() => result.current.exportSite());
    expect(result.current.exportError).toBe(message);
    expect(result.current.exporting).toBe(false);
    await expect(defaultSiteTransferPort.createShare({})).rejects.toMatchObject({
      status: 400, code: "SECRET_IN_CONTENT", message,
    });
  });
  it("StrictMode exposes a 400 refusal and clears the exporting spinner", async () => {
    let rejectExport!: (error: Error) => void;
    const port = createFakeSiteTransferPort({ createShare: () => new Promise((_, reject) => { rejectExport = reject; }) });
    // Root-level strict mode replays effects; a nested <StrictMode> wrapper does not in tests.
    const { result } = renderHook(() => useSiteExport({ port, t }), {
      wrapper: ({ children }) => <FetchQueryProvider>{children}</FetchQueryProvider>,
      reactStrictMode: true,
    });
    let pending!: Promise<void>;
    act(() => { pending = result.current.exportSite(); });
    expect(result.current.exporting).toBe(true);
    await act(async () => {
      rejectExport(new ApiError("Cannot share unsupported nonempty table 'p_unknown__data'.", 400, "UNSUPPORTED_DATA"));
      await pending;
    });
    expect(result.current.exportError).toContain("p_unknown__data");
    expect(result.current.exporting).toBe(false);
  });

  it("polls with the job id until a finished share returns, then refreshes the list", async () => {
    const calls: Array<{ jobId?: string }> = [];
    let listed: SiteShare[] = [];
    const port = createFakeSiteTransferPort({
      listShares: async () => ({ shares: listed }),
      createShare: async (input) => {
        calls.push(input);
        if (calls.length < 3) return { jobId: "job-1", phase: "packing" };
        listed = [share()];
        return share();
      },
    });
    const { result } = renderHook(() => useSiteExport({ port, t }), { wrapper });
    await waitFor(() => expect(result.current.shares).toEqual([]));
    await act(() => result.current.exportSite());
    expect(calls).toEqual([{}, { jobId: "job-1" }, { jobId: "job-1" }]);
    expect(result.current.exporting).toBe(false);
    expect(result.current.exportError).toBeNull();
    await waitFor(() => expect(result.current.shares).toEqual([share()]));
  });

  it("shows the server's message when an export fails", async () => {
    const port = createFakeSiteTransferPort({ createShare: async () => { throw new ApiError("No storage configured.", 400, "UNAVAILABLE"); } });
    const { result } = renderHook(() => useSiteExport({ port, t }), { wrapper });
    await act(() => result.current.exportSite());
    expect(result.current.exportError).toBe("No storage configured.");
    expect(result.current.exporting).toBe(false);
  });

  it("ignores a second press while an export runs", async () => {
    let release: (value: SiteShare) => void = () => {};
    const createShare = vi.fn(() => new Promise<SiteShare>((resolve) => { release = resolve; }));
    const port = createFakeSiteTransferPort({ createShare });
    const { result } = renderHook(() => useSiteExport({ port, t }), { wrapper });
    let first: Promise<void> = Promise.resolve();
    act(() => { first = result.current.exportSite(); });
    await waitFor(() => expect(result.current.exporting).toBe(true));
    await act(() => result.current.exportSite());
    expect(createShare).toHaveBeenCalledTimes(1);
    await act(async () => { release(share()); await first; });
    expect(result.current.exporting).toBe(false);
  });

  it("gives up with a 'taking too long' message when the export never finishes", async () => {
    const createShare = vi.fn(async () => ({ jobId: "job-1", phase: "packing" }));
    const port = createFakeSiteTransferPort({ createShare });
    const { result } = renderHook(() => useSiteExport({ port, t }), { wrapper });
    await act(() => result.current.exportSite());
    expect(result.current.exportError).toBe("The export is taking too long. Try again later.");
    expect(result.current.exporting).toBe(false);
    expect(createShare.mock.calls.length).toBeGreaterThan(1);
  });

  it("drops an export failure that lands after unmount", async () => {
    let fail: (error: Error) => void = () => {};
    const createShare = vi.fn(() => new Promise<SiteShare>((_resolve, reject) => { fail = reject; }));
    const port = createFakeSiteTransferPort({ createShare });
    const { result, unmount } = renderHook(() => useSiteExport({ port, t }), { wrapper });
    let pending: Promise<void> = Promise.resolve();
    act(() => { pending = result.current.exportSite(); });
    const exporting = result.current;
    unmount();
    await act(async () => { fail(new Error("packing failed")); await pending; });
    expect(exporting.exportError).toBeNull();
    expect(createShare).toHaveBeenCalledTimes(1);
  });

  it("ignores a second revoke while one is in flight", async () => {
    let release: (value: SiteShare) => void = () => {};
    const revokeShare = vi.fn(() => new Promise<SiteShare>((resolve) => { release = resolve; }));
    const port = createFakeSiteTransferPort({ listShares: async () => ({ shares: [share()] }), revokeShare });
    const { result } = renderHook(() => useSiteExport({ port, t }), { wrapper });
    await waitFor(() => expect(result.current.shares).toHaveLength(1));
    let first: Promise<void> = Promise.resolve();
    act(() => { first = result.current.revoke(share()); });
    await waitFor(() => expect(result.current.revokingId).toBe("share-1"));
    await act(() => result.current.revoke(share({ shareId: "share-2" })));
    expect(revokeShare).toHaveBeenCalledTimes(1);
    await act(async () => { release(share({ status: "revoked" })); await first; });
    expect(result.current.revokingId).toBeNull();
  });

  it("revokes one share and reports a failure", async () => {
    const revokeShare = vi.fn(async () => share({ status: "revoked" }));
    const port = createFakeSiteTransferPort({ listShares: async () => ({ shares: [share()] }), revokeShare });
    const { result } = renderHook(() => useSiteExport({ port, t }), { wrapper });
    await waitFor(() => expect(result.current.shares).toHaveLength(1));
    await act(() => result.current.revoke(share()));
    expect(revokeShare).toHaveBeenCalledWith({ shareId: "share-1" });
    expect(result.current.revokingId).toBeNull();

    revokeShare.mockRejectedValueOnce(new ApiError("", 500));
    await act(() => result.current.revoke(share()));
    expect(result.current.exportError).toBe("Revoke failed.");
  });

  it("copies an active link and marks it copied; a zip-only share copies nothing", async () => {
    const writeText = vi.fn(async () => {});
    const port = createFakeSiteTransferPort();
    const { result } = renderHook(() => useSiteExport({ port, t }, { clipboard: { writeText } }), { wrapper });
    await act(() => result.current.copyLink(share({ url: null })));
    expect(writeText).not.toHaveBeenCalled();
    await act(() => result.current.copyLink(share()));
    expect(writeText).toHaveBeenCalledWith("https://example.com/s/abc");
    expect(result.current.copiedId).toBe("share-1");
  });

  it("copies nothing on a host with no navigator (SSR) when no clipboard is injected", async () => {
    const port = createFakeSiteTransferPort();
    vi.stubGlobal("navigator", undefined);
    try {
      const { result } = renderHook(() => useSiteExport({ port, t }), { wrapper });
      await act(() => result.current.copyLink(share()));
      expect(result.current.copiedId).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("is zip-only when the newest export has no link", async () => {
    const port = createFakeSiteTransferPort({ listShares: async () => ({ shares: [share({ url: null }), share({ shareId: "old" })] }) });
    const { result } = renderHook(() => useSiteExport({ port, t }), { wrapper });
    await waitFor(() => expect(result.current.zipOnly).toBe(true));
    expect(result.current.downloadHref(share())).toBe("/download/share-1");
  });

  it("is not zip-only with no exports, and names a list failure", async () => {
    const port = createFakeSiteTransferPort({ listShares: async () => { throw new ApiError("", 500); } });
    const { result } = renderHook(() => useSiteExport({ port, t }), { wrapper });
    await waitFor(() => expect(result.current.listError).toBe("Couldn't load exports."));
    expect(result.current.zipOnly).toBe(false);
  });
});

describe("share link and website address rules", () => {
  it.each([
    ["https://example.com/s/abc", true],
    ["  https://example.com/s/abc  ", true],
    ["http://example.com/s/abc", false],
    ["https://user:pw@example.com/s", false],
    ["https://example.com/s#frag", false],
    ["not a link", false],
    ["", false],
  ])("validShareLink(%j) is %s", (link, expected) => {
    expect(validShareLink(link)).toBe(expected);
  });

  it.each([
    ["https://example.com", true],
    ["http://example.com", true],
    ["javascript:alert(1)", false],
    ["file:///etc/passwd", false],
    ["example.com", false],
  ])("validWebsiteAddress(%j) is %s", (address, expected) => {
    expect(validWebsiteAddress(address)).toBe(expected);
  });

  it("drafts a request naming the trimmed address and the site-import plugin", () => {
    expect(liveImportPrompt("  https://example.com ")).toBe("Import the live website at https://example.com into this site with the site-import agent plugin.");
  });
});

describe("useSiteImport", () => {
  it("imports by share link, then sets the new owner's password", async () => {
    const startImport = vi.fn(async () => siteImport());
    const completeImportOwner = vi.fn(async () => siteImport({ state: "ready", adminUrl: "https://localhost:3000/admin" }));
    const port = createFakeSiteTransferPort({ startImport, completeImportOwner });
    const { result } = renderHook(() => useSiteImport({ port, t }), { wrapper });

    act(() => result.current.setLink(" https://example.com/s/abc "));
    expect(result.current.canImport).toBe(true);
    await act(() => result.current.startImport());
    expect(startImport).toHaveBeenCalledWith({ url: "https://example.com/s/abc" });
    expect(result.current.current?.state).toBe("needs-owner");
    expect(result.current.link).toBe("");

    act(() => { result.current.setPassword("s3cret"); result.current.setConfirm("other"); });
    expect(result.current.passwordProblem).toBe("The passwords don't match.");
    await act(() => result.current.completeOwner());
    expect(completeImportOwner).not.toHaveBeenCalled();

    act(() => result.current.setConfirm("s3cret"));
    expect(result.current.passwordProblem).toBeNull();
    await act(() => result.current.completeOwner());
    expect(completeImportOwner).toHaveBeenCalledWith({ importId: "import-1", adminPassword: "s3cret" });
    expect(result.current.current?.state).toBe("ready");
    expect(result.current.password).toBe("");
    expect(result.current.confirm).toBe("");
  });

  it("uploads a picked .zip first, then imports by its upload id", async () => {
    const uploadImportZip = vi.fn(async () => ({ uploadId: "upload-1" }));
    const startImport = vi.fn(async () => siteImport({ source: { uploadId: "upload-1" } }));
    const port = createFakeSiteTransferPort({ uploadImportZip, startImport });
    const { result } = renderHook(() => useSiteImport({ port, t }), { wrapper });
    const zip = new File(["PK"], "mingjie.tovu.zip", { type: "application/zip" });

    act(() => result.current.setLink("https://example.com/s/abc"));
    act(() => result.current.chooseFiles([zip]));
    expect(result.current.file).toBe(zip);
    expect(result.current.link).toBe("");
    await act(() => result.current.startImport());
    expect(uploadImportZip).toHaveBeenCalledWith({ file: zip });
    expect(startImport).toHaveBeenCalledWith({ uploadId: "upload-1" });
    expect(result.current.file).toBeNull();
  });

  it("refuses a file that is not a .zip, and typing a link clears a chosen file", () => {
    const port = createFakeSiteTransferPort();
    const { result } = renderHook(() => useSiteImport({ port, t }), { wrapper });
    act(() => result.current.chooseFiles([new File(["x"], "notes.pdf")]));
    expect(result.current.file).toBeNull();
    expect(result.current.importError).toBe("Choose a .tovu.zip file.");
    act(() => result.current.chooseFiles([]));
    expect(result.current.file).toBeNull();

    act(() => result.current.chooseFiles([new File(["PK"], "a.ZIP")]));
    expect(result.current.importError).toBeNull();
    act(() => result.current.setLink("https://example.com/s/abc"));
    expect(result.current.file).toBeNull();
    act(() => result.current.chooseFiles([new File(["PK"], "a.zip")]));
    act(() => result.current.clearFile());
    expect(result.current.file).toBeNull();
    expect(result.current.canImport).toBe(false);
  });

  it("clearing the link keeps a chosen file, and a second import press while one runs is ignored", async () => {
    let release: (value: SiteImport) => void = () => {};
    const startImport = vi.fn(() => new Promise<SiteImport>((resolve) => { release = resolve; }));
    const port = createFakeSiteTransferPort({ startImport });
    const { result } = renderHook(() => useSiteImport({ port, t }), { wrapper });
    act(() => result.current.chooseFiles([new File(["PK"], "site.tovu.zip")]));
    act(() => result.current.setLink(""));
    expect(result.current.file?.name).toBe("site.tovu.zip");
    act(() => result.current.setLink("https://example.com/s/abc"));
    let first: Promise<void> = Promise.resolve();
    act(() => { first = result.current.startImport(); });
    await waitFor(() => expect(result.current.importing).toBe(true));
    await act(() => result.current.startImport());
    expect(startImport).toHaveBeenCalledTimes(1);
    await act(async () => { release(siteImport()); await first; });
    expect(result.current.importing).toBe(false);
  });

  it("refuses a link that is not https, without calling the server", async () => {
    const port = createFakeSiteTransferPort();
    const { result } = renderHook(() => useSiteImport({ port, t }), { wrapper });
    act(() => result.current.setLink("http://example.com/s/abc"));
    await act(() => result.current.startImport());
    expect(result.current.importError).toBe("Paste an https:// share link.");
    expect(result.current.current).toBeNull();
  });

  it("says no site changed when the import fails, keeping the source to retry", async () => {
    const port = createFakeSiteTransferPort({ startImport: async () => { throw new ApiError("", 500); } });
    const { result } = renderHook(() => useSiteImport({ port, t }), { wrapper });
    act(() => result.current.setLink("https://example.com/s/abc"));
    await act(() => result.current.startImport());
    expect(result.current.importError).toBe("Import failed. No site was changed.");
    expect(result.current.importing).toBe(false);
    expect(result.current.link).toBe("https://example.com/s/abc");
  });

  it("names an owner-step failure and keeps the import open", async () => {
    const port = createFakeSiteTransferPort({
      listImports: async () => ({ imports: [siteImport()] }),
      completeImportOwner: async () => { throw new ApiError("", 500); },
    });
    const { result } = renderHook(() => useSiteImport({ port, t }), { wrapper });
    await waitFor(() => expect(result.current.imports).toHaveLength(1));
    act(() => result.current.resume(result.current.imports![0]!));
    act(() => { result.current.setPassword("pw"); result.current.setConfirm("pw"); });
    await act(() => result.current.completeOwner());
    expect(result.current.ownerError).toBe("Couldn't create the site.");
    expect(result.current.current?.importId).toBe("import-1");
    expect(result.current.settingOwner).toBe(false);
  });

  it("names a list failure", async () => {
    const port = createFakeSiteTransferPort({ listImports: async () => { throw new ApiError("", 500); } });
    const { result } = renderHook(() => useSiteImport({ port, t }), { wrapper });
    await waitFor(() => expect(result.current.listError).toBe("Couldn't load imports."));
  });

  it("hands a valid live website to the assistant as a draft and opens the dock", () => {
    const dockRequests: boolean[] = [];
    const unsubscribe = subscribeToAssistantDockRequests((open) => dockRequests.push(open));
    const insertText = vi.fn();
    const handle = { current: { insertText } } as unknown as React.RefObject<never>;
    renderHook(() => useAssistantPromptRequests(handle));
    const port = createFakeSiteTransferPort();
    const { result } = renderHook(() => useSiteImport({ port, t }), { wrapper });

    act(() => result.current.setLiveAddress("javascript:alert(1)"));
    expect(result.current.liveAddressValid).toBe(false);
    act(() => result.current.startLiveImport());
    expect(insertText).not.toHaveBeenCalled();

    act(() => result.current.setLiveAddress("https://example.com"));
    expect(result.current.liveAddressValid).toBe(true);
    act(() => result.current.startLiveImport());
    expect(insertText).toHaveBeenCalledWith(liveImportPrompt("https://example.com"));
    expect(dockRequests).toEqual([true]);
    unsubscribe();
  });
});
