import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { PublishContentReport } from "@tovu/publish-content-ui";

import { PublishContentDialog } from "../PublishContentDialog";
import { createFakePublishContentPort } from "../hooks/publish-content-dependencies.hooks";
import { usePublishContentConfirm } from "../hooks/use-publish-content-confirm.hooks";

/**
 * @file `PublishContentDialog` — plan §4 task 11's two acceptance criteria, asserted against the
 * rendered dialog:
 *
 * 1. **a conflict row renders its reason and is not selectable for silent apply**, and
 * 2. **the dialog cannot fire execute without a confirmed plan.**
 *
 * Both are asserted through what the operator can actually see and click plus what the port
 * actually received — never through the hook's internal state — so an implementation that renders
 * the right words while calling the wrong endpoint still fails. Both were confirmed RED against a
 * deliberately broken implementation before this file was accepted (`conflict` mapped to `publish`
 * in `report-rows.ts`, and `executePublish` called with a hardcoded token).
 *
 * Harness follows `features/dashboard/__tests__/Dashboard.unit.test.tsx` (RTL, no server), except
 * that the network is replaced at the PORT rather than at `fetch`. The port seam was what let this dialog be built while
 * Task 10's peer routes were still being written; it stays because a URL mock would assert on
 * `lib/api.ts`'s path building rather than on the dialog's own behaviour — see
 * `hooks/publish-content-port.hooks.ts`.
 */

const t = (key: string) => key;

const ONE_PEER = [
  {
    id: "peer-prod",
    label: "tovu.com (production)",
    baseUrl: "https://tovu.com",
    remoteWorkspaceId: "workspace-local",
    masked: "tvp_…8f2a",
    hasCredential: true,
  },
] as const;

const CONFLICT_REASON = "destination hash differs from both source and baseline — it was edited there";

const MIXED_REPORT: PublishContentReport = {
  refused: false,
  refusalReason: null,
  applyOrder: ["media", "post"],
  rows: [
    { entityType: "post", entityId: "post-new", outcome: "created", writes: true, reason: null },
    { entityType: "post", entityId: "post-edited-there", outcome: "conflict", writes: false, reason: CONFLICT_REASON },
    { entityType: "media", entityId: "media-same", outcome: "unchanged", writes: false, reason: null },
  ],
};

/**
 * A plan with more than one publishable row, so "some are checked" is a state that can exist at all
 * — `MIXED_REPORT` above has exactly one and is deliberately left untouched, since the assertions
 * around it are about the conflict row rather than about selection.
 *
 * `media-no-label` carries no `entityLabel` on purpose: it is the older-peer / unnamed-entity case,
 * and it proves the entity column falls back to a SHORT id rather than the full uuid.
 */
const SELECTION_REPORT: PublishContentReport = {
  refused: false,
  refusalReason: null,
  applyOrder: ["media", "post"],
  rows: [
    { entityType: "post", entityId: "11111111-aaaa-4aaa-8aaa-111111111111", entityLabel: "hello-world", outcome: "created", writes: true, reason: null },
    { entityType: "post", entityId: "22222222-bbbb-4bbb-8bbb-222222222222", entityLabel: "about-us", outcome: "applied", writes: true, reason: null },
    { entityType: "media", entityId: "33333333-cccc-4ccc-8ccc-333333333333", outcome: "created", writes: true, reason: null },
    { entityType: "media", entityId: "44444444-dddd-4ddd-8ddd-444444444444", entityLabel: "logo-png", outcome: "unchanged", writes: false, reason: null },
    { entityType: "post", entityId: "55555555-eeee-4eee-8eee-555555555555", entityLabel: "edited-there", outcome: "conflict", writes: false, reason: CONFLICT_REASON },
  ],
};

const HELLO_WORLD = "11111111-aaaa-4aaa-8aaa-111111111111";
const ABOUT_US = "22222222-bbbb-4bbb-8bbb-222222222222";
const UNNAMED_MEDIA = "33333333-cccc-4ccc-8ccc-333333333333";

function renderDialog(port: ReturnType<typeof createFakePublishContentPort>) {
  return render(<PublishContentDialog onCancel={() => {}} t={t} port={port} />);
}

/** The dialog's single forward control, whatever its label currently is. */
function primaryButton(): HTMLButtonElement {
  const button = document.querySelector(".settings-dialog .btn-primary");
  if (!button) throw new Error("the publish dialog has no primary button");
  return button as HTMLButtonElement;
}

