import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PostTemplateModal } from "../PostTemplateModal";
import type { PostTemplateFetchState } from "../hooks/use-post-template-source.hooks";
import { navigate } from "@/lib/router";

vi.mock("../../../lib/router", () => ({ navigate: vi.fn() }));

const t = (key: string) => key;
/** Every case below leaves a real dirty-guard decision out of scope (see the "Edit button" describe
 *  block for the one case that isn't) — this stub always allows the navigation/close through, same
 *  as `Posts.unit.test.tsx`'s own fixtures do for props unrelated to what a given `it` covers. */
const alwaysConfirmLeave = () => true;

/**
 * @file `PostTemplateModal` — the "View Template" read-only source view (2026-08-10). Covers the
 * four outcomes disclosed in `PostEditor.tsx`'s wiring and the modal's own file header: a
 * non-static theme tier (nothing to fetch, by design — `theme-static-assets.ts` only mounts
 * static-tier theme dirs), an unknown tier (`null`, the active theme absent from
 * `availableThemes`), a fetch failure, and a successful load. Does not test `PreviewModalShell`'s
 * own chrome (Escape/backdrop/close) — that is Jini's own component, covered in its own package.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(navigate).mockClear();
});

function jsonOk(text: string): Response {
  return new Response(text, { status: 200 });
}

describe("theme tier gates the fetch", () => {
  it("a non-static theme shows the tier explanation and never calls fetch", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    render(
      <PostTemplateModal
        themeId="handlebars-theme"
        themeTier="handlebars"
        themeApiVersion={undefined}
        templateFilename="post.html"
        onClose={vi.fn()}
        confirmLeave={alwaysConfirmLeave}
        t={t}
      />,
    );

    expect(screen.getByText(/is a handlebars theme/i)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("an undetermined tier (null) says so distinctly, without claiming a specific tier", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    render(
      <PostTemplateModal
        themeId="mystery"
        themeTier={null}
        themeApiVersion={undefined}
        templateFilename="post.html"
        onClose={vi.fn()}
        confirmLeave={alwaysConfirmLeave}
        t={t}
      />,
    );

    expect(screen.getByText(/could not determine/i)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("a static-tier theme", () => {
  it("fetches /theme-assets/{themeId}/pages/{templateFilename} for a v1 (apiVersion undefined) theme and renders the raw text", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(jsonOk("<h1>Hello template</h1>")));
    vi.stubGlobal("fetch", fetchSpy);

    render(
      <PostTemplateModal
        themeId="basic"
        themeTier="static"
        themeApiVersion={undefined}
        templateFilename="blog-post.html"
        onClose={vi.fn()}
        confirmLeave={alwaysConfirmLeave}
        t={t}
      />,
    );

    expect(fetchSpy).toHaveBeenCalledWith("/theme-assets/basic/pages/blog-post.html");
    // Rendered as literal text (CodeWithLines's own contract — plain `{text}` JSX children, never
    // `dangerouslySetInnerHTML`), so the tag characters show up as visible text, not a real <h1>.
    await waitFor(() => expect(screen.getByText("<h1>Hello template</h1>")).toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "Hello template" })).not.toBeInTheDocument();
  });

  // 2026-08-19 architecture audit finding 1: every real static theme on disk today
  // (`src/themes/static/basic` and its six siblings) is `apiVersion: 2`, whose page templates live
  // under `render/pages/`, not `pages/` — the shape the test above alone used to leave unexercised.
  it("fetches /theme-assets/{themeId}/render/pages/{templateFilename} for an apiVersion: 2 theme", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(jsonOk("<h1>Hello template</h1>")));
    vi.stubGlobal("fetch", fetchSpy);

    render(
      <PostTemplateModal
        themeId="basic"
        themeTier="static"
        themeApiVersion={2}
        templateFilename="blog-post.html"
        onClose={vi.fn()}
        confirmLeave={alwaysConfirmLeave}
        t={t}
      />,
    );

    expect(fetchSpy).toHaveBeenCalledWith("/theme-assets/basic/render/pages/blog-post.html");
    await waitFor(() => expect(screen.getByText("<h1>Hello template</h1>")).toBeInTheDocument());
  });

  it("shows a loading state before the fetch settles", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));

    render(
      <PostTemplateModal
        themeId="basic"
        themeTier="static"
        themeApiVersion={2}
        templateFilename="x.html"
        onClose={vi.fn()}
        confirmLeave={alwaysConfirmLeave}
        t={t}
      />,
    );

    expect(screen.getByText(/loading template/i)).toBeInTheDocument();
  });

  it("shows an error message on a non-2xx response, naming the status", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("not found", { status: 404 }))));

    render(
      <PostTemplateModal
        themeId="basic"
        themeTier="static"
        themeApiVersion={2}
        templateFilename="missing.html"
        onClose={vi.fn()}
        confirmLeave={alwaysConfirmLeave}
        t={t}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/404/);
  });

  it("shows an error message on a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network down"))));

    render(
      <PostTemplateModal
        themeId="basic"
        themeTier="static"
        themeApiVersion={2}
        templateFilename="x.html"
        onClose={vi.fn()}
        confirmLeave={alwaysConfirmLeave}
        t={t}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/network down/);
  });
});

describe("PostTemplateModal template-source-hook injection", () => {
  it("renders purely off an injected fake, proving useTemplateSourceHook is not hardcoded", () => {
    // The real hook always starts `{ status: "loading" }` on a fresh mount for a static-tier theme
    // — a fake that resolves synchronously to `loaded` is something the real hook could never
    // produce on first render, so this only passes if the render used the fake.
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    function useFakeTemplateSource(): PostTemplateFetchState {
      return { status: "loaded", html: "fake template source" };
    }

    render(
      <PostTemplateModal
        themeId="basic"
        themeTier="static"
        themeApiVersion={2}
        templateFilename="blog-post.html"
        onClose={vi.fn()}
        confirmLeave={alwaysConfirmLeave}
        t={t}
        useTemplateSourceHook={useFakeTemplateSource}
      />,
    );

    expect(screen.getByText("fake template source")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("Edit button (owner ask, 2026-09-22)", () => {
  /** Reused across this block's `it`s: a loaded static-tier fixture, so the header (and its Edit
   *  button) is on screen without waiting on a real fetch. */
  function renderLoadedModal(overrides: { onClose?: () => void; confirmLeave?: () => boolean } = {}) {
    function useFakeTemplateSource(): PostTemplateFetchState {
      return { status: "loaded", html: "<h1>Hello template</h1>" };
    }
    return render(
      <PostTemplateModal
        themeId="basic"
        themeTier="static"
        themeApiVersion={2}
        templateFilename="posts-default.html"
        onClose={overrides.onClose ?? vi.fn()}
        confirmLeave={overrides.confirmLeave ?? alwaysConfirmLeave}
        t={t}
        useTemplateSourceHook={useFakeTemplateSource}
      />,
    );
  }

  it("navigates to the exact Theme Explore URL for this template and closes the modal", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderLoadedModal({ onClose });

    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(navigate).toHaveBeenCalledWith("/themes/explore?theme=basic&file=render%2Fpages%2Fposts-default.html");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("declines to navigate or close when confirmLeave reports unsaved edits", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    // Same shape as `PostEditorHeader`'s back-link guard: `confirmLeave` returning `false` means
    // the operator chose "keep editing" at a browser-native confirm(), so nothing here should act
    // as though they'd left.
    renderLoadedModal({ onClose, confirmLeave: () => false });

    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(navigate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
