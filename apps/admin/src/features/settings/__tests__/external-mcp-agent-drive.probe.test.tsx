import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { createFakeSourceConfigDependencies, type SourceConfigItem } from "@jini-ai/ui";
import { executePageCapability } from "@jini-ai/agentic/core";
import { createDomPageDriver } from "@jini-ai/agentic/dom";

import { ExternalMcpSettingsPanel } from "../ExternalMcpSettingsPanel";

/**
 * @file FEASIBILITY PROBE (not a product regression test) for "Option A" — can an agent drive the
 * real reactive External MCP add form through `page.*`, rather than through a separate in-chat card?
 *
 * The two things reasoning alone could not settle, and that this file answers by running:
 *
 * 1. `createDomPageDriver.findElements` re-queries `root.querySelectorAll('[data-agent-element]')`
 *    on EVERY call, so a second `page.find_elements` is a live read — but `ExternalMcpSettingsPanel`
 *    has a deliberate ONE-RENDER LAG (`transportGuess`/`authModeGuess` are synced in an effect, not
 *    derived in the same render). Whether the newly-applicable fields have actually mounted by the
 *    time the agent's next call runs is a timing question, not a structural one.
 * 2. `page.fill`'s guard refuses credential fields. Whether `oauthClientSecret` — rendered by
 *    `@jini-ai/ui`'s `SourceConfigField` as `kind: "password"` — is actually seen as one by that
 *    guard decides whether the human/agent split the owner wants is free or has to be built.
 *
 * ## Why the handles are stamped by a MutationObserver here
 *
 * The fields are rendered by `@jini-ai/ui`'s `SourceConfigAddForm`/`SourceConfigField`, which emit
 * NO `data-agent-element` and expose no prop to add one. Tovu owns the panel, not the inputs. So the
 * probe stamps handles onto `SourceConfigField`'s own deterministic `id`
 * (`source-config-field-<key>`) from outside React, which is the cheapest mechanism available to
 * Tovu without a Jini change — deliberately the WEAKEST of the candidate mechanisms, so a pass here
 * is a lower bound on what a real implementation could achieve, not an optimistic one.
 *
 * ## What this probe does NOT prove
 *
 * Timing in a real browser. Removing every `driver.settle()` call below and re-running left all
 * three green, so jsdom plus React's act environment already resolve the re-render before `settle`
 * is reached — the margin measured here is jsdom's, not Chrome's. The `settle()` calls are kept
 * because they are what the real bridge does; the claim they support is STRUCTURAL (the second
 * `find_elements` is a live re-read, and the newly-mounted fields are in its result), not
 * "two animation frames is enough time".
 */

/** `oauthClientId` -> `oauthclientid`; handles are lowercase words joined by single hyphens. */
function handleForFieldKey(key: string): string {
  return `mcp-${key.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}`;
}

const FIELD_ID_PREFIX = "source-config-field-";

/** Stamps `data-agent-element`/`-role` on every add-form field currently in the DOM. */
function stampFieldHandles(root: ParentNode): void {
  for (const control of Array.from(root.querySelectorAll(`[id^="${FIELD_ID_PREFIX}"]`))) {
    if (control.hasAttribute("data-agent-element")) continue;
    const key = control.id.slice(FIELD_ID_PREFIX.length);
    control.setAttribute("data-agent-element", handleForFieldKey(key));
    control.setAttribute("data-agent-role", "field");
  }
}

let observer: MutationObserver | undefined;

function watchAndStamp(root: HTMLElement): void {
  stampFieldHandles(root);
  observer = new MutationObserver(() => stampFieldHandles(root));
  observer.observe(root, { childList: true, subtree: true });
}

afterEach(() => {
  observer?.disconnect();
  observer = undefined;
});

function renderPanel() {
  const dependencies = createFakeSourceConfigDependencies<SourceConfigItem>({
    sources: [],
    createSource: (input) => ({ id: input.fields.id?.trim() || "new-server", fields: input.fields }),
  });
  return render(<ExternalMcpSettingsPanel dependencies={dependencies} />);
}

interface FoundElements {
  elements: { handle: string; label: string }[];
}

