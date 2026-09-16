// @vitest-environment jsdom
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { App } from "../../App";
import { publishSitePreview, resetSitePreviewBus } from "../../lib/site-preview-bus";

/**
 * @file `TOVU_ADMIN_ASSISTANT=off` is a real server-side disable (`admin-assistant-enabled.ts`) —
 * every route `AssistantDock` calls 404s in that state. Before this dispatch, the admin SPA had no
 * way to learn the flag was off, so it kept mounting `AssistantDock`/`ChatFab` regardless: a
 * permanently broken chat surface reporting "No usable CLI is selected" instead of nothing.
 *
 * `App.hooks.tsx`'s `useAdminAssistantAvailability` reads a sibling `adminAssistantEnabled` field
 * `GET .../assistant/settings` now returns (`server/routes/admin/assistant/get-settings.ts`), and
 * `App.tsx` conditionally mounts the dock/FAB on it. These two tests prove the wiring: shown by
 * default (field `true`, or a stub response omitting it entirely — the admin's own fail-open
 * convention), hidden once the server reports it off.
 *
 * The `ai-assistant` operator control panel (`panels.tsx`) is a DIFFERENT screen, unaffected by
 * this flag by design (it is where an operator sees the off state, not the chat dock itself) — not
 * covered here.
 */

function stubFetch(assistantSettingsBody: Record<string, unknown>): ReturnType<typeof vi.fn> {
  return vi.fn(async (url: string) => {
    const href = String(url);
    if (href.includes("/auth/me")) {
      return new Response(JSON.stringify({ user: { id: "u1", username: "admin" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (href.includes("/assistant/settings")) {
      return new Response(JSON.stringify(assistantSettingsBody), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    // Any other call this render pulls in (locale, execution config, BYOK credential status, …) —
    // a benign empty success, same fallback `app-plugins-route.unit.test.tsx` uses.
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  });
}

beforeEach(() => {
  // jsdom has no `EventSource`; `useAdminSession`'s settings-change-feed and `App`'s page-control
  // bridge both construct one in an effect once authenticated — see the sibling App tests in this
  // directory for the identical stub and rationale.
  vi.stubGlobal(
    "EventSource",
    class {
      close() {}
      addEventListener() {}
      removeEventListener() {}
    },
  );
  // jsdom has no `ResizeObserver` either. Only needed once the dock is actually OPENED (its
  // width-measuring effect in `App.hooks.tsx` runs on the mounted pane), which the overlay test
  // below does by clicking the FAB — the two visibility tests never reach it.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetSitePreviewBus();
});

it("mounts the assistant dock and chat FAB by default (flag on, and when the field is absent)", async () => {
  vi.stubGlobal("fetch", stubFetch({ data: { publicEnabled: false }, adminAssistantEnabled: true }));
  const { container } = render(<App />);

  await waitFor(() => expect(container.querySelector("main")).not.toBeNull());
  expect(container.querySelector('[aria-label="Assistant"]')).not.toBeNull();
  expect(container.querySelector(".chat-fab")).not.toBeNull();
});

/**
 * `admin.show_site_page`'s whole reason to exist is that the assistant must survive showing the site
 * (the plan's §Q6: navigating the desktop `<webview>` would unmount this dock and kill the run
 * mid-sentence). This test is that guarantee, asserted rather than reasoned about.
 *
 * jsdom has no layout, so "the overlay does not COVER the dock" cannot be measured here. What it CAN
 * pin is the DOM fact the no-overlap claim rests on: `.site-preview-overlay` is `position: absolute;
 * inset: 0` against `.admin-main-col`, so its containing block is that column — a dock rendered
 * OUTSIDE that column is unreachable by it at any z-index. If a later refactor hoists the overlay to
 * `.admin-layout`'s top level (where the plan's prose originally put it, next to `<Toast>`), or moves
 * the dock inside `.admin-main-col`, that containment argument silently stops holding and this goes
 * red. The clickability half is asserted directly, by actually clicking the FAB with the overlay up.
 */
it("keeps the assistant dock mounted, outside the overlay's containing block, and still clickable while a site preview is open", async () => {
  vi.stubGlobal("fetch", stubFetch({ data: { publicEnabled: false }, adminAssistantEnabled: true }));
  const { container } = render(<App />);
  await waitFor(() => expect(container.querySelector("main")).not.toBeNull());

  act(() => publishSitePreview({ path: "/blog/hello" }));

  const overlay = container.querySelector(".site-preview-overlay");
  const dock = container.querySelector('[aria-label="Assistant"]');
  const fab = container.querySelector<HTMLElement>(".chat-fab");
  const mainCol = container.querySelector(".admin-main-col");
  expect(overlay).not.toBeNull();
  expect(overlay!.querySelector("iframe")?.getAttribute("src")).toBe("/blog/hello");

  // 1. The dock and FAB are still in the tree at all — the run's own surface survived.
  expect(dock).not.toBeNull();
  expect(fab).not.toBeNull();
  // 2. Neither is INSIDE the overlay (which would make them children of a panel the user closes).
  expect(overlay!.contains(dock)).toBe(false);
  expect(overlay!.contains(fab)).toBe(false);
  // 3. Neither is inside the overlay's containing block, so `inset: 0` cannot reach them.
  expect(mainCol).not.toBeNull();
  expect(mainCol!.contains(overlay)).toBe(true);
  expect(mainCol!.contains(dock)).toBe(false);
  expect(mainCol!.contains(fab)).toBe(false);
  // 4. And the FAB still takes a click with the overlay up — not merely present, but usable.
  expect(dock!.hasAttribute("hidden")).toBe(true);
  fireEvent.click(fab!);
  await waitFor(() => expect(container.querySelector('[aria-label="Assistant"]')!.hasAttribute("hidden")).toBe(false));
  expect(container.querySelector(".site-preview-overlay")).not.toBeNull();
});

it("hides the assistant dock and chat FAB once the server reports TOVU_ADMIN_ASSISTANT=off", async () => {
  vi.stubGlobal("fetch", stubFetch({ data: { publicEnabled: false }, adminAssistantEnabled: false }));
  const { container } = render(<App />);

  await waitFor(() => expect(container.querySelector("main")).not.toBeNull());
  await waitFor(() => expect(container.querySelector(".chat-fab")).toBeNull());
  expect(container.querySelector('[aria-label="Assistant"]')).toBeNull();
});
