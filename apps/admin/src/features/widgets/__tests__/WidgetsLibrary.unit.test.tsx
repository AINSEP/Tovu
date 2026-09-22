import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WidgetsLibrary, WidgetsLibraryNotices } from "../WidgetsLibrary";
import { widgetTypeLabel } from "../rules";

/**
 * @file `WidgetsLibrary` against the real `useWiredWidgetsLibrary` path (`fetch` stubbed) — pins
 * the 2026-09-21 trash rewrite: Delete always confirms via "Move to trash?" and moves the widget
 * through the generic `POST .../trash/items` route (`api.trash`). The widget-specific purge/
 * force-purge escalation this suite used to pin is gone — the server's widget purge route was
 * removed, so it 404s if anything still called it.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const WIDGET = {
  id: "w1",
  workspaceId: "ws1",
  slug: "hero-banner",
  title: "Hero banner",
  status: "active" as const,
  widgetType: "text" as const,
  config: {},
  updatedAt: "2026-08-01T00:00:00.000Z",
  version: 1,
};

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

beforeEach(() => {
  fetchMock = vi.fn();
  // `WidgetsLibrary` also reads `core.language.locale` (via `useAdminLocale`) to translate its own
  // chrome — a real `fetch` call this file's tests never queued for. Routed here, ahead of
  // `fetchMock`, so it never consumes a slot from the `mockResolvedValueOnce` sequence every test
  // below still queues on `fetchMock` itself unchanged. An empty settings response resolves
  // `loadLanguage()` to `DEFAULT_LOCALE` ("en"), matching every assertion below.
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/settings/effective")) {
      return Promise.resolve(jsonResponse({ data: [] }));
    }
    return fetchMock(input, init);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("Trash opens a confirm dialog and sends no request until confirmed", async () => {
  const user = userEvent.setup();
  fetchMock.mockResolvedValueOnce(jsonResponse({ widgets: [WIDGET] }));

  render(<WidgetsLibrary />);

  await user.click(await screen.findByRole("button", { name: /trash/i }));

  // Only the initial list GET has fired — no trash request yet.
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const dialog = await screen.findByRole("dialog", { name: "Move to trash?" });
  expect(within(dialog).getByText('Move "Hero banner" to trash?')).toBeInTheDocument();
});

it("confirming Trash POSTs the generic trash/items route exactly once and drops the row", async () => {
  const user = userEvent.setup();
  fetchMock
    .mockResolvedValueOnce(jsonResponse({ widgets: [WIDGET] }))
    .mockResolvedValueOnce(jsonResponse({ ok: true, version: 2 }))
    .mockResolvedValueOnce(jsonResponse({ widgets: [] }));

  render(<WidgetsLibrary />);

  await user.click(await screen.findByRole("button", { name: /trash/i }));
  const dialog = await screen.findByRole("dialog", { name: "Move to trash?" });
  await user.click(within(dialog).getByRole("button", { name: "Move to trash" }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  const trashCall = fetchMock.mock.calls[1];
  expect(String(trashCall[0])).toContain("/trash/items");
  expect(trashCall[1]?.body).toBe(JSON.stringify({ type: "widget", id: "w1" }));

  await waitFor(() => expect(screen.queryByText("Hero banner")).not.toBeInTheDocument());
  expect(screen.getByText(/no widgets yet/i)).toBeInTheDocument();
});

it("Cancel on the trash confirm sends no request", async () => {
  const user = userEvent.setup();
  fetchMock.mockResolvedValueOnce(jsonResponse({ widgets: [WIDGET] }));

  render(<WidgetsLibrary />);

  await user.click(await screen.findByRole("button", { name: /trash/i }));
  const dialog = await screen.findByRole("dialog", { name: "Move to trash?" });
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Move to trash?" })).not.toBeInTheDocument());
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("a 409 TRASH_VERSION_CHANGED shows the reload message", async () => {
  const user = userEvent.setup();
  fetchMock
    .mockResolvedValueOnce(jsonResponse({ widgets: [WIDGET] }))
    .mockResolvedValueOnce(
      jsonResponse({ error: "the item changed since it was last read", code: "TRASH_VERSION_CHANGED" }, 409),
    );

  render(<WidgetsLibrary />);

  await user.click(await screen.findByRole("button", { name: /trash/i }));
  const dialog = await screen.findByRole("dialog", { name: "Move to trash?" });
  await user.click(within(dialog).getByRole("button", { name: "Move to trash" }));

  expect(await screen.findByText("This item changed since you loaded it. Reload and try again.")).toBeInTheDocument();
});

it("a 404 (already gone) shows no error and quietly re-reads the list", async () => {
  const user = userEvent.setup();
  fetchMock
    .mockResolvedValueOnce(jsonResponse({ widgets: [WIDGET] }))
    .mockResolvedValueOnce(jsonResponse({ error: "item was not found", code: "NOT_FOUND" }, 404))
    .mockResolvedValueOnce(jsonResponse({ widgets: [] }));

  render(<WidgetsLibrary />);

  await user.click(await screen.findByRole("button", { name: /trash/i }));
  const dialog = await screen.findByRole("dialog", { name: "Move to trash?" });
  await user.click(within(dialog).getByRole("button", { name: "Move to trash" }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  expect(screen.queryByText(/changed since you loaded it/i)).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

// The create-type <select> rendered `WIDGET_TYPE_OPTIONS`' raw English labels and an English
// aria-label in every locale, even though the table's own Type column right below it already went
// through `widgetTypeLabel` — the one sink on this screen the S-I18N sweep's translator swap never
// reached, since the label never passed through `t` at all.
it("labels the create-type select and its options in the admin's locale", async () => {
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/settings/effective")) {
      return Promise.resolve(jsonResponse({ data: [{ key: "locale", value: "es" }] }));
    }
    return fetchMock(input, init);
  });
  fetchMock.mockResolvedValueOnce(jsonResponse({ widgets: [] }));

  render(<WidgetsLibrary />);

  const select = await screen.findByRole("combobox", { name: "Tipo de widget a crear" });
  expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual([
    "Texto",
    "Enlaces sociales",
    "Entradas recientes",
    "Menú",
    "Formulario de contacto",
  ]);
  expect(widgetTypeLabel("social-links", "es")).toBe("Enlaces sociales");
});

// Direct coverage of the two notices extracted out of `WidgetsLibrary`'s own render body under the
// tightened ≤9/≤9 pass. Neither branch had a test before this pass — `WidgetsLibrary`'s own suite
// above never renders it with a fetch/action error or a nonzero skippedCount.
it("renders neither notice when there is no error and nothing was skipped", () => {
  const { container } = render(<WidgetsLibraryNotices error={null} skippedCount={0} />);
  expect(container.querySelector(".notice")).not.toBeInTheDocument();
});

it("renders the error banner", () => {
  render(<WidgetsLibraryNotices error="failed to load widgets" skippedCount={0} />);
  expect(screen.getByText("failed to load widgets")).toBeInTheDocument();
});

it("uses the singular phrasing for exactly one skipped row", () => {
  render(<WidgetsLibraryNotices error={null} skippedCount={1} />);
  expect(screen.getByText("1 row could not be displayed.")).toBeInTheDocument();
});

it("uses the plural phrasing for more than one skipped row", () => {
  render(<WidgetsLibraryNotices error={null} skippedCount={3} />);
  expect(screen.getByText("3 rows could not be displayed.")).toBeInTheDocument();
});
