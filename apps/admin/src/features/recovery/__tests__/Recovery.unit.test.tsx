import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Recovery } from "../Recovery";
import type { RecoveryController } from "../hooks/use-recovery.hooks";
import { navigate } from "@/lib/router";
import type { AdminDegradedBanner, AdminRecoveryStatus, AdminRestorePoint } from "@/lib/api";

// Tabs (2026-09-10): `Recovery` now navigates between "restore-points" and "restore" via `?tab=`,
// same `TabBar` + `navigate(..., { replace: true })` convention `Database.tsx`'s own test file
// mocks this identical way.
vi.mock("../../../lib/router", () => ({ navigate: vi.fn() }));

/**
 * @file `Recovery` — the `/admin/recovery` screen (design-spec.md §4, ADR-045). Markup only;
 * `Recovery` itself is driven through the injectable `useRecoveryHook` seam (same convention as
 * `Pages.tsx`/`Posts.tsx`).
 *
 * `RestoreFlow` (the ceremony shell) is NOT exported and has no DI seam exposed through
 * `Recovery`'s own props — `RestoreFlowProps.useRestoreFlowHook` is consumed only inside
 * `RestoreFlow` itself, which `Recovery` does not thread through. Its only real mount path is
 * `Recovery` with a restore point selected, so it is exercised here the same way production reaches
 * it: mount `Recovery` with `selected` set and drive its real `useRestoreFlow` hook through mocked
 * `fetch` responses, following the harness `use-restore-flow.unit.test.ts` already established for
 * the ceremony's request/response shapes.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const POINT: AdminRestorePoint = {
  id: "rp1",
  trigger: "manual",
  costClass: "cheap",
  kind: "full",
  watermarkAtCapture: 42,
  createdAt: "2026-08-01T12:34:00.000Z",
};

const UNAVAILABLE_POINT: AdminRestorePoint = { ...POINT, id: "rp2", costClass: "unavailable" };

const STATUS: AdminRecoveryStatus = { costClass: "cheap", banner: null };

function bannerStatus(banner: AdminDegradedBanner): AdminRecoveryStatus {
  return { costClass: "cheap", banner };
}

function recoveryController(overrides: Partial<RecoveryController> = {}): RecoveryController {
  return {
    status: STATUS,
    points: [POINT],
    error: null,
    creating: false,
    createRestorePoint: vi.fn(async () => {}),
    selected: null,
    setSelected: vi.fn(),
    t: (key: string) => key,
    locale: "en",
    ...overrides,
  };
}

function renderRecovery(overrides: Partial<RecoveryController> = {}, renderOverrides: { tabId?: string | null } = {}) {
  const c = recoveryController(overrides);
  const useRecoveryHook = () => c;
  render(<Recovery useRecoveryHook={useRecoveryHook} tabId={renderOverrides.tabId} />);
  return c;
}

beforeEach(() => {
  vi.mocked(navigate).mockClear();
});

describe("loading and error-before-load states", () => {
  it("shows a loading notice while points/status are null and there is no error", () => {
    renderRecovery({ points: null, status: null, error: null });
    expect(screen.getByText("Loading restore points…")).toBeInTheDocument();
  });

  it("shows only the error notice when points is still null and error is set", () => {
    renderRecovery({ points: null, status: null, error: "failed to load Recovery" });
    expect(screen.getByText("failed to load Recovery")).toBeInTheDocument();
    expect(screen.queryByText("Loading restore points…")).not.toBeInTheDocument();
  });

  it("still shows the loading notice if only status is missing (points+status both required)", () => {
    renderRecovery({ points: [POINT], status: null, error: null });
    expect(screen.getByText("Loading restore points…")).toBeInTheDocument();
  });
});

describe("loaded", () => {
  it("shows an inline banner ABOVE the list, not a blank screen, once loaded and a later error occurs", () => {
    renderRecovery({ points: [POINT], status: STATUS, error: "failed to create restore point" });
    expect(screen.getByText("failed to create restore point")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});

describe("degraded banner", () => {
  it("renders nothing when status.banner is null", () => {
    renderRecovery({ status: STATUS });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(document.querySelector(".recovery-degraded-banner")).not.toBeInTheDocument();
  });

  it("uses role=alert + aria-live=assertive for pending-migration and links to Database", () => {
    renderRecovery({
      status: bannerStatus({ kind: "pending-migration", accessibleText: "Migration pending", actionKind: "deep-link-to-database-migration" }),
    });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("aria-live", "assertive");
    expect(screen.getByText("Migration pending")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Database" })).toHaveAttribute("href", "/admin/database");
  });

  it("uses role=alert + aria-live=assertive for migration-interrupted, with the disabled Unblock button", () => {
    renderRecovery({
      status: bannerStatus({ kind: "migration-interrupted", accessibleText: "Migration interrupted", actionKind: "unblock-interrupted-migration" }),
    });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    const unblock = screen.getByRole("button", { name: "Unblock (not yet available)" });
    expect(unblock).toBeDisabled();
  });

  it("uses aria-live=polite (no role=alert) for cost-unavailable", () => {
    renderRecovery({
      status: bannerStatus({ kind: "cost-unavailable", accessibleText: "Cost unavailable", actionKind: "none" }),
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Cost unavailable")).toBeInTheDocument();
    const el = screen.getByText("Cost unavailable").closest(".recovery-degraded-banner")!;
    expect(el).toHaveAttribute("aria-live", "polite");
  });

  it("renders neither action button when actionKind is 'none'", () => {
    renderRecovery({
      status: bannerStatus({ kind: "watermark-baseline-unavailable", accessibleText: "Baseline unavailable", actionKind: "none" }),
    });
    expect(screen.queryByRole("link", { name: "Go to Database" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unblock (not yet available)" })).not.toBeInTheDocument();
  });
});

describe("restore points list", () => {
  it("shows the empty state when there are no points", () => {
    renderRecovery({ points: [] });
    expect(screen.getByText("No restore points yet.")).toBeInTheDocument();
  });

  it("renders timestamp, trigger, and cost-class columns", () => {
    renderRecovery({ points: [POINT] });
    expect(screen.getByText("2026-08-01 12:34")).toBeInTheDocument();
    expect(screen.getByText("manual")).toBeInTheDocument();
    // Real cost-class badge text, not the raw `"cheap"` enum value — see the "loaded — header and
    // cost class" describe block above for the same fix on the top status bar.
    expect(screen.getAllByText("Fast restore").length).toBeGreaterThan(0);
  });

  it("renders a 'Restore…' button for a restorable point", () => {
    renderRecovery({ points: [POINT] });
    // Accessible name, not just visible text: `restoreButtonAccessibleName` (rules.ts) appends the
    // row's own timestamp after the visible "Restore…" label so this control's accessible name is
    // distinct per row — see the multi-row test below for why a bare "Restore…" match would not
    // have caught the regression this label fixes.
    expect(screen.getByRole("button", { name: "Restore… 2026-08-01 12:34" })).toBeInTheDocument();
  });

  it("gives each row's Restore button a DISTINCT accessible name, not a repeated bare 'Restore…'", () => {
    // Two restore points differing only by id/timestamp — the shape that exposed the bug: every
    // row rendered the identical visible text "Restore…", so `getByRole("button", { name:
    // "Restore…" })` (or any accessibility-tree-driven agent resolving by role+name) could not
    // tell one row's destructive, unrecoverable action from another's.
    const secondPoint: AdminRestorePoint = { ...POINT, id: "rp3", createdAt: "2026-08-02T09:00:00.000Z" };
    renderRecovery({ points: [POINT, secondPoint] });
    expect(screen.getByRole("button", { name: "Restore… 2026-08-01 12:34" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore… 2026-08-02 09:00" })).toBeInTheDocument();
    // A query still scoped to the shared, ambiguous visible prefix must resolve to exactly these
    // two — never collapse to one indistinguishable control.
    expect(screen.getAllByRole("button", { name: /^Restore…/ })).toHaveLength(2);
  });

  it("renders 'No restore-point mechanism available' instead of a button when costClass is unavailable", () => {
    renderRecovery({ points: [UNAVAILABLE_POINT] });
    expect(screen.queryByRole("button", { name: /^Restore…/ })).not.toBeInTheDocument();
    expect(screen.getByText("No restore-point mechanism available — see the runbook.")).toBeInTheDocument();
  });

  it("clicking 'Restore…' calls setSelected with that point and navigates to the restore tab", async () => {
    const user = userEvent.setup();
    const c = renderRecovery({ points: [POINT] });
    await user.click(screen.getByRole("button", { name: "Restore… 2026-08-01 12:34" }));
    expect(c.setSelected).toHaveBeenCalledWith(POINT);
    expect(navigate).toHaveBeenCalledWith("/recovery?tab=restore", { replace: true });
  });
});

describe("tabs", () => {
  it("renders the page header and the two-tab tab bar", () => {
    renderRecovery();
    expect(screen.getByRole("heading", { name: "Recovery", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "Recovery" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Restore points" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Restore" })).toBeInTheDocument();
  });

  it("defaults to the Restore points tab when no tabId is given", () => {
    renderRecovery();
    expect(screen.getByRole("tab", { name: "Restore points" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Restore" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("opens on the tab named by tabId", () => {
    renderRecovery({ points: [], selected: null }, { tabId: "restore" });
    expect(screen.getByRole("tab", { name: "Restore" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("falls back to Restore points for an unrecognized tabId", () => {
    renderRecovery({}, { tabId: "bogus" });
    expect(screen.getByRole("tab", { name: "Restore points" })).toHaveAttribute("aria-selected", "true");
  });

  it("clicking the Restore tab calls navigate with the new ?tab= query, replacing history", async () => {
    const user = userEvent.setup();
    renderRecovery();
    await user.click(screen.getByRole("tab", { name: "Restore" }));
    expect(navigate).toHaveBeenCalledWith("/recovery?tab=restore", { replace: true });
  });

  it("on the Restore tab with nothing selected, prompts back to Restore points instead of rendering the ceremony", () => {
    renderRecovery({ selected: null }, { tabId: "restore" });
    expect(screen.getByText("Select a restore point from the Restore points tab to begin.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^Restore to/ })).not.toBeInTheDocument();
  });
});

describe("create restore point (moved here from Database.tsx, 2026-09-10)", () => {
  it("shows a 'Create restore point' button on the Restore points tab", () => {
    renderRecovery();
    expect(screen.getByRole("button", { name: "Create restore point" })).toBeInTheDocument();
  });

  it("clicking 'Create restore point' calls createRestorePoint", async () => {
    const user = userEvent.setup();
    const c = renderRecovery();
    await user.click(screen.getByRole("button", { name: "Create restore point" }));
    expect(c.createRestorePoint).toHaveBeenCalledTimes(1);
  });

  it("disables the create button and shows 'Creating…' while creating is true", () => {
    renderRecovery({ creating: true });
    expect(screen.getByRole("button", { name: "Creating…" })).toBeDisabled();
  });
});

// --- RestoreFlow, exercised through Recovery with `selected` set, real hook + mocked fetch ---

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

beforeEach(() => {
  fetchMock = vi.fn();
  // `RestoreFlow` is rendered here through the REAL `useRestoreFlow` hook (only `Recovery`'s own
  // `useRecoveryHook` is DI'd above), and that hook now also calls `useAdminLocale()` (real
  // `fetch`, not this hook's own concern), which would otherwise consume one of this file's
  // strictly-ordered `mockResolvedValueOnce` slots and shift every later assertion by one call.
  // Routed to a fixed default-locale response outside `fetchMock`'s own call queue — same
  // interceptor pattern `Members.unit.test.tsx` uses.
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    if (String(url).includes("/settings/effective") && String(url).includes("namespace=core.language")) {
      return Promise.resolve(
        new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } }),
      );
    }
    return fetchMock(url, init);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderFlow(recoveryOverrides: Partial<RecoveryController> = {}) {
  const rc = recoveryController({ selected: POINT, ...recoveryOverrides });
  const useRecoveryHook = () => rc;
  // Tabs (2026-09-10): `RestoreFlow` only renders on the "restore" tab — production only ever
  // reaches it there (`onSelectPoint`/the deep-link effect both navigate to `?tab=restore` before
  // `selected` is ever consulted), so this mirrors that real arrival state rather than a case that
  // cannot occur outside a test.
  render(<Recovery useRecoveryHook={useRecoveryHook} tabId="restore" />);
  return rc;
}

async function renderFlowWithDisclosure(
  disclosure: unknown = { partial: true, watermarkBaselineAvailable: true, counts: { posts_pages: 3, plugin_table: "unknown" } },
) {
  fetchMock.mockResolvedValueOnce(jsonResponse(disclosure));
  const rc = renderFlow();
  await waitFor(() => expect(screen.queryByText("Computing the discarded-write-window disclosure…")).not.toBeInTheDocument());
  return rc;
}

describe("RestoreFlow shell (rendered via Recovery with a point selected)", () => {
  it("renders the back button, heading, and point metadata immediately (before disclosure resolves)", () => {
    fetchMock.mockResolvedValueOnce(new Promise(() => {})); // never resolves for this test
    renderFlow();
    expect(screen.getByRole("button", { name: "← Restore points" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Restore to 2026-08-01 12:34" })).toBeInTheDocument();
    expect(screen.getByText("manual")).toBeInTheDocument();
    expect(screen.getAllByText("Fast restore").length).toBeGreaterThan(0);
    expect(screen.getByText("full")).toBeInTheDocument();
    expect(screen.getByText("Computing the discarded-write-window disclosure…")).toBeInTheDocument();
  });

  it("clicking back calls setSelected(null) and navigates to the restore-points tab", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(new Promise(() => {}));
    const rc = renderFlow();
    await user.click(screen.getByRole("button", { name: "← Restore points" }));
    expect(rc.setSelected).toHaveBeenCalledWith(null);
    expect(navigate).toHaveBeenCalledWith("/recovery?tab=restore-points", { replace: true });
  });

  it("shows the disclosure-fetch error instead of the disclosure panel on failure", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "" }, 500));
    renderFlow();
    await waitFor(() => expect(screen.getByText("Failed to compute the discarded-write-window disclosure")).toBeInTheDocument());
    expect(screen.queryByText(/discard at least/)).not.toBeInTheDocument();
  });
});

describe("DisclosurePanel", () => {
  /** The count line's quantity and category are separate elements as of the 2026-09-10 web-design
   *  pass, so `getByText` no longer sees the whole sentence on one node (`getNodeText` reads only
   *  an element's DIRECT text children). Asserting the row's full `textContent` instead is the
   *  stronger check either way: it pins the complete rendered string exactly, where the previous
   *  regex would have passed on any line merely CONTAINING it. */
  function lossRowTexts(): (string | null)[] {
    return screen.getAllByRole("listitem").map((li) => li.textContent);
  }

  it("renders a known category's count directly", async () => {
    await renderFlowWithDisclosure({ partial: true, watermarkBaselineAvailable: true, counts: { posts_pages: 3 } });
    expect(lossRowTexts()).toContain("3 posts/pages writes");
  });

  it("renders 'unknown' counts distinctly (INV-05) rather than as 0", async () => {
    await renderFlowWithDisclosure({ partial: true, watermarkBaselineAvailable: true, counts: { plugin_table: "unknown" } });
    expect(lossRowTexts()).toContain("at least an unknown number of plugin-table rows");
  });

  it("renders only the categories the server actually sent — no placeholder row for an uncovered category", async () => {
    await renderFlowWithDisclosure({ partial: true, watermarkBaselineAvailable: true, counts: { posts_pages: 5 } });
    expect(screen.queryByText(/plugin-table rows/)).not.toBeInTheDocument();
  });

  it("shows the baseline-unavailable warning when watermarkBaselineAvailable is false", async () => {
    await renderFlowWithDisclosure({ partial: true, watermarkBaselineAvailable: false, counts: {} });
    expect(screen.getByRole("alert")).toHaveTextContent(/could not be computed/);
  });

  it("omits the baseline-unavailable warning when watermarkBaselineAvailable is true", async () => {
    await renderFlowWithDisclosure({ partial: true, watermarkBaselineAvailable: true, counts: {} });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("the acknowledge checkbox starts unchecked and 'Continue to confirm' starts disabled", async () => {
    await renderFlowWithDisclosure();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Continue to confirm" })).toBeDisabled();
  });

  it("checking the acknowledge box enables 'Continue to confirm'", async () => {
    const user = userEvent.setup();
    await renderFlowWithDisclosure();
    await user.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.getByRole("button", { name: "Continue to confirm" })).toBeEnabled();
  });
});