function reportRow(entityId: string): HTMLElement {
  const row = document.querySelector(`tr[data-entity-id="${entityId}"]`);
  if (!row) throw new Error(`no report row for "${entityId}"`);
  return row as HTMLElement;
}

/** The one checkbox inside a report row, or `null` when that row offers none. */
function rowCheckbox(entityId: string): HTMLInputElement | null {
  return reportRow(entityId).querySelector("input[type=checkbox]");
}

/** The header's check-everything control. */
function headerCheckbox(): HTMLInputElement {
  const box = document.querySelector("thead input[type=checkbox]");
  if (!box) throw new Error("the report table has no header checkbox");
  return box as HTMLInputElement;
}

async function planFrom(port: ReturnType<typeof createFakePublishContentPort>) {
  const user = userEvent.setup();
  renderDialog(port);
  await waitFor(() => expect(port.calls.listPeers).toBe(1));
  await user.click(primaryButton());
  await screen.findByRole("table");
  return user;
}

describe("PublishContentDialog — a conflict row is reported, never silently applied", () => {
  it("renders the conflict's own reason text", async () => {
    const port = createFakePublishContentPort({ peers: ONE_PEER, report: MIXED_REPORT });
    await planFrom(port);

    expect(within(reportRow("post-edited-there")).getByText(CONFLICT_REASON)).toBeTruthy();
  });

  it("marks the conflict row skipped and gives it no control that could publish it", async () => {
    const port = createFakePublishContentPort({ peers: ONE_PEER, report: MIXED_REPORT });
    await planFrom(port);

    const conflict = reportRow("post-edited-there");
    expect(conflict.getAttribute("data-publish-disposition")).toBe("skipped");
    expect(within(conflict).queryAllByRole("checkbox")).toHaveLength(0);
    expect(within(conflict).queryAllByRole("button")).toHaveLength(0);
    expect(within(conflict).getByText("Skipped")).toBeTruthy();

    // The contrast that makes the assertion above mean something: a row that DOES publish is
    // labelled as such in the same table, so "skipped" is a real distinction, not the only state.
    expect(reportRow("post-new").getAttribute("data-publish-disposition")).toBe("publish");
  });

  it("excludes the conflict from the count the publish button commits to", async () => {
    const port = createFakePublishContentPort({ peers: ONE_PEER, report: MIXED_REPORT });
    await planFrom(port);

    expect(primaryButton().textContent).toBe("Publish 1 item");
  });

  it("never sends the conflicted entity anywhere — execute carries only the bundle and the token", async () => {
    const port = createFakePublishContentPort({ peers: ONE_PEER, report: MIXED_REPORT });
    const user = await planFrom(port);

    await user.click(primaryButton());
    await waitFor(() => expect(port.calls.executePublish).toHaveLength(1));
    expect(port.calls.executePublish[0]).toEqual({ peerId: "peer-prod", bundleId: "fake-bundle", confirmationToken: "fake-token" });
  });
});

