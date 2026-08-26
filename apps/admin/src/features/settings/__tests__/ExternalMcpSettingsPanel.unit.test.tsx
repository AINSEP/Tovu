import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createFakeSourceConfigDependencies, type SourceConfigItem } from "@jini-ai/ui";

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
  return render(<ExternalMcpSettingsPanel dependencies={dependencies} />);
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
