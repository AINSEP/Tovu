import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminWorkspace } from "@/lib/api";
import { createFakeWorkspacePort } from "../hooks/workspace-dependencies.hooks";
import { useWiredWorkspace, useWorkspace } from "../hooks/use-workspace.hooks";

/**
 * @file `useWorkspace` — the Workspace screen's entire state machine (load + rename-form save),
 * extracted so it is reachable from `renderHook` with no `Workspace.tsx` markup involved.
 * `features/workspace/hooks` measured 5.12% across all four coverage metrics before this file: the
 * only existing tests (`Workspace.unit.test.tsx`, `rules.unit.test.ts`) drive the SCREEN through
 * its `useWorkspaceHook` DI seam with a hand-built `WorkspaceController`, so the real hook body —
 * `port.getWorkspace()`/`port.updateWorkspace()`, `describeApiError` wiring, the internal
 * `useAdminLocale()` call — never ran.
 *
 * No dedicated test file for `workspace-port.hooks.ts` (a type-only interface — an `export
 * interface` with no runtime statements to exercise) or a standalone `workspace-dependencies
 * .hooks.ts` suite. `defaultWorkspacePort`'s two bindings are exercised for real by the
 * `useWiredWorkspace` group at the bottom of this file, and `createFakeWorkspacePort`'s `current`/
 * `updateWorkspace` mutation logic is exercised by every `useWorkspace({ port })` save test above
 * it. Matches `use-theme-pages.unit.test.ts`'s precedent for the same port-trio shape: one hook
 * test file, no separate port/dependencies files of their own.
 *
 * `useWorkspace` calls `useAdminLocale()` INTERNALLY (not an injected param — contrast
 * `use-redirects.hooks.ts`'s `t`/`locale` params), so this file stubs global `fetch` for the
 * `/settings/effective?namespace=core.language` call only — same interceptor shape
 * `use-roles.unit.test.tsx`/`use-restore-flow.unit.test.ts` use. Every OTHER read/write here goes
 * through the injected `WorkspacePort`, never real `fetch`.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function fakeSubmitEvent(): React.FormEvent {
  return { preventDefault: vi.fn() } as unknown as React.FormEvent;
}

/** Routes the locale-settings call to a fixed response; every other URL just hangs forever (a
 *  `Promise` that never settles) rather than throwing — nothing in the fake-port tests below ever
 *  needs a second real endpoint, and a permanently-pending promise can never produce an unhandled
 *  rejection the way a synchronous throw inside `fetch` could. */
function stubLocaleFetch(localeData: Array<{ key: string; value: string }> = []) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (String(url).includes("/settings/effective") && String(url).includes("namespace=core.language")) {
        return Promise.resolve(jsonResponse({ data: localeData }));
      }
      return new Promise<Response>(() => {});
    }),
  );
}

/** Routes on method + a distinguishing URL substring, matching `use-redirects.hooks.unit.test.tsx`'s
 *  `routeFetch` helper — used only by the `useWiredWorkspace` end-to-end test below, which needs
 *  BOTH the locale call and the real `/workspaces/workspace-local` GET/PATCH routed. */
function routeFetch(routes: Array<{ when: (url: string, init?: RequestInit) => boolean; respond: () => Response }>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const route = routes.find((r) => r.when(String(url), init));
    if (!route) throw new Error(`unrouted fetch: ${init?.method ?? "GET"} ${String(url)}`);
    return route.respond();
  });
}

const WORKSPACE: AdminWorkspace = {
  id: "w1",
  name: "My Site",
  slug: "my-site",
  createdAt: "2026-08-01T00:00:00.000Z",
};

beforeEach(() => {
  stubLocaleFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useWorkspace — load", () => {
  it("starts with workspace null and empty draft fields before the load settles", () => {
    const port = createFakeWorkspacePort({ workspace: WORKSPACE });
    port.getWorkspace = () => new Promise(() => {});
    const { result } = renderHook(() => useWorkspace({ port }));

    expect(result.current.workspace).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.name).toBe("");
    expect(result.current.slug).toBe("");
    expect(result.current.saving).toBe(false);
    expect(result.current.saveError).toBeNull();
    expect(result.current.saved).toBe(false);
  });

  it("loads the workspace from the injected port on mount, seeding name/slug from it", async () => {
    const port = createFakeWorkspacePort({ workspace: WORKSPACE });
    const { result } = renderHook(() => useWorkspace({ port }));

    await waitFor(() => expect(result.current.workspace).not.toBeNull());
    expect(result.current.workspace).toEqual(WORKSPACE);
    expect(result.current.name).toBe(WORKSPACE.name);
    expect(result.current.slug).toBe(WORKSPACE.slug);
    expect(result.current.error).toBeNull();
  });

  it("passes an Error rejection's own message straight through (no ApiError code match)", async () => {
    const port = createFakeWorkspacePort();
    port.getWorkspace = () => Promise.reject(new Error("boom"));
    const { result } = renderHook(() => useWorkspace({ port }));

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe("boom");
    expect(result.current.workspace).toBeNull();
  });

  it("falls back to the translated 'failed to load workspace' message for a non-Error rejection", async () => {
    const port = createFakeWorkspacePort();
    port.getWorkspace = () => Promise.reject("network exploded");
    const { result } = renderHook(() => useWorkspace({ port }));

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe("failed to load workspace");
  });
});

