import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ADMIN_PANELS } from "@/panels";
import { Authentication } from "../index";

/**
 * @file The Authentication provider-credential preview. Provider panels must expose the real
 * credential shape while remaining unmistakably disabled until a backend contract exists.
 */

describe("Authentication", () => {
  it("is wired into the Authentication panel registry entry", () => {
    const authenticationPanel = ADMIN_PANELS.find((panel) => panel.id === "authentication");

    expect(authenticationPanel).toBeDefined();
    render(
      <>
        {authenticationPanel?.render({
          view: null,
          params: {},
          query: new URLSearchParams(),
        })}
      </>,
    );

    expect(screen.getByRole("note")).toHaveTextContent(/provider authentication backend/i);
  });

  it("states the current backend boundary on the Home tab", () => {
    render(<Authentication />);

    expect(screen.getByRole("note")).toHaveTextContent(/local username and password/i);
    expect(screen.getByRole("note")).toHaveTextContent(/provider authentication backend/i);
  });

  it.each([
    ["Google", ["Client ID", "Client secret"]],
    ["Facebook", ["App ID", "App secret"]],
    ["LinkedIn", ["Client ID", "Client secret"]],
  ] as const)("renders disabled, required, secret-safe %s credential controls", async (tabLabel, fieldLabels) => {
    const user = userEvent.setup();
    render(<Authentication />);

    await user.click(screen.getByRole("button", { name: tabLabel }));

    expect(screen.getByRole("note")).toHaveTextContent(/not connected to a provider authentication backend/i);
    const [identityInput, secretInput] = fieldLabels.map((fieldLabel) =>
      screen.getByLabelText(new RegExp(`^${fieldLabel}`, "i")),
    );

    expect(identityInput).toBeDisabled();
    expect(identityInput).toBeRequired();
    expect(identityInput).toHaveAttribute("type", "text");
    expect(secretInput).toBeDisabled();
    expect(secretInput).toBeRequired();
    expect(secretInput).toHaveAttribute("type", "password");
    expect(secretInput).toHaveAttribute("autocomplete", "new-password");
    expect(secretInput).toHaveValue("");
    expect(screen.queryByRole("button", { name: /save|enable|connect/i })).not.toBeInTheDocument();
  });
});
