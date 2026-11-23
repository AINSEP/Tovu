import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { useStaticPublish } from "../use-static-publish.hooks";
import { useStaticPublishProjectName } from "../static-publish-project-name.hooks";
import { createFakeStaticPublishPort } from "../static-publish-dependencies.hooks";
import { PUBLISH_TARGETS } from "../../__tests__/publish-targets.fixture";
import type { AdminPublishDestination } from "@/features/deployment/api/deployment-api.types";

/**
 * @file A340 — the Static Site tab's project-name field starts from the owner's last publish.
 * Before the fix the field was `useState("")` and never seeded, so an owner who had already
 * published to Vercel as `acme` was asked to retype `acme` on every visit even though the server's
 * publish history (`GET .../system/publish/destinations`) already held it. Same injected-port shape
 * as `use-static-publish.unit.test.tsx`; this file owns only the seeding rules.
 */

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

const fakeT = (key: string): string => key;
const fakeLocale = "en";

function staticDestination(overrides: Partial<Extract<AdminPublishDestination, { kind: "static" }>> = {}): AdminPublishDestination {
  return {
    id: "static:vercel:acme",
    kind: "static",
    lastPublishedAt: "2026-11-01T00:00:00.000Z",
    label: "Vercel: acme",
    url: "https://acme.vercel.app",
    target: "vercel",
    projectName: "acme",
    configFields: {},
    ...overrides,
  };
}

/** The fake port, listing the fixture's targets and the given publish history. */
function portWith(destinations: AdminPublishDestination[] | Promise<AdminPublishDestination[]>) {
  return createFakeStaticPublishPort({
    listPublishTargets: () => Promise.resolve([...PUBLISH_TARGETS]),
    listPublishDestinations: () => Promise.resolve(destinations),
  });
}

async function renderForm(port: ReturnType<typeof portWith>) {
  const rendered = renderHook(() => useStaticPublish({ port, t: fakeT, locale: fakeLocale }), { wrapper });
  await waitFor(() => expect(rendered.result.current.run !== undefined && rendered.result.current.targets !== undefined).toBe(true));
  return rendered;
}

describe("useStaticPublish — project name starts from the last publish", () => {
  it("shows the project name the last publish to the selected host used", async () => {
    const { result } = await renderForm(portWith([staticDestination()]));
    act(() => result.current.setTarget("vercel"));

    await waitFor(() => expect(result.current.projectName).toBe("acme"));
    expect(result.current.canPublish).toBe(true);
  });

  it("prefers the newest publish to that host and ignores other hosts, peers and deploys", async () => {
    const { result } = await renderForm(
      portWith([
        { id: "peer:1", kind: "tovu-peer", peerId: "p1", label: "Peer", url: "https://peer.example", lastPublishedAt: "2026-11-05T00:00:00.000Z" },
        staticDestination({ id: "static:netlify:other", target: "netlify", projectName: "other-site", lastPublishedAt: "2026-11-04T00:00:00.000Z" }),
        staticDestination({ projectName: "acme-new", lastPublishedAt: "2026-11-03T00:00:00.000Z" }),
        staticDestination({ id: "static:vercel:acme-old", projectName: "acme-old", lastPublishedAt: "2026-10-01T00:00:00.000Z" }),
      ])
    );
    act(() => result.current.setTarget("vercel"));

    await waitFor(() => expect(result.current.projectName).toBe("acme-new"));
  });

  it("follows the host the owner switches to until they type", async () => {
    const { result } = await renderForm(
      portWith([staticDestination(), staticDestination({ id: "static:netlify:site", target: "netlify", projectName: "acme-site" })])
    );
    act(() => result.current.setTarget("vercel"));
    await waitFor(() => expect(result.current.projectName).toBe("acme"));

    act(() => result.current.setTarget("netlify"));
    expect(result.current.projectName).toBe("acme-site");
  });

  it("leaves the field blank when the selected host was never published to", async () => {
    const { result } = await renderForm(portWith([staticDestination({ target: "vercel" })]));
    await waitFor(() => expect(result.current.projectName).toBe(""));
    expect(result.current.target).toBe("github-pages");
  });

  it("never overwrites what the owner typed, even when the history arrives after they typed", async () => {
    let resolveHistory: (rows: AdminPublishDestination[]) => void = () => undefined;
    const history = new Promise<AdminPublishDestination[]>((resolve) => {
      resolveHistory = resolve;
    });
    const port = portWith(history);
    // `untouched` shares the form's query cache (same key) but has no typed text, so its value
    // proves the history really arrived before the assertion on the form below: without it, "still
    // typed-by-owner" would also hold if the response had simply not been applied yet.
    const { result } = renderHook(
      () => ({ form: useStaticPublish({ port, t: fakeT, locale: fakeLocale }), untouched: useStaticPublishProjectName({ port, target: "vercel" }) }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.form.run !== undefined && result.current.form.targets !== undefined).toBe(true));
    act(() => result.current.form.setTarget("vercel"));
    act(() => result.current.form.setProjectName("typed-by-owner"));
    expect(result.current.untouched.projectName).toBe("");

    await act(async () => {
      resolveHistory([staticDestination()]);
      await history;
    });
    await waitFor(() => expect(result.current.untouched.projectName).toBe("acme"));

    expect(result.current.form.projectName).toBe("typed-by-owner");
  });

  it("keeps an owner's deliberately cleared field empty instead of refilling it from history", async () => {
    const { result } = await renderForm(portWith([staticDestination()]));
    act(() => result.current.setTarget("vercel"));
    await waitFor(() => expect(result.current.projectName).toBe("acme"));

    act(() => result.current.setProjectName(""));

    expect(result.current.projectName).toBe("");
  });

  it("sends the seeded project name when the owner publishes without retyping it", async () => {
    const triggered: Array<{ projectName: string }> = [];
    const port = createFakeStaticPublishPort({
      listPublishTargets: () => Promise.resolve([...PUBLISH_TARGETS]),
      listPublishDestinations: () => Promise.resolve([staticDestination()]),
      triggerPublish: (input) => {
        triggered.push({ projectName: input.projectName });
        return Promise.resolve({ status: "running", startedAtIso: "t0", finishedAtIso: null, target: "vercel" });
      },
    });
    const { result } = await renderForm(port);
    act(() => result.current.setTarget("vercel"));
    await waitFor(() => expect(result.current.projectName).toBe("acme"));

    await act(async () => {
      await result.current.publish();
    });

    expect(triggered).toEqual([{ projectName: "acme" }]);
  });

  it("starts blank, without an error, when the publish history cannot be read", async () => {
    const port = createFakeStaticPublishPort({
      listPublishTargets: () => Promise.resolve([...PUBLISH_TARGETS]),
      listPublishDestinations: () => Promise.reject(new Error("history unavailable")),
    });
    const { result } = await renderForm(port);
    act(() => result.current.setTarget("vercel"));

    expect(result.current.projectName).toBe("");
    expect(result.current.targetsError).toBeNull();
    expect(result.current.loadError).toBeNull();
  });
});
