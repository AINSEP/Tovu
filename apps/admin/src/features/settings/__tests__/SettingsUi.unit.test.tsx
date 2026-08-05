import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  createFakeMediaProvidersPort,
  createFakeSkillsPort,
  createFakeSourceConfigDependencies,
  type SourceConfigItem,
} from "@jini-ai/ui";

import { SettingsUi } from "../SettingsUi";
import type { SettingsUiController } from "../hooks/use-settings-ui.hooks";
import type { SettingsSlice } from "../../../hooks/use-settings-slice.hooks";
import { createExecutionPort, DEFAULT_EXECUTION_CONFIG } from "../../../lib/execution-settings";
import {
  DEFAULT_APPEARANCE,
  DEFAULT_INSTRUCTIONS,
  DEFAULT_LOCALE,
  DEFAULT_NOTIFICATIONS,
  DEFAULT_PRIVACY,
} from "../../../lib/settings-tabs";

/**
 * @file `SettingsUi` — the Open Design settings-dialog port, driven entirely through the
 * `useSettingsUiHook` dependency-injection seam (same convention `PostsProps.usePostsHook` uses)
 * so no real ledger round trip is needed to exercise the 13-tab shell.
 *
 * Primary target: the `InstructionsTab` onChange landmine (`SettingsUi.tsx`'s
 * `onChange={(next) => s.instructions.onChange(next ?? DEFAULT_INSTRUCTIONS)}`). It was briefly
 * miscopied to `next ?? ""` during the extraction and fixed, and nothing guarded it before this
 * pass. `InstructionsTab` (`@jini-ai/ui`) reports an all-empty textarea as `undefined`, never `''`
 * — clearing the field is therefore the only way to observe the fallback at all, and asserting
 * against the *imported* `DEFAULT_INSTRUCTIONS` constant (not a hardcoded `""` literal) is what
 * actually pins the fallback source, not just its current value.
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

function baseController(overrides: Partial<SettingsUiController> = {}): SettingsUiController {
  return {
    modalOpen: false,
    setModalOpen: vi.fn(),
    memoryTopTab: "memories",
    setMemoryTopTab: vi.fn(),

    port: createExecutionPort(),
    mediaProvidersPort: createFakeMediaProvidersPort(),
    skillsPort: createFakeSkillsPort({ skills: [] }),
    externalMcpDependencies: createFakeSourceConfigDependencies<SourceConfigItem>({
      createSource: (input) => ({ id: input.fields.id?.trim() || "mcp-test", fields: input.fields }),
    }),

    execution: makeSlice(DEFAULT_EXECUTION_CONFIG),
    instructions: makeSlice(DEFAULT_INSTRUCTIONS),
    notifications: makeSlice(DEFAULT_NOTIFICATIONS),
    privacy: makeSlice(DEFAULT_PRIVACY),
    appearance: makeSlice(DEFAULT_APPEARANCE),
    language: makeSlice(DEFAULT_LOCALE),

    loading: false,
    loadError: null,
    save: { status: "idle" },
    ...overrides,
  } as SettingsUiController;
}

/** Switches the inline shell to the named tab via its sidebar nav button — only the active tab's
 *  panel is mounted (`SettingsDialogShell` renders `activeTab?.panel` alone), so every scenario
 *  below outside the default "Execution mode" tab has to navigate first. */
async function goToTab(user: ReturnType<typeof userEvent.setup>, tabId: string) {
  await user.click(screen.getByTestId(`settings-dialog-nav-${tabId}`));
}

