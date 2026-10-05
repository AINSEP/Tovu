import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SkillRow } from "../SkillRow";
import { SkillInstallConfirmation } from "../SkillInstallConfirmation";
import { SkillRemoveConfirmDialog } from "../SkillRemoveConfirmDialog";
import type { SkillRowView, SkillsController } from "../use-skills.hooks";
import type { useSkillInstall } from "../use-skill-install.hooks";

/**
 * The three render-only Skills pieces, driven from their view-model props. `Skills.unit.test.tsx`
 * mounts them through the real page; this file pins the states that page test does not reach:
 * an uploaded (non-GitHub) skill, the busy guards, the install error with nothing pending, and the
 * remove dialog's error line.
 */

afterEach(cleanup);

function rowView(overrides: Partial<SkillRowView> = {}): SkillRowView {
  return {
    skill: { toolId: "skill_notes", name: "notes", description: "Keep tidy notes.", enabled: true, source: "uploaded" },
    busy: false, expanded: false, detailId: "skill-notes-detail",
    onToggleExpanded: vi.fn(), onToggleEnabled: vi.fn(), onRemove: vi.fn(), onInspect: vi.fn(),
    ...overrides,
  };
}

describe("SkillRow", () => {
  it("labels an uploaded, enabled skill and routes each control to its own action", () => {
    const row = rowView();
    render(<ul><SkillRow row={row} /></ul>);
    const item = screen.getByRole("listitem", { name: "notes" });
    expect(item).toHaveAttribute("data-enabled", "true");
    expect(within(item).getByText("Uploaded")).toBeInTheDocument();
    expect(within(item).queryByRole("link", { name: "GitHub" })).toBeNull();
    expect(within(item).getByText("Enabled")).toBeInTheDocument();
    expect(within(item).getByRole("switch", { name: "Enable notes" })).toHaveAttribute("aria-checked", "true");
    expect(document.getElementById("skill-notes-detail")).toHaveAttribute("hidden");

    fireEvent.click(within(item).getByRole("switch", { name: "Enable notes" }));
    fireEvent.click(within(item).getByRole("button", { name: "Remove notes" }));
    fireEvent.click(within(item).getByRole("button", { name: "Inspect skill files — notes" }));
    fireEvent.click(within(item).getByRole("button", { name: "notes" }));
    fireEvent.click(within(item).getByRole("button", { name: "Show or hide details — notes" }));
    expect(row.onToggleEnabled).toHaveBeenCalledOnce();
    expect(row.onRemove).toHaveBeenCalledOnce();
    expect(row.onInspect).toHaveBeenCalledTimes(2);
    expect(row.onToggleExpanded).toHaveBeenCalledOnce();
  });

  it("shows GitHub provenance, the disabled state and blocks toggling/removal while busy", () => {
    const row = rowView({
      skill: { toolId: "skill_x", name: "x", description: "d", enabled: false, source: { githubUrl: "https://github.com/acme/x", commit: "abcdef0123" } },
      sourceUrl: "https://github.com/acme/x", shortCommit: "abcdef0", busy: true, expanded: true,
    });
    render(<ul><SkillRow row={row} /></ul>);
    const item = screen.getByRole("listitem", { name: "x" });
    expect(within(item).getByRole("link", { name: "GitHub" })).toHaveAttribute("href", "https://github.com/acme/x");
    expect(within(item).getByText("abcdef0").tagName).toBe("CODE");
    expect(within(item).queryByText("Uploaded")).toBeNull();
    expect(within(item).getByText("Disabled")).toBeInTheDocument();
    const toggle = within(item).getByRole("switch", { name: "Enable x" });
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute("aria-busy", "true");
    expect(within(item).getByRole("button", { name: "Remove x" })).toBeDisabled();
    expect(document.getElementById(row.detailId)).not.toHaveAttribute("hidden");
  });
});

type Install = ReturnType<typeof useSkillInstall>;
function install(overrides: Partial<Install> = {}): Install {
  return { pending: null, busy: false, error: null, propose: vi.fn(), proposeFiles: vi.fn(), cancel: vi.fn(), confirm: vi.fn(async () => {}), fail: vi.fn(), ...overrides };
}

describe("SkillInstallConfirmation", () => {
  it("renders nothing with nothing pending and no error", () => {
    const { container } = render(<SkillInstallConfirmation install={install()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a failed read as an alert even with nothing pending", () => {
    render(<SkillInstallConfirmation install={install({ error: "SKILL.md is missing." })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("SKILL.md is missing.");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("asks to confirm a GitHub install, naming its source, and confirms or cancels", () => {
    const pendingInstall = install({ pending: { githubUrl: "https://github.com/acme/incident" } });
    render(<SkillInstallConfirmation install={pendingInstall} />);
    const dialog = screen.getByRole("dialog", { name: "Install skill" });
    expect(within(dialog).getByText("https://github.com/acme/incident")).toBeInTheDocument();
    expect(within(dialog).queryByRole("alert")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm install" }));
    expect(pendingInstall.confirm).toHaveBeenCalledOnce();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(pendingInstall.cancel).toHaveBeenCalledOnce();
  });

  it("names uploaded files, shows the install error inside the dialog and disables actions while busy", () => {
    const busyInstall = install({ pending: { files: [] }, busy: true, error: "Install failed." });
    render(<SkillInstallConfirmation install={busyInstall} />);
    const dialog = screen.getByRole("dialog", { name: "Install skill" });
    expect(dialog).toHaveAttribute("aria-busy", "true");
    expect(within(dialog).getByText("Uploaded skill files")).toBeInTheDocument();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Install failed.");
    expect(within(dialog).getByRole("button", { name: "Confirm install" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});

function controller(overrides: Partial<SkillsController> = {}): SkillsController {
  return {
    removing: { toolId: "skill_notes", name: "notes", description: "", enabled: true, source: "uploaded" },
    busy: false, error: null, onCancelRemove: vi.fn(), onConfirmRemove: vi.fn(),
    confirmation: { dialogRef: { current: null }, onDialogClick: (event: { stopPropagation: () => void }) => event.stopPropagation() },
    ...overrides,
  } as unknown as SkillsController;
}

describe("SkillRemoveConfirmDialog", () => {
  it("names the skill and routes confirm and cancel", () => {
    const remove = controller();
    render(<SkillRemoveConfirmDialog controller={remove} />);
    const dialog = screen.getByRole("dialog", { name: "Remove skill" });
    expect(within(dialog).getByRole("heading")).toHaveTextContent("Remove notes?");
    expect(within(dialog).queryByRole("alert")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm remove" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(remove.onConfirmRemove).toHaveBeenCalledOnce();
    expect(remove.onCancelRemove).toHaveBeenCalledOnce();
  });

  it("shows the removal error and disables both actions while busy", () => {
    render(<SkillRemoveConfirmDialog controller={controller({ busy: true, error: "Could not change skills." })} />);
    const dialog = screen.getByRole("dialog", { name: "Remove skill" });
    expect(dialog).toHaveAttribute("aria-busy", "true");
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Could not change skills.");
    expect(within(dialog).getByRole("button", { name: "Confirm remove" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});
