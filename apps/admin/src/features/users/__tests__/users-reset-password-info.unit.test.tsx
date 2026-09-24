import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "@/lib/fetch-query";
import { Users } from "../Users";

/**
 * @file Owner ask (2026-09-24): an info icon on the Users page explains that there is no
 * "forgot password" self-service flow yet, and that an admin resets a locked-out user's password
 * from this page. Reset-password behavior itself is unchanged — this only covers the new info
 * affordance. Reuses the shared `InfoTip` (`components/InfoTip.tsx`) — already the app's
 * established "ⓘ opens an explanation, keyboard- and focus-reachable, Escape closes without losing
 * focus" pattern (see `ThemePagesTab.tsx`'s locked-row usage) — rather than a bespoke popover.
 *
 * `Users` has no injectable hook seam for its own page header, so this renders the full screen with
 * a mocked `fetch`, same interceptor shape `Users.unit.test.tsx` already uses for the locale and
 * `/auth/me` calls this screen fires unconditionally on mount.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const INFO_COPY =
  "No 'forgot password' email yet. If someone is locked out, the owner can reset their password here.";

beforeEach(() => {
  vi.stubGlobal("fetch", (url: string) => {
    const href = String(url);
    if (href.includes("/settings/effective") && href.includes("namespace=core.language")) {
      return Promise.resolve(jsonResponse({ data: [] }));
    }
    if (href.endsWith("/auth/me")) {
      return Promise.resolve(jsonResponse({ user: { id: "not-a-seeded-user" } }));
    }
    if (href.includes("/roles")) return Promise.resolve(jsonResponse({ roles: [] }));
    if (href.includes("/policies")) return Promise.resolve(jsonResponse({ policies: [] }));
    if (href.includes("/users")) return Promise.resolve(jsonResponse({ users: [] }));
    return Promise.resolve(jsonResponse({}));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderLoadedUsers() {
  render(
    <FetchQueryProvider>
      <Users />
    </FetchQueryProvider>,
  );
  await screen.findByText("No users yet.");
}

describe("Users page header — reset-password info tip", () => {
  it("shows a reachable info icon, closed by default", async () => {
    await renderLoadedUsers();
    expect(screen.getByLabelText(INFO_COPY)).toBeInTheDocument();
    expect(screen.queryByText(INFO_COPY)).not.toBeInTheDocument();
  });

  it("opens on click and shows the terse copy", async () => {
    const user = userEvent.setup();
    await renderLoadedUsers();
    await user.click(screen.getByLabelText(INFO_COPY));
    expect(screen.getByText(INFO_COPY)).toBeInTheDocument();
  });

  it("opens on keyboard focus (Tab), and Escape closes it without moving focus off the icon", async () => {
    const user = userEvent.setup();
    await renderLoadedUsers();
    const icon = screen.getByLabelText(INFO_COPY);

    // The icon is the first focusable element on the page (page-header-text precedes
    // page-actions in DOM order), so one Tab from a fresh render reaches it — same style
    // `InfoTip.unit.test.tsx` itself uses rather than calling `.focus()` directly.
    await user.tab();
    expect(document.activeElement).toBe(icon);
    expect(screen.getByText(INFO_COPY)).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByText(INFO_COPY)).not.toBeInTheDocument();
    expect(document.activeElement).toBe(icon);
  });
});