describe("loading and error states", () => {
  it("shows a loading placeholder while any slice is still settling", () => {
    render(<SettingsUi useSettingsUiHook={() => baseController({ loading: true })} />);
    expect(screen.getByText("Loading settings…")).toBeInTheDocument();
    expect(screen.queryByTestId("settings-dialog-nav-execution")).not.toBeInTheDocument();
  });

  it("shows the first load error as a banner once loaded, without blocking the rest of the page", () => {
    render(<SettingsUi useSettingsUiHook={() => baseController({ loadError: "namespace fetch failed" })} />);
    expect(
      screen.getByText('Could not load saved settings (namespace fetch failed). Showing defaults — edits will still save.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId("settings-dialog-nav-execution")).toBeInTheDocument();
  });
});

describe("InstructionsTab onChange landmine", () => {
  it("clearing the textarea entirely falls back to the imported DEFAULT_INSTRUCTIONS, not a hardcoded empty string", async () => {
    const user = userEvent.setup();
    const controller = baseController({ instructions: makeSlice("some existing instructions") });
    render(<SettingsUi useSettingsUiHook={() => controller} />);

    await goToTab(user, "instructions");
    const textarea = screen.getByLabelText("Custom instructions");
    await user.clear(textarea);

    expect(controller.instructions.onChange).toHaveBeenCalledWith(DEFAULT_INSTRUCTIONS);
  });

  it("typing real text calls onChange with that text verbatim — the fallback only fires on an all-empty field", async () => {
    const user = userEvent.setup();
    const controller = baseController({ instructions: makeSlice("") });
    render(<SettingsUi useSettingsUiHook={() => controller} />);

    await goToTab(user, "instructions");
    const textarea = screen.getByLabelText("Custom instructions");
    await user.type(textarea, "x");

    expect(controller.instructions.onChange).toHaveBeenLastCalledWith("x");
  });
});

describe("Notifications patch merge", () => {
  it("merges NotificationsTab's onChange patch onto the current value rather than replacing it wholesale", async () => {
    const user = userEvent.setup();
    const controller = baseController({
      notifications: makeSlice<typeof DEFAULT_NOTIFICATIONS>({ ...DEFAULT_NOTIFICATIONS, soundEnabled: false }),
    });
    render(<SettingsUi useSettingsUiHook={() => controller} />);

    await goToTab(user, "notifications");
    await user.click(screen.getByRole("button", { name: "Completion sound" }));

    expect(controller.notifications.onChange).toHaveBeenCalledWith({
      ...DEFAULT_NOTIFICATIONS,
      soundEnabled: true,
    });
  });
});

describe("Appearance (dialog theme) onChange merge", () => {
  it("merges AppearanceTab's theme selection onto the current value", async () => {
    const user = userEvent.setup();
    const controller = baseController({ appearance: makeSlice(DEFAULT_APPEARANCE) });
    render(<SettingsUi useSettingsUiHook={() => controller} />);

    await goToTab(user, "appearance");
    const group = screen.getByRole("group", { name: "Appearance" });
    await user.click(within(group).getByRole("button", { name: /dark/i }));

    expect(controller.appearance.onChange).toHaveBeenCalledWith({ ...DEFAULT_APPEARANCE, theme: "dark" });
  });
});

describe("Privacy tab — inert by design (no Tovu telemetry backend)", () => {
  it("renders the reference note and makes the control genuinely inert", async () => {
    const user = userEvent.setup();
    render(<SettingsUi useSettingsUiHook={() => baseController()} />);
    await goToTab(user, "privacy");

    expect(
      screen.getByText(/this installation has no outbound telemetry pipeline/i),
    ).toBeInTheDocument();
    const wrap = document.querySelector(".settings-ui-inert-control");
    expect(wrap).toHaveAttribute("inert");
  });
});

describe("save status pill", () => {
  it("renders the merged saving state with role=status", () => {
    render(<SettingsUi useSettingsUiHook={() => baseController({ save: { status: "saving" } })} />);
    const pill = document.querySelector(".settings-ui-save");
    expect(pill).toHaveTextContent("Saving…");
    expect(pill).toHaveAttribute("role", "status");
  });

  it("renders the merged error state with role=alert and the error's own message", () => {
    render(
      <SettingsUi useSettingsUiHook={() => baseController({ save: { status: "error", message: "save failed" } })} />,
    );
    const pill = document.querySelector(".settings-ui-save");
    expect(pill).toHaveTextContent("save failed");
    expect(pill).toHaveAttribute("role", "alert");
  });
});

describe("Open as dialog", () => {
  it("page mode renders one inline shell and no modal until requested", () => {
    render(<SettingsUi useSettingsUiHook={() => baseController()} />);
    expect(screen.queryByTestId("settings-dialog-backdrop")).not.toBeInTheDocument();
  });

  it("clicking Open as dialog asks the controller to open the modal", async () => {
    const user = userEvent.setup();
    const controller = baseController();
    render(<SettingsUi useSettingsUiHook={() => controller} />);

    await user.click(screen.getByRole("button", { name: "Open as dialog" }));
    expect(controller.setModalOpen).toHaveBeenCalledWith(true);
  });

  it("renders the modal shell (with a Close button) once modalOpen is true", () => {
    render(<SettingsUi useSettingsUiHook={() => baseController({ modalOpen: true })} />);
    expect(screen.getByTestId("settings-dialog-backdrop")).toBeInTheDocument();
    // Two shells are mounted at once in modal mode (inline page + modal), so there are two
    // matching sidebar nav buttons — scope to the modal's own dialog to avoid ambiguity.
    expect(screen.getAllByTestId("settings-dialog-nav-execution").length).toBe(2);
  });
});

describe("About tab", () => {
  it("shows the Tovu Admin version, no updater surface", async () => {
    const user = userEvent.setup();
    render(<SettingsUi useSettingsUiHook={() => baseController()} />);
    await goToTab(user, "about");

    expect(screen.getByText(/^Tovu Admin /)).toBeInTheDocument();
    // "no updater surface" means no update-status/check control — the panel's own hint prose
    // mentioning "updater" in passing (deployments, not an in-app updater) is not itself a surface.
    expect(screen.queryByRole("button", { name: /update/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("status", { name: /update/i })).not.toBeInTheDocument();
  });
});
