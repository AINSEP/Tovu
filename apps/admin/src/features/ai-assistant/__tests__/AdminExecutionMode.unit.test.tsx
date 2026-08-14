import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ExecutionConfig } from "@jini-ai/ui";

import { AdminExecutionMode } from "../AiAssistant";
import type { AdminExecutionModeController } from "../hooks/use-admin-execution-mode.hooks";
import type { AdminExecutionCredentialController } from "../../../hooks/use-admin-execution-credential.hooks";
import type { SettingsSlice } from "../../../hooks/use-settings-slice.hooks";
import { createExecutionPort, DEFAULT_EXECUTION_CONFIG } from "../../../lib/execution-settings";

/**
 * @file First direct test for `AdminExecutionMode` (previously unexported, no test file of its own —
 * only reachable through `AiAssistant`'s "Admin AI Assistant" tab). Exported alongside this file in
 * the same Orc-BASH pass that converted its inline `useWiredAdminExecutionCredential({...})` call
 * (`AiAssistant.tsx`) into the `useAdminExecutionCredentialHook` prop below — the seam this suite
 * exercises. Mirrors `SettingsUi.unit.test.tsx`'s identical "renders from the injected fake, not a
 * real round trip" assertion for the SAME shared hook's other mount, since the two must never
 * disagree (see `AdminExecutionMode`'s own doc comment in `AiAssistant.tsx`).
 */

function makeSlice<T>(value: T): SettingsSlice<T> {
  return {
    value,
    loadError: null,
    saveState: { status: "idle" },
    onChange: vi.fn(),
    refresh: vi.fn(),
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
    saveState: { status: "idle" },
    canSaveKey: false,
    saveKey: vi.fn(async () => {}),
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

  it("still renders normally when the credential hook is left at its default", () => {
    render(<AdminExecutionMode useAdminExecutionModeHook={() => fakeExecutionModeController()} />);
    // No migration prompt (nothing to fake a legacy key with), but the execution form itself renders.
    expect(screen.queryByText(/We found a saved key in this browser/)).not.toBeInTheDocument();
  });
});
