import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { PublishContentReport } from "@tovu/publish-content-ui";

import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import type { AdminPublishDestination, AdminPublishRunSnapshot } from "@/lib/api";
import { createFakeStaticPublishPort } from "../../deployment/hooks/static-publish-dependencies.hooks";
import type { StaticPublishPort } from "../../deployment/hooks/static-publish-port.hooks";
import { createFakePublishContentPort, type FakePublishContentPortOptions } from "../../publish-content/hooks/publish-content-dependencies.hooks";
import { closePublishRequest, usePublishRequest } from "../../publish-content/hooks/publish-request.store";
import { SitePublishButton } from "../SitePublishButton";
import { createFakeSitePublishPort, type SitePublishPort } from "../hooks/site-publish-dependencies.hooks";
import { useSitePublish } from "../hooks/use-site-publish.hooks";
import { t as sitesT } from "../sites-i18n";
import {
  destinationAction,
  destinationPeerId,
  peerPlanDecision,
  relativePublishedTime,
  skippedAfterPublish,
  type SitePublishPermissions,
} from "../site-publish-rules";

/**
 * @file The Sites Export tab's Publish button: its pure rules, and the panel rendered over the real
 * controller with fake destinations, static-publish and publish-content ports. No real host is
 * ever reached: every publish lands on a fake.
 */

const t = (key: string): string => key;
const NOW = Date.parse("2026-10-18T12:00:00.000Z");
const ALL: SitePublishPermissions = { known: true, canPublishStatic: true, canPublishContent: true };

const staticRow: AdminPublishDestination = {
  id: "static:host-a:blog",
  kind: "static",
  lastPublishedAt: "2026-10-16T12:00:00.000Z",
  label: "Host A: blog",
  url: "https://blog.example.test",
  target: "host-a",
  projectName: "blog",
  credentialId: "cred-1",
  configFields: { teamId: "team-9" },
};
const peerRow: AdminPublishDestination = {
  id: "tovu-peer:peer-1",
  kind: "tovu-peer",
  peerId: "peer-1",
  label: "live.example.test",
  url: "https://live.example.test",
  lastPublishedAt: "2026-10-18T11:00:00.000Z",
};
const linkedDeploy: AdminPublishDestination = {
  id: "deploy:host-b:app",
  kind: "deploy",
  status: "confirmed",
  target: "host-b",
  label: "app",
  url: "https://app.example.test",
  lastPublishedAt: "2026-10-10T12:00:00.000Z",
  linkedPeerId: "peer-2",
};
const pendingDeploy: AdminPublishDestination = {
  id: "deploy:host-b:other",
  kind: "deploy",
  status: "started",
  statusMessage: "Deploy started, not confirmed",
  target: "host-b",
  label: "other",
  url: "https://other.example.test",
  lastPublishedAt: "2026-10-09T12:00:00.000Z",
};

function report(outcomes: Array<"created" | "unchanged" | "conflict">, refused = false): PublishContentReport {
  return {
    refused,
    refusalReason: refused ? "Content versions differ." : null,
    applyOrder: [],
    rows: outcomes.map((outcome, index) => ({
      entityType: "page",
      entityId: `p${index}`,
      entityLabel: `page-${index}`,
      outcome,
      writes: outcome === "created",
      reason: outcome === "conflict" ? "changed on live since the last publish" : null,
    })),
  } as PublishContentReport;
}

function renderPanel(input: {
  destinations?: AdminPublishDestination[];
  port?: Partial<SitePublishPort>;
  staticPort?: StaticPublishPort;
  peer?: FakePublishContentPortOptions;
  liveAvailable?: boolean;
} = {}) {
  let listCalls = 0;
  const port = createFakeSitePublishPort({
    listDestinations: () => {
      listCalls += 1;
      return Promise.resolve(input.destinations ?? []);
    },
    ...input.port,
  });
  const staticPort = input.staticPort ?? createFakeStaticPublishPort();
  const peerPort = createFakePublishContentPort(input.peer);
  render(
    <FetchQueryProvider>
      <SitePublishButton
        t={t}
        usePublish={({ t: tr }) => useSitePublish({ port, staticPort, peerPort, t: tr, locale: "en", liveAvailable: input.liveAvailable ?? true }, { now: () => NOW })}
      />
    </FetchQueryProvider>,
  );
  return { peerPort, listCalls: () => listCalls };
}

