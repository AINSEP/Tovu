import { render, screen } from "@/__tests__/fetch-query-render";
import { afterEach, expect, it, vi } from "vitest";

import { Database } from "../Database";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { useWiredMigrateForwardSection } from "../hooks/migrate-forward-section-dependencies.hooks";
import { useWiredSchemaStateSection } from "../hooks/schema-state-section-dependencies.hooks";
import { useWiredTimelineSection } from "../hooks/timeline-section-dependencies.hooks";

/** The wired hooks, injected exactly as `panels.tsx` injects them. */
const wiredHooks = {
  useAdminLocaleHook: useAdminLocale,
  useTimelineSectionHook: useWiredTimelineSection,
  useMigrateForwardSectionHook: useWiredMigrateForwardSection,
  useSchemaStateSectionHook: useWiredSchemaStateSection,
};

// The screen lives in `@jini-ai/admin`; this pins what the host binding hands it: the wired section
// hooks over the real HTTP adapter, the admin locale hook, and the host `ServerLabel`.
afterEach(() => vi.unstubAllGlobals());

function stubAdminApi() {
  vi.stubGlobal("fetch", async (url: string) => {
    const path = String(url);
    let body: unknown;
    if (path.includes("/database/schema-state")) body = { status: "in-sync", siteMeta: { version: 7, tag: "site" }, runtime: { version: 7, tag: "site" } };
    else if (path.includes("/database/timeline")) {
      body = { items: [{ id: "row1", kind: "core.migration", createdAt: "2026-08-01T12:34:00.000Z", restorePointId: null, outcome: "success" }], nextCursor: null };
    } else if (path.includes("/settings/effective")) body = { data: [] };
    else throw new Error(`Unexpected test request: ${url}`);
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  });
}

it("renders the Jini Database screen with the wired Timeline and the host ServerLabel", async () => {
  stubAdminApi();
  render(<Database {...wiredHooks} tabId="timeline" />);
  expect(screen.getByRole("heading", { name: "Database", level: 1 })).toBeInTheDocument();
  expect(await screen.findByRole("cell", { name: "core.migration" })).toBeInTheDocument();
  expect(screen.getByText("success")).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Timeline" })).toHaveAttribute("aria-selected", "true");
});

it("opens the Migrate forward tab from the host-supplied tabId", async () => {
  stubAdminApi();
  render(<Database {...wiredHooks} tabId="migrate-forward" />);
  expect(await screen.findByRole("button", { name: "Plan migration" })).toBeInTheDocument();
});
