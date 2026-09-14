import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Media } from "../Media";
import { sortMediaByOrder } from "../rules";
import type { AdminMedia } from "@/lib/api";
import { FetchQueryProvider } from "@/lib/fetch-query";

/**
 * @file The Media screen's "Order by" dropdown (owner-directed, 2026-09-11: "have a sort by to see
 * our most recent images", plus a human-selectable Alphabetical option — a visible control she can
 * change, not a fixed default).
 *
 * `SqliteMediaRepo.list()` (`apps/website/src/platform/db/sqlite/media-repo.sqlite.ts`) already
 * hardcodes newest-first at the SQL layer, so a naive test could pass purely because the server
 * happens to hand back rows in that order already, without the CLIENT'S own sort logic doing any
 * work. Every fixture below is built so insertion order, title order, and `createdAt` order are all
 * THREE different orderings — no single assertion can pass by accident on whichever order the mock
 * `fetch` response happens to list them in. Mirrors `media-type-filter.unit.test.tsx`'s identical
 * "pure function tests + screen-level tests" structure for the sibling Images/Videos control.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function makeItem(overrides: Partial<AdminMedia> & { id: string }): AdminMedia {
  return {
    workspaceId: "workspace-local",
    title: overrides.id,
    slug: overrides.id,
    alt: "",
    caption: "",
    credit: "",
    sha256: `sha-${overrides.id}`,
    status: "active",
    createdAt: "2026-08-01T09:00:00.000Z",
    updatedAt: "2026-08-01T09:00:00.000Z",
    version: 1,
    width: null,
    height: null,
    cssClass: null,
    htmlAttributes: null,
    contentType: null,
    ...overrides,
  };
}

// Insertion order: ZEBRA, APPLE, MANGO.
// createdAt order (newest first): MANGO (08-03), APPLE (08-02), ZEBRA (08-01).
// Alphabetical (case-insensitive, title): APPLE ("apple pie"), MANGO ("Mango Tart"), ZEBRA ("Zebra Zoo").
// All three orderings disagree with each other and with insertion order.
const ZEBRA = makeItem({ id: "zebra-1", title: "Zebra Zoo", createdAt: "2026-08-01T09:00:00.000Z" });
const APPLE = makeItem({ id: "apple-1", title: "apple pie", createdAt: "2026-08-02T09:00:00.000Z" });
const MANGO = makeItem({ id: "mango-1", title: "Mango Tart", createdAt: "2026-08-03T09:00:00.000Z" });
const ITEMS_IN_INSERTION_ORDER = [ZEBRA, APPLE, MANGO];

describe("sortMediaByOrder", () => {
  it("orders 'created' newest-first by createdAt, independent of insertion order", () => {
    expect(sortMediaByOrder(ITEMS_IN_INSERTION_ORDER, "created").map((m) => m.id)).toEqual([
      "mango-1",
      "apple-1",
      "zebra-1",
    ]);
  });

  it("orders 'alphabetical' case-insensitively by title, independent of insertion order", () => {
    // "apple pie" < "Mango Tart" < "Zebra Zoo" once both sides are lowercased — a naive byte-wise
    // compare would instead put every capitalized title ahead of every lowercase one.
    expect(sortMediaByOrder(ITEMS_IN_INSERTION_ORDER, "alphabetical").map((m) => m.id)).toEqual([
      "apple-1",
      "mango-1",
      "zebra-1",
    ]);
  });

  it("breaks a 'created' tie deterministically by id (descending), not left as insertion order", () => {
    const sameInstantA = makeItem({ id: "b-tie", title: "B", createdAt: "2026-08-05T00:00:00.000Z" });
    const sameInstantB = makeItem({ id: "a-tie", title: "A", createdAt: "2026-08-05T00:00:00.000Z" });
    // Insertion order here is [sameInstantA, sameInstantB] ("b-tie" first) — the tiebreak must flip
    // it to "b-tie" still first only because "b-tie" > "a-tie" descending, not because it happened
    // to be inserted first (proven by re-running with the insertion order reversed below).
    expect(sortMediaByOrder([sameInstantA, sameInstantB], "created").map((m) => m.id)).toEqual(["b-tie", "a-tie"]);
    expect(sortMediaByOrder([sameInstantB, sameInstantA], "created").map((m) => m.id)).toEqual(["b-tie", "a-tie"]);
  });

  it("treats titles differing only by case as equal-order (case-insensitive), tie-broken by id ascending", () => {
    const upper = makeItem({ id: "z-tie", title: "Same Title" });
    const lower = makeItem({ id: "a-tie", title: "same title" });
    expect(sortMediaByOrder([upper, lower], "alphabetical").map((m) => m.id)).toEqual(["a-tie", "z-tie"]);
  });

  it("sorts an empty title first, ahead of any non-empty title", () => {
    const blank = makeItem({ id: "blank-1", title: "" });
    expect(sortMediaByOrder([APPLE, blank, ZEBRA], "alphabetical").map((m) => m.id)).toEqual([
      "blank-1",
      "apple-1",
      "zebra-1",
    ]);
  });

  it("never mutates the array it was given", () => {
    const original = [...ITEMS_IN_INSERTION_ORDER];
    sortMediaByOrder(ITEMS_IN_INSERTION_ORDER, "alphabetical");
    expect(ITEMS_IN_INSERTION_ORDER).toEqual(original);
  });
});

function renderScreen(props: React.ComponentProps<typeof Media> = {}) {
  return render(
    <FetchQueryProvider>
      <Media {...props} />
    </FetchQueryProvider>
  );
}

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

function mockList(items: AdminMedia[]) {
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes("/locale")) return Promise.resolve(jsonResponse({ locale: "en" }));
    return Promise.resolve(jsonResponse({ media: items }));
  });
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Reads every rendered card's title, top to bottom — the grid's own visual order, not a
 *  `getAllByText` call whose match order is not guaranteed to follow DOM order across a query
 *  that can match unrelated text nodes. */