async function openPanel() {
  fireEvent.click(screen.getByRole("button", { name: "Publish" }));
  return screen.findByRole("region", { name: "Publish destinations" });
}

function row(panel: HTMLElement, label: string): HTMLElement {
  return within(panel).getByText(label).closest("li")!;
}

afterEach(() => closePublishRequest());

describe("createFakeSitePublishPort", () => {
  it("defaults to an empty destination list and a viewer allowed to publish both ways", async () => {
    const port = createFakeSitePublishPort();
    await expect(port.listDestinations()).resolves.toEqual([]);
    await expect(port.me()).resolves.toEqual({ effectivePermissions: ["system.publish", "publish_content.apply"] });
  });
});

describe("site publish rules", () => {
  it("offers publish, connect or nothing from the row kind and the viewer's permissions", () => {
    expect(destinationAction({ destination: staticRow, permissions: ALL, liveAvailable: true })).toBe("publish");
    expect(destinationAction({ destination: peerRow, permissions: ALL, liveAvailable: true })).toBe("publish");
    expect(destinationAction({ destination: linkedDeploy, permissions: ALL, liveAvailable: true })).toBe("publish");
    expect(destinationAction({ destination: pendingDeploy, permissions: ALL, liveAvailable: true })).toBe("connect");
    // Unknown permissions never offer an action.
    expect(destinationAction({ destination: staticRow, permissions: { ...ALL, known: false }, liveAvailable: true })).toBeNull();
    expect(destinationAction({ destination: staticRow, permissions: { ...ALL, canPublishStatic: false }, liveAvailable: true })).toBeNull();
    expect(destinationAction({ destination: peerRow, permissions: { ...ALL, canPublishStatic: false }, liveAvailable: true })).toBe("publish");
    expect(destinationAction({ destination: peerRow, permissions: { ...ALL, canPublishContent: false }, liveAvailable: true })).toBeNull();
    expect(destinationAction({ destination: pendingDeploy, permissions: { ...ALL, canPublishContent: false }, liveAvailable: true })).toBeNull();
    // The live site cannot publish content anywhere.
    expect(destinationAction({ destination: peerRow, permissions: ALL, liveAvailable: false })).toBeNull();
    expect(destinationAction({ destination: staticRow, permissions: ALL, liveAvailable: false })).toBe("publish");
  });

  it("finds the peer a row publishes content to", () => {
    expect(destinationPeerId(peerRow)).toBe("peer-1");
    expect(destinationPeerId(linkedDeploy)).toBe("peer-2");
    expect(destinationPeerId(pendingDeploy)).toBeNull();
    expect(destinationPeerId(staticRow)).toBeNull();
  });

  it("reads publish times relative to now in the viewer's locale", () => {
    expect(relativePublishedTime({ iso: "2026-10-16T12:00:00.000Z", nowMs: NOW, locale: "en" })).toBe("2 days ago");
    expect(relativePublishedTime({ iso: "2026-10-18T11:00:00.000Z", nowMs: NOW, locale: "en" })).toBe("1 hour ago");
    expect(relativePublishedTime({ iso: "2026-10-18T11:59:50.000Z", nowMs: NOW, locale: "en" })).toBe("this minute");
    expect(relativePublishedTime({ iso: "2026-10-16T12:00:00.000Z", nowMs: NOW, locale: "de" })).toBe("vorgestern");
    expect(relativePublishedTime({ iso: "not a date", nowMs: NOW, locale: "en" })).toBe("not a date");
  });

  it("decides a whole-site plan without forcing conflicts", () => {
    expect(peerPlanDecision({ details: report([], true) })).toEqual({ kind: "refused", reason: "Content versions differ." });
    expect(peerPlanDecision({ details: report(["unchanged", "conflict"]) })).toEqual({ kind: "nothing", skipped: 1 });
    expect(peerPlanDecision({ details: report(["created", "conflict", "unchanged"]) })).toEqual({ kind: "publish", skipped: 1 });
    expect(skippedAfterPublish({ plan: report(["created", "conflict"]) })).toBe(1);
    expect(skippedAfterPublish({ plan: report(["created", "conflict"]), executed: report(["conflict", "conflict"]) })).toBe(2);
  });
});