describe("PublishContentDialog — execute is gated on a confirmed plan", () => {
  it("does not call plan, confirm or execute merely by opening", async () => {
    const port = createFakePublishContentPort({ peers: ONE_PEER, report: MIXED_REPORT });
    renderDialog(port);
    await waitFor(() => expect(port.calls.listPeers).toBe(1));

    expect(port.calls.planPublish).toHaveLength(0);
    expect(port.calls.confirmPublish).toHaveLength(0);
    expect(port.calls.executePublish).toHaveLength(0);
  });

  it("plans on the first click and executes nothing", async () => {
    const port = createFakePublishContentPort({ peers: ONE_PEER, report: MIXED_REPORT });
    await planFrom(port);

    expect(port.calls.planPublish).toEqual([{ peerId: "peer-prod" }]);
    expect(port.calls.confirmPublish).toHaveLength(0);
    expect(port.calls.executePublish).toHaveLength(0);
  });

  it("never executes when confirm fails, and says why", async () => {
    const port = createFakePublishContentPort({
      peers: ONE_PEER,
      report: MIXED_REPORT,
      confirmError: new Error("principal 'user-1' is not authorized for 'publish_content.apply'"),
    });
    const user = await planFrom(port);

    await user.click(primaryButton());
    await screen.findByText("principal 'user-1' is not authorized for 'publish_content.apply'");

    expect(port.calls.confirmPublish).toHaveLength(1);
    expect(port.calls.executePublish).toHaveLength(0);
  });

  it("executes with exactly the token confirm returned, against the planned peer", async () => {
    const port = createFakePublishContentPort({
      peers: ONE_PEER,
      report: MIXED_REPORT,
      bundleId: "bundle-from-plan",
      confirmationToken: "tok-from-server",
      executeResult: { restorePointId: "rp-9", runId: "run-9", changeSetIds: ["cs-1", "cs-2"] },
    });
    const user = await planFrom(port);

    await user.click(primaryButton());
    await waitFor(() => expect(port.calls.executePublish).toHaveLength(1));

    expect(port.calls.confirmPublish).toEqual([{ peerId: "peer-prod", planId: "fake-plan", planHash: "fake-plan-hash" }]);
    expect(port.calls.executePublish).toEqual([
      { peerId: "peer-prod", bundleId: "bundle-from-plan", confirmationToken: "tok-from-server" },
    ]);
    expect(await screen.findByText("Published 2 changes.")).toBeTruthy();
  });

  it("offers no forward control at all when the plan would write nothing", async () => {
    const port = createFakePublishContentPort({
      peers: ONE_PEER,
      report: {
        refused: false,
        refusalReason: null,
        applyOrder: ["post"],
        rows: [{ entityType: "post", entityId: "p1", outcome: "conflict", writes: false, reason: CONFLICT_REASON }],
      },
    });
    const user = await planFrom(port);

    expect(primaryButton().disabled).toBe(true);
    await user.click(primaryButton());
    expect(port.calls.confirmPublish).toHaveLength(0);
    expect(port.calls.executePublish).toHaveLength(0);
  });

  it("refuses a refused plan outright and shows the refusal reason", async () => {
    const port = createFakePublishContentPort({
      peers: ONE_PEER,
      report: {
        refused: true,
        refusalReason: "these two instances are on different content-hash versions; upgrade the older one",
        applyOrder: [],
        rows: [],
      },
    });
    const user = userEvent.setup();
    renderDialog(port);
    await waitFor(() => expect(port.calls.listPeers).toBe(1));
    await user.click(primaryButton());

    await screen.findByText("these two instances are on different content-hash versions; upgrade the older one");
    expect(primaryButton().disabled).toBe(true);
    expect(port.calls.confirmPublish).toHaveLength(0);
    expect(port.calls.executePublish).toHaveLength(0);
  });
});

describe("PublishContentDialog — the rest of the surface", () => {
  it("no longer claims publishing is unavailable", async () => {
    const port = createFakePublishContentPort({ peers: ONE_PEER, report: MIXED_REPORT });
    const { container } = renderDialog(port);
    await waitFor(() => expect(port.calls.listPeers).toBe(1));

    expect(container.querySelector(".notice.warning")).toBeNull();
    expect(screen.queryByText(/Not available yet/)).toBeNull();
  });

  it("offers no connect action and stays disabled when nothing is deployed to connect to", async () => {
    // The fake's default `getDestination()` result (no `destination` override) is the honest-floor
    // response: a fresh install that has never deployed, so there is no candidate to pre-fill.
    const port = createFakePublishContentPort({ peers: [] });
    renderDialog(port);

    await screen.findByText("No live site is set up yet. Deploy this site once, then come back here.");
    expect(primaryButton().disabled).toBe(true);
    expect(primaryButton().textContent).toBe("Connect");
    expect(port.calls.planPublish).toHaveLength(0);
    expect(port.calls.connectDestination).toHaveLength(0);
  });

  it("offers a one-click connect, pre-filled from deploy config, when nothing is configured yet", async () => {
    const port = createFakePublishContentPort({
      peers: [],
      destination: {
        connected: false,
        site: null,
        candidateUrl: "https://tovu.dev",
        message: "Publish to tovu.dev?",
        nextStep: null,
      },
      report: MIXED_REPORT,
    });
    const user = userEvent.setup();
    renderDialog(port);

    await screen.findByText("Publish to tovu.dev?");
    expect(primaryButton().disabled).toBe(false);
    expect(primaryButton().textContent).toBe("Connect");

    await user.click(primaryButton());
    await waitFor(() => expect(port.calls.connectDestination).toHaveLength(1));

    // Connecting folds straight into planning against the newly connected peer — no second click to
    // "confirm" the connection itself, and no separate settings screen involved anywhere.
    await screen.findByRole("table");
    expect(port.calls.planPublish).toEqual([{ peerId: "peer-connected" }]);
  });

  it("reports a failed connect without stranding the dialog, and lets the operator retry", async () => {
    const port = createFakePublishContentPort({
      peers: [],
      destination: {
        connected: false,
        site: null,
        candidateUrl: "https://tovu.dev",
        message: "Publish to tovu.dev?",
        nextStep: null,
      },
      connectError: new Error("could not reach tovu.dev"),
    });
    const user = userEvent.setup();
    renderDialog(port);

    await screen.findByText("Publish to tovu.dev?");
    await user.click(primaryButton());

    await screen.findByText("could not reach tovu.dev");
    expect(primaryButton().disabled).toBe(false);
    expect(primaryButton().textContent).toBe("Connect");
    expect(port.calls.planPublish).toHaveLength(0);
  });

  it("surfaces a failed plan without stranding the dialog", async () => {
    const port = createFakePublishContentPort({ peers: ONE_PEER, planError: new Error("PLAN_STALE") });
    const user = userEvent.setup();
    renderDialog(port);
    await waitFor(() => expect(port.calls.listPeers).toBe(1));

    await user.click(primaryButton());
    await screen.findByText("PLAN_STALE");
    expect(primaryButton().disabled).toBe(false);
  });
});

