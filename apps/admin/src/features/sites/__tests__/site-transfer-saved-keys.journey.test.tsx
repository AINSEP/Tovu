import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { SiteExportTab } from "../SiteExportTab";
import { SiteImportTab } from "../SiteImportTab";
import { defaultSiteTransferPort } from "../hooks/site-transfer-dependencies.hooks";
import { useSiteExport, useSiteImport } from "../hooks/use-site-transfer.hooks";
import { t as sitesTranslator } from "../sites-i18n";

/** The real UI/controller/HTTP adapter journey. Only the remote HTTP service is simulated;
 * archive crypto, authorization and durable registry verification belong to Jobs 1 and 2. */
const t = (key: string) => key;
const archivePassword = "generated-password-for-this-export";
const omission = "Left out posts.content row 123.";
const share = { shareId: "share-1", file: "site.tovu.zip", bytes: 1024, url: null, status: "active", createdAt: "2026-10-31T12:00:00Z", downloadUrl: "/download", hasEncryptedKeys: true, notices: [omission] };
const pending = { importId: "import-1", source: { uploadId: "upload-1" }, newSiteName: "copy", state: "needs-owner", hasEncryptedKeys: true, createdAt: "2026-10-31T12:00:00Z" };
type Call = { path: string; method: string; body?: string; credentials?: RequestCredentials };

function service({ owner = true, seededOwner = owner, carriesKeys = true, revealFails = false } = {}) {
  const calls: Call[] = [];
  let exported = false;
  let polled = false;
  let completed = false;
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const path = String(url);
    const body = init?.body instanceof Blob ? await init.body.text() : init?.body as string | undefined;
    const method = init?.method ?? "GET";
    calls.push({ path, method, body, credentials: init?.credentials });
    if (path.endsWith("/auth/me")) return Response.json({ user: { id: "caller", username: "admin" } });
    if (path.endsWith("/users")) return Response.json({ users: [{ principalId: "caller", isOwner: owner, canRename: !seededOwner }] });
    if (path.endsWith("/static/options")) return Response.json({ activeThemeId: "", themes: [] });
    if (path.endsWith("/site-shares/share-1/password")) return revealFails
      ? Response.json({ code: "FORBIDDEN", message: "Only the owner can reveal passwords." }, { status: 403 })
      : Response.json({ password: archivePassword }, { headers: { "Cache-Control": "no-store" } });
    if (path.endsWith("/site-shares") && method === "POST") {
      if (!polled) { polled = true; return Response.json({ jobId: "job-1", phase: "preparing" }); }
      exported = true;
      return Response.json({ ...share, hasEncryptedKeys: JSON.parse(body!).includeSavedKeys ?? calls.some(call => call.body === '{"includeSavedKeys":true}') });
    }
    if (path.endsWith("/site-shares")) return Response.json({ shares: exported ? [share] : [] });
    if (path.endsWith("/site-imports/import-1/owner")) {
      completed = true;
      return Response.json({ ...pending, state: "ready", warnings: [omission, "Saved keys were left out: incorrect password."] });
    }
    if (path.endsWith("/site-imports")) return Response.json({ imports: completed
      ? [{ ...pending, state: "ready", warnings: [omission, "Saved keys were left out: incorrect password."] }]
      : [{ ...pending, hasEncryptedKeys: carriesKeys }] });
    throw new Error(`Unexpected HTTP request: ${method} ${path}`);
  });
  return calls;
}

function exportScreen(clipboard = { writeText: vi.fn(async (_text: string) => {}) }) {
  return render(<FetchQueryProvider><SiteExportTab t={t} useExport={({ t }) => useSiteExport({ port: defaultSiteTransferPort, t }, { clipboard })} /></FetchQueryProvider>);
}

function importScreen() {
  return render(<FetchQueryProvider><SiteImportTab t={t} useImport={({ t }) => useSiteImport({ port: defaultSiteTransferPort, t })} /></FetchQueryProvider>);
}

afterEach(() => { vi.unstubAllGlobals(); });

it("defaults keys off and does not fetch a password for an ordinary export", async () => {
  const calls = service();
  exportScreen();
  expect(await screen.findByLabelText("Include saved keys")).not.toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Export Tovu site" }));
  await screen.findByRole("link", { name: "Download zip" });
  expect(calls.filter(call => call.method === "POST").map(call => call.body)).toEqual(["{}", '{"jobId":"job-1"}']);
  expect(calls.some(call => call.path.endsWith("/password"))).toBe(false);
}, 10000);

