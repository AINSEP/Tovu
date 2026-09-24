import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeSourceConfigDependencies, type SourceConfigItem } from "@jini-ai/ui";
import { executePageCapability } from "@jini-ai/agentic/core";
import { createDomPageDriver } from "@jini-ai/agentic/dom";

import { FetchQueryProvider } from "@/lib/fetch-query";
import type { AdminRemoteToolSurfaceEntry } from "@/lib/api";

import { ExternalMcpSettingsPanel } from "../ExternalMcpSettingsPanel";

/**
 * @file Regression test for the property the whole External MCP agent-control feature rests on:
 * the assistant can drive the REAL reactive add form through `page.*` verbs, so a novice can ask
 * for a connection instead of learning which of fourteen fields apply to it.
 *
 * This started life as a feasibility probe that stamped `data-agent-element` onto Jini's inputs
 * from outside React with a `MutationObserver`, because `@jini-ai/ui`'s `SourceConfigField`
 * emitted no such markup and exposed no prop to add any. That prop now exists (`agentHandle`), so
 * the scaffolding is gone and every handle below is one the shipping components actually publish.
 * The verbs run through the real `executePageCapability` and the real `createDomPageDriver` — not
 * `userEvent` — so this exercises the same code path the agent bridge does.
 *
 * The three properties, each of which reasoning alone could not settle:
 *
 * 1. A second `find_elements` after a `select_option` discovers fields that did not exist on the
 *    first call. `ExternalMcpSettingsPanel` has a deliberate ONE-RENDER LAG (`transportGuess`/
 *    `authModeGuess` are synced in an effect, not derived in the same render), so whether the
 *    newly-applicable fields have mounted by the agent's next call is a timing question.
 * 2. `page.fill` reaches React state, not just the DOM node.
 * 3. `page.fill` REFUSES the OAuth client secret, with its exact message — the human/agent split
 *    the owner wants comes for free rather than needing to be built.
 *
 * ## What this does NOT prove
 *
 * Timing in a real browser. Removing every `driver.settle()` call below left all of these green,
 * so jsdom plus React's act environment already resolve the re-render before `settle` is reached —
 * the margin measured here is jsdom's, not Chrome's. The `settle()` calls are kept because they
 * are what the real bridge does; the claim they support is STRUCTURAL (the second `find_elements`
 * is a live re-read of the DOM, and the newly-mounted fields are in its result), not "two
 * animation frames is enough time".
 */

interface FoundElements {
  elements: { handle: string; label: string }[];
}

async function findElements(driver: ReturnType<typeof createDomPageDriver>): Promise<string[]> {
  const result = (await executePageCapability(driver, "page.find_elements", {})) as FoundElements;
  return result.elements.map((element) => element.handle);
}

function renderPanel(sources: SourceConfigItem[] = []) {
  const dependencies = createFakeSourceConfigDependencies<SourceConfigItem>({
    sources,
    createSource: (input) => ({ id: input.fields.id?.trim() || "new-server", fields: input.fields }),
  });
  // The panel now also asks the RUNNING assistant what it admitted
  // (`useWiredExternalMcpAdmissions` -> `useFetchQuery`), which needs the app's query client. In
  // production `FetchQueryProvider` is mounted at the app root; here it has to be explicit. The
  // reads themselves fail in jsdom and the banner degrades to its "could not ask" line, which is
  // exactly the behaviour under test elsewhere and is invisible to the field assertions below.
  return render(
    <FetchQueryProvider>
      <ExternalMcpSettingsPanel dependencies={dependencies} />
    </FetchQueryProvider>,
  );
}

/** Opens the add form and returns a driver over the rendered panel, as the agent bridge would. */
async function openAddForm() {
  const user = userEvent.setup();
  const { container } = renderPanel();
  await user.click(screen.getByRole("button", { name: "Add server" }));
  await screen.findByLabelText(/Connection type/);
  return createDomPageDriver({ root: container, pages: {} });
}

