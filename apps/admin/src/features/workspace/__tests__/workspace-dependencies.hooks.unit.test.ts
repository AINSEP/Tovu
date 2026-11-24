import { act, renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { useQueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminWorkspaceResponse as AdminWorkspace } from "@jini-ai/core/contracts/site/cms-workspace";
import { useWorkspace } from "@jini-ai/admin/screens/workspace/hooks/use-workspace.hooks";
import { createFakeWorkspacePort, useWiredWorkspace } from "../hooks/workspace-dependencies.hooks";
import { describeApiError } from "../rules";
import { t } from "../workspace-i18n";

/**
 * @file The host binding of the shared workspace controller hook: `useWiredWorkspace` composes the
 * real `defaultWorkspacePort`, the real `useAdminLocale()`, this feature's `workspace-i18n`
 * dictionary and `rules.ts`'s `describeApiError`. The hook's own state machine is tested beside it in
 * `@jini-ai/admin` (`screens/workspace/__tests__/use-workspace.hooks.unit.test.ts`) with fakes; this
 * file keeps only what needs this app: the real locale endpoint, the real API client and this app's
 * production query adapter (TanStack — `resetQueries`).
 *
 * Stubs global `fetch` for the `/settings/effective?namespace=core.language` call — same
 * interceptor shape `use-roles.unit.test.tsx`/`use-restore-flow.unit.test.ts` use.
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

/** Routes on method + a distinguishing URL substring, matching `Jini redirects/react/__tests__/use-redirects.hooks.unit.test.tsx`'s
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
  version: 1,
};

beforeEach(() => {
  stubLocaleFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
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

  it("t/locale reflect useAdminLocale()'s resolved locale, translating through workspace-i18n", async () => {
    stubLocaleFetch([{ key: "locale", value: "es" }]);
    const { result } = renderHook(() => useWiredWorkspace());

    await waitFor(() => expect(result.current.locale).toBe("es"));
    expect(result.current.t("Save changes")).toBe("Guardar cambios");
  });

  it("loads via api.getWorkspace and saves via api.updateWorkspace, both through defaultWorkspacePort", async () => {
    const fetchMock = routeFetch([
        { when: (u) => u.includes("/settings/effective"), respond: () => jsonResponse({ data: [] }) },
        {
          when: (u, init) => u.endsWith("/workspaces/workspace-local") && (!init?.method || init.method === "GET"),
          respond: () => jsonResponse({ workspace: WORKSPACE }),
        },
        {
          when: (u, init) => u.endsWith("/workspaces/workspace-local") && init?.method === "PATCH",
          respond: () => jsonResponse({ workspace: { ...WORKSPACE, name: "Wired Rename", slug: "wired-rename" } }),
        },
      ]);
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useWiredWorkspace());
    await waitFor(() => expect(result.current.workspace).toEqual(WORKSPACE));

    act(() => {
      result.current.setName("Wired Rename");
      result.current.setSlug("wired-rename");
    });
    await act(async () => result.current.onSave(fakeSubmitEvent()));

    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(patchCall).toBeDefined();
    expect(JSON.parse(patchCall![1]?.body as string)).toEqual({ name: "Wired Rename", slug: "wired-rename" });
    expect(result.current.workspace?.name).toBe("Wired Rename");
    expect(result.current.workspace?.slug).toBe("wired-rename");
    expect(result.current.saved).toBe(true);
  });

  it("falls back to this feature's 'failed to load workspace' copy for a non-Error load rejection", async () => {
    const port = createFakeWorkspacePort();
    port.getWorkspace = () => Promise.reject("network exploded");
    const { result } = renderHook(() => useWorkspace({ port, locale: "en", translate: t, describeError: describeApiError }));

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe("failed to load workspace");
  });
});

describe("workspace cache and form drafts (this app's TanStack adapter)", () => {
  it("keeps an unsaved rename while a reset cache reloads the workspace", async () => {
    const port = createFakeWorkspacePort({ workspace: WORKSPACE });
    const { result } = renderHook(() => ({ workspace: useWorkspace({ port, locale: "en", translate: t, describeError: describeApiError }), client: useQueryClient() }));
    await waitFor(() => expect(result.current.workspace.workspace).toEqual(WORKSPACE));
    act(() => {
      result.current.workspace.setName("Unsaved name");
      result.current.workspace.setSlug("unsaved-slug");
    });
    let resolveReload!: (value: { workspace: AdminWorkspace }) => void;
    const reload = new Promise<{ workspace: AdminWorkspace }>((resolve) => { resolveReload = resolve; });
    port.getWorkspace = () => reload;

    let reset!: Promise<void>;
    act(() => { reset = result.current.client.resetQueries({ queryKey: ["workspace", "current"], exact: true }); });
    await waitFor(() => expect(result.current.workspace.workspace).toBeNull());
    expect(result.current.workspace.name).toBe("Unsaved name");
    expect(result.current.workspace.slug).toBe("unsaved-slug");
    expect(result.current.workspace.error).toBeNull();

    const refreshed = { ...WORKSPACE, name: "Server name", slug: "server-slug" };
    await act(async () => {
      resolveReload({ workspace: refreshed });
      await reset;
    });
    await waitFor(() => expect(result.current.workspace.workspace).toEqual(refreshed));
    expect(result.current.workspace.name).toBe("Unsaved name");
    expect(result.current.workspace.slug).toBe("unsaved-slug");
  });
});
