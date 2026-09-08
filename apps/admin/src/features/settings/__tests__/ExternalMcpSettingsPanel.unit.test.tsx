import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createFakeSourceConfigDependencies, type SourceConfigItem } from "@jini-ai/ui";

import { FetchQueryProvider } from "@/lib/fetch-query";

import { ExternalMcpSettingsPanel } from "../ExternalMcpSettingsPanel";

/**
 * @file Component-level coverage for `ExternalMcpSettingsPanel` — specifically the property
 * `rules.unit.test.ts`'s `buildExternalMcpFieldSpecs` tests cannot reach on their own: that the
 * add-form ACTUALLY re-renders with the right fields as an operator changes Connection type /
 * Credentials live, not just that the pure function returns the right array for a given snapshot.
 * Uses `@jini-ai/ui`'s own in-memory fake port (the same one `SettingsUi.unit.test.tsx` uses for tab
 * chrome), since this suite is about field reactivity, not the real `/mcp-servers` transport (see
 * `use-external-mcp.unit.test.ts` for that).
 */

function renderPanel() {
  const dependencies = createFakeSourceConfigDependencies<SourceConfigItem>({
    sources: [],
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

async function openAddForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Add server" }));
  // Confirms the panel finished its first load (fetchSources resolves asynchronously even with 0
  // latency) before any field assertions run.
  await screen.findByLabelText(/Connection type/);
}

describe("ExternalMcpSettingsPanel — add-form field visibility reacts live to the operator's choices", () => {
  it("opens to the stdio default: Command is present, URL and the OAuth block are absent", async () => {
    const user = userEvent.setup();
    renderPanel();
    await openAddForm(user);

    expect(screen.getByLabelText(/^Command/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^URL/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Client ID/)).not.toBeInTheDocument();
  });

  it("switching Connection type to a hosted server hides Command/Args/Env and reveals a required URL field", async () => {
    const user = userEvent.setup();
    renderPanel();
    await openAddForm(user);

    await user.selectOptions(screen.getByLabelText(/Connection type/), "streamable_http");

    expect(screen.queryByLabelText(/^Command/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Args/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Environment variables/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^URL/)).toBeInTheDocument();
  });

  it("switching Credentials to OAuth reveals the OAuth identity fields, and switching back hides them again", async () => {
    const user = userEvent.setup();
    renderPanel();
    await openAddForm(user);

    await user.selectOptions(screen.getByLabelText(/Credentials/), "oauth");
    expect(screen.getByLabelText(/^Client ID/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Sign-in method/)).toBeInTheDocument();
    // stdio (the still-active transport) + oauth needs an access-token env var.
    expect(screen.getByLabelText(/Access token environment variable/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/Credentials/), "static_env");
    expect(screen.queryByLabelText(/^Client ID/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Access token environment variable/)).not.toBeInTheDocument();
  });

  it("oauth + a hosted transport does not ask for the (stdio-only) access-token env var", async () => {
    const user = userEvent.setup();
    renderPanel();
    await openAddForm(user);

    await user.selectOptions(screen.getByLabelText(/Connection type/), "streamable_http");
    await user.selectOptions(screen.getByLabelText(/Credentials/), "oauth");

    expect(screen.getByLabelText(/^Client ID/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Access token environment variable/)).not.toBeInTheDocument();
  });
});

/**
 * @file (continued) Regression coverage for the accidental-delete incident: an operator pressed
 * a configured server's "Remove" and it deleted immediately, with no confirmation — unrecoverable
 * for an OAuth connection, since its sealed secret is not returned by the read API. `onRemove`
 * must open a confirmation dialog instead of calling `list.remove` directly; the port is only
 * ever reached from the dialog's own confirm action.
 */
function renderPanelWithSources(sources: SourceConfigItem[]) {
  const dependencies = createFakeSourceConfigDependencies<SourceConfigItem>({
    sources,
    createSource: (input) => ({ id: input.fields.id?.trim() || "new-server", fields: input.fields }),
  });
  return render(
    <FetchQueryProvider>
      <ExternalMcpSettingsPanel dependencies={dependencies} />
    </FetchQueryProvider>,
  );
}

const HIGGSFIELD: SourceConfigItem = { id: "higgsfield", fields: { id: "higgsfield", command: "npx" } };
const GITHUB: SourceConfigItem = { id: "github", fields: { id: "github", command: "npx" } };

describe("ExternalMcpSettingsPanel — Remove asks for confirmation before deleting", () => {
  it("pressing Remove does not delete the connection — it opens a confirmation dialog, and the row is untouched", async () => {
    const user = userEvent.setup();
    renderPanelWithSources([HIGGSFIELD]);
    await screen.findAllByTestId("source-config-item-card");

    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // Still there: the click must not have reached the port before confirmation.
    expect(screen.getAllByTestId("source-config-item-card")).toHaveLength(1);
  });

  it("names the right server when several are configured, not a sibling", async () => {
    const user = userEvent.setup();
    renderPanelWithSources([HIGGSFIELD, GITHUB]);
    await screen.findAllByTestId("source-config-item-card");

    const removeButtons = screen.getAllByRole("button", { name: "Remove" });
    await user.click(removeButtons[1]!); // github's row

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("github");
    expect(dialog).not.toHaveTextContent("higgsfield");
  });

  it("Confirm deletes exactly once", async () => {
    const user = userEvent.setup();
    renderPanelWithSources([HIGGSFIELD]);
    await screen.findAllByTestId("source-config-item-card");

    await user.click(screen.getByRole("button", { name: "Remove" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));

    // The fake port's own removeSource resolves via a Promise (not synchronously), so the row's
    // removal is awaited rather than asserted immediately.
    await waitFor(() => expect(screen.queryAllByTestId("source-config-item-card")).toHaveLength(0));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Cancel deletes nothing and leaves the row untouched", async () => {
    const user = userEvent.setup();
    renderPanelWithSources([HIGGSFIELD]);
    await screen.findAllByTestId("source-config-item-card");

    await user.click(screen.getByRole("button", { name: "Remove" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("source-config-item-card")).toHaveLength(1);
  });

  it("Escape deletes nothing and leaves the row untouched", async () => {
    const user = userEvent.setup();
    renderPanelWithSources([HIGGSFIELD]);
    await screen.findAllByTestId("source-config-item-card");

    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("source-config-item-card")).toHaveLength(1);
  });
});