describe("PublishContentDialog — the entity column names entities, never uuids", () => {
  it("shows the entity's own slug, keeping the id reachable as a tooltip", async () => {
    const port = createFakePublishContentPort({ peers: ONE_PEER, report: SELECTION_REPORT });
    await planFrom(port);

    const cell = reportRow(HELLO_WORLD).querySelectorAll("td")[2];
    expect(cell.textContent).toBe("hello-world");
    expect(cell.getAttribute("title")).toBe(HELLO_WORLD);
    // The regression this column exists to close: the full uuid was the visible text.
    expect(cell.textContent).not.toBe(HELLO_WORLD);
  });

  it("falls back to a short id, never the whole uuid, for an entity with no human name", async () => {
    const port = createFakePublishContentPort({ peers: ONE_PEER, report: SELECTION_REPORT });
    await planFrom(port);

    const cell = reportRow(UNNAMED_MEDIA).querySelectorAll("td")[2];
    expect(cell.textContent).toBe("33333333");
  });
});

describe("PublishContentDialog — per-row selection", () => {
  it("checks every publishable row by default, and offers no control on the rows it would not write", async () => {
    const port = createFakePublishContentPort({ peers: ONE_PEER, report: SELECTION_REPORT });
    await planFrom(port);

    expect(rowCheckbox(HELLO_WORLD)?.checked).toBe(true);
    expect(rowCheckbox(ABOUT_US)?.checked).toBe(true);
    expect(rowCheckbox(UNNAMED_MEDIA)?.checked).toBe(true);
    // Not a disabled checkbox — no checkbox at all, for both non-writing dispositions.
    expect(rowCheckbox("44444444-dddd-4ddd-8ddd-444444444444")).toBeNull();
    expect(rowCheckbox("55555555-eeee-4eee-8eee-555555555555")).toBeNull();
    expect(headerCheckbox().checked).toBe(true);
    expect(headerCheckbox().indeterminate).toBe(false);
  });

  it("follows the selection in the count the button commits to", async () => {
    const port = createFakePublishContentPort({ peers: ONE_PEER, report: SELECTION_REPORT });
    const user = await planFrom(port);
    expect(primaryButton().textContent).toBe("Publish 3 items");

    await user.click(rowCheckbox(ABOUT_US)!);
    expect(primaryButton().textContent).toBe("Publish 2 items");

    await user.click(rowCheckbox(UNNAMED_MEDIA)!);
    expect(primaryButton().textContent).toBe("Publish 1 item");
  });

  it("puts the header checkbox in the indeterminate state while only some rows are checked", async () => {
    const port = createFakePublishContentPort({ peers: ONE_PEER, report: SELECTION_REPORT });
    const user = await planFrom(port);

    await user.click(rowCheckbox(ABOUT_US)!);
    expect(headerCheckbox().checked).toBe(false);
    expect(headerCheckbox().indeterminate).toBe(true);
  });

  it("clears and restores the whole selection from the header checkbox", async () => {
    const port = createFakePublishContentPort({ peers: ONE_PEER, report: SELECTION_REPORT });
    const user = await planFrom(port);

    await user.click(headerCheckbox());
    expect(rowCheckbox(HELLO_WORLD)?.checked).toBe(false);
    expect(rowCheckbox(ABOUT_US)?.checked).toBe(false);
    expect(primaryButton().textContent).toBe("Nothing to publish");
    expect(primaryButton().disabled).toBe(true);

    await user.click(headerCheckbox());
    expect(rowCheckbox(HELLO_WORLD)?.checked).toBe(true);
    expect(primaryButton().textContent).toBe("Publish 3 items");
    expect(primaryButton().disabled).toBe(false);
  });

  it("publishes nothing at all while every row is unchecked", async () => {
    const port = createFakePublishContentPort({ peers: ONE_PEER, report: SELECTION_REPORT });
    const user = await planFrom(port);

    await user.click(headerCheckbox());
    await user.click(primaryButton());

    expect(port.calls.planPublish).toHaveLength(1);
    expect(port.calls.confirmPublish).toHaveLength(0);
    expect(port.calls.executePublish).toHaveLength(0);
  });
});

