import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WidgetInstanceEditor, widgetInstanceGuard } from "../WidgetInstanceEditor";
import type { AdminWidget } from "../../../lib/api";

/**
 * @file `WidgetInstanceEditor` — pins the fix for the audit's Major finding on
 * `/widgets/new?type=garbage-nonsense`: a missing `?type=` was already handled ("No widget type
 * specified."), but a garbage one previously reached a full live editor shell — title field,
 * working Save button — with zero config fields and zero explanation. Follows the RTL harness
 * `Plugins.unit.test.tsx` established for this package.
 */

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a garbage ?type= on /widgets/new", () => {
  it("renders an Unknown widget type error instead of a live editor shell", () => {
    render(<WidgetInstanceEditor widgetId={null} widgetType="garbage-nonsense" />);

    expect(screen.getByText('Unknown widget type "garbage-nonsense".')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Widget title")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^save$/i })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("a missing ?type= on /widgets/new (still handled)", () => {
  it("renders No widget type specified, unaffected by the new check", () => {
    render(<WidgetInstanceEditor widgetId={null} widgetType={null} />);
    expect(screen.getByText("No widget type specified.")).toBeInTheDocument();
  });
});

describe("a known widget type on /widgets/new", () => {
  it("renders the live editor shell normally", () => {
    render(<WidgetInstanceEditor widgetId={null} widgetType="text" />);

    expect(screen.getByPlaceholderText("Widget title")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeInTheDocument();
  });

  it("gives the title field a real accessible name, not just a placeholder", () => {
    render(<WidgetInstanceEditor widgetId={null} widgetType="text" />);

    const titleInput = screen.getByLabelText("Widget title");
    expect(titleInput).toHaveAttribute("placeholder", "Widget title");
  });
});

// Direct tests for the pure decision function pulled out of `WidgetInstanceEditor` in the
// complexity pass (cyc 14/cog 11 -> 9/7) — the four early-exit states are now one top-level
// function, testable without mounting the component or its hook.
const FAKE_WIDGET = {
  id: "w1",
  workspaceId: "ws1",
  slug: "hero-text",
  title: "Hero text",
  status: "active" as const,
  widgetType: "text" as const,
  config: { body: "hi" },
  updatedAt: "2026-01-01",
  version: 1,
} satisfies AdminWidget;

describe("widgetInstanceGuard", () => {
  it("returns fetch-error when loading a widget failed and none is already loaded", () => {
    expect(widgetInstanceGuard({ error: "boom", isNew: false, widget: null, loading: false, widgetType: "text" })).toEqual({
      kind: "fetch-error",
      message: "boom",
    });
  });

  it("does NOT return fetch-error once a widget is loaded, even if a stale error is still set", () => {
    // Mirrors the original inline guard's `!widget` condition: an error from a prior failed save
    // must not blank out an already-rendered editor.
    expect(widgetInstanceGuard({ error: "stale save error", isNew: false, widget: FAKE_WIDGET, loading: false, widgetType: "text" })).toBeNull();
  });

  it("does NOT return fetch-error on the new-widget screen, even with an error set", () => {
    expect(widgetInstanceGuard({ error: "save failed", isNew: true, widget: null, loading: false, widgetType: "text" })).toBeNull();
  });

  it("returns loading whenever loading is true, ahead of the no-type/unknown-type checks", () => {
    expect(widgetInstanceGuard({ error: null, isNew: false, widget: null, loading: true, widgetType: null })).toEqual({ kind: "loading" });
  });

  it("returns no-type when widgetType is null and not loading", () => {
    expect(widgetInstanceGuard({ error: null, isNew: true, widget: null, loading: false, widgetType: null })).toEqual({ kind: "no-type" });
  });

  it("returns unknown-type for a garbage type on the NEW-widget screen only", () => {
    expect(widgetInstanceGuard({ error: null, isNew: true, widget: null, loading: false, widgetType: "garbage-nonsense" })).toEqual({
      kind: "unknown-type",
      widgetType: "garbage-nonsense",
    });
  });

  it("does NOT check unknown-type for an already-loaded widget (server validated it at creation)", () => {
    expect(
      widgetInstanceGuard({ error: null, isNew: false, widget: FAKE_WIDGET, loading: false, widgetType: "garbage-nonsense" }),
    ).toBeNull();
  });

  it("returns null (no guard) once everything is ready to render the full editor shell", () => {
    expect(widgetInstanceGuard({ error: null, isNew: false, widget: FAKE_WIDGET, loading: false, widgetType: "text" })).toBeNull();
    expect(widgetInstanceGuard({ error: null, isNew: true, widget: null, loading: false, widgetType: "text" })).toBeNull();
  });
});
