import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useDashboard } from "../hooks/use-dashboard.hooks";
import { createFakeDashboardPort } from "../hooks/dashboard-dependencies.hooks";
import type { AdminPost } from "@/lib/api";

const DISMISSED_KEY = "tovu.admin.default-password-banner.dismissed";

/**
 * @file `useDashboard`'s injected-port seam (2026-08-14, closes the port-conversion gap
 * `use-dashboard.hooks.ts`'s own file header describes) — proves the five independent reads run
 * against `createFakeDashboardPort` with zero `fetch` involved, complementing
 * `Dashboard.unit.test.tsx`'s existing end-to-end (stubbed-`fetch`, real `useWiredDashboard`)
 * coverage the same way `use-form-editor.unit.test.tsx` complements `FormEditor.unit.test.tsx`.
 */

function postFixture(overrides: Partial<AdminPost> = {}): AdminPost {
  return {
    id: "p1",
    workspaceId: "fake-ws",
    kind: "post",
    title: "Hello",
    slug: "hello",
    bodyJson: {},
    status: "published",
    updatedAt: "2026-08-01T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

describe("useDashboard — injected port", () => {
  it("loads all five stats from the fake port's seed, with no fetch involved", async () => {
    const networkMock = vi.fn();
    vi.stubGlobal("fetch", networkMock);
    const port = createFakeDashboardPort({
      posts: [postFixture({ id: "p1", status: "published" }), postFixture({ id: "p2", status: "draft", kind: "post" })],
      pages: [postFixture({ id: "pg1", kind: "page", status: "draft" })],
      media: [{ status: "active" }, { status: "active" }, { status: "trashed" }],
      pendingCommentsCount: 4,
      activeThemeId: "quartz-libre",
    });

    const { result } = renderHook(() => useDashboard({ port, locale: "en", t: (key) => key }));

    await waitFor(() => expect(result.current.posts.value).toBe(2));
    expect(result.current.published).toBe(1);
    expect(result.current.pages.value).toBe(1);
    expect(result.current.drafts).toBe(1);
    expect(result.current.media.value).toBe(2);
    expect(result.current.comments.value).toBe(4);
    expect(result.current.themeId).toBe("quartz-libre");
    expect(networkMock).not.toHaveBeenCalled();
  });

  it("merges posts and pages into `recent`, independent of which settles first", async () => {
    const port = createFakeDashboardPort({
      posts: [postFixture({ id: "p1", updatedAt: "2026-08-01T00:00:00.000Z" })],
      pages: [postFixture({ id: "pg1", kind: "page", updatedAt: "2026-08-02T00:00:00.000Z" })],
    });

    const { result } = renderHook(() => useDashboard({ port, locale: "en", t: (key) => key }));

    await waitFor(() => expect(result.current.recent).not.toBeNull());
    // Newest-first (pages' 08-02 row before posts' 08-01 row) — proves both sources landed in one
    // merged list rather than one silently overwriting the other.
    expect(result.current.recent?.map((r) => r.id)).toEqual(["pg1", "p1"]);
  });

  it("keeps each stat's error independent — a failed comments read does not blank the posts count", async () => {
    const port = createFakeDashboardPort({
      posts: [postFixture()],
      listCommentsQueueError: new Error("comments unavailable"),
    });

    const { result } = renderHook(() => useDashboard({ port, locale: "en", t: (key) => key }));

    await waitFor(() => expect(result.current.comments.error).toBe("comments unavailable"));
    expect(result.current.posts.value).toBe(1);
    expect(result.current.posts.error).toBeNull();
  });

  it("passes the injected t straight through, proving it isn't a hardcoded DASHBOARD_DICT lookup", () => {
    const port = createFakeDashboardPort();
    const t = (key: string) => `[${key}]`;
    const { result } = renderHook(() => useDashboard({ port, locale: "en", t }));

    expect(result.current.t("Dashboard")).toBe("[Dashboard]");
  });
});

describe("useDashboard — default-password banner (password-banner plan, 2026-09-24, Slice 3)", () => {
  afterEach(() => {
    localStorage.removeItem(DISMISSED_KEY);
  });

  it("shows once the port reports usesDefaultPassword: true", async () => {
    const port = createFakeDashboardPort({ usesDefaultPassword: true });
    const { result } = renderHook(() => useDashboard({ port, locale: "en", t: (key) => key }));

    await waitFor(() => expect(result.current.showDefaultPasswordBanner).toBe(true));
  });

  it("hides after dismiss, and persists the dismissal to localStorage under the caller's own id", async () => {
    const port = createFakeDashboardPort({ usesDefaultPassword: true });
    const { result } = renderHook(() => useDashboard({ port, locale: "en", t: (key) => key }));
    await waitFor(() => expect(result.current.showDefaultPasswordBanner).toBe(true));

    result.current.dismissDefaultPasswordBanner();

    await waitFor(() => expect(result.current.showDefaultPasswordBanner).toBe(false));
    expect(localStorage.getItem(DISMISSED_KEY)).toBe("fake-user-1");
  });

  it("stays hidden on a fresh mount when the same user already dismissed it", async () => {
    localStorage.setItem(DISMISSED_KEY, "fake-user-1");
    const port = createFakeDashboardPort({ usesDefaultPassword: true });
    const { result } = renderHook(() => useDashboard({ port, locale: "en", t: (key) => key }));

    await waitFor(() => expect(result.current.themeId).not.toBeNull());
    expect(result.current.showDefaultPasswordBanner).toBe(false);
  });

  it("re-appears for a different user signed in on the same browser", async () => {
    const portA = createFakeDashboardPort({ usesDefaultPassword: true, principalId: "user-a" });
    const first = renderHook(() => useDashboard({ port: portA, locale: "en", t: (key) => key }));
    await waitFor(() => expect(first.result.current.showDefaultPasswordBanner).toBe(true));
    first.result.current.dismissDefaultPasswordBanner();
    await waitFor(() => expect(first.result.current.showDefaultPasswordBanner).toBe(false));
    first.unmount();

    const portB = createFakeDashboardPort({ usesDefaultPassword: true, principalId: "user-b" });
    const { result } = renderHook(() => useDashboard({ port: portB, locale: "en", t: (key) => key }));

    await waitFor(() => expect(result.current.showDefaultPasswordBanner).toBe(true));
  });

  it("stays hidden when the status fetch rejects — advisory, swallowed, no error state", async () => {
    const port = createFakeDashboardPort({ getPasswordStatusError: new Error("boom") });
    const { result } = renderHook(() => useDashboard({ port, locale: "en", t: (key) => key }));

    await waitFor(() => expect(result.current.themeId).not.toBeNull());
    expect(result.current.showDefaultPasswordBanner).toBe(false);
  });

  it("still renders when localStorage throws on read", async () => {
    const realGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("storage disabled");
    };
    try {
      const port = createFakeDashboardPort({ usesDefaultPassword: true });
      const { result } = renderHook(() => useDashboard({ port, locale: "en", t: (key) => key }));

      await waitFor(() => expect(result.current.showDefaultPasswordBanner).toBe(true));
    } finally {
      Storage.prototype.getItem = realGetItem;
    }
  });
});
