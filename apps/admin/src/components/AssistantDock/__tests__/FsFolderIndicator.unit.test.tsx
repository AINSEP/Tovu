import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { FsFolderIndicator } from "../FsFolderIndicator";

/**
 * @file First dedicated test file for `FsFolderIndicator.tsx`/`FsFolderIndicator.hooks.ts` — the
 * chat composer's folder control for the assistant's `fs-files` `custom` root. Covers the loading
 * gap (renders nothing until the initial GET settles), the unset/set display states, the inline
 * editor's set/cancel/clear round trips, and the server-rejection error path — all against a mocked
 * `../../lib/api`, same convention `use-access-tokens.unit.test.tsx` documents for this repo
 * ("mocking just those [named exports] keeps every other lib/api export real").
 */

const { getFsFilesCustomRoot, setFsFilesCustomRoot, clearFsFilesCustomRoot } = vi.hoisted(() => ({
  getFsFilesCustomRoot: vi.fn(),
  setFsFilesCustomRoot: vi.fn(),
  clearFsFilesCustomRoot: vi.fn(),
}));

vi.mock("../../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getFsFilesCustomRoot,
      setFsFilesCustomRoot,
      clearFsFilesCustomRoot,
    },
  };
});

beforeEach(() => {
  getFsFilesCustomRoot.mockReset();
  setFsFilesCustomRoot.mockReset();
  clearFsFilesCustomRoot.mockReset();
});

describe("FsFolderIndicator", () => {
  it("renders nothing until the initial GET settles", async () => {
    let resolveGet!: (value: { path: string | null }) => void;
    getFsFilesCustomRoot.mockReturnValue(new Promise((resolve) => (resolveGet = resolve)));

    const { container } = render(<FsFolderIndicator />);
    expect(container).toBeEmptyDOMElement();

    resolveGet({ path: null });
    await waitFor(() => expect(container).not.toBeEmptyDOMElement());
  });

  it("shows 'No folder set' when the custom root is unset", async () => {
    getFsFilesCustomRoot.mockResolvedValue({ path: null });
    render(<FsFolderIndicator />);
    expect(await screen.findByText("No folder set")).toBeInTheDocument();
    // No remove ("stop sharing") affordance when nothing is set.
    expect(screen.queryByRole("button", { name: "Stop sharing this folder" })).not.toBeInTheDocument();
  });

  it("shows the folder's basename (with the full path as a tooltip) once one is set", async () => {
    getFsFilesCustomRoot.mockResolvedValue({ path: "/Users/la/Programming/kUInetic/demo" });
    render(<FsFolderIndicator />);
    expect(await screen.findByText("demo")).toBeInTheDocument();
    expect(screen.getByTitle("/Users/la/Programming/kUInetic/demo")).toBeInTheDocument();
  });

  it("opens the inline editor, submits a path, and reflects the server's response", async () => {
    const user = userEvent.setup();
    getFsFilesCustomRoot.mockResolvedValue({ path: null });
    setFsFilesCustomRoot.mockResolvedValue({ path: "/Users/la/Programming/kUInetic/demo" });
    render(<FsFolderIndicator />);

    await user.click(await screen.findByText("No folder set"));
    const input = screen.getByLabelText("Folder path for the assistant to read");
    await user.type(input, "/Users/la/Programming/kUInetic/demo");
    await user.click(screen.getByRole("button", { name: "Set" }));

    await waitFor(() => expect(setFsFilesCustomRoot).toHaveBeenCalledWith("/Users/la/Programming/kUInetic/demo"));
    expect(await screen.findByText("demo")).toBeInTheDocument();
  });

  it("shows the server's own rejection message inline rather than crashing or going silent", async () => {
    const user = userEvent.setup();
    getFsFilesCustomRoot.mockResolvedValue({ path: null });
    setFsFilesCustomRoot.mockRejectedValue(new Error("'/nope' does not exist"));
    render(<FsFolderIndicator />);

    await user.click(await screen.findByText("No folder set"));
    await user.type(screen.getByLabelText("Folder path for the assistant to read"), "/nope");
    await user.click(screen.getByRole("button", { name: "Set" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("'/nope' does not exist");
    // The editor stays open on failure — nothing was actually set.
    expect(screen.getByLabelText("Folder path for the assistant to read")).toBeInTheDocument();
  });

  it("cancelling the editor discards the draft without calling the API", async () => {
    const user = userEvent.setup();
    getFsFilesCustomRoot.mockResolvedValue({ path: null });
    render(<FsFolderIndicator />);

    await user.click(await screen.findByText("No folder set"));
    await user.type(screen.getByLabelText("Folder path for the assistant to read"), "/whatever");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByText("No folder set")).toBeInTheDocument();
    expect(setFsFilesCustomRoot).not.toHaveBeenCalled();
  });

  it("clearing a set folder calls the API and reverts to the unset display", async () => {
    const user = userEvent.setup();
    getFsFilesCustomRoot.mockResolvedValue({ path: "/Users/la/Programming/kUInetic/demo" });
    clearFsFilesCustomRoot.mockResolvedValue({ path: null });
    render(<FsFolderIndicator />);

    await user.click(await screen.findByRole("button", { name: "Stop sharing this folder" }));

    await waitFor(() => expect(clearFsFilesCustomRoot).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("No folder set")).toBeInTheDocument();
  });
});
