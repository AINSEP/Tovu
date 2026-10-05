// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../../App";
import type { UseAdminSession } from "../../App.hooks";
import { FetchQueryProvider } from "../../lib/fetch-query";

/**
 * @file The sidebar hides a section the signed-in operator cannot use, and a direct URL to one
 * shows a "no access" state instead of mounting a screen whose first read the server 403s.
 *
 * Rendered through `App`'s `useSession` seam with the session's own `effectivePermissions`, so
 * these cases exercise the real nav and route wiring — not just `lib/panel-access.ts` in isolation.
 */

const EDITOR = ["content.read", "content.write", "content.publish", "content.delete", "media.read", "media.upload", "media.update", "media.delete", "theme.set"];

function session(effectivePermissions: readonly string[] | undefined): () => UseAdminSession {
  const value: UseAdminSession = {
    user: { id: "u1", username: "someone" },
    checking: false,
    effectivePermissions,
    handleLogin: vi.fn(),
    logout: vi.fn(),
  };
  return () => value;
}

beforeEach(() => {
  // Same generic stubs as `app-session-seam.unit.test.tsx`: mounted screens still read through
  // `fetch`, and jsdom has no `EventSource` for the page-control bridge. Empty `roles`/`policies`
  // let the Roles screen finish loading and render its heading in the cases that allow it.
  const body = JSON.stringify({ roles: [], policies: [] });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200, headers: { "content-type": "application/json" } })));
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
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

function renderAt(path: string, effectivePermissions: readonly string[] | undefined) {
  window.history.replaceState(null, "", path);
  return render(<App useSession={session(effectivePermissions)} />, { wrapper: FetchQueryProvider }).container;
}

describe("the sidebar follows the operator's permissions", () => {
  it("hides Users and Roles & Permissions from an editor", () => {
    const container = renderAt("/admin/", EDITOR);

    // Positive control: a row the editor can use is there, so the nav did render.
    expect(container.querySelector('a[href="/admin/posts"]')).not.toBeNull();
    expect(container.querySelector('a[href="/admin/users"]')).toBeNull();
    expect(container.querySelector('a[href="/admin/roles"]')).toBeNull();
  });

  it("shows the owner every row, Users and Roles included", () => {
    const container = renderAt("/admin/", ["*"]);

    expect(container.querySelector('a[href="/admin/posts"]')).not.toBeNull();
    expect(container.querySelector('a[href="/admin/users"]')).not.toBeNull();
    expect(container.querySelector('a[href="/admin/roles"]')).not.toBeNull();
  });
});

describe("a direct URL to a hidden section", () => {
  it("shows the no-access state to an editor, not the Roles screen", () => {
    renderAt("/admin/roles", EDITOR);

    expect(screen.getByRole("heading", { name: "You don't have access to this" })).toBeTruthy();
    // The panel's own screen must not mount.
    expect(screen.queryByRole("heading", { name: "Roles & Permissions" })).toBeNull();
  });

  it("still renders the section for an operator who holds its permission", async () => {
    renderAt("/admin/roles", ["role.manage"]);

    expect(await screen.findByRole("heading", { name: "Roles & Permissions" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "You don't have access to this" })).toBeNull();
  });

  it("shows the screen while the operator's permissions are not known yet", async () => {
    renderAt("/admin/roles", undefined);

    expect(await screen.findByRole("heading", { name: "Roles & Permissions" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "You don't have access to this" })).toBeNull();
  });
});
