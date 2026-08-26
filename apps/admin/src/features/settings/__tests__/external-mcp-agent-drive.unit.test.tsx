import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createFakeSourceConfigDependencies, type SourceConfigItem } from "@jini-ai/ui";
import { executePageCapability } from "@jini-ai/agentic/core";
import { createDomPageDriver } from "@jini-ai/agentic/dom";

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
  return render(<ExternalMcpSettingsPanel dependencies={dependencies} />);
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
