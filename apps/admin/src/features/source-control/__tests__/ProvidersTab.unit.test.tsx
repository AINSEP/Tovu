import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ProvidersTab } from "../ProvidersTab";
import type { SourceControlCredentialsController } from "../hooks/use-source-control-credentials.hooks";

// The sibling SourceControl suite covers load/save errors, accordion defaults,
// navigation and the real controller's saves. These fixtures target plugin fields.
// Author Checklist / F2.5/F4.1/F6.2: real inputs, literal field identities/values;
// callback delivery is the contract, and the subject is never mocked.
it("masks extra secret fields and routes edits by provider and declared field name", async () => {
  // Mutation: replace field.secret ? 'password' : 'text' with 'text', or pass
  // the sanitized DOM ID segment to setField instead of the declared name.
  const user = userEvent.setup();
  const setField = vi.fn();
  const controller: SourceControlCredentialsController = {
    rows: [{
      providerId: "atlas", token: "atlas-token", saved: undefined,
      values: { "client secret": "sealed", account: "alice" },
      saving: false, readyToSave: true, error: null,
      info: {
        id: "atlas", label: "Atlas", listed: true, tokenField: "token",
        tokenPageUrl: "", scopeGuidanceKey: "",
        fields: [
          { name: "client secret", label: "Client secret", secret: true, required: true },
          { name: "account", label: "Account", required: true },
          { name: "tenant", label: "Tenant", required: false },
        ],
      },
    }],
    loadError: null, t: (key) => key,
    setToken: vi.fn(), setField, save: vi.fn().mockResolvedValue(undefined),
  };
  render(<ProvidersTab useSourceControlCredentialsHook={() => controller} />);
  const row = screen.getByRole("heading", { name: "Connect Atlas" }).closest("details")!;
  const secret = within(row).getByLabelText("Client secret");
  const account = within(row).getByRole("textbox", { name: "Account" });
  expect(secret).toHaveAttribute("type", "password");
  expect(secret).toHaveAttribute("autocomplete", "new-password");
  expect(secret).toHaveValue("sealed");
  expect(account).toHaveAttribute("type", "text");
  expect(account).toHaveAttribute("autocomplete", "off");
  expect(account).toHaveValue("alice");
  expect(within(row).getByRole("textbox", { name: "Tenant" })).toHaveValue("");
  expect(within(row).getByLabelText("Access token")).toHaveAttribute("type", "password");
  await user.type(secret, "!");
  await user.type(account, "z");
  expect(setField.mock.calls).toEqual([
    ["atlas", "client secret", "sealed!"],
    ["atlas", "account", "alicez"],
  ]);
  expect(controller.setToken).not.toHaveBeenCalled();
});

it("omits empty scope guidance while retaining a usable token form", () => {
  // F4.4/F5.2: the listed row must render; a hidden/unlisted row cannot satisfy
  // this absence check. Mutation: render the guidance disclosure unconditionally.
  const controller: SourceControlCredentialsController = {
    rows: [{
      providerId: "boreal", token: "", values: {}, saved: undefined,
      saving: false, readyToSave: false, error: null,
      info: { id: "boreal", label: "Boreal", listed: true, tokenField: "token",
        fields: [], tokenPageUrl: "", scopeGuidanceKey: "" },
    }],
    loadError: null, t: (key) => key,
    setToken: vi.fn(), setField: vi.fn(), save: vi.fn().mockResolvedValue(undefined),
  };
  render(<ProvidersTab useSourceControlCredentialsHook={() => controller} />);
  const row = screen.getByRole("heading", { name: "Connect Boreal" }).closest("details")!;
  expect(row).toHaveAttribute("open");
  expect(within(row).getByLabelText("Access token")).toHaveValue("");
  expect(within(row).getByRole("button", { name: "Save" })).toBeDisabled();
  expect(within(row).queryByText("Which token do I need?")).not.toBeInTheDocument();
  expect(within(row).queryByRole("link", { name: "Create a token" })).not.toBeInTheDocument();
});
