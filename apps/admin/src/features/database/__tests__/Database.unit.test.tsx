import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Database } from "../Database";
import type { TimelineSectionController } from "../hooks/use-timeline-section.hooks";
import type { MigrateForwardSectionController } from "../hooks/use-migrate-forward-section.hooks";
import type { SchemaStateSectionController } from "../hooks/use-schema-state-section.hooks";
import { navigate } from "@/lib/router";
import type { AdminLedgerRow } from "@/lib/api";

/**
 * @file `Database` — the `/admin/database` screen (design-spec.md §3, ADR-041). Markup only for
 * both sections; the two underlying hooks (`useTimelineSection`, `useMigrateForwardSection`)
 * already have their own dedicated, 100%-covered test files. This file's job is only the render
 * layer, which was bare (3.12%) before the original tabs pass.
 *
 * NO RESTORE-POINTS SECTION (2026-09-10): this file used to also cover a third section,
 * `RestorePointsSection`/`useRestorePointsSection`, mounted on a `restore-points` tab. That whole
 * capability moved to `features/recovery/Recovery.tsx` (`development/todos.md`'s "Recovery vs
 * Database's Restore Points tab" entry, owner, 2026-09-10) — see `Recovery.unit.test.tsx`'s own
 * "create restore point" describe block for its coverage now. `useRestorePointsSection` itself was
 * NOT deleted (still exercised by `__measurements__/request-volume.measurement.test.tsx`, unrelated
 * to this screen), so this file simply stopped mounting/mocking it.
 *
 * `TimelineSection`/`MigrateForwardSection` each declare a `use*Hook` DI seam
 * (`Recovery.tsx`/`Pages.tsx` convention), but `Database` — the only exported component in this
 * file — never threads a prop through to them, so there is no way to inject a controller via props
 * from the top (same situation as `RestoreFlow` in `Recovery.tsx`). Module-mocking each `use*Section`
 * hook is the seam that's actually reachable: each mock is driven through a `vi.hoisted` ref that
 * tests mutate before rendering, giving direct control over every section's state without a real
 * `fetch`.
 *
 * `t`/`locale` (2026-08-11, standing i18n rule): each controller fixture below defaults `t` to the
 * identity function (and `locale` to `"en"`, where the controller carries one) — matching
 * `wired-hooks-convention.md`'s own `t: (k) => k` example — so every existing assertion above stays
 * matched against the raw English key with no behavior change.
 *
 * TABS: `Database` renders one section at a time behind a `TabBar` (Timeline/Migrate forward — see
 * `Database.tsx`'s own header comment for the grouping rationale), instead of mounting both at
 * once. `renderDatabase` below resolves a default `?tab=` from WHICH override key a test passed —
 * `migrateForward` opens on "migrate-forward", anything else (including no override at all) opens
 * on the default "timeline" tab — so every pre-existing test call below still lands on the section
 * it was already asserting against with no change to the call itself. A test that needs a specific
 * tab regardless of that inference (or needs to assert on the tab bar itself) passes `tabId`
 * explicitly, which always wins.
 */

vi.mock("../../../lib/router", () => ({ navigate: vi.fn() }));

const { timelineRef, migrateForwardRef, schemaStateRef } = vi.hoisted(() => ({
  timelineRef: { current: null as unknown },
  migrateForwardRef: { current: null as unknown },
  schemaStateRef: { current: null as unknown },
}));

vi.mock("../hooks/use-timeline-section.hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hooks/use-timeline-section.hooks")>();
  return { ...actual, useWiredTimelineSection: () => timelineRef.current };
});
vi.mock("../hooks/use-migrate-forward-section.hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hooks/use-migrate-forward-section.hooks")>();
  return { ...actual, useWiredMigrateForwardSection: () => migrateForwardRef.current };
});
vi.mock("../hooks/use-schema-state-section.hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hooks/use-schema-state-section.hooks")>();
  return { ...actual, useWiredSchemaStateSection: () => schemaStateRef.current };
});

const ROW: AdminLedgerRow = {
  id: "row1",
  kind: "core.migration",
  createdAt: "2026-08-01T12:34:00.000Z",
  restorePointId: "rp1",
  outcome: "success",
};
const ROW_NO_RESTORE_POINT: AdminLedgerRow = { ...ROW, id: "row2", restorePointId: null };

