import { afterEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";

import {
  publishAgentScreenEntry,
  publishAgentScreenRoute,
  readAgentScreenContext,
  resetAgentScreenContext,
} from "../agent-screen-context";
import { useAgentScreenEntry, useAgentScreenRoute } from "@/hooks/use-agent-screen-context.hooks";

/**
 * @file The admin screen the assistant is told about with every message (2026-09-16 owner report:
 * with the page editor for "Landing sample — xai" open, the assistant could not say which page it
 * was). `App.tsx` publishes the route, an editor publishes its open entry, and `useRunContext` reads
 * both at send time.
 */

const LANDING_ENTRY = {
  kind: "page",
  id: "4f220108-5113-415a-a264-e787d13d2ec4",
  title: "Landing sample — xai",
  slug: "/",
  status: "published",
};

afterEach(() => resetAgentScreenContext());

describe("agent screen context store", () => {
  it("reports nothing before any screen is published", () => {
    expect(readAgentScreenContext()).toBeUndefined();
  });

  it("combines the published route with the open entry", () => {
    publishAgentScreenRoute({ path: "/pages/4f220108-5113-415a-a264-e787d13d2ec4", section: "pages", view: "page-editor" });
    publishAgentScreenEntry(LANDING_ENTRY);
    expect(readAgentScreenContext()).toEqual({
      path: "/pages/4f220108-5113-415a-a264-e787d13d2ec4",
      section: "pages",
      view: "page-editor",
      entry: LANDING_ENTRY,
    });
  });

  it("omits view on a section's index screen", () => {
    publishAgentScreenRoute({ path: "/pages", section: "pages", view: null });
    expect(readAgentScreenContext()).toEqual({ path: "/pages", section: "pages" });
  });

  it("does not report an entry without a route — an entry alone does not say where the operator is", () => {
    publishAgentScreenEntry(LANDING_ENTRY);
    expect(readAgentScreenContext()).toBeUndefined();
  });

  it("a stale release (an editor unmounting after the next one mounted) does not clear the newer entry", () => {
    publishAgentScreenRoute({ path: "/pages/b", section: "pages", view: "page-editor" });
    const releaseOld = publishAgentScreenEntry({ ...LANDING_ENTRY, id: "a", title: "Old" });
    publishAgentScreenEntry({ ...LANDING_ENTRY, id: "b", title: "New" });
    releaseOld();
    expect(readAgentScreenContext()?.entry?.title).toBe("New");
  });
});

describe("useAgentScreenRoute / useAgentScreenEntry", () => {
  it("publishes the entry while the editor is mounted and clears it on unmount", () => {
    renderHook(() => useAgentScreenRoute({ path: "/pages/x", section: "pages", view: "page-editor" }));
    const editor = renderHook(({ entry }) => useAgentScreenEntry(entry), { initialProps: { entry: LANDING_ENTRY } });
    expect(readAgentScreenContext()?.entry).toEqual(LANDING_ENTRY);

    editor.unmount();
    expect(readAgentScreenContext()).toEqual({ path: "/pages/x", section: "pages", view: "page-editor" });
  });

  it("publishes nothing while the editor's entry is still loading", () => {
    renderHook(() => useAgentScreenRoute({ path: "/pages/x", section: "pages", view: "page-editor" }));
    renderHook(() => useAgentScreenEntry(null));
    expect(readAgentScreenContext()?.entry).toBeUndefined();
  });

  it("follows a renamed entry", () => {
    renderHook(() => useAgentScreenRoute({ path: "/pages/x", section: "pages", view: "page-editor" }));
    const editor = renderHook(({ entry }) => useAgentScreenEntry(entry), { initialProps: { entry: LANDING_ENTRY } });
    editor.rerender({ entry: { ...LANDING_ENTRY, title: "Renamed" } });
    expect(readAgentScreenContext()?.entry?.title).toBe("Renamed");
  });
});
