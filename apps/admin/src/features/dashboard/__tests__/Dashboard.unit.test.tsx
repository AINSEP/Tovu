import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Dashboard } from "../Dashboard";

/**
 * @file `Dashboard` — pins the audit's exec-summary finding #5 (`ADS-memory/reports/audits/
 * 20260801-admin-adversarial-ux-audit.md`): the original two `useEffect` fetches had no `.catch()`,
 * so a rejection left a stat card reading "…" forever with no indication anything was wrong. The
 * screen now makes 5 independent fetches (posts, pages, media, comments, presentation), each owning
 * its own error slot, and a failure on one endpoint must never blank or freeze a card fed by a
 * different one.
 *
 * The mocked `fetch` below routes on the request URL (`routeFetch`) rather than call order/count —
 * the previous version of this file chained `mockResolvedValueOnce` calls tied to exactly 2 fetches
 * in a fixed order, which silently mis-asserted the moment a 3rd fetch was added. Routing on URL
 * keeps every assertion tied to *which endpoint* produced what, not *which fetch happened Nth*, so
 * this suite survives further additions to the screen's data sources. Follows the RTL harness
 * `Plugins.unit.test.tsx` established for this package (mocked global `fetch`, no server).
 *
 * Fixed defect, now pinned below (`both posts and pages failing`): `recent` (the state backing the
 * "Recently updated" panel) is only ever moved off its initial `null` from a `.then()`, so if
 * `listPosts` AND `listPages` both reject, nothing would move it — the panel would be stuck reading
 * "Loading…" forever with no error indication, the same defect class exec-summary #5 fixed for the
 * stat cards. `Dashboard.tsx` now renders an alert (`recent === null && posts.error && pages.error`)
 * instead, derived from the two existing stat errors rather than a third error slot of its own (the
 * panel has no fetch to independently fail). This was caught during the first pass of this file and
 * reported rather than silently tested around or fixed in place — see the coordinator's fix commit
 * for the rationale in full.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function rejected(message: string): () => Promise<Response> {
  return () => Promise.reject(new Error(message));
}

/** Routes a mocked `fetch` call to a handler keyed by a distinguishing substring of the request
 *  URL (the admin API's 5 dashboard endpoints never share a substring, so first-match is safe). A
 *  URL with no matching route rejects loudly instead of hanging the test on an unresolved promise. */
function routeFetch(routes: Record<string, () => Promise<Response>>) {
  return (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const entry = Object.entries(routes).find(([key]) => url.includes(key));
    if (!entry) return Promise.reject(new Error(`Dashboard test: no mocked route for ${url}`));
    return entry[1]();
  };
}

/** Finds a `.dash-stat` card by its visible label, so assertions can be scoped with `within(...)`
 *  instead of matching on ambiguous values (e.g. both the Pages and Media cards can read "2"). */
function statCard(container: HTMLElement, label: string): HTMLElement {
  const labelEl = Array.from(container.querySelectorAll(".dash-stat-label")).find((el) => el.textContent === label);
  if (!labelEl) throw new Error(`no stat card labeled "${label}"`);
  const card = labelEl.closest(".dash-stat");
  if (!card) throw new Error(`stat label "${label}" has no .dash-stat ancestor`);
  return card as HTMLElement;
}

function activityTitles(container: HTMLElement): (string | null)[] {
  return Array.from(container.querySelectorAll(".dash-activity-title")).map((el) => el.textContent);
}

const POSTS_RESPONSE = {
  posts: [
    { post: { id: "post-1", slug: "post-one", kind: "post", title: "Post One", status: "published", updatedAt: "2026-07-30T09:00:00.000Z" } },
    { post: { id: "post-2", slug: "post-two", kind: "post", title: "Post Two", status: "published", updatedAt: "2026-07-27T09:00:00.000Z" } },
    { post: { id: "post-3", slug: "post-three", kind: "post", title: "Post Three", status: "draft", updatedAt: "2026-07-26T09:00:00.000Z" } },
  ],
};
const PAGES_RESPONSE = {
  posts: [
    { post: { id: "page-1", kind: "page", title: "Page One", status: "draft", updatedAt: "2026-07-31T09:00:00.000Z" } },
    { post: { id: "page-2", kind: "page", title: "Page Two", status: "draft", updatedAt: "2026-07-28T09:00:00.000Z" } },
  ],
};
// Interleaved with posts by design: proves the merge sorts across both sources, not just within one.
const MERGED_TITLES = ["Page One", "Post One", "Page Two", "Post Two", "Post Three"];