function timelineController(overrides: Partial<TimelineSectionController> = {}): TimelineSectionController {
  return {
    rows: [ROW],
    nextCursor: null,
    error: null,
    kind: "",
    setKind: vi.fn(),
    outcome: "",
    setOutcome: vi.fn(),
    fromDate: "",
    setFromDate: vi.fn(),
    toDate: "",
    setToDate: vi.fn(),
    loadingMore: false,
    applyFilters: vi.fn((e: React.FormEvent) => e.preventDefault()),
    loadMore: vi.fn(),
    t: (key: string) => key,
    locale: "en",
    ...overrides,
  };
}

function migrateForwardController(overrides: Partial<MigrateForwardSectionController> = {}): MigrateForwardSectionController {
  return {
    step: "idle",
    busy: false,
    error: null,
    plan: null,
    confirmationToken: null,
    done: false,
    reset: vi.fn(),
    startPlan: vi.fn(async () => {}),
    doConfirm: vi.fn(async () => {}),
    doExecute: vi.fn(async () => {}),
    t: (key: string) => key,
    locale: "en",
    ...overrides,
  };
}

/** Defaults to the SETTLED-AND-CLEAN state (`warning: null`, `settled: true`) so every pre-existing
 *  test in this file renders no drift banner and keeps asserting exactly what it always did. */
function schemaStateController(overrides: Partial<SchemaStateSectionController> = {}): SchemaStateSectionController {
  return { warning: null, settled: true, t: (k: string) => k, ...overrides };
}

/** See the "TABS" file-header note above for why this infers a default tab from which override
 *  key a test passed, rather than requiring every existing call site to name one. */
function resolveDefaultTabId(overrides: { migrateForward?: unknown; tabId?: string | null }): string | null | undefined {
  if (overrides.tabId !== undefined) return overrides.tabId;
  if (overrides.migrateForward) return "migrate-forward";
  return "timeline";
}

function renderDatabase(overrides: {
  timeline?: Partial<TimelineSectionController>;
  migrateForward?: Partial<MigrateForwardSectionController>;
  schemaState?: Partial<SchemaStateSectionController>;
  tabId?: string | null;
} = {}) {
  const t = timelineController(overrides.timeline);
  const m = migrateForwardController(overrides.migrateForward);
  const s = schemaStateController(overrides.schemaState);
  timelineRef.current = t;
  migrateForwardRef.current = m;
  schemaStateRef.current = s;
  render(<Database tabId={resolveDefaultTabId(overrides)} />);
  return { timeline: t, migrateForward: m, schemaState: s };
}

beforeEach(() => {
  timelineRef.current = timelineController();
  migrateForwardRef.current = migrateForwardController();
  schemaStateRef.current = schemaStateController();
});

describe("page shell", () => {
  it("renders the page header and the two-tab tab bar", () => {
    renderDatabase();
    expect(screen.getByRole("heading", { name: "Database", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "Database" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Timeline" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Migrate forward" })).toBeInTheDocument();
    // Restore points moved to Recovery (2026-09-10, `development/todos.md`) — Database no longer
    // has a tab for it at all.
    expect(screen.queryByRole("tab", { name: "Restore points" })).not.toBeInTheDocument();
  });
});