describe("PublishContentDialog — a deselected row never reaches the destination", () => {
  it("re-plans against only the checked rows, then confirms and executes THAT plan", async () => {
    const port = createFakePublishContentPort({ peers: ONE_PEER, report: SELECTION_REPORT });
    const user = await planFrom(port);

    await user.click(rowCheckbox(ABOUT_US)!);
    await user.click(primaryButton());
    await waitFor(() => expect(port.calls.executePublish).toHaveLength(1));

    // The narrowed plan names exactly the rows left checked — the deselected entity is not in the
    // bundle the destination is given to plan, so there is no later step that has to skip it.
    expect(port.calls.planPublish).toEqual([
      { peerId: "peer-prod" },
      { peerId: "peer-prod", selectedEntityKeys: [`post:${HELLO_WORLD}`, `media:${UNNAMED_MEDIA}`] },
    ]);
    expect(port.calls.planPublish[1].selectedEntityKeys).not.toContain(`post:${ABOUT_US}`);

    // Confirm and execute redeem the SECOND plan, not the one the operator first saw.
    expect(port.calls.confirmPublish).toEqual([
      { peerId: "peer-prod", planId: "fake-plan-narrowed", planHash: "fake-plan-hash-narrowed" },
    ]);
    expect(port.calls.executePublish).toEqual([
      { peerId: "peer-prod", bundleId: "fake-bundle-narrowed", confirmationToken: "fake-token" },
    ]);
  });

  it("drops the deselected row from the table it publishes, and stops offering checkboxes once committed", async () => {
    const port = createFakePublishContentPort({ peers: ONE_PEER, report: SELECTION_REPORT });
    // Execute is held open so the assertions below land during the `executing` phase — the window
    // where the report is still on screen and the operator has already committed. Once execute
    // resolves the dialog is `done` and the table is gone, which asserts nothing about selection.
    port.executePublish = () => new Promise(() => {});
    const user = await planFrom(port);

    await user.click(rowCheckbox(ABOUT_US)!);
    await user.click(primaryButton());
    await waitFor(() => expect(primaryButton().textContent).toBe("Publishing…"));

    expect(document.querySelector(`tr[data-entity-id="${ABOUT_US}"]`)).toBeNull();
    expect(rowCheckbox(HELLO_WORLD)?.disabled).toBe(true);
    expect(headerCheckbox().disabled).toBe(true);
  });

  it("re-plans nothing when the operator left every row checked", async () => {
    const port = createFakePublishContentPort({ peers: ONE_PEER, report: SELECTION_REPORT });
    const user = await planFrom(port);

    await user.click(primaryButton());
    await waitFor(() => expect(port.calls.executePublish).toHaveLength(1));

    expect(port.calls.planPublish).toEqual([{ peerId: "peer-prod" }]);
    expect(port.calls.confirmPublish).toEqual([{ peerId: "peer-prod", planId: "fake-plan", planHash: "fake-plan-hash" }]);
  });
});

