import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DockLeadingAccessory, type DockLeadingAccessoryProps } from "../DockLeadingAccessory";

/**
 * @file `DockLeadingAccessory` — what the dock puts in `ChatPane`'s `leadingAccessory` slot —
 * rendered on its own: the deployed-site note, the agent sign-in warning, and the skill tray's
 * send action, each present only when it applies. `FolderDropNotice` and `SelectedAgentPluginTray`
 * have their own suites; here they only receive the dock's values.
 */

afterEach(() => cleanup());

const SKILL_CHIP = { pluginRefId: "tool-1", label: "Summarise · Skill" };

function accessoryProps(overrides: Partial<DockLeadingAccessoryProps> = {}): DockLeadingAccessoryProps {
  return {
    note: null,
    warning: null,
    folderDrop: { notice: null, dismiss: vi.fn(), retry: vi.fn() },
    pluginChips: [],
    onRemovePlugin: vi.fn(),
    skills: { chips: [], removeSkill: vi.fn() },
    skillOnlySend: { canSendSkills: false, sendSkills: vi.fn() },
    ...overrides,
  };
}

describe("DockLeadingAccessory", () => {
  it("renders nothing at all when no note, warning, notice or chip applies", () => {
    const { container } = render(<DockLeadingAccessory {...accessoryProps()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the execution policy's note as a status line", () => {
    render(<DockLeadingAccessory {...accessoryProps({ note: "Local CLI is not available on this site." })} />);
    expect(screen.getByRole("status")).toHaveTextContent("Local CLI is not available on this site.");
  });

  it("announces the selected agent's sign-in warning politely", () => {
    render(<DockLeadingAccessory {...accessoryProps({ warning: "Sign in to Claude Code, then Rescan." })} />);
    expect(screen.getByRole("status")).toHaveTextContent("Sign in to Claude Code, then Rescan.");
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });

  it("offers to send the selected skills when a skill-only send can go out", async () => {
    const sendSkills = vi.fn();
    render(<DockLeadingAccessory {...accessoryProps({ skills: { chips: [SKILL_CHIP], removeSkill: vi.fn() }, skillOnlySend: { canSendSkills: true, sendSkills } })} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Send selected skills" }));
    expect(sendSkills).toHaveBeenCalledTimes(1);
  });

  it("withholds the send action while a skill-only send cannot go out", () => {
    render(<DockLeadingAccessory {...accessoryProps({ skills: { chips: [SKILL_CHIP], removeSkill: vi.fn() }, skillOnlySend: { canSendSkills: false, sendSkills: vi.fn() } })} />);
    expect(screen.getByText("Summarise · Skill")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send selected skills" })).toBeNull();
  });
});