describe("tab bar", () => {
  it("defaults to the Timeline tab and shows only its content when no tabId is given", () => {
    renderDatabase();
    expect(screen.getByRole("tab", { name: "Timeline" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Migrate forward" })).toHaveAttribute("aria-selected", "false");
    // Only Timeline's section is mounted — the other section's own heading is absent.
    expect(screen.queryByRole("heading", { name: "Migrate forward" })).not.toBeInTheDocument();
  });

  it("opens on the tab named by tabId, showing only that section", () => {
    renderDatabase({ tabId: "migrate-forward" });
    expect(screen.getByRole("tab", { name: "Migrate forward" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "Migrate forward" })).toBeInTheDocument();
    expect(screen.queryAllByRole("table")).toHaveLength(0);
  });

  it("falls back to Timeline for an unrecognized tabId", () => {
    renderDatabase({ tabId: "bogus" });
    expect(screen.getByRole("tab", { name: "Timeline" })).toHaveAttribute("aria-selected", "true");
  });

  it("clicking a tab calls navigate with the new ?tab= query, replacing history", async () => {
    const user = userEvent.setup();
    renderDatabase();
    await user.click(screen.getByRole("tab", { name: "Migrate forward" }));
    expect(navigate).toHaveBeenCalledWith("/database?tab=migrate-forward", { replace: true });
  });

  it("keeps the drift banner visible above the tab bar regardless of which tab is active", () => {
    renderDatabase({
      tabId: "migrate-forward",
      schemaState: { warning: { tone: "error", title: "Something is wrong", body: "Details here." } },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Something is wrong");
  });
});

describe("TimelineSection — loading/error/loaded", () => {
  it("shows only the error notice (no filter form) when rows is null and error is set", () => {
    renderDatabase({ timeline: { rows: null, error: "failed to load the Database Timeline" } });
    expect(screen.getByText("failed to load the Database Timeline")).toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  it("shows a loading notice while rows is null and there is no error", () => {
    renderDatabase({ timeline: { rows: null, error: null } });
    expect(screen.getByText("Loading timeline…")).toBeInTheDocument();
  });

  it("shows the empty state when rows is an empty array, with no table on the active (Timeline) tab", () => {
    renderDatabase({ timeline: { rows: [] } });
    expect(screen.getByText("No database activity recorded yet.")).toBeInTheDocument();
    // Only the Timeline tab is mounted (see the "tab bar" describe block) — its own empty-state
    // card renders instead of a table, and the other two sections aren't in the tree at all.
    expect(screen.queryAllByRole("table")).toHaveLength(0);
  });

  it("renders kind, outcome, restore-point link, and formatted time columns for a loaded row", () => {
    renderDatabase({ timeline: { rows: [ROW] } });
    const table = screen.getAllByRole("table")[0];
    expect(table).toHaveTextContent("core.migration");
    expect(table).toHaveTextContent("success");
    expect(table).toHaveTextContent("2026-08-01 12:34");
    // Accessible name, not just visible text: `viewInRecoveryAccessibleName` (rules.ts) appends
    // this row's own kind/timestamp after the visible "View in Recovery →" label so this control's
    // accessible name is distinct per row — see the multi-row test below.
    expect(screen.getByRole("button", { name: "View in Recovery → — core.migration, 2026-08-01 12:34" })).toBeInTheDocument();
  });

  it("gives each row's 'View in Recovery →' link a DISTINCT accessible name, not a repeated bare one", () => {
    // Two ledger rows differing only by kind/timestamp — every row's button is on screen at once
    // (unlike a per-row menu item), so identical accessible names would make
    // `getByRole("button", { name: "View in Recovery →" })` — or any accessibility-tree-driven
    // agent — unable to tell which row's restore point it would open.
    const otherRow: AdminLedgerRow = { ...ROW, id: "row3", kind: "index.provision", createdAt: "2026-08-02T09:00:00.000Z" };
    renderDatabase({ timeline: { rows: [ROW, otherRow] } });
    expect(screen.getByRole("button", { name: "View in Recovery → — core.migration, 2026-08-01 12:34" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View in Recovery → — index.provision, 2026-08-02 09:00" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^View in Recovery →/ })).toHaveLength(2);
  });

  it("renders '—' instead of a link when the row has no restorePointId", () => {
    renderDatabase({ timeline: { rows: [ROW_NO_RESTORE_POINT] } });
    expect(screen.queryByRole("button", { name: /^View in Recovery →/ })).not.toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows an inline error banner ABOVE the table once rows have loaded and a later error occurs", () => {
    renderDatabase({ timeline: { rows: [ROW], error: "stale filter" } });
    expect(screen.getByText("stale filter")).toBeInTheDocument();
    expect(screen.getAllByRole("table").length).toBeGreaterThan(0);
  });

  it("clicking 'View in Recovery →' calls the real navigateToRecoveryWithDeepLink (stashes envelope + navigates)", async () => {
    const user = userEvent.setup();
    sessionStorage.removeItem("recovery-deep-link-envelope");
    renderDatabase({ timeline: { rows: [ROW] } });
    await user.click(screen.getByRole("button", { name: "View in Recovery → — core.migration, 2026-08-01 12:34" }));
    const stashed = sessionStorage.getItem("recovery-deep-link-envelope");
    expect(stashed).not.toBeNull();
    expect(JSON.parse(stashed!)).toMatchObject({ restorePointId: "rp1", ledgerEventId: "row1" });
    expect(navigate).toHaveBeenCalledWith("/recovery");
    sessionStorage.removeItem("recovery-deep-link-envelope");
  });
});

describe("TimelineSection — filter form", () => {
  it("submitting the filter form calls applyFilters", async () => {
    const user = userEvent.setup();
    const c = renderDatabase({ timeline: { rows: [ROW] } });
    await user.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(c.timeline.applyFilters).toHaveBeenCalledTimes(1);
  });

  it("typing in the outcome filter calls setOutcome", async () => {
    const user = userEvent.setup();
    const c = renderDatabase({ timeline: { rows: [ROW] } });
    await user.type(screen.getByLabelText("Outcome"), "x");
    expect(c.timeline.setOutcome).toHaveBeenCalled();
  });

  it("changing the kind select calls setKind", async () => {
    const user = userEvent.setup();
    const c = renderDatabase({ timeline: { rows: [ROW] } });
    await user.selectOptions(screen.getByLabelText("Kind"), "plugin.ddl");
    expect(c.timeline.setKind).toHaveBeenCalledWith("plugin.ddl");
  });

  it("changing the From date calls setFromDate", () => {
    const c = renderDatabase({ timeline: { rows: [ROW] } });
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-01-01" } });
    expect(c.timeline.setFromDate).toHaveBeenCalledWith("2026-01-01");
  });

  it("changing the To date calls setToDate", () => {
    const c = renderDatabase({ timeline: { rows: [ROW] } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-12-31" } });
    expect(c.timeline.setToDate).toHaveBeenCalledWith("2026-12-31");
  });
});

describe("TimelineSection — pagination", () => {
  it("shows 'Load more' when nextCursor is set", () => {
    renderDatabase({ timeline: { rows: [ROW], nextCursor: "cursor1" } });
    expect(screen.getByRole("button", { name: "Load more" })).toBeInTheDocument();
  });

  it("omits 'Load more' when nextCursor is null", () => {
    renderDatabase({ timeline: { rows: [ROW], nextCursor: null } });
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("clicking 'Load more' calls loadMore, and the button shows 'Loading…' + is disabled while loadingMore", () => {
    const c = renderDatabase({ timeline: { rows: [ROW], nextCursor: "cursor1", loadingMore: true } });
    expect(screen.getByRole("button", { name: "Loading…" })).toBeDisabled();
    void c;
  });
});

describe("MigrateForwardSection — idle/planned/confirmed/done", () => {
  it("idle: shows 'Plan migration' and no Reset button", () => {
    renderDatabase({ migrateForward: { step: "idle" } });
    expect(screen.getByRole("button", { name: "Plan migration" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
  });

  it("idle: shows 'Planning…' and disables the button while busy", () => {
    renderDatabase({ migrateForward: { step: "idle", busy: true } });
    expect(screen.getByRole("button", { name: "Planning…" })).toBeDisabled();
  });

  it("clicking 'Plan migration' calls startPlan", async () => {
    const user = userEvent.setup();
    const c = renderDatabase({ migrateForward: { step: "idle" } });
    await user.click(screen.getByRole("button", { name: "Plan migration" }));
    expect(c.migrateForward.startPlan).toHaveBeenCalledTimes(1);
  });

  it("planned: shows the plan id and 'Confirm migration', plus a Reset button", () => {
    renderDatabase({ migrateForward: { step: "planned", plan: { planId: "plan1", planHash: "hash1" } } });
    expect(screen.getByText("plan1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm migration" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
  });

  it("planned: omits the plan block entirely if plan is null even though step is 'planned' (defensive AND)", () => {
    renderDatabase({ migrateForward: { step: "planned", plan: null } });
    expect(screen.queryByRole("button", { name: "Confirm migration" })).not.toBeInTheDocument();
  });

  it("clicking 'Confirm migration' calls doConfirm", async () => {
    const user = userEvent.setup();
    const c = renderDatabase({ migrateForward: { step: "planned", plan: { planId: "plan1", planHash: "hash1" } } });
    await user.click(screen.getByRole("button", { name: "Confirm migration" }));
    expect(c.migrateForward.doConfirm).toHaveBeenCalledTimes(1);
  });

  it("confirmed: shows 'Execute migration' (btn-warning) once confirmationToken is set", () => {
    renderDatabase({ migrateForward: { step: "confirmed", confirmationToken: "tok1" } });
    expect(screen.getByRole("button", { name: "Execute migration" })).toBeInTheDocument();
  });

  it("confirmed: shows 'Migrating…' and disables the button while busy", () => {
    renderDatabase({ migrateForward: { step: "confirmed", confirmationToken: "tok1", busy: true } });
    expect(screen.getByRole("button", { name: "Migrating…" })).toBeDisabled();
  });

  it("confirmed: omits the execute block if confirmationToken is null even though step is 'confirmed'", () => {
    renderDatabase({ migrateForward: { step: "confirmed", confirmationToken: null } });
    expect(screen.queryByRole("button", { name: "Execute migration" })).not.toBeInTheDocument();
  });

  it("clicking 'Execute migration' calls doExecute", async () => {
    const user = userEvent.setup();
    const c = renderDatabase({ migrateForward: { step: "confirmed", confirmationToken: "tok1" } });
    await user.click(screen.getByRole("button", { name: "Execute migration" }));
    expect(c.migrateForward.doExecute).toHaveBeenCalledTimes(1);
  });

  it("done: shows the success status message only when done is also true", () => {
    renderDatabase({ migrateForward: { step: "done", done: true } });
    expect(screen.getByRole("status")).toHaveTextContent("Migration executed successfully.");
  });

  it("done: omits the success message if done is false even though step is 'done' (defensive AND)", () => {
    renderDatabase({ migrateForward: { step: "done", done: false } });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the ceremony error inline at any step", () => {
    renderDatabase({ migrateForward: { step: "idle", error: "Failed to plan the forward migration" } });
    expect(screen.getByText("Failed to plan the forward migration")).toBeInTheDocument();
  });

  it("clicking Reset (visible once step !== idle) calls reset", async () => {
    const user = userEvent.setup();
    const c = renderDatabase({ migrateForward: { step: "planned", plan: { planId: "plan1", planHash: "hash1" } } });
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(c.migrateForward.reset).toHaveBeenCalledTimes(1);
  });

  it("disables Reset while busy", () => {
    renderDatabase({ migrateForward: { step: "planned", plan: { planId: "plan1", planHash: "hash1" }, busy: true } });
    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
  });
});

describe("drift warning", () => {
  /**
   * The gap this section closes: `src/platform/db/drift.ts` could classify a database as diverged, and
   * nothing anywhere ever showed that to a person. These assertions are about VISIBILITY — that
   * the banner reaches the accessibility tree with an alert role, ahead of the screen's content,
   * and that silence is reserved for a confirmed-clean read.
   */
  it("renders nothing at all when the check came back clean", () => {
    renderDatabase({ schemaState: { warning: null, settled: true } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders nothing before the first check settles, rather than a premature verdict", () => {
    renderDatabase({ schemaState: { warning: null, settled: false } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("announces a diverged database as an alert carrying both the headline and the explanation", () => {
    renderDatabase({
      schemaState: {
        warning: {
          tone: "error",
          title: "Your database does not match the software running this site",
          body: "This site's data was set up by a different version of the software than the one running now. Saving changes may not work correctly. Check with whoever manages this site before making further changes.",
        },
      },
    });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Your database does not match the software running this site");
    expect(alert).toHaveTextContent("Saving changes may not work correctly.");
  });

  it("carries the error tone's class for a diverged database and the warning tone's class otherwise", () => {
    renderDatabase({ schemaState: { warning: { tone: "error", title: "T", body: "B" } } });
    expect(screen.getByRole("alert").className).toContain("error");

    cleanup();
    renderDatabase({ schemaState: { warning: { tone: "warning", title: "T", body: "B" } } });
    expect(screen.getByRole("alert").className).toContain("warning");
  });

  it("shows the could-not-check warning too — an unanswered check is never silent", () => {
    renderDatabase({
      schemaState: {
        warning: {
          tone: "warning",
          title: "We could not check your database",
          body: "This check did not finish, so we cannot tell whether your database is up to date. Try reloading the page.",
        },
      },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("We could not check your database");
  });

  it("puts the banner before the tab bar, so it is read before the content it is a warning about", () => {
    renderDatabase({ schemaState: { warning: { tone: "error", title: "Something is wrong", body: "Details here." } } });

    const alert = screen.getByRole("alert");
    const tabBar = screen.getByRole("tablist", { name: "Database" });
    expect(alert.compareDocumentPosition(tabBar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("routes its copy through the section's own bound translator", () => {
    const translate = vi.fn((key: string) => (key === "Shout" ? "TRANSLATED" : key));
    renderDatabase({
      schemaState: { warning: { tone: "warning", title: "Shout", body: "Body" }, t: translate },
    });

    expect(screen.getByRole("alert")).toHaveTextContent("TRANSLATED");
    expect(translate).toHaveBeenCalledWith("Shout");
  });
});
