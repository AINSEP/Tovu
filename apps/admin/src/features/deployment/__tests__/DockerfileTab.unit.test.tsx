import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DockerfileTab } from "../DockerfileTab";
import type { DockerfileSourceController } from "../hooks/use-dockerfile-source.hooks";

/**
 * @file `DockerfileTab` — driven through the `useDockerfileSourceHook` DI seam, same convention
 * `OverviewTab.unit.test.tsx` uses.
 *
 * 2026-08-15: rewritten for the tab's read-only -> editable change. Pins: the empty state now also
 * renders the editable box (not a dead end), the existing-Dockerfile view is a real `<textarea>`
 * (not a `<pre><code>`) whose edits flow through the injected `setDraft`, the Unsaved-changes pill
 * and Saved/save-error surfaces are driven by the controller's own `isDirty`/`saved`/`saveError`
 * (never a second, un-synced local flag — same rule the old suite already pinned for `copied`), that
 * Copy/Download act on `draft` and are disabled on an empty draft, and that Save calls the injected
 * `save()` and is disabled while `saving`. The hook's own load/save mechanics (fetch behavior, dirty
 * comparison, no-second-GET-after-save) are `use-dockerfile-source.unit.test.tsx`'s job, not this
 * file's — this file only proves the component wires the controller's fields to the right markup.
 */

const fakeT = (key: string): string => key;

