import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AdminByokKeyFooter, AdminByokMigrationPrompt, resolveByokFooterStatusLine } from "../AdminByokKeyPanel";
import type { AdminExecutionCredentialController } from "../../hooks/use-admin-execution-credential.hooks";

/**
 * @file Presentational-only coverage for `AdminByokKeyPanel.tsx` — the migration banner and the
 * "Save key" footer. State/API behavior is covered by
 * `hooks/__tests__/use-admin-execution-credential.hooks.test.ts`; this file only pins the DOM
 * wiring (what renders, what's disabled, which controller method a click calls).
 */

function controller(overrides: Partial<AdminExecutionCredentialController> = {}): AdminExecutionCredentialController {
  return {
    stored: null,
    apiKeyStoredExternally: false,
    apiKeyPlaceholder: undefined,
    saveState: { status: "idle" },
    canSaveKey: false,
    saveKey: vi.fn(),
    legacyKey: null,
    migrateLegacyKey: vi.fn(),
    dismissLegacyPrompt: vi.fn(),
    ...overrides,
  };
}

describe("AdminByokMigrationPrompt", () => {
  it("renders nothing when there is no legacy key to migrate", () => {
    const { container } = render(<AdminByokMigrationPrompt controller={controller({ legacyKey: null })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the prompt and wires the confirm button to migrateLegacyKey", async () => {
    const user = userEvent.setup();
    const c = controller({ legacyKey: "sk-legacy" });
    render(<AdminByokMigrationPrompt controller={c} />);

    expect(screen.getByText(/we found a saved key in this browser/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /save to my account/i }));
    expect(c.migrateLegacyKey).toHaveBeenCalledTimes(1);
  });

  it("wires the decline button to dismissLegacyPrompt, and never calls migrateLegacyKey", async () => {
    const user = userEvent.setup();
    const c = controller({ legacyKey: "sk-legacy" });
    render(<AdminByokMigrationPrompt controller={c} />);

    await user.click(screen.getByRole("button", { name: /not now/i }));
    expect(c.dismissLegacyPrompt).toHaveBeenCalledTimes(1);
    expect(c.migrateLegacyKey).not.toHaveBeenCalled();
  });

  it("disables both buttons while a save is in flight", () => {
    render(<AdminByokMigrationPrompt controller={controller({ legacyKey: "sk-legacy", saveState: { status: "saving" } })} />);
    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /not now/i })).toBeDisabled();
  });

  it("surfaces the error message when a migration save fails", () => {
    render(
      <AdminByokMigrationPrompt
        controller={controller({ legacyKey: "sk-legacy", saveState: { status: "error", message: "no master key" } })}
      />,
    );
    expect(screen.getByText("no master key")).toBeInTheDocument();
  });

  it("never renders the raw legacy key value anywhere in the prompt", () => {
    render(<AdminByokMigrationPrompt controller={controller({ legacyKey: "sk-super-secret-value" })} />);
    expect(screen.queryByText(/sk-super-secret-value/)).not.toBeInTheDocument();
  });
});

describe("AdminByokKeyFooter", () => {
  it("disables Save when canSaveKey is false", () => {
    render(<AdminByokKeyFooter controller={controller({ canSaveKey: false })} />);
    expect(screen.getByRole("button", { name: /save key/i })).toBeDisabled();
  });

  it("enables Save and wires it to saveKey when canSaveKey is true", async () => {
    const user = userEvent.setup();
    const c = controller({ canSaveKey: true });
    render(<AdminByokKeyFooter controller={c} />);

    const button = screen.getByRole("button", { name: /save key/i });
    expect(button).toBeEnabled();
    await user.click(button);
    expect(c.saveKey).toHaveBeenCalledTimes(1);
  });

  it("shows the stored/encrypted status line once a credential is on the server", () => {
    render(<AdminByokKeyFooter controller={controller({ stored: { isSet: true, masked: "••••abcd", protocol: "anthropic", providerId: "anthropic", baseUrl: null, model: null, maxTokens: null, updatedAt: "2026-08-05T00:00:00.000Z" } })} />);
    expect(screen.getByText(/stored on the server, encrypted/i)).toBeInTheDocument();
  });

  it("shows the saved confirmation immediately after a successful save", () => {
    render(<AdminByokKeyFooter controller={controller({ saveState: { status: "saved", keyWritten: true } })} />);
    expect(screen.getByText(/saved to the server, encrypted\./i)).toBeInTheDocument();
  });

  it("reports a keyless save honestly rather than claiming the key was stored", () => {
    // The rendered counterpart of the `resolveByokFooterStatusLine` case below — this is the exact
    // DOM the owner was reading when they reported the panel "let them save a blank key".
    render(<AdminByokKeyFooter controller={controller({ saveState: { status: "saved", keyWritten: false } })} />);
    expect(screen.getByText(/your stored key was left unchanged/i)).toBeInTheDocument();
    expect(screen.queryByText(/saved to the server, encrypted\./i)).not.toBeInTheDocument();
  });

  it("surfaces a save error", () => {
    render(<AdminByokKeyFooter controller={controller({ saveState: { status: "error", message: "failed to save the key" } })} />);
    expect(screen.getByText("failed to save the key")).toBeInTheDocument();
  });
});

describe("resolveByokFooterStatusLine", () => {
  // Direct coverage of the pure function extracted out of `AdminByokKeyFooter`'s own render body —
  // the rendered-component tests above already pin the same four cases end-to-end; this exercises
  // the status/isStored combinations without a render at all.
  it("reports 'Saving…' while saving, regardless of isStored", () => {
    expect(resolveByokFooterStatusLine({ status: "saving" }, false)).toBe("Saving…");
    expect(resolveByokFooterStatusLine({ status: "saving" }, true)).toBe("Saving…");
  });

  it("reports the saved confirmation once saved", () => {
    expect(resolveByokFooterStatusLine({ status: "saved", keyWritten: true }, false)).toBe("Saved to the server, encrypted.");
  });

  it("does NOT claim the key was saved when the save carried no key", () => {
    // Owner-reported bug (2026-09-02): an empty field with a key already stored is the normal
    // returning-operator state, so "Save key" is deliberately enabled — but `saveKey` omits `apiKey`
    // from the PUT, so the write that happened was to the protocol/model fields, NOT to the key.
    // Answering "Saved to the server, encrypted." there tells the operator their blank field was
    // stored as the credential. The line must say what actually happened instead.
    const line = resolveByokFooterStatusLine({ status: "saved", keyWritten: false }, true);
    expect(line).not.toBe("Saved to the server, encrypted.");
    expect(line).toBe("Settings saved. Your stored key was left unchanged.");
  });

  it("distinguishes 'stored' from 'never stored' while idle", () => {
    expect(resolveByokFooterStatusLine({ status: "idle" }, true)).toBe("Stored on the server, encrypted. Paste a new key to replace it.");
    expect(resolveByokFooterStatusLine({ status: "idle" }, false)).toBe("Paste your key, then press Save key.");
  });

  it("returns null on error — the footer renders the error via a separate element", () => {
    expect(resolveByokFooterStatusLine({ status: "error", message: "boom" }, false)).toBeNull();
  });
});