it("opts in only on the first POST, shows the password once with Copy, and requires reveal after refresh", async () => {
  const calls = service();
  const clipboard = { writeText: vi.fn(async (_text: string) => {}) };
  const first = exportScreen(clipboard);
  fireEvent.click(await screen.findByLabelText("Include saved keys"));
  fireEvent.click(screen.getByRole("button", { name: "Export Tovu site" }));
  expect(await screen.findByDisplayValue(archivePassword)).toBeVisible();
  expect(screen.getByText("Send this password separately")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  await waitFor(() => expect(clipboard.writeText).toHaveBeenCalledExactlyOnceWith(archivePassword));
  expect(calls.filter(call => call.path.endsWith("/site-shares") && call.method === "POST").map(call => call.body)).toEqual(['{"includeSavedKeys":true}', '{"jobId":"job-1"}']);
  expect(calls.filter(call => call.path.endsWith("/password"))).toHaveLength(1);
  first.unmount();
  exportScreen(clipboard);
  const reveal = await screen.findByRole("button", { name: "Reveal password" });
  expect(screen.queryByDisplayValue(archivePassword)).toBeNull();
  expect(screen.getByText(omission)).toBeVisible();
  fireEvent.click(reveal);
  expect(await screen.findByDisplayValue(archivePassword)).toBeVisible();
  expect(calls.filter(call => call.path.endsWith("/password"))).toHaveLength(2);
}, 10000);

it("withholds key export and reveal from a non-owner even with a saved encrypted export", async () => {
  const calls = service({ owner: false });
  // First create a history record without going through the owner-only UI.
  await defaultSiteTransferPort.createShare({});
  await defaultSiteTransferPort.createShare({ jobId: "job-1" });
  exportScreen();
  await screen.findByRole("link", { name: "Download zip" });
  await waitFor(() => expect(calls.some(call => call.path.endsWith("/users"))).toBe(true));
  expect(screen.queryByLabelText("Include saved keys")).toBeNull();
  expect(screen.queryByRole("button", { name: "Reveal password" })).toBeNull();
  expect(calls.some(call => call.path.endsWith("/password"))).toBe(false);
}, 10000);

it("keeps export omissions visible when password retrieval fails", async () => {
  service({ revealFails: true });
  exportScreen();
  fireEvent.click(await screen.findByLabelText("Include saved keys"));
  fireEvent.click(screen.getByRole("button", { name: "Export Tovu site" }));
  expect(await screen.findByText(omission)).toBeVisible();
  expect(await screen.findByRole("alert")).toHaveTextContent("Only the owner");
  expect(screen.queryByDisplayValue(archivePassword)).toBeNull();
}, 10000);

it("does not treat another wildcard policy owner as the designated site owner", async () => {
  const calls = service({ owner: true, seededOwner: false });
  await defaultSiteTransferPort.createShare({});
  await defaultSiteTransferPort.createShare({ jobId: "job-1" });
  exportScreen();
  await screen.findByRole("link", { name: "Download zip" });
  await waitFor(() => expect(calls.some(call => call.path.endsWith("/users"))).toBe(true));
  expect(screen.queryByLabelText("Include saved keys")).toBeNull();
  expect(screen.queryByRole("button", { name: "Reveal password" })).toBeNull();
}, 10000);

it("keeps the saved keys password separate, submits it as a form field, and retains notices after refresh", async () => {
  const calls = service();
  const first = importScreen();
  fireEvent.click(await screen.findByRole("button", { name: "Finish setup" }));
  const saved = screen.getByLabelText("Saved keys password");
  expect(saved).toHaveAttribute("type", "password");
  fireEvent.change(saved, { target: { value: "wrong key & password" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "new admin password" } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "new admin password" } });
  fireEvent.click(screen.getByRole("button", { name: "Create site" }));
  await screen.findByText("copy is ready.");
  expect(calls.find(call => call.path.endsWith("/owner"))?.body).toBe("adminPassword=new+admin+password&savedKeysPassword=wrong+key+%26+password");
  expect(screen.queryByLabelText("Saved keys password")).toBeNull();
  first.unmount();
  importScreen();
  const table = await screen.findByRole("table", { name: "Past imports" });
  expect(await within(table).findByText(omission)).toBeVisible();
  expect(within(table).getByText("Saved keys were left out: incorrect password.")).toBeVisible();
}, 10000);

it.each([true, false])("allows owner setup without a saved keys password (bundle present: %s)", async carriesKeys => {
  const calls = service({ carriesKeys });
  importScreen();
  fireEvent.click(await screen.findByRole("button", { name: "Finish setup" }));
  expect(Boolean(screen.queryByLabelText("Saved keys password"))).toBe(carriesKeys);
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "administrator" } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "administrator" } });
  fireEvent.click(screen.getByRole("button", { name: "Create site" }));
  await screen.findByText("copy is ready.");
  expect(calls.find(call => call.path.endsWith("/owner"))?.body).toBe("adminPassword=administrator");
}, 10000);

it("reads the new saved keys labels from the Sites dictionary in the admin's locale", async () => {
  service();
  render(<FetchQueryProvider><SiteExportTab t={key => sitesTranslator({ locale: "zh-CN", key })} useExport={({ t }) => useSiteExport({ port: defaultSiteTransferPort, t })} /></FetchQueryProvider>);
  expect(await screen.findByLabelText("包含已保存的密钥")).not.toBeChecked();
}, 10000);