describe("SitePublishButton", () => {
  it("lists nothing and ships nothing until opened, and never ships on open even with one destination", async () => {
    let triggers = 0;
    const staticPort = createFakeStaticPublishPort({ triggerPublish: () => { triggers += 1; return Promise.resolve({ status: "running", startedAtIso: null, finishedAtIso: null, target: "host-a" }); } });
    const { listCalls, peerPort } = renderPanel({ destinations: [staticRow], staticPort });
    expect(listCalls()).toBe(0);
    const panel = await openPanel();
    expect(await within(panel).findByText("Host A: blog")).toBeTruthy();
    expect(listCalls()).toBe(1);
    expect(triggers).toBe(0);
    expect(peerPort.calls.planPublish).toHaveLength(0);
  });

  it("shows each destination's label, url, kind badge, relative time and pending deploy state", async () => {
    renderPanel({ destinations: [peerRow, staticRow, pendingDeploy] });
    const panel = await openPanel();
    const labels = await within(panel).findAllByText(/^(live\.example\.test|Host A: blog|other)$/);
    expect(labels.map((node) => node.textContent)).toEqual(["live.example.test", "Host A: blog", "other"]);
    const staticItem = row(panel, "Host A: blog");
    expect(within(staticItem).getByText("Static site")).toBeTruthy();
    expect(within(staticItem).getByText("Last published 2 days ago")).toBeTruthy();
    expect(within(staticItem).getByRole("link", { name: "https://blog.example.test" }).getAttribute("href")).toBe("https://blog.example.test");
    expect(within(row(panel, "live.example.test")).getByText("Tovu site")).toBeTruthy();
    const pending = row(panel, "other");
    expect(within(pending).getByText("Deploy")).toBeTruthy();
    expect(within(pending).getByText("Deploy started, not confirmed")).toBeTruthy();
    expect(within(pending).getByRole("button", { name: "Connect other" })).toBeTruthy();
  });

  it("guides an empty list to the publish setup screen", async () => {
    renderPanel({ destinations: [] });
    const panel = await openPanel();
    expect(await within(panel).findByText(/Nothing published yet/)).toBeTruthy();
    expect(within(panel).getByRole("link", { name: "Set up publishing" }).getAttribute("href")).toMatch(/\/deployment\?tab=static-site$/);
  });

  it("reports a failed destinations read", async () => {
    renderPanel({ port: { listDestinations: () => Promise.reject(new Error("boom")) } });
    const panel = await openPanel();
    expect((await within(panel).findByRole("alert")).textContent).toMatch(/boom|Could not load publish destinations/);
  });

  it("replays a static destination with its saved target, project, config and connection, then shows the result", async () => {
    const sent: unknown[] = [];
    const done: AdminPublishRunSnapshot = {
      status: "completed", startedAtIso: "x", finishedAtIso: "2026-10-18T12:01:00.000Z", target: "host-a",
      result: { ok: true, targetId: "host-a", url: "https://blog.example.test/new", status: "ready" },
    };
    let statusReads = 0;
    const staticPort = createFakeStaticPublishPort({
      triggerPublish: (input) => { sent.push(input); return Promise.resolve({ status: "running", startedAtIso: "x", finishedAtIso: null, target: "host-a" }); },
      getPublishStatus: () => { statusReads += 1; return Promise.resolve(statusReads === 1 ? { status: "idle", startedAtIso: null, finishedAtIso: null, target: null } : done); },
    });
    const { listCalls } = renderPanel({ destinations: [staticRow], staticPort });
    const panel = await openPanel();
    const item = await within(panel).findByText("Host A: blog").then((node) => node.closest("li")!);
    fireEvent.click(within(item).getByRole("button", { name: "Publish to Host A: blog" }));
    expect(sent).toEqual([{ config: { target: "host-a", fields: { teamId: "team-9" } }, projectName: "blog", credentialId: "cred-1" }]);
    expect(await within(item).findByRole("button", { name: "Publish to Host A: blog" })).toHaveProperty("disabled", true);
    const link = await within(item).findByRole("link", { name: "https://blog.example.test/new" }, { timeout: 4000 });
    expect(link.closest("p")!.textContent).toMatch(/^Published:/);
    await waitFor(() => expect(listCalls()).toBe(2));
    fireEvent.keyDown(document, { key: "Escape" });
    const reopened = await openPanel();
    await within(reopened).findByText("Host A: blog");
    expect(within(reopened).queryByRole("status")).toBeNull();
  });

  it("pushes content to a Tovu peer through plan, confirm and execute, with no forced overwrite", async () => {
    const { peerPort } = renderPanel({ destinations: [peerRow], peer: { report: report(["created"]) } });
    const panel = await openPanel();
    const item = await within(panel).findByText("live.example.test").then((node) => node.closest("li")!);
    fireEvent.click(within(item).getByRole("button", { name: "Publish to live.example.test" }));
    expect(await within(item).findByRole("link", { name: "https://live.example.test" }, { timeout: 2000 }).then(() => true)).toBe(true);
    expect(peerPort.calls.planPublish).toEqual([{ peerId: "peer-1" }]);
    expect(peerPort.calls.confirmPublish).toEqual([{ peerId: "peer-1", planId: "fake-plan", planHash: "fake-plan-hash" }]);
    expect(peerPort.calls.executePublish).toEqual([{ peerId: "peer-1", bundleId: "fake-bundle", confirmationToken: "fake-token" }]);
    expect(within(item).getByRole("status").textContent).toMatch(/^Published:/);
  });

  it("publishes a linked deploy's content to its peer", async () => {
    const { peerPort } = renderPanel({ destinations: [linkedDeploy], peer: { report: report(["created"]) } });
    const panel = await openPanel();
    fireEvent.click(await within(panel).findByRole("button", { name: "Publish to app" }));
    await waitFor(() => expect(peerPort.calls.executePublish).toHaveLength(1));
    expect(peerPort.calls.planPublish).toEqual([{ peerId: "peer-2" }]);
  });

  it("skips conflicts, never forces them, and offers the full Publish dialog to review them", async () => {
    function OpenRequestProbe() {
      return <span data-testid="open-request">{usePublishRequest() ? "open" : "closed"}</span>;
    }
    const { peerPort } = renderPanel({ destinations: [peerRow], peer: { report: report(["created", "conflict"]) } });
    render(<OpenRequestProbe />);
    const panel = await openPanel();
    fireEvent.click(await within(panel).findByRole("button", { name: "Publish to live.example.test" }));
    const review = await within(panel).findByRole("button", { name: "Review in Publish" });
    expect(within(panel).getByText(/1 skipped: changed on the live site\./)).toBeTruthy();
    expect(peerPort.calls.planPublish[0]).not.toHaveProperty("overwriteEntityKeys");
    expect(peerPort.calls.executePublish[0]).not.toHaveProperty("overwriteEntityKeys");
    fireEvent.click(review);
    expect(screen.getByTestId("open-request").textContent).toBe("open");
    expect(screen.queryByRole("region", { name: "Publish destinations" })).toBeNull();
  });

  it("stops before confirm when there is nothing to publish or the plan is refused", async () => {
    const upToDate = renderPanel({ destinations: [peerRow], peer: { report: report(["unchanged"]) } });
    let panel = await openPanel();
    fireEvent.click(await within(panel).findByRole("button", { name: "Publish to live.example.test" }));
    expect(await within(panel).findByText("Already up to date.")).toBeTruthy();
    expect(upToDate.peerPort.calls.confirmPublish).toHaveLength(0);
    document.body.innerHTML = "";

    const refused = renderPanel({ destinations: [peerRow], peer: { report: report([], true) } });
    panel = await openPanel();
    fireEvent.click(await within(panel).findByRole("button", { name: "Publish to live.example.test" }));
    expect(await within(panel).findByText("Content versions differ.")).toBeTruthy();
    expect(refused.peerPort.calls.confirmPublish).toHaveLength(0);
  });

  it("shows a push failure inline on its row", async () => {
    renderPanel({ destinations: [peerRow], peer: { report: report(["created"]), executeError: new Error("restore point unavailable") } });
    const panel = await openPanel();
    fireEvent.click(await within(panel).findByRole("button", { name: "Publish to live.example.test" }));
    expect(await within(panel).findByText(/restore point unavailable|Could not publish\./)).toBeTruthy();
  });

  it("disables every row while one run is in flight", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const base = createFakePublishContentPort({ report: report(["created"]) });
    const port = createFakeSitePublishPort({ listDestinations: () => Promise.resolve([peerRow, staticRow, pendingDeploy]) });
    render(
      <FetchQueryProvider>
        <SitePublishButton t={t} usePublish={({ t: tr }) => useSitePublish({
          port,
          staticPort: createFakeStaticPublishPort(),
          peerPort: { ...base, planPublish: async (input) => { await gate; return base.planPublish(input); } },
          t: tr,
          locale: "en",
          liveAvailable: true,
        })} />
      </FetchQueryProvider>,
    );
    let panel = await openPanel();
    fireEvent.click(await within(panel).findByRole("button", { name: "Publish to live.example.test" }));
    await waitFor(() => expect(within(panel).getByRole("button", { name: "Publish to Host A: blog" })).toHaveProperty("disabled", true));
    expect(within(panel).getByRole("button", { name: "Publish to live.example.test" }).textContent).toBe("Publishing…");
    expect(within(panel).getByRole("button", { name: "Connect other" })).toHaveProperty("disabled", true);
    fireEvent.keyDown(document, { key: "Escape" });
    panel = await openPanel();
    expect(within(panel).getByRole("button", { name: "Publish to live.example.test" }).textContent).toBe("Publishing…");
    expect(within(panel).getByRole("button", { name: "Connect other" })).toHaveProperty("disabled", true);
    await act(async () => { release(); await gate; });
    await waitFor(() => expect(within(panel).getByRole("button", { name: "Publish to Host A: blog" })).toHaveProperty("disabled", false));
  });

  it("clears the result of a publish that settles while the panel is closed", async () => {
    let finish!: (run: AdminPublishRunSnapshot) => void;
    const pending = new Promise<AdminPublishRunSnapshot>((resolve) => { finish = resolve; });
    renderPanel({ destinations: [staticRow], staticPort: createFakeStaticPublishPort({ triggerPublish: () => pending }) });
    const panel = await openPanel();
    fireEvent.click(await within(panel).findByRole("button", { name: "Publish to Host A: blog" }));
    expect(within(panel).getByRole("button", { name: "Publish to Host A: blog" }).textContent).toBe("Publishing…");
    fireEvent.keyDown(document, { key: "Escape" });
    await act(async () => {
      finish({ status: "completed", startedAtIso: "x", finishedAtIso: "2026-10-18T12:01:00.000Z", target: "host-a",
        result: { ok: true, targetId: "host-a", url: "https://blog.example.test/new", status: "ready" } });
      await pending;
    });
    const reopened = await openPanel();
    await within(reopened).findByText("Host A: blog");
    expect(within(reopened).queryByRole("status")).toBeNull();
    expect(within(reopened).getByRole("button", { name: "Publish to Host A: blog" })).toHaveProperty("disabled", false);
  });

  it("fetches exactly once on each open, including a quick reopen with fresh cached data", async () => {
    const { listCalls } = renderPanel({ destinations: [peerRow] });
    let panel = await openPanel();
    await within(panel).findByText("live.example.test");
    await act(async () => {});
    expect(listCalls()).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    panel = await openPanel();
    await waitFor(() => expect(listCalls()).toBe(2));
    await act(async () => {});
    expect(within(panel).getByText("live.example.test")).toBeTruthy();
    expect(listCalls()).toBe(2);
  });

  it.each(["result", "error"])("clears a settled %s when closed", async (outcome) => {
    renderPanel({ destinations: [peerRow], peer: { report: report([], outcome === "error") } });
    let panel = await openPanel();
    fireEvent.click(await within(panel).findByRole("button", { name: "Publish to live.example.test" }));
    await within(panel).findByText(outcome === "error" ? "Content versions differ." : "Already up to date.");
    fireEvent.keyDown(document, { key: "Escape" });
    panel = await openPanel();
    await within(panel).findByText("live.example.test");
    expect(within(panel).queryByRole("status")).toBeNull();
  });

  it.each([{ cached: [] }, { cached: [peerRow] }])("shows a refresh failure instead of cached empty or stale destinations and retries", async ({ cached }) => {
    let calls = 0;
    renderPanel({ port: { listDestinations: async () => {
      calls += 1;
      if (calls === 2) throw new Error("destinations offline");
      return cached;
    } } });
    let panel = await openPanel();
    await within(panel).findByText(cached.length ? "live.example.test" : /Nothing published yet/);
    fireEvent.keyDown(document, { key: "Escape" });
    panel = await openPanel();
    expect((await within(panel).findByRole("alert")).textContent).toContain("destinations offline");
    expect(within(panel).queryByText(/Nothing published yet/)).toBeNull();
    expect(within(panel).queryByText("live.example.test")).toBeNull();
    fireEvent.click(within(panel).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(within(panel).queryByRole("alert")).toBeNull());
    expect(calls).toBe(3);
    expect(within(panel).getByText(cached.length ? "live.example.test" : /Nothing published yet/)).toBeTruthy();
  });

  it("hides actions the viewer cannot run", async () => {
    renderPanel({
      destinations: [staticRow, peerRow],
      port: { me: () => Promise.resolve({ effectivePermissions: ["system.read", "publish_content.read"] }) },
    });
    const panel = await openPanel();
    await within(panel).findByText("Host A: blog");
    await waitFor(() => expect(within(panel).queryAllByRole("button")).toHaveLength(0));
  });

  it("closes on Escape and returns focus to the button", async () => {
    renderPanel({ destinations: [] });
    await openPanel();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "Publish destinations" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Publish" }));
    expect(screen.getByRole("button", { name: "Publish" }).getAttribute("aria-expanded")).toBe("false");
  });
});

