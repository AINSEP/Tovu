import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  AdminByokKeyFooter,
  AdminByokMigrationPrompt,
  AdminByokSettingsFooter,
  resolveByokFooterStatusLine,
  resolveByokSettingsStatusLine,
} from "../AdminByokKeyPanel";
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
    settingsSaveState: { status: "idle" },
    canSaveKey: false,
    saveKey: vi.fn(),
    saveSettings: vi.fn(),
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
    render(<AdminByokKeyFooter controller={controller({ saveState: { status: "saved" } })} />);
    expect(screen.getByText(/saved to the server, encrypted\./i)).toBeInTheDocument();
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
    expect(resolveByokFooterStatusLine("saving", false)).toBe("Saving…");
    expect(resolveByokFooterStatusLine("saving", true)).toBe("Saving…");
  });

  it("reports the saved confirmation once saved", () => {
    expect(resolveByokFooterStatusLine("saved", false)).toBe("Saved to the server, encrypted.");
  });

  it("distinguishes 'stored' from 'never stored' while idle", () => {
    expect(resolveByokFooterStatusLine("idle", true)).toBe("Stored on the server, encrypted. Paste a new key to replace it.");
    expect(resolveByokFooterStatusLine("idle", false)).toBe("Paste your key, then press Save key.");
  });

  it("returns null on error — the footer renders the error via a separate element", () => {
    expect(resolveByokFooterStatusLine("error", false)).toBeNull();
  });
});

describe("AdminByokSettingsFooter", () => {
  it("wires the Save settings button to saveSettings and never to saveKey", async () => {
    const user = userEvent.setup();
    const c = controller({ canSaveKey: true });
    render(<AdminByokSettingsFooter controller={c} />);

    await user.click(screen.getByRole("button", { name: /save settings/i }));
    expect(c.saveSettings).toHaveBeenCalledTimes(1);
    // The whole point of the split: this control cannot reach the key path at all.
    expect(c.saveKey).not.toHaveBeenCalled();
  });

  it("is enabled even with a blank key field — settings are not the key", () => {
    render(<AdminByokSettingsFooter controller={controller({ canSaveKey: false })} />);
    expect(screen.getByRole("button", { name: /save settings/i })).toBeEnabled();
  });

  it("disables itself only while its own save is in flight, not while the key is saving", () => {
    render(<AdminByokSettingsFooter controller={controller({ saveState: { status: "saving" } })} />);
    expect(screen.getByRole("button", { name: /save settings/i })).toBeEnabled();

    render(<AdminByokSettingsFooter controller={controller({ settingsSaveState: { status: "saving" } })} />);
    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
  });

  it("never claims a key was saved — its confirmation names the settings only", () => {
    render(<AdminByokSettingsFooter controller={controller({ settingsSaveState: { status: "saved" } })} />);
    expect(screen.getByText("Settings saved.")).toBeInTheDocument();
    expect(screen.queryByText(/encrypted/i)).not.toBeInTheDocument();
  });

  it("surfaces its own save error", () => {
    render(
      <AdminByokSettingsFooter controller={controller({ settingsSaveState: { status: "error", message: "boom" } })} />,
    );
    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("wears the SAME button class as Save key — the two read as one class of control", () => {
    // Owner ruling, 2026-09-02: same burnt-orange, from the same token. Asserted as class parity
    // rather than a colour, so it cannot pass with a hand-picked hex that merely looks similar —
    // `.btn-primary` is the only thing that resolves `var(--primary)`.
    const c = controller({ canSaveKey: true });
    const { container: keyFooter } = render(<AdminByokKeyFooter controller={c} />);
    const { container: settingsFooter } = render(<AdminByokSettingsFooter controller={c} />);

    const saveKey = keyFooter.querySelector("button");
    const saveSettings = settingsFooter.querySelector("button");
    expect(saveKey).toHaveClass("btn-primary");
    expect(saveSettings!.className).toBe(saveKey!.className);
  });
});

describe("resolveByokSettingsStatusLine", () => {
  it("reports progress and a settings-only confirmation, and nothing otherwise", () => {
    expect(resolveByokSettingsStatusLine("saving")).toBe("Saving…");
    expect(resolveByokSettingsStatusLine("saved")).toBe("Settings saved.");
    expect(resolveByokSettingsStatusLine("idle")).toBeNull();
    expect(resolveByokSettingsStatusLine("error")).toBeNull();
  });
});