function renderedCardTitles(): string[] {
  return Array.from(document.querySelectorAll(".media-card-title")).map((el) => el.textContent ?? "");
}

describe("Media screen order-by control", () => {
  it("defaults to Created (newest-first) with no operator interaction", async () => {
    mockList(ITEMS_IN_INSERTION_ORDER);
    renderScreen();

    await screen.findByText("Zebra Zoo");
    expect(renderedCardTitles()).toEqual(["Mango Tart", "apple pie", "Zebra Zoo"]);
  });

  it("re-orders the grid to alphabetical when the operator picks it from the dropdown", async () => {
    mockList(ITEMS_IN_INSERTION_ORDER);
    renderScreen();
    await screen.findByText("Zebra Zoo");

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Order by"), "alphabetical");

    expect(renderedCardTitles()).toEqual(["apple pie", "Mango Tart", "Zebra Zoo"]);
  });

  it("switches back to Created when re-selected, proving the control is not a one-way/fixed default", async () => {
    mockList(ITEMS_IN_INSERTION_ORDER);
    renderScreen();
    await screen.findByText("Zebra Zoo");

    const user = userEvent.setup();
    const select = screen.getByLabelText("Order by");
    await user.selectOptions(select, "alphabetical");
    expect(renderedCardTitles()).toEqual(["apple pie", "Mango Tart", "Zebra Zoo"]);

    await user.selectOptions(select, "created");
    expect(renderedCardTitles()).toEqual(["Mango Tart", "apple pie", "Zebra Zoo"]);
  });
});

// Owner screenshot 2026-09-12 (`owner-screenshots-2026-09-12/14-media-order-by-spacing.png`): the
// "Order by" label sat flush against its dropdown because `.media-order-control` had no rule at all.
// jsdom does no layout, so — like `sidebar-accordion-css.unit.test.ts` — this asserts the declaration
// exists in the stylesheet `main.tsx` loads for this screen.
describe("Media order-by control spacing", () => {
  const stylesheet = readFileSync(resolve(process.cwd(), "src/styles/media.css"), "utf8");

  it("lays the label and dropdown out in a row with a gap between them", () => {
    const rule = /\.media-order-control\s*\{[^}]*\}/.exec(stylesheet)?.[0] ?? "";
    expect(rule).toMatch(/display\s*:\s*flex/);
    expect(rule).toMatch(/gap\s*:\s*var\(--space-/);
  });
});
