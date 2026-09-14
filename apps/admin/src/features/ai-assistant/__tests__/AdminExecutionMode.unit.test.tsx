import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PROVIDER_PRESETS, type ByokConfig, type ExecutionConfig, type ExecutionPort } from "@jini-ai/ui";

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
 * Owner repro 2026-09-13 (`owner-screenshots-2026-09-13/29-*.png`), through the REAL `ExecutionTab` and
 * the REAL credential hook over its in-memory port: the saved key is Google's and the form is on OpenAI.
 *
 * The other half, no model discovery on the endpoint change, is `@jini-ai/ui`'s `ExecutionTab`
 * `canDiscoverModels` gate. This suite loads Jini's built `dist`, so that half is asserted in Jini's own
 * `ExecutionTab.test.tsx` until the package is rebuilt and the prop is wired here.
 */
describe("AdminExecutionMode — OpenAI selected while the saved key is Google's", () => {
  const GOOGLE = "https://generativelanguage.googleapis.com";
  const OPENAI = "https://api.openai.com/v1";
  const OTHER_PROVIDER_COPY = "Your saved key is for a different provider. Paste a key for this one.";
  const googleKey: AdminExecutionCredential = {
    isSet: true,
    masked: "••••mw4w",
    protocol: "google",
    providerId: "google",
    baseUrl: GOOGLE,
    model: "gemini-flash-latest",
    maxTokens: null,
    updatedAt: "2026-09-13T00:00:00.000Z",
  };

  /** The form on whichever built-in preset owns `baseUrl`, with nothing typed. */
  function formOn(baseUrl: string, model: string): ByokConfig {
    const preset = DEFAULT_PROVIDER_PRESETS.find((p) => p.baseUrl === baseUrl);
    if (!preset) throw new Error(`no built-in preset for ${baseUrl}`);
    return { protocol: preset.protocol, providerId: preset.id, apiKey: "", baseUrl, model };
  }

  function renderWithGoogleKeySaved(byok: ByokConfig, t?: (key: string) => string) {
    const credentialPort = createFakeAdminExecutionCredentialPort({ stored: googleKey });
    const probes: ExecutionPort = {
      detectLocalAgents: vi.fn(async () => []),
      testConnection: vi.fn(async () => ({ ok: true, message: "Connected" })),
      listModels: vi.fn(async () => ["model-a"]),
    };
    render(
      <AdminExecutionMode
        useAdminExecutionModeHook={() =>
          fakeExecutionModeController({
            port: { current: probes },
            execution: makeSlice<ExecutionConfig>({ ...DEFAULT_EXECUTION_CONFIG, mode: "byok", byok }),
          })
        }
        useAdminExecutionCredentialHook={(input) => useAdminExecutionCredential(input, credentialPort)}
        {...(t ? { t } : {})}
      />,
    );
    return probes;
  }

  it("asks for OpenAI's key, hides the Google key's mask, and keeps Test connection disabled", async () => {
    renderWithGoogleKeySaved(formOn(OPENAI, "gpt-4o"));

    expect(await screen.findByText(OTHER_PROVIDER_COPY)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("••••mw4w")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test connection" })).toBeDisabled();
  });

  it("words that ask through the screen's t", async () => {
    renderWithGoogleKeySaved(formOn(OPENAI, "gpt-4o"), (key) =>
      key === OTHER_PROVIDER_COPY ? "Tu clave guardada es de otro proveedor." : key,
    );

    expect(await screen.findByText("Tu clave guardada es de otro proveedor.")).toBeInTheDocument();
  });

  it("on Google itself the saved key still counts: its mask shows and Test connection is enabled", async () => {
    renderWithGoogleKeySaved(formOn(GOOGLE, "gemini-flash-latest"));

    expect(await screen.findByPlaceholderText("••••mw4w")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test connection" })).toBeEnabled();
    expect(screen.getByText("Stored on the server, encrypted. Paste a new key to replace it.")).toBeInTheDocument();
  });
});