function controllerFixture(overrides: Partial<DockerfileSourceController> = {}): DockerfileSourceController {
  return {
    snapshot: { exists: true, contents: "FROM node:22\n" },
    draft: "FROM node:22\n",
    setDraft: vi.fn(),
    isDirty: false,
    error: null,
    saving: false,
    saveError: null,
    saved: false,
    copied: false,
    copy: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
    t: fakeT,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loading and error states", () => {
  it("shows a loading notice while snapshot is undefined", () => {
    render(<DockerfileTab useDockerfileSourceHook={() => controllerFixture({ snapshot: undefined })} />);
    expect(screen.getByText("Loading Dockerfile…")).toBeInTheDocument();
  });

  it("shows the error alone when nothing has ever loaded", () => {
    render(
      <DockerfileTab
        useDockerfileSourceHook={() => controllerFixture({ snapshot: undefined, error: "disk error" })}
      />,
    );
    expect(screen.getByText("disk error")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy" })).not.toBeInTheDocument();
  });
});

describe("no Dockerfile yet", () => {
  it("renders the honest empty-state block AND an editable box to write one, not a dead end", () => {
    render(
      <DockerfileTab
        useDockerfileSourceHook={() =>
          controllerFixture({ snapshot: { exists: false, contents: null }, draft: "" })
        }
      />,
    );
    expect(screen.getByText("No Dockerfile yet")).toBeInTheDocument();
    expect(
      screen.getByText("No Dockerfile exists at the repo root yet. Once one is added, its contents will appear here."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No Dockerfile exists yet. Write one below, then save to create it."),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Dockerfile contents" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    // Nothing typed yet — Copy/Download have nothing to act on.
    expect(screen.getByRole("button", { name: "Copy" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Download" })).toBeDisabled();
  });

  it("Save is enabled once the operator has typed something, even before it's saved", () => {
    render(
      <DockerfileTab
        useDockerfileSourceHook={() =>
          controllerFixture({ snapshot: { exists: false, contents: null }, draft: "FROM node:22\n", isDirty: true })
        }
      />,
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeEnabled();
  });
});

describe("an existing Dockerfile", () => {
  it("shows the real contents in a real, editable textarea — not a read-only <pre>", () => {
    render(<DockerfileTab useDockerfileSourceHook={() => controllerFixture()} />);
    const textarea = screen.getByRole("textbox", { name: "Dockerfile contents" });
    expect(textarea).toHaveValue("FROM node:22\n");
    expect(
      screen.getByText("Building is a terminal command (docker build …), not a button here."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Saving here only replaces the file's contents — it does not build or deploy anything."),
    ).toBeInTheDocument();
  });

  it("typing in the textarea calls the injected setDraft with the new value — the hook owns the actual state, not the component", async () => {
    const user = userEvent.setup();
    const setDraft = vi.fn();
    render(<DockerfileTab useDockerfileSourceHook={() => controllerFixture({ setDraft })} />);

    await user.type(screen.getByRole("textbox", { name: "Dockerfile contents" }), "X");
    expect(setDraft).toHaveBeenCalled();
  });

  it("no Unsaved-changes pill and no Saved confirmation when nothing has changed", () => {
    render(<DockerfileTab useDockerfileSourceHook={() => controllerFixture()} />);
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });

  it("shows the Unsaved-changes pill when the controller reports isDirty", () => {
    render(<DockerfileTab useDockerfileSourceHook={() => controllerFixture({ isDirty: true })} />);
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });

  it("clicking Save calls the injected save() and disables the button while saving", async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(<DockerfileTab useDockerfileSourceHook={() => controllerFixture({ save })} />);

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(save).toHaveBeenCalledTimes(1);

    rerender(<DockerfileTab useDockerfileSourceHook={() => controllerFixture({ save, saving: true })} />);
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });

  it("shows a Saved confirmation when the controller reports saved=true", () => {
    render(<DockerfileTab useDockerfileSourceHook={() => controllerFixture({ saved: true })} />);
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("surfaces a save failure as an alert, distinct from a load error", () => {
    render(<DockerfileTab useDockerfileSourceHook={() => controllerFixture({ saveError: "disk full" })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("disk full");
  });

  it("clicking Copy calls the injected copy() — the actual clipboard write is the hook's own job, not this component's", async () => {
    const user = userEvent.setup();
    const copy = vi.fn().mockResolvedValue(undefined);
    render(<DockerfileTab useDockerfileSourceHook={() => controllerFixture({ copy })} />);

    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(copy).toHaveBeenCalledTimes(1);
  });

  it("shows Copied! instead of Copy whenever the controller reports copied=true — the label is driven by the hook's own state, not a second un-synced local flag", () => {
    render(<DockerfileTab useDockerfileSourceHook={() => controllerFixture({ copied: true })} />);
    expect(screen.getByRole("button", { name: "Copied!" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy" })).not.toBeInTheDocument();
  });

  it("Download builds a real file from the current draft — object URL created, anchor clicked, then revoked", async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn().mockReturnValue("blob:fake-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<DockerfileTab useDockerfileSourceHook={() => controllerFixture()} />);
    await user.click(screen.getByRole("button", { name: "Download" }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const [blob] = createObjectURL.mock.calls[0] as [Blob];
    expect(blob).toBeInstanceOf(Blob);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake-url");

    clickSpy.mockRestore();
  });
});

describe("agent handles", () => {
  // Pins the ids the AI assistant relies on to drive this tab through `page.*` capabilities — same
  // `data-agent-element` querying convention `PostEditor.unit.test.tsx` uses for its own handles.
  // Guards against a handle silently rotting (renamed, removed, or a typo) with nothing catching it.
  it("tags the editor card, Copy, Download, Save and the textarea on an existing Dockerfile", () => {
    render(<DockerfileTab useDockerfileSourceHook={() => controllerFixture()} />);
    expect(document.querySelector('[data-agent-element="deployment-dockerfile-editor-card"]')).toBeInTheDocument();
    expect(document.querySelector('[data-agent-element="deployment-dockerfile-copy"]')).toBeInTheDocument();
    expect(document.querySelector('[data-agent-element="deployment-dockerfile-download"]')).toBeInTheDocument();
    expect(document.querySelector('[data-agent-element="deployment-dockerfile-save"]')).toBeInTheDocument();
    expect(document.querySelector('[data-agent-element="deployment-dockerfile-textarea"]')).toBeInTheDocument();
    // Nothing to report yet in this state.
    expect(document.querySelector('[data-agent-element="deployment-dockerfile-unsaved"]')).not.toBeInTheDocument();
    expect(document.querySelector('[data-agent-element="deployment-dockerfile-saved"]')).not.toBeInTheDocument();
    expect(document.querySelector('[data-agent-element="deployment-dockerfile-save-error"]')).not.toBeInTheDocument();
  });

  it("tags the empty-state region when no Dockerfile exists yet", () => {
    render(
      <DockerfileTab
        useDockerfileSourceHook={() => controllerFixture({ snapshot: { exists: false, contents: null }, draft: "" })}
      />,
    );
    expect(document.querySelector('[data-agent-element="deployment-dockerfile-empty"]')).toBeInTheDocument();
    // The editor card renders in both shapes — see `DockerfileEditorCard`'s own doc.
    expect(document.querySelector('[data-agent-element="deployment-dockerfile-editor-card"]')).toBeInTheDocument();
  });

  it("tags the unsaved-changes, saved, and save-error indicators only while each condition holds", () => {
    const { rerender } = render(<DockerfileTab useDockerfileSourceHook={() => controllerFixture({ isDirty: true })} />);
    expect(document.querySelector('[data-agent-element="deployment-dockerfile-unsaved"]')).toBeInTheDocument();

    rerender(<DockerfileTab useDockerfileSourceHook={() => controllerFixture({ saved: true })} />);
    expect(document.querySelector('[data-agent-element="deployment-dockerfile-saved"]')).toBeInTheDocument();

    rerender(<DockerfileTab useDockerfileSourceHook={() => controllerFixture({ saveError: "disk full" })} />);
    expect(document.querySelector('[data-agent-element="deployment-dockerfile-save-error"]')).toBeInTheDocument();
  });

  it("tags the load-error banner whether or not a snapshot ever loaded", () => {
    const { rerender } = render(
      <DockerfileTab useDockerfileSourceHook={() => controllerFixture({ snapshot: undefined, error: "disk error" })} />,
    );
    expect(document.querySelector('[data-agent-element="deployment-dockerfile-load-error"]')).toBeInTheDocument();

    rerender(<DockerfileTab useDockerfileSourceHook={() => controllerFixture({ error: "stale refresh failed" })} />);
    expect(document.querySelector('[data-agent-element="deployment-dockerfile-load-error"]')).toBeInTheDocument();
  });
});