describe("PublishContentDialog — a failure's own words reach the operator", () => {
  it("renders an EGRESS_REFUSED message verbatim, devHostAllowlist instruction and all", async () => {
    // A peer on a private address answers 502 with this sentence as `body.error`, and `request()`
    // throws it as an `ApiError` whose message IS that string. It is the operator's ONLY
    // instruction for fixing the problem, so nothing between here and the screen may rewrite it.
    const port = createFakePublishContentPort({
      peers: ONE_PEER,
      planError: new Error("this peer's host resolves to a private address; add it to devHostAllowlist (TOVU_DEV_HOST_ALLOWLIST) to reach it"),
    });
    const user = userEvent.setup();
    renderDialog(port);
    await waitFor(() => expect(port.calls.listPeers).toBe(1));

    await user.click(primaryButton());
    expect(await screen.findByText("this peer's host resolves to a private address; add it to devHostAllowlist (TOVU_DEV_HOST_ALLOWLIST) to reach it")).toBeTruthy();
  });

  it("falls back to its own copy when the failure carries no message of its own", async () => {
    // `describeApiError`'s base case: a thrown non-Error has nothing to show, and a blank error
    // notice reads as a rendering bug rather than a failure.
    const port = createFakePublishContentPort({ peers: ONE_PEER });
    port.planPublish = async () => {
      throw "not an Error at all";
    };
    const user = userEvent.setup();
    renderDialog(port);
    await waitFor(() => expect(port.calls.listPeers).toBe(1));

    await user.click(primaryButton());
    expect(await screen.findByText("Could not work out what would be published.")).toBeTruthy();
  });
});

// terra review 2026-09-20, finding 2 (High). A plan is minted by ONE peer, for the bundle that peer
// was given. Confirm and execute used to read whatever the picker said at click time, so switching
// the picker after planning sent the operator's click to a site whose report they never saw — and
// with a row unchecked, the narrowed re-plan made that a fully self-consistent plan/confirm/execute
// at the new site, which every server-side check accepts.
describe("PublishContentDialog — a plan belongs to the site it was made for (terra #2)", () => {
  const TWO_PEERS = [
    ONE_PEER[0],
    {
      id: "peer-staging",
      label: "staging.tovu.com",
      baseUrl: "https://staging.tovu.com",
      remoteWorkspaceId: "workspace-local",
      masked: null,
      hasCredential: true,
    },
  ] as const;

  async function planAgainstProduction(port: ReturnType<typeof createFakePublishContentPort>) {
    const user = userEvent.setup();
    renderDialog(port);
    const picker = await screen.findByRole("combobox");
    await user.selectOptions(picker, "peer-prod");
    await user.click(primaryButton());
    await screen.findByRole("table");
    return { user, picker };
  }

  it("switching the site after planning takes the other site's report off screen, and the next click plans the new site", async () => {
    const port = createFakePublishContentPort({ peers: TWO_PEERS, report: SELECTION_REPORT });
    const { user, picker } = await planAgainstProduction(port);

    await user.click(rowCheckbox(ABOUT_US)!);
    await user.selectOptions(picker, "peer-staging");

    expect(screen.queryByRole("table")).toBeNull();
    expect(primaryButton().textContent).toBe("Publish Content");

    await user.click(primaryButton());
    await screen.findByRole("table");
    // A full plan of the new site, for the operator to read — not production's selection carried over.
    expect(port.calls.planPublish).toEqual([{ peerId: "peer-prod" }, { peerId: "peer-staging" }]);
    expect(port.calls.confirmPublish).toEqual([]);
    expect(port.calls.executePublish).toEqual([]);
    // Every row of the new plan starts checked; production's unchecked row does not follow it.
    expect(rowCheckbox(ABOUT_US)!.checked).toBe(true);
  });

  it("the site can't be changed while its plan is still being worked out, or once the publish is committed", async () => {
    const port = createFakePublishContentPort({ peers: TWO_PEERS, report: MIXED_REPORT });
    let releasePlan: () => void = () => {};
    const heldPort = {
      ...port,
      planPublish: (input: Parameters<typeof port.planPublish>[0]) =>
        new Promise<Awaited<ReturnType<typeof port.planPublish>>>((resolve, reject) => {
          releasePlan = () => port.planPublish(input).then(resolve, reject);
        }),
      // Recorded by the fake, then held open so the assertions below land during `executing`.
      executePublish: (input: Parameters<typeof port.executePublish>[0]) => {
        void port.executePublish(input);
        return new Promise<never>(() => {});
      },
    };
    const user = userEvent.setup();
    renderDialog(heldPort as typeof port);
    const picker = await screen.findByRole("combobox");
    await user.selectOptions(picker, "peer-prod");
    expect(picker).toBeEnabled();

    await user.click(primaryButton());
    expect(primaryButton().textContent).toBe("Planning…");
    expect(picker).toBeDisabled();

    releasePlan();
    await screen.findByRole("table");
    expect(picker).toBeEnabled();

    await user.click(primaryButton());
    await waitFor(() => expect(port.calls.executePublish).toHaveLength(1));
    expect(picker).toBeDisabled();
    expect(port.calls.executePublish[0].peerId).toBe("peer-prod");
  });
  it("a plan that answers after the site was changed in the same tick is dropped, never shown against the new site", async () => {
    const port = createFakePublishContentPort({ peers: TWO_PEERS, report: MIXED_REPORT });
    const { result } = renderHook(() => usePublishContentConfirm({ onCancel: () => {}, t, port }));
    await waitFor(() => expect(result.current.peers).toHaveLength(2));
    act(() => result.current.onSelectPeer("peer-prod"));

    // One snapshot, two handlers: the picker's guard still sees the pre-click phase, so only the
    // plan's own peer check stands between production's answer and a staging-labelled report.
    const view = result.current;
    await act(async () => {
      view.onPrimary();
      view.onSelectPeer("peer-staging");
    });

    expect(port.calls.planPublish).toEqual([{ peerId: "peer-prod" }]);
    expect(result.current.selectedPeerId).toBe("peer-staging");
    expect(result.current.phase).toEqual({ kind: "idle" });
    expect(result.current.rows).toEqual([]);
  });

  it("a plan FAILURE that answers after the site was changed is dropped too — the new site did not fail", async () => {
    const port = createFakePublishContentPort({ peers: TWO_PEERS, planError: new Error("production is down") });
    const { result } = renderHook(() => usePublishContentConfirm({ onCancel: () => {}, t, port }));
    await waitFor(() => expect(result.current.peers).toHaveLength(2));
    act(() => result.current.onSelectPeer("peer-prod"));

    const view = result.current;
    await act(async () => {
      view.onPrimary();
      view.onSelectPeer("peer-staging");
    });

    expect(result.current.phase).toEqual({ kind: "idle" });
    expect(result.current.errorMessage).toBeNull();
  });
});

