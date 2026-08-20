import { Profiler, type ProfilerOnRenderCallback } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "../lib/fetch-query";
import { Redirects } from "../features/redirects/Redirects";
import { useWiredTaxonomy } from "../features/taxonomy/hooks/use-taxonomy.hooks";

/**
 * @file Measurement instrument — deliverable C of the request-volume follow-up
 * (TM-TOVU-2026-08-12-A: did `lib/fetch-query` actually reduce request volume, or just move it?).
 * MEASUREMENT-ONLY, NOT a correctness test — companion to `request-volume.measurement.test.tsx`
 * (same audit, same "commit it so it isn't paid for twice" reasoning). Run with:
 * `cd apps/admin && npx vitest run src/__measurements__/render-churn.measurement.test.tsx --reporter=verbose`
 * — the `MEASURE\t...` lines in stdout are the actual data; the `expect()` calls are load-bearing
 * assertions on the one number that matters (cross-key re-render isolation), not decoration.
 *
 * Grep across `apps/admin/src`, `Jini/packages/admin/src`, and `Jini/packages/ui/src` found ZERO
 * uses of `React.memo`/`memo()`/`PureComponent` anywhere in this app's actual render path
 * (independently re-confirmed by the Coordinator with a second regex — see the audit thread). This
 * file verifies that empirically with the real React reconciler (jsdom, not a live browser — a
 * Profiler render count needs the React tree, not paint/layout, so jsdom is sufficient and
 * deterministic) rather than trusting the static grep alone, and measures the one adjacent question
 * that IS still open: does invalidating one query key cause a component that only reads a DIFFERENT
 * key to re-render (would indicate `FetchQueryProvider`'s context, not TanStack's own per-query
 * subscription store, is what drives re-renders)? Confirmed no — see the audit thread for the number.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const RULE = {
  id: "r1", workspaceId: "w1", matchType: "exact", fromPattern: "/old", toTarget: "/new", statusCode: 301,
  status: "active", override: false, priority: 0, source: "manual", sourceEntryId: null,
  fromPathAtCapture: null, toPathAtCapture: null, createdByPrincipal: "p1", createdByPluginId: null,
  createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z", version: 1,
};

function TaxonomyProbe() {
  const { taxonomies } = useWiredTaxonomy();
  return <div data-testid="taxonomy-probe-count">{taxonomies?.length ?? "loading"}</div>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("render churn — no React.memo exists anywhere in this render path", () => {
  it("confirms empirically: a redirects-list refetch re-renders the redirects tree AND does NOT touch an unrelated taxonomy-reading sibling", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.includes("/settings/effective") && url.includes("namespace=core.language")) return jsonResponse({ data: [] });
      if (url.includes("/taxonomy")) return jsonResponse({ items: [] });
      if (method === "POST" && url.includes("/redirects")) return jsonResponse({ data: RULE });
      if (url.includes("/redirects")) return jsonResponse({ data: [RULE] });
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    const redirectsRenders: number[] = [];
    const taxonomyRenders: number[] = [];
    const onRedirectsRender: ProfilerOnRenderCallback = () => {
      redirectsRenders.push(Date.now());
    };
    const onTaxonomyRender: ProfilerOnRenderCallback = () => {
      taxonomyRenders.push(Date.now());
    };

    render(
      <FetchQueryProvider>
        <Profiler id="redirects" onRender={onRedirectsRender}>
          <Redirects />
        </Profiler>
        <Profiler id="taxonomy-probe" onRender={onTaxonomyRender}>
          <TaxonomyProbe />
        </Profiler>
      </FetchQueryProvider>
    );

    await screen.findByText(/old/);
    await waitFor(() => expect(screen.getByTestId("taxonomy-probe-count").textContent).toBe("0"));

    const redirectsRendersBeforeWrite = redirectsRenders.length;
    const taxonomyRendersBeforeWrite = taxonomyRenders.length;

    // Fire a redirects write (create) — invalidates KEYS.list=["redirects"] only. taxonomy's key
    // (["taxonomies"]) shares no prefix relation with it at all (confirmed in deliverable B).
    const fromInput = screen.getByLabelText(/from path/i);
    const toInput = screen.getByLabelText(/to target/i);
    await act(async () => {
      fromInput.dispatchEvent(new Event("focus", { bubbles: true }));
    });
    fromInput.setAttribute("value", "/new-path");
    toInput.setAttribute("value", "/new-target");
    // jsdom form submission needs real user typing to update React-controlled/uncontrolled state
    // correctly — use fireEvent-level change events instead of raw attribute writes.
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(fromInput, { target: { value: "/new-path" } });
    fireEvent.change(toInput, { target: { value: "/new-target" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /add redirect/i }));
    });

    await waitFor(() => expect(redirectsRenders.length).toBeGreaterThan(redirectsRendersBeforeWrite));
    // Give any (incorrectly) triggered background refetch of an unrelated key time to land.
    await new Promise((r) => setTimeout(r, 50));

    const redirectsCommitsForOneWrite = redirectsRenders.length - redirectsRendersBeforeWrite;
    const taxonomyCommitsDuringRedirectsWrite = taxonomyRenders.length - taxonomyRendersBeforeWrite;

    // eslint-disable-next-line no-console
    console.log(
      `MEASURE\trender-churn\tredirects tree commits for 1 create\t${redirectsCommitsForOneWrite}\t` +
        `taxonomy-probe commits during that SAME write\t${taxonomyCommitsDuringRedirectsWrite}`
    );

    // The real, load-bearing assertion for the "does an unrelated key's consumer re-render" question:
    expect(taxonomyCommitsDuringRedirectsWrite).toBe(0);
  },
  // Mounts two Profiler-wrapped trees plus a real form submission; under `--coverage`
  // instrumentation overhead this reliably exceeds vitest's 5000ms default (measured 6243ms in a
  // full-suite coverage run) even though it passes in well under a second standalone. Verified 4/4
  // passes without --coverage before this bump — the test itself was not hanging.
  15000);
});
