import "../../styles/playground.css";
import { usePlaygroundCanvas } from "./hooks/use-playground-canvas.hooks";

/**
 * @file The Studio "Playground" screen — a whiteboard for the assistant.
 *
 * No manual component picker: the assistant already discovers every component itself
 * (`search_components`/`describe_component` against `DEFAULT_INTERACTIVE_UI_REGISTRY`, real
 * shadcn/recharts components alongside A2UI's basic primitives) and renders whatever it decides
 * to build via the `assistant_render_ui` tool. The workspace chat dock (open it from the "+"
 * button, top right of any admin page) is what you talk to; while THIS page is the active one,
 * whatever it draws lands below, on the canvas, instead of inline in the chat transcript — on any
 * other admin page the exact same ask still renders inline in the chat, unchanged.
 *
 * The routing itself lives entirely on the `AssistantDock` side
 * (`components/AssistantDock/RoutedA2uiSurfaceCard.tsx`) — this component's only job is to publish
 * its own canvas container to `lib/playground-render-target-bus.ts` while it is mounted, and
 * unpublish it on unmount so navigating away reverts every later ask to inline rendering. That
 * register/unregister ref callback lives in `hooks/use-playground-canvas.hooks.ts`, split out the
 * same way `RoutedA2uiSurfaceCard.tsx` splits its own reading half of this same bus into
 * `hooks/use-routed-a2ui-surface-card.hooks.ts` — this file stays props-and-JSX only and calls
 * {@link usePlaygroundCanvas} through the injectable `usePlaygroundCanvasHook` prop below, the same
 * seam shape this page's now-deleted `usePlaygroundHook` prop used to have.
 *
 * Deliberately no example output rendered here: anything shown on the canvas must come from a real
 * assistant turn, not from JSX written into this file — a static/hardcoded example was tried and
 * explicitly rejected (it defeats the entire point of dynamic, agent-driven rendering). The
 * "nothing drawn yet" placeholder below is CSS only (`playground.css`'s
 * `.playground-render-target:empty ~ .playground-empty-state`) for the same reason: the canvas div
 * itself must stay a pure portal target with no JSX children of its own, or a real surface
 * appended into it by `RoutedA2uiSurfaceCard`'s portal would be commingled with content this
 * component thinks it owns.
 */
export interface PlaygroundProps {
  /** Injectable seam for the canvas render-target-bus registration hook. Defaults to the real
   *  {@link usePlaygroundCanvas}; a test can pass a fake here to exercise `Playground`'s rendering
   *  without driving the real `playground-render-target-bus` module state. */
  usePlaygroundCanvasHook?: typeof usePlaygroundCanvas;
}

export function Playground({ usePlaygroundCanvasHook = usePlaygroundCanvas }: PlaygroundProps = {}) {
  const { registerCanvas } = usePlaygroundCanvasHook();

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">Studio</p>
          <h1 className="page-title">Playground</h1>
          <p className="page-description">
            Ask the assistant to build anything — try &ldquo;Show a pie chart of my posts vs pages.&rdquo; Every real
            component is already available to it.
          </p>
        </div>
      </div>

      <div className="card playground-canvas">
        <h2 className="playground-panel-title">Canvas</h2>
        <div className="playground-canvas-body">
          <div className="playground-render-target" ref={registerCanvas} />
          <p className="playground-empty-state">Nothing drawn yet — ask the assistant.</p>
        </div>
      </div>
    </div>
  );
}