describe("driving the reactive External MCP add form through page.* verbs", () => {
  it("a second find_elements after select_option discovers fields that did not exist on the first call", async () => {
    const driver = await openAddForm();

    const before = await findElements(driver);
    expect(before).toContain("mcp-add-field-command");
    expect(before).not.toContain("mcp-add-field-url");
    expect(before).not.toContain("mcp-add-field-oauth-client-id");

    // The agent's move, through the real executor and the real driver — not userEvent.
    await executePageCapability(driver, "page.select_option", {
      handle: "mcp-add-field-transport",
      option: "Hosted server (URL)",
    });
    await driver.settle?.();

    const afterTransport = await findElements(driver);
    expect(afterTransport).toContain("mcp-add-field-url");
    expect(afterTransport).not.toContain("mcp-add-field-command");

    await executePageCapability(driver, "page.select_option", {
      handle: "mcp-add-field-auth-mode",
      option: "Connect via OAuth",
    });
    await driver.settle?.();

    const afterAuth = await findElements(driver);
    expect(afterAuth).toContain("mcp-add-field-oauth-client-id");
    expect(afterAuth).toContain("mcp-add-field-oauth-client-secret");
    expect(afterAuth).toContain("mcp-add-field-oauth-token-endpoint");
  });

  it("page.fill writes the non-secret fields and the values reach React state", async () => {
    const driver = await openAddForm();
    await executePageCapability(driver, "page.select_option", {
      handle: "mcp-add-field-transport",
      option: "Hosted server (URL)",
    });
    await driver.settle?.();

    await executePageCapability(driver, "page.fill", { handle: "mcp-add-field-id", text: "higgsfield" });
    await executePageCapability(driver, "page.fill", {
      handle: "mcp-add-field-url",
      text: "https://mcp.example.com/v1",
    });
    await driver.settle?.();

    expect((screen.getByLabelText(/^ID/) as HTMLInputElement).value).toBe("higgsfield");
    expect((screen.getByLabelText(/^URL/) as HTMLInputElement).value).toBe("https://mcp.example.com/v1");
  });

  it("page.fill REFUSES the OAuth client secret even though it carries a handle", async () => {
    const driver = await openAddForm();
    await executePageCapability(driver, "page.select_option", {
      handle: "mcp-add-field-auth-mode",
      option: "Connect via OAuth",
    });
    await driver.settle?.();

    // Exact text, not just "it threw": a bare `.toThrow()` would also pass for an unresolved or
    // ambiguous handle, which is the opposite of the property being claimed.
    await expect(
      executePageCapability(driver, "page.fill", {
        handle: "mcp-add-field-oauth-client-secret",
        text: "hunter2",
      }),
      // `SourceConfigField` renders `kind: "password"` as a real `type="password"` input while
      // hidden, so the refusal is the type-based one. Its "Show" toggle flips it to `type="text"`,
      // and the name-based rule ("...secret...") catches it there — refused either way, but this
      // asserts the message actually produced rather than the one assumed.
    ).rejects.toThrow(
      'refusing to fill "mcp-add-field-oauth-client-secret": this field type can never be filled by an agent',
    );

    // And the value really is still empty — the refusal is not cosmetic.
    expect((screen.getByLabelText(/^Client secret/) as HTMLInputElement).value).toBe("");
  });

  it("publishes the submit button, so the agent can complete the flow it started", async () => {
    const driver = await openAddForm();
    expect(await findElements(driver)).toContain("mcp-add-submit");
  });
});

describe("addressing the configured servers", () => {
  // Two servers whose ids slugify to the SAME handle. If the panel handed both cards one base,
  // every verb aimed at either would resolve ambiguously — and silently, since the first DOM match
  // wins. This is the end-to-end check on `rules.ts`'s `buildExternalMcpCardHandles`.
  const COLLIDING_SOURCES: SourceConfigItem[] = [
    { id: "My_Server", fields: { id: "My_Server", command: "npx" } },
    { id: "my.server", fields: { id: "my.server", command: "npx" } },
  ];

  it("gives every configured server a distinct, id-derived handle", async () => {
    const { container } = renderPanel(COLLIDING_SOURCES);
    // The fake port resolves its list asynchronously, exactly as the real one does: nothing is
    // addressable until the cards have actually mounted.
    await screen.findAllByTestId("source-config-item-card");
    const driver = createDomPageDriver({ root: container, pages: {} });

    const handles = await findElements(driver);
    expect(handles).toContain("mcp-server-my-server");
    expect(handles).toContain("mcp-server-my-server-2");
    expect(new Set(handles).size).toBe(handles.length);
  });

  it("publishes each card's own remove button under that card's handle", async () => {
    const { container } = renderPanel([{ id: "higgsfield", fields: { id: "higgsfield", command: "npx" } }]);
    // The fake port resolves its list asynchronously, exactly as the real one does: nothing is
    // addressable until the cards have actually mounted.
    await screen.findAllByTestId("source-config-item-card");
    const driver = createDomPageDriver({ root: container, pages: {} });

    expect(await findElements(driver)).toContain("mcp-server-higgsfield-remove");
  });
});

