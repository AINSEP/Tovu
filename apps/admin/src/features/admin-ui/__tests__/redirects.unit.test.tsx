import { StrictMode } from "react";
import { render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ADMIN_PANELS } from "../../../panels";
import { parseRoute } from "../../../App";
import { Placeholder } from "../../../components/Placeholder";

// AdminUi reads the admin locale; these tests render panels without the fetch-query provider.
vi.mock("../../../hooks/use-admin-locale.hooks", () => ({ useAdminLocale: () => "en" }));

const originalUrl = window.location.href;
afterEach(() => window.history.replaceState(null, "", originalUrl));

it.each([
  ["admin-themes", "theme"],
  ["admin-appearance", "appearance"],
  ["design-system", "appearance"],
  ["admin-ui?tab=design-system", "appearance"],
])("replaces /admin/%s with its Admin UI tab", (path, tab) => {
  window.history.replaceState(null, "", `/admin/${path}${path.includes("?") ? "&" : "?"}old=1#stale`);
  const length = window.history.length;
  const route = parseRoute(`/${path}`);
  expect(route.panelId).toBe(path.split("?")[0]);
  const panel = ADMIN_PANELS.find((candidate) => candidate.id === route.panelId)!;
  render(<StrictMode>{panel.render({ ...route, Placeholder })}</StrictMode>);
  expect(window.location.pathname).toBe("/admin/admin-ui");
  expect(window.location.search).toBe(`?tab=${tab}`);
  expect(window.location.hash).toBe("");
  expect(window.history.length).toBe(length);
});
