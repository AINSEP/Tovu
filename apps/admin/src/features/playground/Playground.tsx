/**
 * @file The Studio "Playground" screen — a live, manually-driven A2UI surface for trying out
 * `interactive-ui` registry components (the real shadcn table, the dependency-free native one)
 * composed alongside A2UI's basic layout primitives (`Column`/`Text`/`Button`).
 *
 * Client-side only, deliberately: `DEFAULT_INTERACTIVE_UI_REGISTRY` is static data already bundled
 * into this app via `@jini-ai/ui` — there is nothing to fetch to browse it, so this searches it
 * directly rather than round-tripping through the daemon's `/api/components/search` (that route
 * exists for an AGENT calling `search_components` over MCP, a different caller with no access to
 * this bundle).
 *
 * What this does NOT do yet: let a chat conversation place a component here. That needs a real
 * agent tool — something in the shape of `demo-a2ui-tool.ts` but built on the merged catalog and
 * driven by actual agent reasoning about what to add, not a scripted two-step demo — which doesn't
 * exist yet. This tab only proves the rendering half: registry resolution, recursive tree-walking,
 * a real shadcn component, all working in the actual admin app.
 *
 * The search/surface/interpreter state lives in `hooks/use-playground.hooks.ts`, split out the
 * same way `SeeMore`/`SeeMore.hooks.tsx` does — this file stays props-and-JSX only, and the
 * `usePlaygroundHook` prop below lets a test render this JSX against a fake hook.
 */
import { A2uiSurfaceRenderer } from "@jini-ai/ui/a2ui";
import "../../styles/playground.css";

import { usePlayground, SURFACE_ID } from "./hooks/use-playground.hooks";

export interface PlaygroundProps {
  /** Injectable seam for the tab's search/surface state. Defaults to the real
   *  {@link usePlayground}; a test can pass a fake here to exercise `Playground`'s rendering with a
   *  fixed registry/surface state instead of driving the real A2UI interpreter. */
  usePlaygroundHook?: typeof usePlayground;
}

export function Playground({ usePlaygroundHook = usePlayground }: PlaygroundProps = {}) {
  const { registry, matches, query, setQuery, total, surfaceOpen, interpreter, addToSurface, reset } = usePlaygroundHook();

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">Studio</p>
          <h1 className="page-title">Playground</h1>
          <p className="page-description">
            Browse the components the assistant can render, and drop them onto a live surface.
          </p>
        </div>
      </div>

      <p className="notice">
        Not wired to chat yet — you add components here by hand, not by asking the assistant.
      </p>

      <div className="playground-layout">
        <section className="card playground-library" aria-labelledby="playground-library-heading">
          <div className="playground-panel-head">
            <h2 className="playground-panel-title" id="playground-library-heading">
              Component library
            </h2>
            {/* The search box's only feedback, so it states the whole picture rather than just the
                match count: "2 components" when nothing is filtered, "1 of 2" once a query narrows it. */}
            <span className="playground-count">
              {matches.length === total ? `${total} components` : `${matches.length} of ${total}`}
            </span>
          </div>

          <label className="visually-hidden" htmlFor="playground-search">
            Search components
          </label>
          <input
            id="playground-search"
            className="playground-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by id, provider, or capability"
          />

          {matches.length === 0 ? (
            <div className="empty-state">
              <p className="playground-empty-title">No component matches &ldquo;{query}&rdquo;</p>
              {/* Names the three fields `matches` actually searches, so the recovery advice is the
                  real filter surface rather than a guess. */}
              <p className="playground-empty-body">
                Search runs over a component&rsquo;s id, provider, and capabilities — try
                &ldquo;table&rdquo;.
              </p>
            </div>
          ) : (
            <ul className="playground-component-list">
              {matches.map((entry) => (
                <li key={entry.id} className="playground-component">
                  <span className="playground-component-id">{entry.id}</span>
                  {entry.description ? (
                    <p className="playground-component-desc">{entry.description}</p>
                  ) : null}
                  <div className="playground-component-foot">
                    <ul className="playground-caps">
                      {entry.capabilities.map((capability) => (
                        <li key={capability} className="playground-cap">
                          {capability}
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className="btn-secondary playground-component-add"
                      onClick={() => addToSurface(entry)}
                    >
                      Add to surface
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card card-flush playground-stage" aria-labelledby="playground-stage-heading">
          <div className="playground-stage-rail">
            <div className="playground-stage-ident">
              <h2 className="playground-panel-title" id="playground-stage-heading">
                Surface
              </h2>
              <code className="playground-surface-id">{SURFACE_ID}</code>
            </div>
            <div className="playground-stage-actions">
              <span className={`playground-state${surfaceOpen ? " is-live" : ""}`}>
                {surfaceOpen ? "Live" : "Empty"}
              </span>
              {/* Disabled with no surface open: `reset` is already a no-op in that state, so this
                  only stops the click, and the enabled/disabled flip is the rail's confirmation
                  that something is actually mounted. */}
              <button type="button" className="btn-ghost" onClick={reset} disabled={!surfaceOpen}>
                Clear surface
              </button>
            </div>
          </div>
          {/* The sheet is always here, empty or not — an invitation printed on a blank page, rather
              than a message floating on the dotted ground where the dots read straight through the
              type. It also keeps the stage the same shape before and after the first Add. */}
          <div className="playground-stage-body">
            <div className="playground-stage-mount">
              {surfaceOpen ? (
                <A2uiSurfaceRenderer
                  interpreter={interpreter}
                  surfaceId={SURFACE_ID}
                  registry={registry}
                  fallback={<p className="playground-empty-body">The surface has no root component yet.</p>}
                />
              ) : (
                <div className="playground-stage-empty">
                  <p className="playground-empty-title">Nothing on the surface yet</p>
                  <p className="playground-empty-body">
                    Add a component from the library to open a surface and see it render here.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