async function findElements(driver: ReturnType<typeof createDomPageDriver>): Promise<string[]> {
  const result = (await executePageCapability(driver, "page.find_elements", {})) as FoundElements;
  return result.elements.map((element) => element.handle);
}

describe("PROBE: driving the reactive External MCP add form through page.* verbs", () => {
  it("a second find_elements after select_option discovers fields that did not exist on the first call", async () => {
    const user = userEvent.setup();
    const { container } = renderPanel();
    await user.click(screen.getByRole("button", { name: "Add server" }));
    await screen.findByLabelText(/Connection type/);
    watchAndStamp(container);

    const driver = createDomPageDriver({ root: container, pages: {} });

    const before = await findElements(driver);
    expect(before).toContain("mcp-command");
    expect(before).not.toContain("mcp-url");
    expect(before).not.toContain("mcp-oauth-client-id");

    // The agent's move, through the real executor and the real driver — not userEvent.
    await executePageCapability(driver, "page.select_option", {
      handle: "mcp-transport",
      option: "Hosted server (URL)",
    });
    await driver.settle?.();

    const afterTransport = await findElements(driver);
    expect(afterTransport).toContain("mcp-url");
    expect(afterTransport).not.toContain("mcp-command");

    await executePageCapability(driver, "page.select_option", {
      handle: "mcp-auth-mode",
      option: "Connect via OAuth",
    });
    await driver.settle?.();

    const afterAuth = await findElements(driver);
    expect(afterAuth).toContain("mcp-oauth-client-id");
    expect(afterAuth).toContain("mcp-oauth-client-secret");
    expect(afterAuth).toContain("mcp-oauth-token-endpoint");
  });

  it("page.fill writes the non-secret fields and the values reach React state", async () => {
    const user = userEvent.setup();
    const { container } = renderPanel();
    await user.click(screen.getByRole("button", { name: "Add server" }));
    await screen.findByLabelText(/Connection type/);
    watchAndStamp(container);

    const driver = createDomPageDriver({ root: container, pages: {} });
    await executePageCapability(driver, "page.select_option", {
      handle: "mcp-transport",
      option: "Hosted server (URL)",
    });
    await driver.settle?.();

    await executePageCapability(driver, "page.fill", { handle: "mcp-id", text: "higgsfield" });
    await executePageCapability(driver, "page.fill", { handle: "mcp-url", text: "https://mcp.example.com/v1" });
    await driver.settle?.();

    expect((screen.getByLabelText(/^ID/) as HTMLInputElement).value).toBe("higgsfield");
    expect((screen.getByLabelText(/^URL/) as HTMLInputElement).value).toBe("https://mcp.example.com/v1");
  });

  it("page.fill REFUSES the OAuth client secret even though it carries a handle", async () => {
    const user = userEvent.setup();
    const { container } = renderPanel();
    await user.click(screen.getByRole("button", { name: "Add server" }));
    await screen.findByLabelText(/Connection type/);
    watchAndStamp(container);

    const driver = createDomPageDriver({ root: container, pages: {} });
    await executePageCapability(driver, "page.select_option", {
      handle: "mcp-auth-mode",
      option: "Connect via OAuth",
    });
    await driver.settle?.();

    // Exact text, not just "it threw": a bare `.toThrow()` would also pass for an unresolved or
    // ambiguous handle, which is the opposite of the property being claimed.
    await expect(
      executePageCapability(driver, "page.fill", { handle: "mcp-oauth-client-secret", text: "hunter2" }),
    // `SourceConfigField` renders `kind: "password"` as a real `type="password"` input while
    // hidden, so the refusal is the type-based one. Its "Show" toggle flips it to `type="text"`,
    // and the name-based rule ("...secret...") catches it there — refused either way, but this
    // asserts the message actually produced rather than the one assumed.
    ).rejects.toThrow(
      'refusing to fill "mcp-oauth-client-secret": this field type can never be filled by an agent',
    );

    // And the value really is still empty — the refusal is not cosmetic.
    expect((screen.getByLabelText(/^Client secret/) as HTMLInputElement).value).toBe("");
  });
});
