import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { AgentPluginDetailsModal } from "../AgentPluginDetailsModal";
import type { AgentPluginDetailsModalController } from "../hooks/use-agent-plugin-details-modal.hooks";
import type { InspectedAgentPlugin } from "../hooks/use-agent-plugins.hooks";

/**
 * @file `AgentPluginDetailsModal`'s own rendering behavior is already covered end-to-end through
 * `AgentPlugins.unit.test.tsx` ("opens an accessible read-only package inspector..."). This file's
 * job is narrower: prove the `useDetails` seam this pass added actually reaches the render, per
 * the `ConfirmDialog dialog-hook injection` precedent every other seamed component carries.
 */

// `AgentPluginDetailsModalProps.plugin` only reads `id`/`displayName` (see that component's own
// narrowed prop type, 2026-09-09) — a plain literal is enough, no catalog import needed.
const PLUGIN: InspectedAgentPlugin = { id: "ui-ux-design", displayName: "UI/UX Design" };
const identity = (key: string) => key;

describe("AgentPluginDetailsModal details-hook injection", () => {
  it("renders purely off an injected fake, proving useAgentPluginDetailsModal is not hardcoded", () => {
    // A fake with a file no real listing for this plugin would carry is proof this render used the
    // fake, not the real hook.
    function useFakeDetails(): AgentPluginDetailsModalController {
      return {
        files: [{ relativePath: "fake/only.md", content: "fake content body" }],
        selectedFile: { relativePath: "fake/only.md", content: "fake content body" },
        selectFile: vi.fn(),
      };
    }

    render(<AgentPluginDetailsModal plugin={PLUGIN} onClose={vi.fn()} t={identity} useDetails={useFakeDetails} />);

    expect(screen.getByRole("button", { name: "fake/only.md" })).toBeInTheDocument();
    expect(screen.getByText("fake content body")).toBeInTheDocument();
  });

  it("shows the hook's own status when the fake resolves no files", () => {
    function useFakeDetails(): AgentPluginDetailsModalController {
      return {
        files: [],
        selectedFile: null,
        selectFile: vi.fn(),
        status: { text: "No files to show for this plugin.", role: "status" },
        listNotice: null,
      };
    }

    render(<AgentPluginDetailsModal plugin={PLUGIN} onClose={vi.fn()} t={identity} useDetails={useFakeDetails} />);

    expect(screen.getByRole("status")).toHaveTextContent("No files to show for this plugin.");
  });
});

/**
 * @file (continued) The wrap toggle added alongside `WrappedFileContent`/`AgentPluginFileContent`
 * (item 1, 2026-08-31 UI-fixes pass): every file defaults to wrapped (owner correction, 2026-09-10 —
 * a `plugin.json` line ran off the pane indefinitely under the old per-extension default), a manual
 * per-file override, and a reset back to the wrapped default when the file selection changes.
 * Exercised through the same `useDetails` seam above, with a small stateful fake standing in for the
 * real hook's file-selection wiring — `selectFile` has to actually change what's selected here,
 * unlike the static fakes above.
 */

const WRAP_TOGGLE_NAME = /^Wrap:/;

function useFakeMultiFileDetails(): AgentPluginDetailsModalController {
  const files = [
    { relativePath: "alpha.md", content: "alpha line one\nalpha line two" },
    { relativePath: "beta.md", content: "beta line one\nbeta line two" },
    { relativePath: "plugin.json", content: '{\n  "name": "fake"\n}' },
  ];
  const [selectedPath, setSelectedPath] = useState(files[0]!.relativePath);
  const selectedFile = files.find((file) => file.relativePath === selectedPath) ?? files[0]!;
  return { files, selectedFile, selectFile: setSelectedPath };
}

describe("AgentPluginDetailsModal wrap toggle", () => {
  it("defaults every file to wrapped, markdown and non-markdown alike", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AgentPluginDetailsModal plugin={PLUGIN} onClose={vi.fn()} t={identity} useDetails={useFakeMultiFileDetails} />,
    );

    // alpha.md is selected by default and defaults wrapped, via the grid renderer.
    expect(container.querySelector(".code-viewer--wrap")).toBeInTheDocument();
    expect(container.querySelector(".gutter")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "plugin.json" }));

    // plugin.json is not markdown, but defaults wrapped too now — the extension no longer decides
    // the default (owner correction, 2026-09-10).
    expect(container.querySelector(".code-viewer--wrap")).toBeInTheDocument();
    expect(container.querySelector(".gutter")).not.toBeInTheDocument();
  });

  it("keeps one gutter number per source line when a wrapped file has a long line, so numbering can't drift", () => {
    const longLine = "x".repeat(400);
    function useFakeLongLineDetails(): AgentPluginDetailsModalController {
      const file = { relativePath: "plugin.json", content: `line one\n${longLine}\nline three` };
      return { files: [file], selectedFile: file, selectFile: vi.fn() };
    }

    const { container } = render(
      <AgentPluginDetailsModal plugin={PLUGIN} onClose={vi.fn()} t={identity} useDetails={useFakeLongLineDetails} />,
    );

    // WrappedFileContent lays out one CSS grid row per source line (`.line-number` paired with its
    // own `.line-content` in the same row), not two independent `white-space: pre` blocks kept in
    // sync by both refusing to wrap — so a long line's row simply grows taller and the count of
    // gutter numbers stays exactly the source line count regardless of how many visual rows the
    // long line wraps to.
    const lineNumbers = container.querySelectorAll(".line-number");
    expect(Array.from(lineNumbers).map((el) => el.textContent)).toEqual(["1", "2", "3"]);
  });

  it("switches renderers and aria-pressed when the toggle is clicked, in both directions", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AgentPluginDetailsModal plugin={PLUGIN} onClose={vi.fn()} t={identity} useDetails={useFakeMultiFileDetails} />,
    );
    const toggle = screen.getByRole("button", { name: WRAP_TOGGLE_NAME });

    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector(".code-viewer--wrap")).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(container.querySelector(".code-viewer--wrap")).not.toBeInTheDocument();
    expect(container.querySelector(".gutter")).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector(".code-viewer--wrap")).toBeInTheDocument();
    expect(container.querySelector(".gutter")).not.toBeInTheDocument();
  });

  it("resets a manual override to the new file's own default instead of carrying it across", async () => {
    const user = userEvent.setup();
    render(<AgentPluginDetailsModal plugin={PLUGIN} onClose={vi.fn()} t={identity} useDetails={useFakeMultiFileDetails} />);

    // alpha.md defaults wrapped; override it off.
    await user.click(screen.getByRole("button", { name: WRAP_TOGGLE_NAME }));
    expect(screen.getByRole("button", { name: WRAP_TOGGLE_NAME })).toHaveAttribute("aria-pressed", "false");

    // beta.md is also markdown, the same true default alpha.md started from — if the override had
    // carried across instead of resetting per file, this would incorrectly read false too.
    await user.click(screen.getByRole("button", { name: "beta.md" }));
    expect(screen.getByRole("button", { name: WRAP_TOGGLE_NAME })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the toggle's own label out of the heading's accessible name", () => {
    render(<AgentPluginDetailsModal plugin={PLUGIN} onClose={vi.fn()} t={identity} useDetails={useFakeMultiFileDetails} />);

    // The toggle sits in the same header row but outside the <h3> for exactly this reason — see
    // `AgentPlugins.unit.test.tsx`'s own exact-name heading assertion, which this protects.
    expect(screen.getByRole("heading", { name: "alpha.md" })).toBeInTheDocument();
  });
});