describe("useWorkspace — onSave", () => {
  async function loaded() {
    const port = createFakeWorkspacePort({ workspace: WORKSPACE });
    const view = renderHook(() => useWorkspace({ port }));
    await waitFor(() => expect(view.result.current.workspace).not.toBeNull());
    return { port, view };
  }

  it("saves the CURRENT draft name/slug through the injected port, not the stale persisted ones", async () => {
    const { port, view } = await loaded();
    const updateSpy = vi.spyOn(port, "updateWorkspace");

    act(() => {
      view.result.current.setName("Renamed Site");
      view.result.current.setSlug("renamed-site");
    });

    const event = fakeSubmitEvent();
    await act(async () => view.result.current.onSave(event));

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(updateSpy).toHaveBeenCalledWith({ name: "Renamed Site", slug: "renamed-site" });
    expect(view.result.current.workspace).toEqual({ ...WORKSPACE, name: "Renamed Site", slug: "renamed-site" });
    expect(view.result.current.saved).toBe(true);
    expect(view.result.current.saveError).toBeNull();
    // The fake's own `current` record actually mutated, not just what the hook echoed back.
    expect(port.current).toEqual({ ...WORKSPACE, name: "Renamed Site", slug: "renamed-site" });
  });

  it("sets saving=true for the duration of the port call, false once it settles", async () => {
    const { port, view } = await loaded();
    let resolveUpdate!: (v: { workspace: AdminWorkspace }) => void;
    port.updateWorkspace = () => new Promise((resolve) => (resolveUpdate = resolve));

    act(() => {
      void view.result.current.onSave(fakeSubmitEvent());
    });
    expect(view.result.current.saving).toBe(true);

    await act(async () => {
      resolveUpdate({ workspace: WORKSPACE });
      await Promise.resolve();
    });
    expect(view.result.current.saving).toBe(false);
  });

  it("sets saveError (not error) on a failed save, leaving saved false and workspace unchanged", async () => {
    const { port, view } = await loaded();
    port.updateWorkspace = () => Promise.reject(new Error("slug already in use"));

    await act(async () => view.result.current.onSave(fakeSubmitEvent()));

    expect(view.result.current.saveError).toBe("slug already in use");
    expect(view.result.current.saved).toBe(false);
    expect(view.result.current.error).toBeNull();
    expect(view.result.current.workspace).toEqual(WORKSPACE);
  });

  it("clears a prior saveError and saved flag at the start of a new save attempt", async () => {
    const { port, view } = await loaded();
    port.updateWorkspace = () => Promise.reject(new Error("first failure"));
    await act(async () => view.result.current.onSave(fakeSubmitEvent()));
    expect(view.result.current.saveError).toBe("first failure");

    port.updateWorkspace = async (patch) => ({ workspace: { ...WORKSPACE, ...patch } });
    await act(async () => view.result.current.onSave(fakeSubmitEvent()));

    expect(view.result.current.saveError).toBeNull();
    expect(view.result.current.saved).toBe(true);
  });
});

describe("useWorkspace — t/locale (2026-08-11, standing i18n rule)", () => {
  it("t/locale reflect useAdminLocale()'s resolved locale, translating through workspace-i18n", async () => {
    stubLocaleFetch([{ key: "locale", value: "es" }]);
    const port = createFakeWorkspacePort({ workspace: WORKSPACE });
    const { result } = renderHook(() => useWorkspace({ port }));

    await waitFor(() => expect(result.current.locale).toBe("es"));
    expect(result.current.t("Save changes")).toBe("Guardar cambios");
  });
});

describe("useWiredWorkspace — composes the real port + real useAdminLocale", () => {
  it("starts with the same null/empty shape as useWorkspace, before any fetch settles", () => {
    const { result } = renderHook(() => useWiredWorkspace());
    expect(result.current.workspace).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.name).toBe("");
    expect(result.current.slug).toBe("");
    expect(result.current.locale).toBe("en");
    expect(typeof result.current.t).toBe("function");
  });

  it("loads via api.getWorkspace and saves via api.updateWorkspace, both through defaultWorkspacePort", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch([
        { when: (u) => u.includes("/settings/effective"), respond: () => jsonResponse({ data: [] }) },
        {
          when: (u, init) => u.endsWith("/workspaces/workspace-local") && (!init?.method || init.method === "GET"),
          respond: () => jsonResponse({ workspace: WORKSPACE }),
        },
        {
          when: (u, init) => u.endsWith("/workspaces/workspace-local") && init?.method === "PATCH",
          respond: () => jsonResponse({ workspace: { ...WORKSPACE, name: "Wired Rename" } }),
        },
      ]),
    );

    const { result } = renderHook(() => useWiredWorkspace());
    await waitFor(() => expect(result.current.workspace).toEqual(WORKSPACE));

    act(() => result.current.setName("Wired Rename"));
    await act(async () => result.current.onSave(fakeSubmitEvent()));

    expect(result.current.workspace?.name).toBe("Wired Rename");
    expect(result.current.saved).toBe(true);
  });
});