// terra review 2026-09-20, finding 3 (High). Once confirm is sent, the publish is the live site's to
// finish — there is no abort. Closing the dialog then cancelled nothing, and because every post-await
// update is dropped once unmounted, the operator never learned whether it published, failed, or
// what restore point it made. The three close paths are Escape, the backdrop and Cancel.
describe("PublishContentDialog — a committed publish can't be closed out from under its result (terra #3)", () => {
  function backdrop(): HTMLElement {
    const node = document.querySelector(".settings-dialog-backdrop");
    if (!node) throw new Error("the publish dialog has no backdrop");
    return node as HTMLElement;
  }

  function cancelButton(): HTMLButtonElement {
    return screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement;
  }

  /** Tries all three close paths, returning how many of them reached `onCancel`. */
  async function tryEveryWayToClose(user: ReturnType<typeof userEvent.setup>, onCancel: ReturnType<typeof vi.fn>): Promise<number> {
    const before = onCancel.mock.calls.length;
    await user.keyboard("{Escape}");
    await user.click(backdrop());
    if (!cancelButton().disabled) await user.click(cancelButton());
    return onCancel.mock.calls.length - before;
  }

  it("still closes every way while nothing is committed — before planning and with a plan on screen", async () => {
    const onCancel = vi.fn();
    const port = createFakePublishContentPort({ peers: ONE_PEER, report: MIXED_REPORT });
    const user = userEvent.setup();
    render(<PublishContentDialog onCancel={onCancel} t={t} port={port} />);
    await waitFor(() => expect(port.calls.listPeers).toBe(1));

    expect(await tryEveryWayToClose(user, onCancel)).toBe(3);
    await user.click(primaryButton());
    await screen.findByRole("table");
    expect(await tryEveryWayToClose(user, onCancel)).toBe(3);
  });

  it("refuses every close path while confirming and executing, then reports the outcome and closes normally", async () => {
    const onCancel = vi.fn();
    const port = createFakePublishContentPort({
      peers: ONE_PEER,
      report: MIXED_REPORT,
      executeResult: { restorePointId: "rp-9", runId: "run-9", changeSetIds: ["cs-1", "cs-2"] },
    });
    let releaseConfirm: () => void = () => {};
    let releaseExecute: () => void = () => {};
    let executeStarted = false;
    const heldPort = {
      ...port,
      confirmPublish: (input: Parameters<typeof port.confirmPublish>[0]) =>
        new Promise<Awaited<ReturnType<typeof port.confirmPublish>>>((resolve, reject) => {
          releaseConfirm = () => port.confirmPublish(input).then(resolve, reject);
        }),
      executePublish: (input: Parameters<typeof port.executePublish>[0]) =>
        new Promise<Awaited<ReturnType<typeof port.executePublish>>>((resolve, reject) => {
          executeStarted = true;
          releaseExecute = () => port.executePublish(input).then(resolve, reject);
        }),
    };
    const user = userEvent.setup();
    render(<PublishContentDialog onCancel={onCancel} t={t} port={heldPort as typeof port} />);
    await waitFor(() => expect(port.calls.listPeers).toBe(1));
    await user.click(primaryButton());
    await screen.findByRole("table");

    await user.click(primaryButton());
    expect(primaryButton().textContent).toBe("Publishing…");
    expect(await tryEveryWayToClose(user, onCancel)).toBe(0);
    expect(cancelButton()).toBeDisabled();

    await act(async () => releaseConfirm());
    await waitFor(() => expect(executeStarted).toBe(true));
    expect(await tryEveryWayToClose(user, onCancel)).toBe(0);
    expect(cancelButton()).toBeDisabled();

    await act(async () => releaseExecute());
    expect(await screen.findByText("Published 2 changes.")).toBeTruthy();
    expect(cancelButton()).toBeEnabled();
    expect(await tryEveryWayToClose(user, onCancel)).toBe(3);
  });
});

