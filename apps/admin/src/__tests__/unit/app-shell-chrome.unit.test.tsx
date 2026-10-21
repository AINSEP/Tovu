// @vitest-environment jsdom
import { act, fireEvent, render as renderWithoutProvider, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { encodePublishCriteriaToQuery } from "@tovu/publish-content-ui";

import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { agentPageId, App, parseRoute } from "../../App";
import type { UseAdminSession } from "../../App.hooks";
import { closePublishRequest, requestPublish } from "../../features/publish-content/hooks/publish-request.store";
import { publishScreenshotCaptured, resetScreenshotCapturedBus } from "../../lib/agent-screenshot-bus";
import { appShellApiBody } from "../app-shell-api.fixture";

/**
 * @file The admin shell's own chrome around the routed screen: the mobile navigation drawer (topbar
 * toggle, backdrop, the drawer's own close button), the assistant dock's open/close controls, the
 * screenshot-capture announcement toast, and the App-level Publish dialog a `requestPublish` (or the
 * `?publish=` deep link) opens. Same fake-session harness as `app-logout-confirm.unit.test.tsx`.
 */

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => new Response(JSON.stringify(shellBody(String(url))), { status: 200, headers: { "content-type": "application/json" } })),
  );
  // jsdom has no ResizeObserver; the dock's height tracking only needs the constructor surface.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "EventSource",
    class {
      close() {}
      addEventListener() {}
      removeEventListener() {}
    },
  );
});

/** The shared shell fixture, plus the Publish dialog's peer list (empty: nowhere connected yet). */
function shellBody(url: string): Record<string, unknown> {
  if (new URL(url, "http://localhost").pathname.endsWith("/publish-content/peers")) return { peers: [] };
  return appShellApiBody({ url });
}

afterEach(() => {
  act(() => closePublishRequest());
  resetScreenshotCapturedBus();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

const session: UseAdminSession = {
  user: { id: "u1", username: "admin" },
  checking: false,
  handleLogin: vi.fn(),
  logout: vi.fn(async () => {}),
};

function render(ui: ReactElement) {
  return renderWithoutProvider(<FetchQueryProvider>{ui}</FetchQueryProvider>);
}

it("the topbar toggle opens the mobile drawer behind a backdrop, and the backdrop closes it", () => {
  const { container } = render(<App useSession={() => session} />);
  const toggle = screen.getByRole("button", { name: "Open navigation" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(container.querySelector(".sidebar-backdrop")).toBeNull();

  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(toggle).toHaveAccessibleName("Close navigation");
  fireEvent.click(container.querySelector(".sidebar-backdrop")!);
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(container.querySelector(".sidebar-backdrop")).toBeNull();
});

it("the topbar toggle and the drawer's own close button both close an open drawer", () => {
  const { container } = render(<App useSession={() => session} />);
  const toggle = screen.getByRole("button", { name: "Open navigation" });
  fireEvent.click(toggle);
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "false");

  fireEvent.click(toggle);
  fireEvent.click(container.querySelector<HTMLButtonElement>(".cms-nav-close")!);
  expect(toggle).toHaveAttribute("aria-expanded", "false");
});

it("the chat button opens the assistant dock and its Close AI chat button closes it again", () => {
  const { container } = render(<App useSession={() => session} />);
  const dock = container.querySelector("aside.admin-chat-dock")!;
  expect(dock).toHaveAttribute("hidden");

  fireEvent.click(container.querySelector<HTMLButtonElement>(".chat-fab")!);
  expect(dock).not.toHaveAttribute("hidden");
  expect(dock).toHaveClass("is-open");

  fireEvent.click(within(dock as HTMLElement).getByRole("button", { name: "Close AI chat" }));
  expect(dock).toHaveAttribute("hidden");
});

it("announces an assistant screenshot capture with a toast that can be dismissed", async () => {
  render(<App useSession={() => session} />);
  const message = "The assistant just captured a screenshot of this screen.";
  expect(screen.queryByText(message)).toBeNull();

  act(() => publishScreenshotCaptured());
  const toast = await screen.findByText(message);
  fireEvent.click(within(toast.closest(".jini-toast") as HTMLElement).getByRole("button", { name: "Dismiss" }));
  await waitFor(() => expect(screen.queryByText(message)).toBeNull());
});

it("mounts the Publish dialog for an open publish request, and Cancel settles it as unplanned", async () => {
  render(<App useSession={() => session} />);
  let settled: unknown;
  act(() => {
    void requestPublish({ types: ["page"] }).then((result) => (settled = result));
  });
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() => expect(settled).toMatchObject({ planned: false }));
});

it("opens the Publish dialog from a ?publish= deep link and strips the param from the URL", async () => {
  window.history.replaceState(null, "", `/admin/?publish=${encodePublishCriteriaToQuery({ types: ["page"] })}&keep=1`);
  render(<App useSession={() => session} />);
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
  expect(window.location.search).toBe("?keep=1");
});

it("a legacy /section/<known id> path resolves exactly like the bare panel path", () => {
  const legacy = parseRoute("/section/settings");
  const modern = parseRoute("/settings");
  expect(legacy).toEqual(modern);
  expect(legacy.panelId).toBe("settings");
});

it("a route naming a panel that is no longer registered reports the dashboard to agents", () => {
  expect(agentPageId({ ...parseRoute("/"), panelId: "retired-panel" })).toBe("dashboard");
});
