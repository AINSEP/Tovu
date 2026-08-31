import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Workspace } from "../Workspace";
import type { WorkspaceController } from "../hooks/use-workspace.hooks";
import { formatTimestamp } from "@/lib/format-timestamp";
import type { AdminWorkspace } from "@/lib/api";

/**
 * @file `Workspace` — the `/admin/workspace` screen, driven through the `useWorkspaceHook`
 * dependency-injection seam. `features/workspace` was 0% covered with no test file at all before
 * this pass.
 */

const WORKSPACE: AdminWorkspace = {
  id: "w1",
  name: "My Site",
  slug: "my-site",
  createdAt: "2026-08-01T00:00:00.000Z",
};

function baseController(overrides: Partial<WorkspaceController> = {}): WorkspaceController {
  return {
    workspace: WORKSPACE,
    error: null,
    name: WORKSPACE.name,
    setName: vi.fn(),
    slug: WORKSPACE.slug,
    setSlug: vi.fn(),
    saving: false,
    saveError: null,
    saved: false,
    onSave: vi.fn(async (e) => e.preventDefault()),
    t: (key: string) => key,
    locale: "en",
    ...overrides,
  };
}

describe("loading and error states", () => {
  it("shows a loading placeholder before the workspace has loaded", () => {
    render(<Workspace useWorkspaceHook={() => baseController({ workspace: null })} />);
    expect(screen.getByText("Loading workspace…")).toBeInTheDocument();
  });

  it("shows the error message instead of the form when the load failed", () => {
    render(<Workspace useWorkspaceHook={() => baseController({ error: "failed to load workspace" })} />);
    expect(screen.getByText("failed to load workspace")).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  });
});

describe("rename form", () => {
  it("renders the persisted name/slug/id/createdAt", () => {
    render(<Workspace useWorkspaceHook={() => baseController()} />);
    expect(screen.getByLabelText("Name")).toHaveValue("My Site");
    expect(screen.getByLabelText("Slug")).toHaveValue("my-site");
    expect(screen.getByText("w1")).toBeInTheDocument();
    // Formatted display (`formatTimestamp`), not the raw ISO-8601 value — see `Workspace.tsx`'s
    // own comment on the created-at cell for why.
    expect(screen.getByText(formatTimestamp(WORKSPACE.createdAt))).toBeInTheDocument();
  });

  it("Save is disabled while the draft matches the persisted workspace (not dirty)", () => {
    render(<Workspace useWorkspaceHook={() => baseController()} />);
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("Save becomes enabled once the draft name diverges, and typing routes through setName", async () => {
    const user = userEvent.setup();
    const setName = vi.fn();
    render(<Workspace useWorkspaceHook={() => baseController({ name: "New Name", setName })} />);

    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
    await user.type(screen.getByLabelText("Name"), "!");
    expect(setName).toHaveBeenCalled();
  });

  it("submitting the form calls onSave", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async (e: React.FormEvent) => e.preventDefault());
    render(<Workspace useWorkspaceHook={() => baseController({ name: "New Name", onSave })} />);

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onSave).toHaveBeenCalled();
  });

  it("shows Saving… and disables Save while a save is in flight", () => {
    render(<Workspace useWorkspaceHook={() => baseController({ name: "New Name", saving: true })} />);
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });

  it("shows the save error banner", () => {
    render(<Workspace useWorkspaceHook={() => baseController({ saveError: "slug already in use" })} />);
    expect(screen.getByText("slug already in use")).toBeInTheDocument();
  });

  it("shows Saved. only once saved is true AND the form is no longer dirty", () => {
    const { rerender } = render(<Workspace useWorkspaceHook={() => baseController({ saved: true })} />);
    expect(screen.getByText("Saved.")).toBeInTheDocument();

    rerender(<Workspace useWorkspaceHook={() => baseController({ saved: true, name: "Changed Since Save" })} />);
    expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
  });
});

describe("Delete workspace", () => {
  it("is always visible, permanently disabled, with an explanatory notice", () => {
    render(<Workspace useWorkspaceHook={() => baseController()} />);
    const deleteButton = screen.getByRole("button", { name: "Delete workspace" });
    expect(deleteButton).toBeDisabled();
    expect(deleteButton).toHaveAttribute("title", "Not available — this install has only one workspace");
    expect(screen.getByText(/every tovu install must always have at least one workspace/i)).toBeInTheDocument();
  });
});