/**
 * @file (continued) `ExternalMcpRemoveConfirmDialog` must be drivable through the SAME real
 * `page.*` verbs as everything else on this panel — an assistant that can `page.click` the card's
 * own `-remove` handle has to be able to finish (or abandon) the confirmation it opens, rather
 * than deadlocking on a dialog it cannot see. Driven through `executePageCapability` +
 * `createDomPageDriver`, not `userEvent`, matching this file's own module doc.
 */
describe("Remove confirmation dialog: the agent may open and cancel it, never confirm it", () => {
  function renderOneServer() {
    return renderPanel([{ id: "higgsfield", fields: { id: "higgsfield", command: "npx" } }]);
  }

  it("page.click on <cardHandle>-remove opens the dialog and publishes only its cancel control", async () => {
    const { container } = renderOneServer();
    await screen.findAllByTestId("source-config-item-card");
    const driver = createDomPageDriver({ root: container, pages: {} });

    await executePageCapability(driver, "page.click", { handle: "mcp-server-higgsfield-remove" });
    await driver.settle?.();

    const afterOpen = await findElements(driver);
    expect(afterOpen).toContain("mcp-server-higgsfield-remove-cancel");
    expect(afterOpen).not.toContain("mcp-server-higgsfield-remove-confirm");
  });

  it("page.click on <cardHandle>-remove-confirm is refused, and the connection stays", async () => {
    // A permanent remove (the saved server and its credentials) is a human-only step.
    const { container } = renderOneServer();
    await screen.findAllByTestId("source-config-item-card");
    const driver = createDomPageDriver({ root: container, pages: {} });

    await executePageCapability(driver, "page.click", { handle: "mcp-server-higgsfield-remove" });
    await driver.settle?.();
    await expect(
      executePageCapability(driver, "page.click", { handle: "mcp-server-higgsfield-remove-confirm" }),
    ).rejects.toThrow('no element published as "mcp-server-higgsfield-remove-confirm" on this page');

    expect(screen.getAllByTestId("source-config-item-card")).toHaveLength(1);
  });

  it("page.click on <cardHandle>-remove-cancel leaves the connection untouched", async () => {
    const { container } = renderOneServer();
    await screen.findAllByTestId("source-config-item-card");
    const driver = createDomPageDriver({ root: container, pages: {} });

    await executePageCapability(driver, "page.click", { handle: "mcp-server-higgsfield-remove" });
    await driver.settle?.();
    await executePageCapability(driver, "page.click", { handle: "mcp-server-higgsfield-remove-cancel" });
    await driver.settle?.();

    expect(screen.getAllByTestId("source-config-item-card")).toHaveLength(1);
    expect(await findElements(driver)).not.toContain("mcp-server-higgsfield-remove-confirm");
  });
});

/**
 * @file (continued) The per-server Tools modal (2026-09-10, superseding the 2026-09-08
 * Connection/Tools `TabBar` this describe block originally covered) must be agent-pressable the
 * same way as everything else on this panel: an assistant opens a server's Tools modal, ticks a
 * tool, and saves — all through the real `page.*` verbs.
 *
 * `ExternalMcpToolPicker` always calls the REAL `useWiredExternalMcpToolPicker`, which probes over
 * `fetch` — there is no port-injection seam at the component level (unlike the roster list, which
 * takes `dependencies`). So this describe block stubs `global.fetch` to answer the probe route with
 * a real `AdminRemoteToolSurfaceEntry[]` body, the same pattern
 * `lib/__tests__/api-external-mcp-admissions.unit.test.ts` uses for the sibling admissions route.
 * The panel's OWN admissions-banner fetch shares the same stub; its response doesn't carry a
 * `connections` array, which `api.getExternalMcpAdmissions` already treats as "nothing to report"
 * (`?? []`) rather than a crash, so this is silent and irrelevant to the assertions below.
 */