describe("useSitePublish controller", () => {
  function renderController(input: { destinations: AdminPublishDestination[]; staticPort?: StaticPublishPort; peer?: FakePublishContentPortOptions }) {
    const port = createFakeSitePublishPort({ listDestinations: () => Promise.resolve(input.destinations) });
    const peerPort = createFakePublishContentPort(input.peer);
    const staticPort = input.staticPort ?? createFakeStaticPublishPort();
    const hook = renderHook(
      () => useSitePublish({ port, staticPort, peerPort, t, locale: "en", liveAvailable: true }, { now: () => NOW }),
      { wrapper: FetchQueryProvider },
    );
    return { hook, peerPort };
  }

  async function openController(hook: ReturnType<typeof renderController>["hook"]) {
    act(() => hook.result.current.toggle());
    await waitFor(() => expect(hook.result.current.status).toBe("ready"));
  }

  it("ignores a publish for a row it never listed, and a same-tick second push of one row", async () => {
    const { hook, peerPort } = renderController({ destinations: [peerRow], peer: { report: report(["created"]) } });
    await openController(hook);
    act(() => hook.result.current.publish("no-such-row"));
    expect(peerPort.calls.planPublish).toHaveLength(0);
    act(() => {
      hook.result.current.publish(peerRow.id);
      hook.result.current.publish(peerRow.id);
    });
    await waitFor(() => expect(hook.result.current.rows[0]?.state?.kind).toBe("done"));
    expect(peerPort.calls.planPublish).toEqual([{ peerId: "peer-1" }]);
    expect(peerPort.calls.confirmPublish).toHaveLength(1);
  });

  it("falls back to a generic refusal message when the peer refuses without a reason", async () => {
    const { hook, peerPort } = renderController({ destinations: [peerRow], peer: { report: { ...report([], true), refusalReason: null } } });
    await openController(hook);
    act(() => hook.result.current.publish(peerRow.id));
    await waitFor(() => expect(hook.result.current.rows[0]?.state).toEqual({ kind: "error", message: "Publishing was refused." }));
    expect(peerPort.calls.confirmPublish).toHaveLength(0);
  });

  it("replays a static destination that saved no connection without naming a credential", async () => {
    const sent: unknown[] = [];
    const { credentialId: _saved, ...noCredential } = staticRow as Extract<AdminPublishDestination, { kind: "static" }>;
    const staticPort = createFakeStaticPublishPort({
      triggerPublish: (request) => { sent.push(request); return Promise.resolve({ status: "completed", startedAtIso: "x", finishedAtIso: "y", target: "host-a" }); },
    });
    const { hook } = renderController({ destinations: [noCredential], staticPort });
    await openController(hook);
    act(() => hook.result.current.publish(noCredential.id));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent).toEqual([{ config: { target: "host-a", fields: { teamId: "team-9" } }, projectName: "blog" }]);
    expect(sent[0]).not.toHaveProperty("credentialId");
  });

  it("shows a failed static trigger as an error on its row", async () => {
    const staticPort = createFakeStaticPublishPort({ triggerPublish: () => Promise.reject(new Error("host refused the upload")) });
    const { hook } = renderController({ destinations: [staticRow], staticPort });
    await openController(hook);
    act(() => hook.result.current.publish(staticRow.id));
    await waitFor(() => expect(hook.result.current.rows[0]?.state?.kind).toBe("error"));
    const state = hook.result.current.rows[0]?.state as { kind: "error"; message: string };
    expect(state.message).toContain("host refused the upload");
    expect(hook.result.current.busy).toBe(false);
  });

  it("shows no row state for a triggered static run that has neither finished nor started running", async () => {
    const staticPort = createFakeStaticPublishPort({
      triggerPublish: () => Promise.resolve({ status: "idle", startedAtIso: null, finishedAtIso: null, target: "host-a" }),
    });
    const { hook } = renderController({ destinations: [staticRow], staticPort });
    await openController(hook);
    act(() => hook.result.current.publish(staticRow.id));
    await waitFor(() => expect(hook.result.current.busy).toBe(false));
    expect(hook.result.current.rows[0]?.state).toBeNull();
  });

  it("shows a static run whose status polling gave up as an error on its row", async () => {
    let reads = 0;
    const staticPort = createFakeStaticPublishPort({
      triggerPublish: () => Promise.resolve({ status: "running", startedAtIso: "x", finishedAtIso: null, target: "host-a" }),
      getPublishStatus: () => {
        reads += 1;
        if (reads === 1) return Promise.resolve({ status: "idle", startedAtIso: null, finishedAtIso: null, target: null });
        return Promise.reject(new Error("status endpoint down"));
      },
    });
    const { hook } = renderController({ destinations: [staticRow], staticPort });
    await openController(hook);
    act(() => hook.result.current.publish(staticRow.id));
    await waitFor(() => expect(hook.result.current.rows[0]?.state?.kind).toBe("error"), { timeout: 8000 });
    const state = hook.result.current.rows[0]?.state as { kind: "error"; message: string };
    expect(state.message).toContain("status endpoint down");
  }, 12000);
});

describe("site publish copy", () => {
  it("carries every Publish key in all 21 locales", async () => {
    const { SITE_PUBLISH_DICT } = await import("../site-publish-i18n");
    const locales = Object.keys(SITE_PUBLISH_DICT);
    expect(locales).toHaveLength(21);
    const keys = Object.keys(SITE_PUBLISH_DICT.de!).sort();
    for (const locale of locales) expect(Object.keys(SITE_PUBLISH_DICT[locale]!).sort()).toEqual(keys);
  });

  it("is merged into the Sites translator", () => {
    // Mutation: drop the SITE_PUBLISH_DICT merge loop; these fall back to English.
    expect(sitesT({ locale: "de", key: "Last published {when}" })).toBe("Zuletzt veröffentlicht {when}");
    expect(sitesT({ locale: "ja", key: "Review in Publish" })).toBe("公開画面で確認");
    expect(sitesT({ locale: "fr", key: "Deploy started, not confirmed" })).toBe("Déploiement lancé, non confirmé");
  });
});