describe("ceremony: idle -> planned -> confirmed -> done", () => {
  it("startPlan (Continue to confirm) moves to the planned step and shows the plan id", async () => {
    const user = userEvent.setup();
    await renderFlowWithDisclosure();
    await user.click(screen.getByRole("checkbox"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ planId: "plan1", planHash: "hash1" }));

    await user.click(screen.getByRole("button", { name: "Continue to confirm" }));

    await waitFor(() => expect(screen.getByText("plan1")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Confirm restore" })).toBeInTheDocument();
  });

  it("shows the ceremony error inline and stays on idle when planning fails", async () => {
    const user = userEvent.setup();
    await renderFlowWithDisclosure();
    await user.click(screen.getByRole("checkbox"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "" }, 500));

    await user.click(screen.getByRole("button", { name: "Continue to confirm" }));

    await waitFor(() => expect(screen.getByText("Failed to plan the restore")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Continue to confirm" })).toBeInTheDocument();
  });

  async function planned() {
    const user = userEvent.setup();
    const rc = await renderFlowWithDisclosure();
    await user.click(screen.getByRole("checkbox"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ planId: "plan1", planHash: "hash1" }));
    await user.click(screen.getByRole("button", { name: "Continue to confirm" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirm restore" })).toBeInTheDocument());
    return { user, rc };
  }

  it("doConfirm moves to the confirmed step and shows the danger 'Execute restore' button", async () => {
    const { user } = await planned();
    fetchMock.mockResolvedValueOnce(jsonResponse({ confirmationToken: "tok1" }));

    await user.click(screen.getByRole("button", { name: "Confirm restore" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Execute restore" })).toBeInTheDocument());
    expect(screen.getByText(/cannot be undone/)).toBeInTheDocument();
  });

  async function confirmed() {
    const { user } = await planned();
    fetchMock.mockResolvedValueOnce(jsonResponse({ confirmationToken: "tok1" }));
    await user.click(screen.getByRole("button", { name: "Confirm restore" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Execute restore" })).toBeInTheDocument());
    return { user };
  }

  it("doExecute moves to the done step and shows the result state", async () => {
    const { user } = await confirmed();
    fetchMock.mockResolvedValueOnce(jsonResponse({ restoreRunId: "run1", state: "succeeded", restartRequired: false }));

    await user.click(screen.getByRole("button", { name: "Execute restore" }));

    await waitFor(() => expect(screen.getByText("run1")).toBeInTheDocument());
    expect(screen.getByText("succeeded")).toBeInTheDocument();
    expect(screen.queryByRole("alert", { name: /restart/i })).not.toBeInTheDocument();
  });

  it("shows the restart-required warning when the response sets restartRequired:true", async () => {
    const { user } = await confirmed();
    fetchMock.mockResolvedValueOnce(jsonResponse({ restoreRunId: "run1", state: "succeeded", restartRequired: true }));

    await user.click(screen.getByRole("button", { name: "Execute restore" }));

    await waitFor(() => expect(screen.getByText(/Restart the server now/)).toBeInTheDocument());
  });

  it("shows the ceremony error and stays on 'confirmed' (Execute restore still shown) when execute fails", async () => {
    const { user } = await confirmed();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "" }, 500));

    await user.click(screen.getByRole("button", { name: "Execute restore" }));

    await waitFor(() => expect(screen.getByText("Failed to execute the restore")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Execute restore" })).toBeInTheDocument();
  });

  // agent-proof-live-buttons pass (2026-09-24), same fix as a022eafaa (Publish confirm): Jini's
  // `createDomPageDriver.click` clicks any `[data-agent-element]`, so this button carrying one let
  // the chat assistant run a real, unrecoverable restore with no human click. Only a person may
  // press Execute — the earlier "Continue to confirm"/"Confirm restore" steps keep their handles
  // since neither one restores anything yet.
  it("the Execute restore button carries no agent handle (an agent can't run the restore)", async () => {
    await confirmed();
    const executeButton = screen.getByRole("button", { name: "Execute restore" });
    expect(executeButton.hasAttribute("data-agent-element")).toBe(false);
    expect(document.querySelector('[data-agent-element="recovery-restore-execute"]')).toBeNull();
  });

  it("disables the active step's button and shows its busy label while the request is in flight", async () => {
    const user = userEvent.setup();
    await renderFlowWithDisclosure();
    await user.click(screen.getByRole("checkbox"));
    let resolvePlan: ((r: Response) => void) | undefined;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => (resolvePlan = resolve)));

    await user.click(screen.getByRole("button", { name: "Continue to confirm" }));
    expect(screen.getByRole("button", { name: "Planning…" })).toBeDisabled();

    await act(async () => {
      resolvePlan?.(jsonResponse({ planId: "plan1", planHash: "hash1" }));
    });
  });
});
