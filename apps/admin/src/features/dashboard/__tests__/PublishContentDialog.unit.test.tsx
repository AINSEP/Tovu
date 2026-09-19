import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { PublishContentReport } from "@tovu/publish-content-ui";

import { PublishContentDialog } from "../PublishContentDialog";
import { createFakePublishContentPort } from "../hooks/publish-content-dependencies.hooks";

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
 * Harness follows `Dashboard.unit.test.tsx` next door (RTL, no server), except that the network is
 * replaced at the PORT rather than at `fetch`: this dialog talks to Task 10's routes, which do not
 * exist yet, so there is no URL to mock — see `hooks/publish-content-port.hooks.ts`.
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

  it("never sends the conflicted entity anywhere — execute carries only the token", async () => {
    const port = createFakePublishContentPort({ peers: ONE_PEER, report: MIXED_REPORT });
    const user = await planFrom(port);

    await user.click(primaryButton());
    await waitFor(() => expect(port.calls.executePublish).toHaveLength(1));
    expect(port.calls.executePublish[0]).toEqual({ peerId: "peer-prod", confirmationToken: "fake-token" });
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
      confirmationToken: "tok-from-server",
      executeResult: { restorePointId: "rp-9", changeSetIds: ["cs-1", "cs-2"] },
    });
    const user = await planFrom(port);

    await user.click(primaryButton());
    await waitFor(() => expect(port.calls.executePublish).toHaveLength(1));

    expect(port.calls.confirmPublish).toEqual([{ peerId: "peer-prod", planId: "fake-plan", planHash: "fake-plan-hash" }]);
    expect(port.calls.executePublish).toEqual([{ peerId: "peer-prod", confirmationToken: "tok-from-server" }]);
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

  it("cannot plan at all with no peer configured, and says what to do", async () => {
    const port = createFakePublishContentPort({ peers: [] });
    renderDialog(port);

    await screen.findByText("No publish target is configured yet. Add one in Settings first.");
    expect(primaryButton().disabled).toBe(true);
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
