import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdminMember } from "@/lib/api";
import { publishContentRefresh, resetContentRefreshBus } from "@/lib/content-refresh-bus";
import { createFakeMembersPort } from "../hooks/members-dependencies.hooks";
import { useMembers, useWiredMembers } from "../hooks/use-members.hooks";
import { MEMBERS_RESOURCE } from "../rules";

/**
 * @file `useMembers`'s own `t`/`locale` fields (2026-08-11, standing i18n rule — see this hook's
 * own file header for the full rationale). No dedicated hook-level test existed for `useMembers`
 * before this change — `Members.unit.test.tsx` already covers the load/row-action behavior
 * end-to-end through the real component; this file adds only what the i18n move itself needs proof
 * of, that `t`/`locale` reflect the hook's own resolved locale rather than a hardcoded English
 * pass-through.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** Routes the locale settings fetch to a fixed response and rejects the members list — this file
 *  has nothing to say about the list's own outcome, and a real pending promise would just make
 *  `waitFor` below wait longer for no assertion benefit. */
function stubFetchWithLocale(locale: string) {
  return vi.fn((url: string) => {
    if (String(url).includes("/settings/effective") && String(url).includes("namespace=core.language")) {
      return Promise.resolve(jsonResponse({ data: [{ key: "locale", value: locale }] }));
    }
    return Promise.reject(new Error("unrouted in this test"));
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useMembers — t/locale reflect the resolved locale", () => {
  // No "t falls back to the English source string for the default locale" test here: MEMBERS_DICT
  // has no "en" entries, so `t("Members")` returns "Members" on a dictionary miss regardless of
  // wiring — and since that condition is already true before the fetch resolves, a `waitFor` gated
  // on it exits immediately, so a follow-up `locale` assertion isn't reliably proven to run after
  // the fetch settles either (DEFAULT_LOCALE is also "en", so it can pass on the pre-fetch value by
  // coincidence). The test below is the real proof: both `t` and `locale` are pinned to values only
  // the resolved 'es' fetch can produce.
  it("t returns the Spanish translation and locale reflects 'es' once the locale settings fetch resolves", async () => {
    vi.stubGlobal("fetch", stubFetchWithLocale("es"));
    const { result } = renderHook(() => useWiredMembers());

    await waitFor(() => expect(result.current.locale).toBe("es"));
    expect(result.current.t("Members")).toBe("Miembros");
  });
});

const MEMBER: AdminMember = {
  id: "m1",
  workspaceId: "w1",
  email: "alice@example.com",
  name: "Alice",
  status: "active",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  version: 1,
};

/**
 * `useMembers` still calls `useAdminLocale()` internally (unlike `usePosts`'s injected `navigate`,
 * `MembersDependencies` carries only `port` — see this hook's own file header), so even the
 * injected-port path below needs `fetch` stubbed for the locale settings read; the member list
 * itself never touches it.
 */
describe("useMembers — content refresh bus", () => {
  afterEach(() => resetContentRefreshBus());

  it("re-reads the list when a content refresh fires, so an assistant-disabled member appears without a reload", async () => {
    vi.stubGlobal("fetch", stubFetchWithLocale("en"));
    const port = createFakeMembersPort({ members: [MEMBER] });
    const { result } = renderHook(() => useMembers({ port }));
    await waitFor(() => expect(result.current.members).toEqual([MEMBER]));

    // The assistant's `members_disable` call landing server-side — the screen has no other way to
    // know it happened.
    port.members[0] = { ...MEMBER, status: "disabled" };
    expect(result.current.members?.[0]?.status).toBe("active");

    act(() => publishContentRefresh());

    await waitFor(() => expect(result.current.members?.[0]?.status).toBe("disabled"));
  });

  it("refreshes on a notification that names members, and ignores one that names only other resources", async () => {
    vi.stubGlobal("fetch", stubFetchWithLocale("en"));
    const port = createFakeMembersPort({ members: [MEMBER] });
    const { result } = renderHook(() => useMembers({ port }));
    await waitFor(() => expect(result.current.members).toEqual([MEMBER]));

    port.members[0] = { ...MEMBER, status: "disabled" };

    act(() => publishContentRefresh(["taxonomy"]));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.members?.[0]?.status).toBe("active");

    act(() => publishContentRefresh([MEMBERS_RESOURCE]));
    await waitFor(() => expect(result.current.members?.[0]?.status).toBe("disabled"));
  });

  it("stops re-reading once unmounted", async () => {
    vi.stubGlobal("fetch", stubFetchWithLocale("en"));
    const port = createFakeMembersPort({ members: [MEMBER] });
    const listSpy = vi.spyOn(port, "listMembers");
    const { result, unmount } = renderHook(() => useMembers({ port }));
    await waitFor(() => expect(result.current.members).toEqual([MEMBER]));

    const callsWhileMounted = listSpy.mock.calls.length;
    unmount();
    act(() => publishContentRefresh());
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(listSpy).toHaveBeenCalledTimes(callsWhileMounted);
  });

  it("does not let a slower, earlier-triggered refresh overwrite a newer one that already settled (out-of-order response race)", async () => {
    vi.stubGlobal("fetch", stubFetchWithLocale("en"));
    const port = createFakeMembersPort({ members: [MEMBER] });
    const { result } = renderHook(() => useMembers({ port }));
    await waitFor(() => expect(result.current.members).toEqual([MEMBER]));

    // Two assistant writes land back to back, each publishing its own content-refresh
    // notification — two overlapping `listMembers()` calls with no ordering guarantee on responses.
    let resolveFirst!: (v: { members: AdminMember[] }) => void;
    let resolveSecond!: (v: { members: AdminMember[] }) => void;
    vi.spyOn(port, "listMembers")
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockImplementationOnce(() => new Promise((resolve) => (resolveSecond = resolve)));

    act(() => {
      publishContentRefresh();
      publishContentRefresh();
    });

    // The SECOND (more recent) request settles first, with the newer list.
    const disabled: AdminMember = { ...MEMBER, status: "disabled" };
    await act(async () => {
      resolveSecond({ members: [disabled] });
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.members).toEqual([disabled]));

    // The FIRST (now-stale) request finally settles. It must not resurrect the older list.
    await act(async () => {
      resolveFirst({ members: [MEMBER] });
      await Promise.resolve();
    });
    expect(result.current.members).toEqual([disabled]);
  });
});