// terra review 2026-09-20, finding 5's sibling. The primary button is disabled from render-time
// phase, which two calls in one tick (an agent's scripted double click, say) both read as
// `planned` — so both confirmed, and each confirmed phase fired its own execute at the live site.
describe("PublishContentDialog — the primary action can't be doubled in one tick (terra #5)", () => {
  it("two confirms from the same render send one confirm and one execute", async () => {
    const port = createFakePublishContentPort({ peers: ONE_PEER, report: MIXED_REPORT });
    const { result } = renderHook(() => usePublishContentConfirm({ onCancel: () => {}, t, port }));
    await waitFor(() => expect(result.current.selectedPeerId).toBe("peer-prod"));
    await act(async () => {
      result.current.onPrimary();
    });
    await waitFor(() => expect(result.current.phase.kind).toBe("planned"));

    const view = result.current;
    await act(async () => {
      view.onPrimary();
      view.onPrimary();
    });
    await waitFor(() => expect(result.current.phase.kind).toBe("done"));

    expect(port.calls.confirmPublish).toHaveLength(1);
    expect(port.calls.executePublish).toHaveLength(1);
  });

  it("two plan requests from the same render send one plan", async () => {
    const port = createFakePublishContentPort({ peers: ONE_PEER, report: MIXED_REPORT });
    const { result } = renderHook(() => usePublishContentConfirm({ onCancel: () => {}, t, port }));
    await waitFor(() => expect(result.current.selectedPeerId).toBe("peer-prod"));

    const view = result.current;
    await act(async () => {
      view.onPrimary();
      view.onPrimary();
    });
    await waitFor(() => expect(result.current.phase.kind).toBe("planned"));
    expect(port.calls.planPublish).toHaveLength(1);
  });

  it("two connects from the same render send one connect", async () => {
    const port = createFakePublishContentPort({
      peers: [],
      destination: { connected: false, site: null, candidateUrl: "https://tovu.com", message: "Connect tovu.com?", nextStep: null },
    });
    const { result } = renderHook(() => usePublishContentConfirm({ onCancel: () => {}, t, port }));
    await waitFor(() => expect(result.current.connectOffer).not.toBeNull());

    const view = result.current;
    await act(async () => {
      view.onPrimary();
      view.onPrimary();
    });
    await waitFor(() => expect(result.current.phase.kind).toBe("planned"));
    expect(port.calls.connectDestination).toHaveLength(1);
  });
});
