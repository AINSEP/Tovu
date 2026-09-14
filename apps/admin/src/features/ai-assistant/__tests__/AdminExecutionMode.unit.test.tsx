import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ByokConfig, ExecutionConfig } from "@jini-ai/ui";

import { AdminExecutionMode } from "../AiAssistant";
import type { AdminExecutionModeController } from "../hooks/use-admin-execution-mode.hooks";
import { createFakeAdminExecutionCredentialPort } from "@/hooks/admin-execution-credential-dependencies.hooks";
import {
  useAdminExecutionCredential,
  type AdminExecutionCredentialController,
} from "@/hooks/use-admin-execution-credential.hooks";
import type { SettingsSlice } from "@/hooks/use-settings-slice.hooks";
import type { AdminExecutionCredential } from "@/lib/api";
import { createExecutionPort, DEFAULT_EXECUTION_CONFIG } from "@/lib/execution-settings";
import {
  GOOGLE,
  GOOGLE_ADMIN_KEY,
  OPENAI,
  apiKeyField,
  createServerPinnedProbes,
  formOn,
  presetFor,
  settle,
} from "@/lib/__tests__/stored-credential-endpoint.test-helpers";

/**
 * @file First direct test for `AdminExecutionMode` (previously unexported, no test file of its own —
 * only reachable through `AiAssistant`'s "Admin AI Assistant" tab). Exported alongside this file in
 * the same Orc-BASH pass that converted its inline `useWiredAdminExecutionCredential({...})` call
 * (`AiAssistant.tsx`) into the `useAdminExecutionCredentialHook` prop below — the seam this suite
 * exercises. Mirrors `SettingsUi.unit.test.tsx`'s identical "renders from the injected fake, not a
 * real round trip" assertion for the SAME shared hook's other mount, since the two must never
 * disagree (see `AdminExecutionMode`'s own doc comment in `AiAssistant.tsx`).
 */

function makeSlice<T>(value: T, overrides: Partial<SettingsSlice<T>> = {}): SettingsSlice<T> {
  return {
    value,
    loadError: null,
    saveState: { status: "idle" },
    onChange: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  };
}

function fakeExecutionModeController(overrides: Partial<AdminExecutionModeController> = {}): AdminExecutionModeController {
  return {
    port: { current: createExecutionPort() },
    execution: makeSlice<ExecutionConfig>(DEFAULT_EXECUTION_CONFIG),
    ...overrides,
  };
}

/** Same fake shape as `SettingsUi.unit.test.tsx`'s `fakeAdminExecutionCredentialController` — the two
 *  mounts share one `AdminExecutionCredentialController` type, so one fake helper shape fits both. */
function fakeAdminExecutionCredentialController(
  overrides: Partial<AdminExecutionCredentialController> = {},
): AdminExecutionCredentialController {
  return {
    stored: null,
    apiKeyStoredExternally: false,
    apiKeyPlaceholder: undefined,
    storedKeyIsForOtherEndpoint: false,
    canDiscoverModels: true,
    saveState: { status: "idle" },
    settingsSaveState: { status: "idle" },
    canSaveKey: false,
    saveKey: vi.fn(async () => {}),
    saveSettings: vi.fn(async () => {}),
    legacyKey: null,
    migrateLegacyKey: vi.fn(async () => {}),
    dismissLegacyPrompt: vi.fn(),
    ...overrides,
  };
}

