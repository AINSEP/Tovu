import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { A2uiSurfaceCard, ChatKitProvider, ChatSurfacesProvider } from "@jini-ai/chat/react";
import { createLabCatalog } from "@jini-ai/protocol/a2ui";
import { DEFAULT_INTERACTIVE_UI_REGISTRY } from "@jini-ai/ui/interactive-ui";
import { chatKit } from "../jini-kits";
import { chatSurfaces } from "../jini-surfaces";

/**
 * TEST-ONLY: ChatSurfaces bound to the REAL implementations,
 * exactly as a host binds them (Tovu's apps/admin/src/integrations/jini-surfaces.ts). For the few card tests
 * whose subject is the bound implementation itself: a real sandboxed MCP-UI iframe, a real registry component
 * rendered inside an A2UI card. Everything else uses fake-chat-surfaces.tsx, which proves chat only needs the port.
 */

/**
 * @file The host's real `chatSurfaces` / `chatKit` binding, rendered through chat's A2UI card.
 *
 * Chat's own tests drive the card through fakes of its `ChatSurfaces` port, so they cannot prove that
 * the registry Tovu picks (`DEFAULT_INTERACTIVE_UI_REGISTRY`) actually draws inside a card. That is
 * a fact about this composition, so it is held here, next to the binding. The cases moved from chat's
 * A2uiSurfaceCard test, delivery test and registry test (C-CHAT-DEPS S6).
 */

afterEach(cleanup);

// A package test supplies its own clock port; the system clock lives in the platform package.
const testClock = { nowMs: () => Date.now() };
const CATALOG_ID = createLabCatalog({}).catalogId;

/** Wire components are flat: `{id, component, ...props}`, never `{id, component, props: {...}}`. */
function createSurfaceMessage(surfaceId: string, components: unknown[]) {
  return { version: "v1.0", createSurface: { surfaceId, catalogId: CATALOG_ID, components } };
}

function renderBound(ui: React.ReactElement) {
  return render(
    <ChatKitProvider kit={chatKit}>
      <ChatSurfacesProvider surfaces={chatSurfaces}>{ui}</ChatSurfacesProvider>
    </ChatKitProvider>,
  );
}

// --- registry components (shadcn/recharts), merged into this card's own catalog -------------
describe("host binding: registry components inside the A2UI card", () => {
  it("renders a registry-sourced shadcn component inside a Card, not the placeholder", () => {
    const events = [
      createSurfaceMessage("s1", [
        { id: "root", component: "Card", child: "btn" },
        { id: "btn", component: "shadcn.button", label: "Publish" },
      ]),
    ];
    renderBound(<A2uiSurfaceCard name="a2ui" clock={testClock} events={events} runStreaming runSucceeded={false} runId="run-1" />);
    expect(document.querySelector(".a2ui-card")).not.toBeNull();
    expect(screen.queryByText(/no renderer yet for component type/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish" })).toBeInTheDocument();
  });

  it("renders the legacy pie chart data as a styled table without a provider", () => {
    const events = [
      createSurfaceMessage("s1", [
        { id: "root", component: "Column", children: ["title", "chart"] },
        { id: "title", component: "Text", text: "Posts vs Pages" },
        { id: "chart", component: "recharts.pie-chart", data: [{ name: "Posts", value: 12 }, { name: "Pages", value: 4 }] },
      ]),
    ];
    renderBound(<A2uiSurfaceCard name="a2ui" clock={testClock} events={events} runStreaming runSucceeded={false} runId="run-1" />);
    expect(screen.getByText("Posts vs Pages")).toBeInTheDocument();
    expect(screen.getByRole("table")).toHaveTextContent("Posts12Pages4");
    expect(document.querySelector("svg.recharts-surface")).toBeNull();
    expect(screen.queryByText(/no renderer yet for component type/)).not.toBeInTheDocument();
  });

  it("delivers a registry data-table row click as the table’s action, with a response id when the agent wants one", async () => {
    const events = [createSurfaceMessage("s1", [
      { id: "root", component: "native.data-table", columns: [{ key: "name", label: "Name" }], rows: [{ name: "Ada" }],
        action: { event: { name: "pick-row", wantResponse: true } } },
    ])];
    const onAgentAction = vi.fn();
    renderBound(<A2uiSurfaceCard name="a2ui" clock={testClock} events={events} runStreaming runSucceeded={false} runId="run-7" onAgentAction={onAgentAction} />);
    await userEvent.click(screen.getByRole("button", { name: /Ada/ }));
    expect(onAgentAction).toHaveBeenCalledWith("run-7", expect.objectContaining({ action: expect.objectContaining({
      name: "pick-row", surfaceId: "s1", sourceComponentId: "root", wantResponse: true, actionId: expect.stringMatching(/^a2ui-action-\d+-[0-9a-z]+$/),
    }) }));
  });

  it("validates and renders nested provider components against the same injected registry", () => {
    // DI component contribution, not a module mock: the interpreter and registry remain real.
    const registry = DEFAULT_INTERACTIVE_UI_REGISTRY.register({ entry: {
      id: "fixture.caption", provider: "fixture", capabilities: ["text"],
      propsSchema: z.object({ caption: z.string() }),
      Component: ({ caption }) => <output>{String(caption)}</output>,
    } });
    const events = [createSurfaceMessage("registry-surface", [
      { id: "root", component: "Column", children: ["card"] },
      { id: "card", component: "Card", child: "caption" },
      { id: "caption", component: "fixture.caption", caption: "Injected provider rendered" },
    ])];
    const baseline = renderBound(<A2uiSurfaceCard name="a2ui" clock={testClock} runId="run-registry" events={events} runStreaming={false} runSucceeded />);
    // 13114809 added this registry seam. Valid parents survive a refused child, so the
    // existing root renders with an action-refusal notice rather than a rootless surface notice.
    expect(screen.getByRole("status")).toHaveTextContent(`Action refused: Component type "fixture.caption" is not in catalog "${CATALOG_ID}" — refused, not rendered.`);
    expect(screen.getByText("⚠ missing component “caption”")).toBeInTheDocument();
    baseline.unmount();
    renderBound(<A2uiSurfaceCard name="a2ui" clock={testClock} runId="run-registry" events={events} runStreaming={false} runSucceeded registry={registry} />);
    expect(screen.getByRole("status")).toHaveTextContent("Injected provider rendered");
    expect(screen.queryByText(/(?:A2UI surface|Action) refused:/)).toBeNull();
    expect(screen.queryByText("⚠ missing component “caption”")).toBeNull();
  });
});
