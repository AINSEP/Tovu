/**
 * Mounts the exact Recharts bundle Tovu ships: the reviewed payload in `@jini-ai/provider-plugins`
 * at the version pinned in `charts-recharts-source.ts` (whose pin test ties those bytes to the approval).
 * The source and its own tests live in Jini (`packages/provider-plugins/src/charts-recharts`); these cases
 * stay here so the PACKAGED build is checked for the owner-reported bugs, not a re-creation of it.
 *
 * Owner bug 11-01: a bar chart of whole counts (posts per status, etc.) got y ticks 0, 0.8, 1.5, 2.3.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";

/** Keep in step with RECHARTS_BROWSER_APPROVAL.version (the admin cannot import server composition). */
const PINNED_VERSION = "0.6.24";
// The package exports `./catalog` (catalog.json at its root), not `package.json`.
const packageRoot = path.dirname(createRequire(import.meta.url).resolve("@jini-ai/provider-plugins/catalog"));
const bundleUrl = pathToFileURL(path.join(packageRoot, "plugins/charts-recharts", PINNED_VERSION, "client/provider.js")).href;
// Plain ESM bundle with no type declarations; the shape used is asserted by the cases below.
const { mount } = (await import(/* @vite-ignore */ bundleUrl)) as { mount: (input: unknown) => unknown };

type Instance = { ready: Promise<void>; destroy: () => void };

beforeEach(() => {
  // Recharts' ResponsiveContainer and tick sizing read getBoundingClientRect; jsdom reports 0x0,
  // which would draw an empty SVG. Text gets a proportional width so ticks are not thinned.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const text = this.id === "recharts_measurement_span";
    const width = text ? (this.textContent ?? "").length * 7 : 600;
    const height = text ? 14 : 300;
    return { width, height, top: 0, left: 0, bottom: height, right: width, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  });
  // ResponsiveContainer skips measuring entirely without a ResizeObserver (jsdom has none, and the
  // admin setup leaves it unstubbed on purpose). Its first size comes from getBoundingClientRect
  // above; this stub only lets that code path run.
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function yTicks(kind: "bar" | "line", values: number[]): Promise<string[]> {
  const element = document.createElement("div");
  document.body.append(element);
  const data = values.map((count, i) => ({ status: `s${i}`, count }));
  let instance!: Instance;
  act(() => {
    instance = mount({ element, spec: { kind, data, categoryKey: "status", series: [{ key: "count" }] }, theme: { mode: "light" } }) as Instance;
  });
  await instance.ready;
  // The bundle carries its own React, so its passive effects (where ResponsiveContainer measures)
  // run on that copy's scheduler, after `ready` — wait for the drawn axis rather than `act`.
  await vi.waitFor(() => expect(element.querySelector(".recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value")).not.toBeNull());
  const ticks = Array.from(element.querySelectorAll(".recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value")).map((el) => el.textContent ?? "");
  act(() => instance.destroy());
  element.remove();
  return ticks;
}

it.each(["bar", "line"] as const)("a %s chart of whole counts gets whole-number y ticks", async (kind) => {
  const ticks = await yTicks(kind, [1, 3, 2]);
  expect(ticks.length).toBeGreaterThan(1);
  expect(ticks.every((tick) => /^\d+$/.test(tick)), ticks.join(", ")).toBe(true);
});

it.each(["bar", "line"] as const)("a %s chart with fractional values keeps fractional y ticks", async (kind) => {
  const ticks = await yTicks(kind, [0.2, 0.5, 0.9]);
  expect(ticks.some((tick) => tick.includes(".")), ticks.join(", ")).toBe(true);
});

// Owner bug 11-01 (ui-look-4): whole counts with a small maximum still got Recharts' default 5 ticks,
// so a posts chart with max 1 had a 0–4 axis and quarter-height bars. Whole counts get at most
// max+1 ticks (never more than 5), so the axis ends at the data.
it.each(["bar", "line"] as const)("a %s chart of small whole counts ends its y axis at the largest count", async (kind) => {
  expect(await yTicks(kind, [1, 0])).toEqual(["0", "1"]);
  expect(await yTicks(kind, [2, 1, 0])).toEqual(["0", "1", "2"]);
});

it.each(["bar", "line"] as const)("a %s chart of all-zero counts still draws whole-number ticks", async (kind) => {
  const ticks = await yTicks(kind, [0, 0]);
  expect(ticks.length).toBeGreaterThan(0);
  expect(ticks.every((tick) => /^\d+$/.test(tick)), ticks.join(", ")).toBe(true);
});

it.each(["bar", "line"] as const)("a %s chart of large whole counts keeps at most 5 ticks", async (kind) => {
  const ticks = await yTicks(kind, [12, 40, 7]);
  expect(ticks.length).toBeLessThanOrEqual(5);
  expect(ticks.every((tick) => /^\d+$/.test(tick)), ticks.join(", ")).toBe(true);
});

// Orphan punctuation is a wrapping defect: assert on the actual shipped SVG at dock widths.
it.each([180, 240, 375])("keeps middle-dot label separators with a word at %spx", async (width) => {
  vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function (this: HTMLElement) {
    const measuring = this.id === "recharts_measurement_span";
    const w = measuring ? (this.textContent ?? "").length * 7 : width;
    const h = measuring ? 14 : 300;
    return { width: w, height: h, top: 0, left: 0, bottom: h, right: w, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  });
  const element = document.createElement("div");
  document.body.append(element);
  const labels = ["Pages · Published", "Posts · Drafts", "Media · Active"];
  const instance = mount({ element, spec: { kind: "bar", data: labels.map(status => ({ status, count: 1 })), categoryKey: "status", series: [{ key: "count" }] }, theme: { mode: "dark" } }) as Instance;
  try {
    await instance.ready;
    await vi.waitFor(() => expect(element.querySelector(".recharts-xAxis-tick-labels tspan")).not.toBeNull());
    const lines = Array.from(element.querySelectorAll(".recharts-xAxis-tick-labels tspan"), el => el.textContent?.trim() ?? "");
    expect(lines).not.toContain("·");
    const titles = Array.from(element.querySelectorAll(".recharts-xAxis-tick-labels title"), el => el.textContent ?? "");
    expect(titles.length).toBeGreaterThan(0);
    expect(titles.every(title => labels.includes(title))).toBe(true);
  } finally { act(() => instance.destroy()); element.remove(); }
});
