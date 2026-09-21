import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ComposioKeyField } from "../ComposioKeyField";
import type { ComposioKeyFieldController } from "../hooks/use-composio-key-field.hooks";
import type { ComposioConfigController } from "../hooks/use-composio-config.hooks";
import { t as composioT } from "../composio-i18n";

/**
 * @file `ComposioKeyField` — first test file for this component (0% before this pass). Covers both
 * the rendered markup off a real `composio` controller, and (per the `ConfirmDialog
 * dialog-hook injection` precedent every seamed component carries) that the `useKeyField` prop
 * this pass added actually reaches the render.
 */

function makeComposio(overrides: Partial<ComposioConfigController> = {}): ComposioConfigController {
  return {
    config: null,
    unlocked: false,
    loadError: null,
    saveState: "idle",
    saveError: null,
    catalogRefreshKey: 0,
    save: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("ComposioKeyField", () => {
  it("shows the unconfigured copy and a Save button with no Clear button when nothing is saved", () => {
    render(<ComposioKeyField composio={makeComposio()} />);

    expect(screen.getByText(/Save a Composio API key to load the live connector catalog/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });

  it("shows the configured copy with the key tail and a Clear button when a key is saved", () => {
    render(<ComposioKeyField composio={makeComposio({ config: { configured: true, apiKeyTail: "wxyz" } })} />);

    expect(screen.getByText("wxyz")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
  });

  it("typing a key enables Save, and clicking it calls composio.save with the trimmed value", async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockResolvedValue(undefined);
    render(<ComposioKeyField composio={makeComposio({ save })} />);

    await user.type(screen.getByLabelText("Composio API key"), "comp_secret");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(save).toHaveBeenCalledWith("comp_secret");
  });

  it("clicking Clear calls composio.clear", async () => {
    const user = userEvent.setup();
    const clear = vi.fn().mockResolvedValue(undefined);
    render(<ComposioKeyField composio={makeComposio({ config: { configured: true, apiKeyTail: "wxyz" }, clear })} />);

    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(clear).toHaveBeenCalledTimes(1);
  });

  it("shows the save error alert when saveState is error", () => {
    render(<ComposioKeyField composio={makeComposio({ saveState: "error", saveError: "bad key" })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("bad key");
  });

  it("shows the load error alert when loadError is set", () => {
    render(<ComposioKeyField composio={makeComposio({ loadError: "network down" })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("network down");
  });
});

describe("ComposioKeyField key-field-hook injection", () => {
  it("renders purely off an injected fake, proving useComposioKeyField is not hardcoded", () => {
    // The real hook derives `configured`/`busy` from the `composio` controller passed in — a fake
    // that reports `configured: true`/`busy: true` off an UNCONFIGURED, idle controller is
    // something the real hook could never produce, so this only passes if the render used the
    // fake.
    function useFakeKeyField(): ComposioKeyFieldController {
      return { draft: "prefilled", setDraft: vi.fn(), configured: true, busy: true, placeholder: "Replace saved key", onSave: vi.fn(), t: (key: string) => key };
    }

    render(<ComposioKeyField composio={makeComposio()} useKeyField={useFakeKeyField} />);

    expect(screen.getByLabelText("Composio API key")).toHaveValue("prefilled");
    expect(screen.getByLabelText("Composio API key")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Saving…" })).toBeInTheDocument();
  });
});

// Security finding #6 (Low, 2026-09-20 terra review): this field was English-only, hardcoded, with
// no t() call anywhere — the label, help text, placeholder, and Clear button all render straight off
// `t`, so a locale where the fallback-to-English chain does NOT apply proves the wiring is real
// rather than every string happening to equal its own dictionary miss.
describe("ComposioKeyField — translated copy (security finding #6)", () => {
  function useSpanishKeyField(): ComposioKeyFieldController {
    return {
      draft: "",
      setDraft: vi.fn(),
      configured: true,
      busy: false,
      placeholder: "Replace saved key",
      onSave: vi.fn(),
      t: (key: string) => composioT("es", key),
    };
  }

  it("renders the label, configured help (with the tail as a real <code> node), and Clear in Spanish", () => {
    render(<ComposioKeyField composio={makeComposio({ config: { configured: true, apiKeyTail: "wxyz" } })} useKeyField={useSpanishKeyField} />);

    expect(screen.getByText("Clave de API de Composio")).toBeInTheDocument();
    const help = screen.getByText(/Hay guardada una clave/);
    expect(help.querySelector("code")).toHaveTextContent("wxyz");
    expect(screen.getByRole("button", { name: "Borrar" })).toBeInTheDocument();
  });
});
