import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SecretInput, secretToggleLabels } from "../SecretInput/SecretInput";

/**
 * @file The shared eye toggle every admin password/token/key field uses: hidden by default, flips
 * the input type, names itself "Show/Hide <label>" with aria-pressed, never submits its form, and
 * re-hides once a save clears the value.
 */

function SavingForm({ onSubmit }: { onSubmit: () => void }) {
  const [value, setValue] = useState("");
  return (
    <form onSubmit={(event) => { event.preventDefault(); onSubmit(); setValue(""); }}>
      <label htmlFor="key">API key</label>
      <SecretInput label="API key" id="key" autoComplete="new-password" value={value} onChange={(event) => setValue(event.target.value)} />
      <button type="submit">Save</button>
    </form>
  );
}

describe("SecretInput", () => {
  it("starts hidden and reveals/re-hides on the eye toggle without submitting", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<SavingForm onSubmit={onSubmit} />);
    const input = screen.getByLabelText("API key");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("autocomplete", "new-password");
    expect(input).toHaveAttribute("spellcheck", "false");
    await user.type(input, "sk-123");
    const toggle = screen.getByRole("button", { name: "Show API key" });
    expect(toggle).toHaveAttribute("type", "button");
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle);
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveValue("sk-123");
    expect(screen.getByRole("button", { name: "Hide API key" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Hide API key" }));
    expect(input).toHaveAttribute("type", "password");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("is keyboard reachable and re-hides after a successful save clears the field", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<SavingForm onSubmit={onSubmit} />);
    const input = screen.getByLabelText("API key");
    await user.type(input, "sk-123");
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Show API key" }));
    await user.keyboard("[Enter]");
    expect(input).toHaveAttribute("type", "text");
    expect(onSubmit).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Show API key" })).toHaveAttribute("aria-pressed", "false");
  });

  it("can be revealed while still empty, so a paste is visible as it lands", async () => {
    const user = userEvent.setup();
    render(<SavingForm onSubmit={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Show API key" }));
    await user.type(screen.getByLabelText("API key"), "sk-1");
    expect(screen.getByLabelText("API key")).toHaveAttribute("type", "text");
  });

  it("disables the toggle with the input and passes agent attributes through", () => {
    render(<SecretInput label="Token" autoComplete="new-password" disabled toggleAttrs={{ "data-agent-element": "token-reveal" }} />);
    const toggle = screen.getByRole("button", { name: "Show Token" });
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute("data-agent-element", "token-reveal");
  });

  it("renders a non-secret declared field as plain text with no toggle and autocomplete off", () => {
    render(<SecretInput label="Username" secret={false} autoComplete="new-password" aria-label="Username" />);
    expect(screen.getByLabelText("Username")).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("Username")).toHaveAttribute("autocomplete", "off");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("translates the toggle name for the active locale", () => {
    expect(secretToggleLabels({ label: "Clé API" }, { locale: "fr" }).show).toBe("Afficher : Clé API");
    render(<SecretInput label="Clé API" locale="fr" />);
    expect(screen.getByRole("button", { name: "Afficher : Clé API" })).toBeInTheDocument();
  });
});
