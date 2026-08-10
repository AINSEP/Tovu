import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PostTemplateModal } from "../PostTemplateModal";

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
        templateFilename="post.html"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/is a handlebars theme/i)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("an undetermined tier (null) says so distinctly, without claiming a specific tier", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    render(<PostTemplateModal themeId="mystery" themeTier={null} templateFilename="post.html" onClose={vi.fn()} />);

    expect(screen.getByText(/could not determine/i)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("a static-tier theme", () => {
  it("fetches /theme-assets/{themeId}/pages/{templateFilename} and renders the raw text", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(jsonOk("<h1>Hello template</h1>")));
    vi.stubGlobal("fetch", fetchSpy);

    render(
      <PostTemplateModal
        themeId="basic"
        themeTier="static"
        templateFilename="blog-post.html"
        onClose={vi.fn()}
      />,
    );

    expect(fetchSpy).toHaveBeenCalledWith("/theme-assets/basic/pages/blog-post.html");
    // Rendered as literal text (CodeWithLines's own contract — plain `{text}` JSX children, never
    // `dangerouslySetInnerHTML`), so the tag characters show up as visible text, not a real <h1>.
    await waitFor(() => expect(screen.getByText("<h1>Hello template</h1>")).toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "Hello template" })).not.toBeInTheDocument();
  });

  it("shows a loading state before the fetch settles", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));

    render(<PostTemplateModal themeId="basic" themeTier="static" templateFilename="x.html" onClose={vi.fn()} />);

    expect(screen.getByText(/loading template/i)).toBeInTheDocument();
  });

  it("shows an error message on a non-2xx response, naming the status", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("not found", { status: 404 }))));

    render(<PostTemplateModal themeId="basic" themeTier="static" templateFilename="missing.html" onClose={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/404/);
  });

  it("shows an error message on a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network down"))));

    render(<PostTemplateModal themeId="basic" themeTier="static" templateFilename="x.html" onClose={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/network down/);
  });
});