describe("the Tools modal is agent-pressable", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const PROBE_TOOLS: AdminRemoteToolSurfaceEntry[] = [
    {
      remoteName: "generate_image",
      description: "Generate an image from a prompt.",
      declaredAnnotations: { readOnlyHint: false },
      writeDeclared: true,
      destructiveDeclared: false,
      hintsAbsent: false,
      allowlisted: true,
      writeAllowed: true,
      admitted: true,
      refusalReason: null,
    },
    {
      remoteName: "edit_image",
      description: "Edit an existing image.",
      declaredAnnotations: { readOnlyHint: false },
      writeDeclared: true,
      destructiveDeclared: false,
      hintsAbsent: false,
      allowlisted: true,
      writeAllowed: false,
      admitted: true,
      refusalReason: null,
    },
  ];

  const HIGGSFIELD_WITH_TOOLS: SourceConfigItem = {
    id: "higgsfield",
    fields: {
      id: "higgsfield",
      command: "npx",
      allowedToolNames: "generate_image, edit_image",
      writeAllowedToolNames: "generate_image",
    },
  };

  function stubProbeFetch() {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ tools: PROBE_TOOLS, probedAt: "2026-09-08T00:00:00.000Z" }), { status: 200 })),
    );
  }

  it("page.click on <cardHandle>-tools-open opens the modal: Remove stays visible, the picker's own controls appear", async () => {
    stubProbeFetch();
    const { container } = renderPanel([HIGGSFIELD_WITH_TOOLS]);
    await screen.findAllByTestId("source-config-item-card");
    const driver = createDomPageDriver({ root: container, pages: {} });

    const before = await findElements(driver);
    expect(before).toContain("mcp-server-higgsfield-remove");
    expect(before).toContain("mcp-server-higgsfield-tools-open");
    expect(before).not.toContain("mcp-server-higgsfield-tools-save");

    await executePageCapability(driver, "page.click", { handle: "mcp-server-higgsfield-tools-open" });
    await driver.settle?.();
    // The picker's own header controls render as soon as the modal mounts it, before the probe
    // resolves — waited on here so the rest of this test isn't racing the fetch.
    await screen.findByText("2 of 2 tools enabled");

    const afterOpen = await findElements(driver);
    // Remove is NEVER hidden by this modal — unlike the old TabBar, which unmounted the Connection
    // card (and its Remove button) while the Tools tab was active. That was the whole point of
    // moving Tools off the card's own action cluster: see `ExternalMcpSettingsPanel.tsx`'s header on
    // widening the visual (and now structural) distance between Tools and the unrecoverable Remove.
    expect(afterOpen).toContain("mcp-server-higgsfield-remove");
    expect(afterOpen).toContain("mcp-server-higgsfield-tools-save");
    expect(afterOpen).toContain("mcp-server-higgsfield-tools-refresh");
    expect(afterOpen).toContain("mcp-server-higgsfield-tools-generate-image");
    expect(afterOpen).toContain("mcp-server-higgsfield-tools-edit-image");

    await executePageCapability(driver, "page.click", { handle: "mcp-server-higgsfield-tools-modal-close" });
    await driver.settle?.();

    const afterClose = await findElements(driver);
    expect(afterClose).toContain("mcp-server-higgsfield-remove");
    expect(afterClose).not.toContain("mcp-server-higgsfield-tools-save");
  });

  it("every tool checkbox has a REAL accessible name — a real <label>, not just data-agent-label", async () => {
    stubProbeFetch();
    const user = userEvent.setup();
    renderPanel([HIGGSFIELD_WITH_TOOLS]);
    await screen.findAllByTestId("source-config-item-card");

    await user.click(screen.getByRole("button", { name: /Open tool permissions/ }));
    // `getByRole` resolves the accessible name via the wrapping <label>, exactly as a screen reader
    // (or an agent bridge reading the accessibility tree) would — `agentHandle`'s own `label` option
    // emits `data-agent-label`, which neither of these reads at all, so this would fail if the real
    // <label> wrapper were ever dropped in favor of relying on that attribute alone.
    expect(await screen.findByRole("checkbox", { name: "generate_image" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "edit_image" })).toBeInTheDocument();
  });

  it("page.click toggles a tool's allowlist checkbox through the real driver, and the count updates", async () => {
    stubProbeFetch();
    const { container } = renderPanel([HIGGSFIELD_WITH_TOOLS]);
    await screen.findAllByTestId("source-config-item-card");
    const driver = createDomPageDriver({ root: container, pages: {} });

    await executePageCapability(driver, "page.click", { handle: "mcp-server-higgsfield-tools-open" });
    await driver.settle?.();
    await screen.findByText("2 of 2 tools enabled");

    await executePageCapability(driver, "page.click", { handle: "mcp-server-higgsfield-tools-edit-image" });
    await driver.settle?.();

    expect(screen.getByText("1 of 2 tools enabled")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "edit_image" })).not.toBeChecked();
    // generate_image is untouched — this was a per-row toggle, not a reset of the whole draft.
    expect(screen.getByRole("checkbox", { name: "generate_image" })).toBeChecked();
  });
});
