// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { fireEvent, render as renderWithoutProvider, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { FetchQueryProvider } from "../../lib/fetch-query";
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
  // The post-preview-expand counterpart test below navigates to `/admin/posts/p1` — reset so a
  // later test in this file (or another file, if jsdom's location leaks across files in the same
  // worker) doesn't inherit that route and try to load a post its own fetch stub knows nothing about.
  window.history.replaceState(null, "", "/");
});

it("mounts the assistant dock and chat FAB by default (flag on, and when the field is absent)", async () => {
  vi.stubGlobal("fetch", stubFetch({ data: { publicEnabled: false }, adminAssistantEnabled: true }));
  const { container } = render(<App />);

  await waitFor(() => expect(container.querySelector("main")).not.toBeNull());
  expect(container.querySelector('[aria-label="Assistant"]')).not.toBeNull();
  expect(container.querySelector(".chat-fab")).not.toBeNull();
});

/**
 * Preview fullscreen, Level 1 counterpart (2026-09-15 —
 * `ADS-memory/.local-artifacts/handoffs/2026-09-15-preview-fullscreen-PLAN.md` §5.1). The test above
 * pins the now-reverted `admin.show_site_page` overlay's containment guarantee; this pins the SAME
 * guarantee for `PostEditor`'s own `.post-preview-expanded` surface — the regression that would have
 * caught the reverted overlay's actual class of bug (escaping `.admin-main-col`, or covering the
 * dock) one layer earlier, on the feature that replaces it. jsdom computes no layout, so — same
 * caveat as the test above — this asserts DOM containment (the class is a descendant of
 * `.admin-main-col`) and the stylesheet's own rule TEXT (`position: absolute`, never `fixed`), never
 * geometry: "the class is present" is not "the rule wins" (this repo's own documented
 * css-presence-vs-precedence trap).
 */
function stubFetchWithPost(assistantSettingsBody: Record<string, unknown>): ReturnType<typeof vi.fn> {
  const post = {
    id: "p1",
    workspaceId: "workspace-local",
    kind: "post",
    title: "Hello World",
    slug: "hello-world",
    bodyJson: { type: "doc", content: [{ type: "paragraph" }] },
    status: "draft",
    updatedAt: "2026-08-01T00:00:00.000Z",
    version: 1,
  };
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
    // Autosave's own recovery-check GET — must be matched BEFORE the plain `/posts/p1` case below,
    // since that path is a substring of this one.
    if (href.includes("/posts/p1/autosave")) {
      return new Response(JSON.stringify({ autosave: null }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (href.includes("/posts/p1")) {
      return new Response(JSON.stringify({ post }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (href.includes("/presentation")) {
      return new Response(
        JSON.stringify({ settings: { activeThemeId: null }, availableThemeIds: [], availableThemes: [], activeThemeTemplates: [], activeThemeStaticPageIds: [] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    // Mentionable-posts list — `endsWith`, not `includes`, so it never swallows the `/posts/p1*`
    // cases above.
    if (href.endsWith("/posts")) {
      return new Response(JSON.stringify({ posts: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  });
}

it("keeps the assistant dock mounted, outside the expanded post-preview's containing block, while a post's Preview tab is expanded", async () => {
  vi.stubGlobal("fetch", stubFetchWithPost({ data: { publicEnabled: false }, adminAssistantEnabled: true }));
  window.history.replaceState(null, "", "/admin/posts/p1");
  const { container } = render(<App />);
  await waitFor(() => expect(container.querySelector("main")).not.toBeNull());
  await waitFor(() => expect(screen.getByRole("tab", { name: "Preview" })).toBeInTheDocument());

  fireEvent.click(screen.getByRole("tab", { name: "Preview" }));
  // `a380c716` replaced the toolbar's "Expand to full width" button with one translucent control on
  // the preview itself (`.post-preview-fab`), named for the direction it goes — see
  // `features/posts/__tests__/PostEditor.unit.test.tsx`'s "Preview fullscreen" suite.
  fireEvent.click(await screen.findByRole("button", { name: "Show full screen" }));

  const expanded = container.querySelector(".post-preview-expanded");
  const dock = container.querySelector('[aria-label="Assistant"]');
  const fab = container.querySelector<HTMLElement>(".chat-fab");
  const mainCol = container.querySelector(".admin-main-col");
  expect(expanded).not.toBeNull();
  expect(mainCol).not.toBeNull();
  // 1. The expanded surface lives INSIDE the same containing block the (now-reverted) overlay used.
  expect(mainCol!.contains(expanded)).toBe(true);
  // 2. The dock/FAB are still outside it — expanding the preview cannot cover either.
  expect(mainCol!.contains(dock)).toBe(false);
  expect(mainCol!.contains(fab)).toBe(false);
  expect(dock).not.toBeNull();
  expect(fab).not.toBeNull();

  // 3. The rule itself is `position: absolute`, never `position: fixed` — containment by DOM
  // nesting alone means nothing if the rule could still escape its containing block.
  // `process.cwd()`-relative, not `import.meta.url`-relative: this package's Vitest transform does
  // not give test modules a plain `file://` `import.meta.url` (confirmed empirically — `new
  // URL(..., import.meta.url)` throws "The URL must be of scheme file" here), so the only stable
  // anchor is the package root Vitest is invoked from.
  const editorCss = readFileSync(path.resolve(process.cwd(), "src/styles/editor.css"), "utf8");
  expect(editorCss).toMatch(/\.post-preview-expanded\s*\{[^}]*position:\s*absolute/);
  expect(editorCss).not.toMatch(/\.post-preview-expanded\s*\{[^}]*position:\s*fixed/);
});

it("hides the assistant dock and chat FAB once the server reports TOVU_ADMIN_ASSISTANT=off", async () => {
  vi.stubGlobal("fetch", stubFetch({ data: { publicEnabled: false }, adminAssistantEnabled: false }));
  const { container } = render(<App />);

  await waitFor(() => expect(container.querySelector("main")).not.toBeNull());
  await waitFor(() => expect(container.querySelector(".chat-fab")).toBeNull());
  expect(container.querySelector('[aria-label="Assistant"]')).toBeNull();
});

/** `App` mounts the assistant dock, whose agents list reads through the app's query cache — render
 *  under the same provider `main.tsx` wraps `App` in. */
function render(ui: ReactElement) {
  return renderWithoutProvider(ui, { wrapper: FetchQueryProvider });
}
