import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, WORKSPACE_ID } from "@/lib/api";
import { FetchQueryProvider } from "@/lib/fetch-query";
import { createFakeContentAnalysisPort } from "../hooks/content-analysis-dependencies.hooks";
import { useContentAnalysis, useWiredContentAnalysis, type ContentAnalysisTarget } from "../hooks/use-content-analysis.hooks";
import type { ContentAnalysisPort } from "../hooks/content-analysis-port.hooks";
import { CONTENT_ANALYZER_PLUGIN_ID } from "../rules";
import { VALID_REPORT_JSON, reportJson } from "./content-analysis-fixtures";

/**
 * @file `useContentAnalysis` — the Content analysis card's state: whether the plugin is on, the
 * stored-vs-fresh analysis it shows, and Analyze now. Driven through `createFakeContentAnalysisPort`;
 * the last group drives `useWiredContentAnalysis` against a stubbed `fetch` to pin the real routes.
 */

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

/** A manually-resolved promise, for race tests — never a timer. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const STORED_EXT = { [CONTENT_ANALYZER_PLUGIN_ID]: { report: VALID_REPORT_JSON } };
const DOC = { type: "doc", content: [{ type: "paragraph" }] };

function target(overrides: Partial<ContentAnalysisTarget> = {}): ContentAnalysisTarget {
  return { post: { id: "p1", version: 1, ext: STORED_EXT }, title: "Draft title", bodyJson: DOC, ...overrides };
}

function mount(port: ContentAnalysisPort, initial: ContentAnalysisTarget = target(), locale = "en") {
  return renderHook((props: ContentAnalysisTarget) => useContentAnalysis(props, { port, locale }), { wrapper, initialProps: initial });
}

describe("showing the card", () => {
  it("is hidden until the plugin's preview status loads, then shows the stored analysis", async () => {
    const port = createFakeContentAnalysisPort();
    const { result } = mount(port);
    expect(result.current.hidden).toBe(true);
    await waitFor(() => expect(result.current.hidden).toBe(false));
    expect(result.current.view.lead).toBe("From the last save.");
    expect(result.current.view.report?.stats[0]?.value).toBe("84");
    expect(result.current.analyzing).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("stays hidden when the content-analyzer plugin is disabled", async () => {
    const port = createFakeContentAnalysisPort({ enabled: false });
    const { result } = mount(port);
    await waitFor(() => expect(port.statusCalls).toBe(1));
    await act(async () => {});
    expect(result.current.hidden).toBe(true);
  });

  it("stays hidden when the content-analyzer plugin is not installed", async () => {
    const port = createFakeContentAnalysisPort({ statusError: new ApiError("plugin was not found", 404, "PLUGIN_NOT_FOUND") });
    const { result } = mount(port);
    await waitFor(() => expect(port.statusCalls).toBe(1));
    await act(async () => {});
    expect(result.current.hidden).toBe(true);
  });

  it("shows the card with the reason when the status read is refused or fails, instead of looking switched off", async () => {
    const port = createFakeContentAnalysisPort({ statusError: new ApiError("You do not have permission to do that.", 403, "FORBIDDEN") });
    const { result } = mount(port);
    await waitFor(() => expect(result.current.hidden).toBe(false));
    expect(result.current.error).toBe("You do not have permission to do that.");
    expect(port.statusCalls).toBe(1);
  });

  it("says the post is not analyzed yet when it carries no stored report", async () => {
    const port = createFakeContentAnalysisPort();
    const { result } = mount(port, target({ post: { id: "p1", version: 1 } }));
    await waitFor(() => expect(result.current.hidden).toBe(false));
    expect(result.current.view).toEqual({ lead: "Not analyzed yet. Save, or click Analyze now.", report: null });
  });

  it("binds its copy to the given locale", async () => {
    const port = createFakeContentAnalysisPort();
    const { result } = mount(port, target(), "es");
    await waitFor(() => expect(result.current.hidden).toBe(false));
    expect(result.current.t("Analyze now")).toBe("Analizar ahora");
    expect(result.current.view.lead).toBe("Del último guardado.");
  });
});

describe("Analyze now", () => {
  it("sends the editor's current, unsaved title and body to the plugin's preview and shows the fresh result", async () => {
    const gate = deferred<void>();
    const port = createFakeContentAnalysisPort({ previewFields: { report: reportJson({ score: 61 }) }, previewGate: gate.promise });
    const { result } = mount(port);
    await waitFor(() => expect(result.current.hidden).toBe(false));

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.analyze();
    });
    await waitFor(() => expect(result.current.analyzing).toBe(true));
    expect(port.previewCalls).toEqual([
      { pluginId: CONTENT_ANALYZER_PLUGIN_ID, body: { postId: "p1", title: "Draft title", bodyJson: DOC } },
    ]);

    await act(async () => {
      gate.resolve();
      await pending;
    });
    expect(result.current.analyzing).toBe(false);
    expect(result.current.view.lead).toBe("From your current draft, including unsaved changes.");
    expect(result.current.view.report?.stats[0]?.value).toBe("61");
  });

  it("shows an unreadable preview reply as analysis unavailable", async () => {
    // No `previewFields`: the fake answers `{}`, a reply with no `report` at all.
    const port = createFakeContentAnalysisPort();
    const { result } = mount(port);
    await waitFor(() => expect(result.current.hidden).toBe(false));
    await act(() => result.current.analyze());
    expect(result.current.view).toEqual({ lead: "Analysis unavailable.", report: null });
  });

  it("reports a refused preview with its own copy, then clears it on the next successful run", async () => {
    const port = createFakeContentAnalysisPort({
      previewFields: { report: VALID_REPORT_JSON },
      previewError: new ApiError("hook threw", 422, "PLUGIN_HOOK_FAILED"),
    });
    const { result } = mount(port);
    await waitFor(() => expect(result.current.hidden).toBe(false));
    await act(() => result.current.analyze());
    await waitFor(() => expect(result.current.error).toBe("The analyzer could not process this content."));
    expect(result.current.analyzing).toBe(false);
    expect(result.current.view.lead).toBe("From the last save.");

    port.setPreviewError(null);
    await act(() => result.current.analyze());
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.view.lead).toBe("From your current draft, including unsaved changes.");
  });

  it("lets a save's refreshed stored analysis win over an earlier fresh result", async () => {
    const port = createFakeContentAnalysisPort({ previewFields: { report: reportJson({ score: 61 }) } });
    const { result, rerender } = mount(port);
    await waitFor(() => expect(result.current.hidden).toBe(false));
    await act(() => result.current.analyze());
    expect(result.current.view.report?.stats[0]?.value).toBe("61");

    rerender(target({ post: { id: "p1", version: 2, ext: { [CONTENT_ANALYZER_PLUGIN_ID]: { report: reportJson({ score: 77 }) } } } }));
    expect(result.current.view.lead).toBe("From the last save.");
    expect(result.current.view.report?.stats[0]?.value).toBe("77");
  });

  it("ignores a preview that was still in flight when a save landed", async () => {
    const gate = deferred<void>();
    const port = createFakeContentAnalysisPort({ previewFields: { report: reportJson({ score: 61 }) }, previewGate: gate.promise });
    const { result, rerender } = mount(port);
    await waitFor(() => expect(result.current.hidden).toBe(false));
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.analyze();
    });
    rerender(target({ post: { id: "p1", version: 2, ext: STORED_EXT } }));
    await act(async () => {
      gate.resolve();
      await pending;
    });
    expect(result.current.view.lead).toBe("From the last save.");
    expect(result.current.view.report?.stats[0]?.value).toBe("84");
  });
});

describe("useWiredContentAnalysis (real routes, stubbed fetch)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }

  it("GETs the plugin's preview status (not the admin plugin list) and POSTs the draft to the workspace-scoped /plugins/content-analyzer/preview route", async () => {
    const requests: Array<{ url: string; method: string; body: unknown }> = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      requests.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.includes("/settings/effective")) return jsonResponse({ data: [] });
      if (url.endsWith("/plugins/content-analyzer/preview") && method === "GET") return jsonResponse({ pluginId: CONTENT_ANALYZER_PLUGIN_ID, enabled: true });
      if (url.endsWith("/plugins/content-analyzer/preview")) {
        return jsonResponse({ pluginId: CONTENT_ANALYZER_PLUGIN_ID, fields: { report: reportJson({ score: 55 }) } });
      }
      return jsonResponse({ error: "unexpected" }, 500);
    });

    const { result } = renderHook(() => useWiredContentAnalysis(target()), { wrapper });
    await waitFor(() => expect(result.current.hidden).toBe(false));
    await act(() => result.current.analyze());

    expect(result.current.view.report?.stats[0]?.value).toBe("55");
    // The admin plugin list needs admin.plugins.read, which a built-in editor lacks.
    expect(requests.some((request) => request.url.endsWith("/plugins"))).toBe(false);
    expect(requests.filter((request) => request.url.endsWith("/preview")).map((request) => request.method)).toEqual(["GET", "POST"]);
    const preview = requests.find((request) => request.url.endsWith("/preview") && request.method === "POST");
    expect(preview).toEqual({
      url: `/api/admin/v1/workspaces/${WORKSPACE_ID}/plugins/content-analyzer/preview`,
      method: "POST",
      body: { postId: "p1", title: "Draft title", bodyJson: DOC },
    });
  });
});