describe("AdminExecutionMode — useAdminExecutionCredentialHook injection", () => {
  it("renders the migration prompt from the injected fake, not from a real credential round trip", () => {
    render(
      <AdminExecutionMode
        useAdminExecutionModeHook={() => fakeExecutionModeController()}
        useAdminExecutionCredentialHook={() =>
          fakeAdminExecutionCredentialController({ legacyKey: "sk-legacy-from-fake" })
        }
      />,
    );
    // `AdminByokMigrationPrompt` renders only when `controller.legacyKey` is non-null — the real
    // hook can't settle a network GET synchronously within `render()`, so this text appearing at
    // all proves the fake controller is what fed this panel, not the real wired hook.
    expect(screen.getByText(/We found a saved key in this browser/)).toBeInTheDocument();
  });

  it("mounts BOTH save footers into the REAL ExecutionTab slots when BYOK mode is selected", () => {
    // The real composition, not a replica: `AdminByokKeyFooter` and `AdminByokSettingsFooter` are
    // handed to `@jini-ai/ui`'s `ExecutionTab` as `apiKeyFooter`/`formFooter`, and `ExecutionTab`
    // forwards them to `ByokProviderForm`'s two slots. A unit test of either footer alone would pass
    // with the prop never wired through — this is what proves the pass-through exists at both hops.
    //
    // `mode: "byok"` because the default is `local-cli`, which renders the CLI grid and no card.
    render(
      <AdminExecutionMode
        useAdminExecutionModeHook={() =>
          fakeExecutionModeController({ execution: makeSlice<ExecutionConfig>({ ...DEFAULT_EXECUTION_CONFIG, mode: "byok" }) })
        }
        useAdminExecutionCredentialHook={() => fakeAdminExecutionCredentialController()}
      />,
    );

    expect(screen.getByRole("button", { name: "Save key" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save settings" })).toBeInTheDocument();
  });

  it("still renders normally when the credential hook is left at its default", () => {
    render(<AdminExecutionMode useAdminExecutionModeHook={() => fakeExecutionModeController()} />);
    // No migration prompt (nothing to fake a legacy key with), but the execution form itself renders.
    expect(screen.queryByText(/We found a saved key in this browser/)).not.toBeInTheDocument();
  });

  it("renders exactly one save-confirmation line when a BYOK settings save completes", () => {
    // Owner-reported bug: the ledger's own generic auto-save line (`execution.saveState`, fed by every
    // edit to `core.execution` — mode switch, Local CLI agent picks, and also every BYOK field
    // keystroke since `ByokProviderForm` routes through the same `onConfigChange`) used to render
    // alongside `AdminByokSettingsFooter`'s own "Settings saved." line, stacking two confirmations
    // under one button press. Both landing on "saved" here reproduces that overlap.
    render(
      <AdminExecutionMode
        useAdminExecutionModeHook={() =>
          fakeExecutionModeController({
            execution: makeSlice<ExecutionConfig>(
              { ...DEFAULT_EXECUTION_CONFIG, mode: "byok" },
              { saveState: { status: "saved" } },
            ),
          })
        }
        useAdminExecutionCredentialHook={() =>
          fakeAdminExecutionCredentialController({ settingsSaveState: { status: "saved" } })
        }
      />,
    );

    expect(screen.getByText("Settings saved.")).toBeInTheDocument();
    // The generic ledger line's own text must not also be on screen — that second element is the
    // duplicate the owner saw stacked under "Save settings".
    expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
  });
});

/**
 * Owner repro 2026-09-13 (`owner-screenshots-2026-09-13/29-*.png`), through the REAL `ExecutionTab`, the
 * REAL credential hook over its in-memory port, and a probe port that refuses the way the server's
 * endpoint pin does: the saved key is Google's and the form is on OpenAI.
 *
 * `SettingsUi.unit.test.tsx` runs the discovery cases through the Settings mount; the two must not disagree.
 */
describe("AdminExecutionMode — OpenAI selected while the saved key is Google's", () => {
  const OTHER_PROVIDER_COPY = "Your saved key is for a different provider. Paste a key for this one.";
  const NO_ENDPOINT_COPY = "Your saved key has no provider saved with it. Paste the key again to test it.";

  /** Renders over a LIVE execution slice, so a chip click or a pasted key re-renders the form the way the
   *  ledger slice does. Returns the probe port. */
  function renderWithKeySaved(
    byok: ByokConfig,
    { stored = GOOGLE_ADMIN_KEY, t }: { stored?: AdminExecutionCredential; t?: (key: string) => string } = {},
  ) {
    const credentialPort = createFakeAdminExecutionCredentialPort({ stored });
    const probes = createServerPinnedProbes(stored);
    function useLiveExecutionMode(): AdminExecutionModeController {
      const [value, setValue] = useState<ExecutionConfig>({ ...DEFAULT_EXECUTION_CONFIG, mode: "byok", byok });
      return fakeExecutionModeController({ port: { current: probes }, execution: makeSlice(value, { onChange: setValue }) });
    }
    render(
      <AdminExecutionMode
        useAdminExecutionModeHook={useLiveExecutionMode}
        useAdminExecutionCredentialHook={(input) => useAdminExecutionCredential(input, credentialPort)}
        {...(t ? { t } : {})}
      />,
    );
    return probes;
  }

  it("asks for OpenAI's key, hides the Google key's mask, and keeps Test connection disabled", async () => {
    renderWithKeySaved(formOn(OPENAI, "gpt-4o"));

    expect(await screen.findByText(OTHER_PROVIDER_COPY)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("••••mw4w")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test connection" })).toBeDisabled();
  });

  it("words that ask through the screen's t", async () => {
    renderWithKeySaved(formOn(OPENAI, "gpt-4o"), {
      t: (key) => (key === OTHER_PROVIDER_COPY ? "Tu clave guardada es de otro proveedor." : key),
    });

    expect(await screen.findByText("Tu clave guardada es de otro proveedor.")).toBeInTheDocument();
  });

  it("on Google itself the saved key still counts: its mask shows and Test connection is enabled", async () => {
    renderWithKeySaved(formOn(GOOGLE, "gemini-flash-latest"));

    expect(await screen.findByPlaceholderText("••••mw4w")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test connection" })).toBeEnabled();
    expect(screen.getByText("Stored on the server, encrypted. Paste a new key to replace it.")).toBeInTheDocument();
  });

  it("switching from Google to OpenAI with nothing typed sends no model discovery and shows no refusal", async () => {
    const user = userEvent.setup();
    const probes = renderWithKeySaved(formOn(GOOGLE, "gemini-flash-latest"));
    expect(await screen.findByPlaceholderText("••••mw4w")).toBeInTheDocument();
    await settle();
    // Google's own discovery on mount is legitimate: the key is saved for that endpoint.
    probes.listModels.mockClear();

    await user.click(screen.getByRole("tab", { name: presetFor(OPENAI).title }));
    await settle();

    expect(screen.getByText(OTHER_PROVIDER_COPY)).toBeInTheDocument();
    expect(probes.listModels).not.toHaveBeenCalled();
    expect(screen.queryByText(/Could not load live models/)).not.toBeInTheDocument();
  });

  it("then pasting a key sends exactly one model discovery, carrying that key to OpenAI", async () => {
    const user = userEvent.setup();
    const probes = renderWithKeySaved(formOn(GOOGLE, "gemini-flash-latest"));
    expect(await screen.findByPlaceholderText("••••mw4w")).toBeInTheDocument();
    await settle();
    probes.listModels.mockClear();

    await user.click(screen.getByRole("tab", { name: presetFor(OPENAI).title }));
    await user.click(apiKeyField());
    await user.paste("sk-openai-typed");
    await settle();

    expect(probes.listModels).toHaveBeenCalledTimes(1);
    expect(probes.listModels).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "sk-openai-typed", baseUrl: OPENAI }));
  });

  it("a reload with OpenAI already selected leaves no refusal on screen once the saved key's view loads", async () => {
    // The mount's discovery can go out before the saved key's view arrives (the controller cannot know the
    // key is Google's yet). Once it knows, `ExecutionTab` must drop that result rather than show it.
    renderWithKeySaved(formOn(OPENAI, "gpt-4o"));
    expect(await screen.findByText(OTHER_PROVIDER_COPY)).toBeInTheDocument();
    await settle();

    expect(screen.queryByText(/Could not load live models/)).not.toBeInTheDocument();
  });

  it("words a refused discovery with the plain-language copy, through the screen's t", async () => {
    renderWithKeySaved(formOn(GOOGLE, "gemini-flash-latest"), {
      stored: { ...GOOGLE_ADMIN_KEY, baseUrl: null },
      t: (key) => (key === NO_ENDPOINT_COPY ? "Tu clave guardada no tiene un proveedor guardado." : key),
    });

    expect(await screen.findByText(/Could not load live models: Tu clave guardada no tiene un proveedor guardado\./)).toBeInTheDocument();
    expect(screen.queryByText(/save a base URL for the credential first/)).not.toBeInTheDocument();
  });
});
