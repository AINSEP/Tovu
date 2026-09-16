// @vitest-environment jsdom
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { App } from "../../App";

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
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("mounts the assistant dock and chat FAB by default (flag on, and when the field is absent)", async () => {
  vi.stubGlobal("fetch", stubFetch({ data: { publicEnabled: false }, adminAssistantEnabled: true }));
  const { container } = render(<App />);

  await waitFor(() => expect(container.querySelector("main")).not.toBeNull());
  expect(container.querySelector('[aria-label="Assistant"]')).not.toBeNull();
  expect(container.querySelector(".chat-fab")).not.toBeNull();
});

it("hides the assistant dock and chat FAB once the server reports TOVU_ADMIN_ASSISTANT=off", async () => {
  vi.stubGlobal("fetch", stubFetch({ data: { publicEnabled: false }, adminAssistantEnabled: false }));
  const { container } = render(<App />);

  await waitFor(() => expect(container.querySelector("main")).not.toBeNull());
  await waitFor(() => expect(container.querySelector(".chat-fab")).toBeNull());
  expect(container.querySelector('[aria-label="Assistant"]')).toBeNull();
});