const MEDIA_RESPONSE = { media: [{ status: "active" }, { status: "active" }, { status: "trashed" }] };
const COMMENTS_RESPONSE = { items: [{}, {}, {}, {}], nextCursor: null };
const COMMENTS_RESPONSE_EMPTY = { items: [], nextCursor: null };
const PRESENTATION_RESPONSE = { settings: { activeThemeId: "editorial" }, availableThemeIds: ["editorial"] };

/** Every endpoint succeeding. Individual tests override one key at a time (`{ ...successRoutes(),
 *  "/posts": rejected(...) }`) rather than rebuilding all 5 routes per scenario. */
function successRoutes(): Record<string, () => Promise<Response>> {
  return {
    "/posts": () => Promise.resolve(jsonResponse(POSTS_RESPONSE)),
    "/pages": () => Promise.resolve(jsonResponse(PAGES_RESPONSE)),
    "/media": () => Promise.resolve(jsonResponse(MEDIA_RESPONSE)),
    "/comments/queue": () => Promise.resolve(jsonResponse(COMMENTS_RESPONSE)),
    "/presentation": () => Promise.resolve(jsonResponse(PRESENTATION_RESPONSE)),
  };
}

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

beforeEach(() => {
  fetchMock = vi.fn();
  // `useWiredDashboard` also calls `useAdminLocale()` (real `fetch`, not this hook's own concern),
  // which would otherwise consume one of this file's strictly-ordered `mockResolvedValueOnce`
  // slots and shift every later assertion by one call. Routed to a fixed default-locale response
  // outside `fetchMock`'s own call queue — same interceptor pattern `Members.unit.test.tsx` uses.
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

it("renders every stat card's real value and the merged, sorted activity panel when all 5 fetches succeed", async () => {
  fetchMock.mockImplementation(routeFetch(successRoutes()));

  const { container } = render(<Dashboard />);

  const postsCard = statCard(container, "Posts");
  expect(await within(postsCard).findByText("3")).toBeInTheDocument();
  expect(within(postsCard).getByText(/2 published/)).toBeInTheDocument();

  const pagesCard = statCard(container, "Pages");
  expect(await within(pagesCard).findByText("2")).toBeInTheDocument();
  expect(within(pagesCard).getByText(/2 drafts/)).toBeInTheDocument();

  const mediaCard = statCard(container, "Media");
  expect(await within(mediaCard).findByText("2")).toBeInTheDocument();
  expect(within(mediaCard).getByText("items in the library")).toBeInTheDocument();

  const commentsCard = statCard(container, "Comments");
  expect(await within(commentsCard).findByText("4")).toBeInTheDocument();
  expect(within(commentsCard).getByText(/awaiting moderation/)).toBeInTheDocument();

  expect(await screen.findByText("editorial")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByText("…")).not.toBeInTheDocument();
  expect(container.querySelectorAll(".is-error")).toHaveLength(0);

  await waitFor(() => expect(activityTitles(container)).toEqual(MERGED_TITLES));
});

/**
 * The panel merges posts AND pages and labels each row with its own `kind`, but every row used to
 * href `/admin/posts/:id` — so a row plainly labelled "page" opened the post editor with a page id,
 * which the kind-guarded detail route 404s on. Pages point at the Pages list rather than a page
 * editor because `panels.tsx` gives the `pages` panel no detail view; see `activityRowHref`.
 */
it("links post rows to the post editor and page rows to the Pages list, not to a post editor that would 404", async () => {
  fetchMock.mockImplementation(routeFetch(successRoutes()));

  const { container } = render(<Dashboard />);
  await waitFor(() => expect(activityTitles(container)).toEqual(MERGED_TITLES));

  const hrefFor = (title: string) =>
    Array.from(container.querySelectorAll<HTMLAnchorElement>(".dash-activity-title"))
      .find((el) => el.textContent === title)
      ?.getAttribute("href");

  // readable-slugs S6a: activityRowHref now reads the post's slug, not its id.
  expect(hrefFor("Post One")).toBe("/admin/posts/post-one");
  expect(hrefFor("Page One")).toBe("/admin/pages");
  expect(hrefFor("Page Two")).toBe("/admin/pages");
  // No page id may appear under /admin/posts/ — that is the exact shape of the original defect.
  const hrefs = Array.from(container.querySelectorAll<HTMLAnchorElement>(".dash-activity-title")).map((el) =>
    el.getAttribute("href"),
  );
  expect(hrefs.some((href) => href?.startsWith("/admin/posts/page-"))).toBe(false);
});

it("shows 'nothing to review' instead of 'awaiting moderation' when the comments queue is empty", async () => {
  fetchMock.mockImplementation(
    routeFetch({ ...successRoutes(), "/comments/queue": () => Promise.resolve(jsonResponse(COMMENTS_RESPONSE_EMPTY)) })
  );

  const { container } = render(<Dashboard />);
  const commentsCard = statCard(container, "Comments");
  expect(await within(commentsCard).findByText("0")).toBeInTheDocument();
  expect(within(commentsCard).getByText("nothing to review")).toBeInTheDocument();
});

describe("a single failing endpoint shows its own reason and stops reading '…', without blanking the cards fed by endpoints that succeeded", () => {
  it("posts failing", async () => {
    fetchMock.mockImplementation(routeFetch({ ...successRoutes(), "/posts": rejected("posts network down") }));
    const { container } = render(<Dashboard />);

    const postsCard = statCard(container, "Posts");
    expect(await within(postsCard).findByText("posts network down")).toBeInTheDocument();
    expect(within(postsCard).getByText("—")).toBeInTheDocument();
    expect(within(postsCard).queryByText("…")).not.toBeInTheDocument();

    expect(await within(statCard(container, "Pages")).findByText("2")).toBeInTheDocument();
    expect(await within(statCard(container, "Media")).findByText("2")).toBeInTheDocument();
    expect(await within(statCard(container, "Comments")).findByText("4")).toBeInTheDocument();
    expect(await screen.findByText("editorial")).toBeInTheDocument();

    // Only pages' rows can contribute — posts never reached the merge. A single failing source is
    // NOT the both-failed case below, so the panel must still render rows, not the new alert state.
    await waitFor(() => expect(activityTitles(container)).toEqual(["Page One", "Page Two"]));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("pages failing", async () => {
    fetchMock.mockImplementation(routeFetch({ ...successRoutes(), "/pages": rejected("pages network down") }));
    const { container } = render(<Dashboard />);

    const pagesCard = statCard(container, "Pages");
    expect(await within(pagesCard).findByText("pages network down")).toBeInTheDocument();
    expect(within(pagesCard).getByText("—")).toBeInTheDocument();

    expect(await within(statCard(container, "Posts")).findByText("3")).toBeInTheDocument();
    expect(await within(statCard(container, "Media")).findByText("2")).toBeInTheDocument();
    expect(await within(statCard(container, "Comments")).findByText("4")).toBeInTheDocument();
    expect(await screen.findByText("editorial")).toBeInTheDocument();

    // Posts alone still succeeded, so the panel must render its rows, not the both-failed alert.
    await waitFor(() => expect(activityTitles(container)).toEqual(["Post One", "Post Two", "Post Three"]));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("media failing", async () => {
    fetchMock.mockImplementation(routeFetch({ ...successRoutes(), "/media": rejected("media network down") }));
    const { container } = render(<Dashboard />);

    const mediaCard = statCard(container, "Media");
    expect(await within(mediaCard).findByText("media network down")).toBeInTheDocument();
    expect(within(mediaCard).getByText("—")).toBeInTheDocument();

    expect(await within(statCard(container, "Posts")).findByText("3")).toBeInTheDocument();
    expect(await within(statCard(container, "Pages")).findByText("2")).toBeInTheDocument();
    expect(await within(statCard(container, "Comments")).findByText("4")).toBeInTheDocument();
    expect(await screen.findByText("editorial")).toBeInTheDocument();
  });

  it("comments failing", async () => {
    fetchMock.mockImplementation(routeFetch({ ...successRoutes(), "/comments/queue": rejected("comments network down") }));
    const { container } = render(<Dashboard />);

    const commentsCard = statCard(container, "Comments");
    expect(await within(commentsCard).findByText("comments network down")).toBeInTheDocument();
    expect(within(commentsCard).getByText("—")).toBeInTheDocument();

    expect(await within(statCard(container, "Posts")).findByText("3")).toBeInTheDocument();
    expect(await within(statCard(container, "Pages")).findByText("2")).toBeInTheDocument();
    expect(await within(statCard(container, "Media")).findByText("2")).toBeInTheDocument();
    expect(await screen.findByText("editorial")).toBeInTheDocument();
  });

  it("presentation failing shows an alert on the Appearance panel without marking any stat card as failed", async () => {
    fetchMock.mockImplementation(routeFetch({ ...successRoutes(), "/presentation": rejected("theme service down") }));
    const { container } = render(<Dashboard />);

    expect(await screen.findByRole("alert")).toHaveTextContent("theme service down");

    expect(await within(statCard(container, "Posts")).findByText("3")).toBeInTheDocument();
    expect(await within(statCard(container, "Pages")).findByText("2")).toBeInTheDocument();
    expect(await within(statCard(container, "Media")).findByText("2")).toBeInTheDocument();
    expect(await within(statCard(container, "Comments")).findByText("4")).toBeInTheDocument();
    expect(container.querySelectorAll(".dash-stat-value.is-error")).toHaveLength(0);
  });
});

it("shows an independent error reason on every card when all 5 fetches fail simultaneously", async () => {
  fetchMock.mockImplementation(
    routeFetch({
      "/posts": rejected("posts failed"),
      "/pages": rejected("pages failed"),
      "/media": rejected("media failed"),
      "/comments/queue": rejected("comments failed"),
      "/presentation": rejected("presentation failed"),
    })
  );

  const { container } = render(<Dashboard />);

  expect(await screen.findByText("posts failed")).toBeInTheDocument();
  expect(screen.getByText("pages failed")).toBeInTheDocument();
  expect(screen.getByText("media failed")).toBeInTheDocument();
  expect(screen.getByText("comments failed")).toBeInTheDocument();
  expect(screen.getByText("presentation failed")).toBeInTheDocument();

  expect(screen.queryByText("…")).not.toBeInTheDocument();
  expect(container.querySelectorAll(".dash-stat-value.is-error")).toHaveLength(4); // posts, pages, media, comments

  // Posts and pages are both among the 5 failures here, so the activity panel must show its own
  // error state too, not sit stuck on "Loading…" (see the dedicated describe block below).
  expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
});

describe("both posts and pages failing — the activity panel's own error state", () => {
  it("shows an alert instead of 'Loading…' forever, while unrelated cards keep their real values", async () => {
    fetchMock.mockImplementation(
      routeFetch({ ...successRoutes(), "/posts": rejected("posts failed"), "/pages": rejected("pages failed") })
    );

    const { container } = render(<Dashboard />);

    const panel = screen.getByText("Recently updated").closest(".dash-panel") as HTMLElement;
    const alert = await within(panel).findByRole("alert");
    expect(alert).toHaveTextContent("Could not load recent activity.");
    expect(alert).toHaveTextContent("posts failed");
    expect(within(panel).queryByText("Loading…")).not.toBeInTheDocument();

    // Media, comments, and the theme panel have no relation to posts/pages — still real values.
    expect(await within(statCard(container, "Media")).findByText("2")).toBeInTheDocument();
    expect(await within(statCard(container, "Comments")).findByText("4")).toBeInTheDocument();
    expect(await screen.findByText("editorial")).toBeInTheDocument();
  });
});

it("dedupes a row that appears in both the posts and pages responses by id", async () => {
  const sharedRow = { id: "shared-1", kind: "post", title: "Shared Row", status: "published", updatedAt: "2026-07-29T09:00:00.000Z" };
  fetchMock.mockImplementation(
    routeFetch({
      ...successRoutes(),
      "/posts": () => Promise.resolve(jsonResponse({ posts: [{ post: sharedRow }] })),
      "/pages": () => Promise.resolve(jsonResponse({ posts: [{ post: sharedRow }] })),
    })
  );

  const { container } = render(<Dashboard />);
  await waitFor(() => expect(activityTitles(container)).toEqual(["Shared Row"]));
});

describe("the activity panel's merge is correct regardless of which of posts/pages resolves first", () => {
  it("pages resolves first, posts resolves later", async () => {
    let resolvePosts!: (r: Response) => void;
    const postsPromise = new Promise<Response>((resolve) => {
      resolvePosts = resolve;
    });

    fetchMock.mockImplementation(routeFetch({ ...successRoutes(), "/posts": () => postsPromise }));
    const { container } = render(<Dashboard />);

    // Pages already resolved; posts is still pending, so only pages' rows are in the merge so far.
    await waitFor(() => expect(activityTitles(container)).toEqual(["Page One", "Page Two"]));

    resolvePosts(jsonResponse(POSTS_RESPONSE));

    await waitFor(() => expect(activityTitles(container)).toEqual(MERGED_TITLES));
  });

  it("posts resolves first, pages resolves later", async () => {
    let resolvePages!: (r: Response) => void;
    const pagesPromise = new Promise<Response>((resolve) => {
      resolvePages = resolve;
    });

    fetchMock.mockImplementation(routeFetch({ ...successRoutes(), "/pages": () => pagesPromise }));
    const { container } = render(<Dashboard />);

    await waitFor(() => expect(activityTitles(container)).toEqual(["Post One", "Post Two", "Post Three"]));

    resolvePages(jsonResponse(PAGES_RESPONSE));

    await waitFor(() => expect(activityTitles(container)).toEqual(MERGED_TITLES));
  });
});
