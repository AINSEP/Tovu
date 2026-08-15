import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DockerfileTab } from "../DockerfileTab";
import type { DockerfileSourceController } from "../hooks/use-dockerfile-source.hooks";

/**
 * @file `DockerfileTab` — driven through the `useDockerfileSourceHook` DI seam, same convention
 * `OverviewTab.unit.test.tsx` uses. Pins: the empty state when no Dockerfile exists, the read-only
 * source view when it does, that Copy calls the injected `copy()` (the hook's own clipboard
 * behavior is `use-dockerfile-source.unit.test.tsx`'s job, not this file's), and that Download
 * triggers a real file save with no server round trip — proving this tab genuinely cannot rebuild
 * itself, only read what's already there.
 */

const fakeT = (key: string): string => key;

function controllerFixture(overrides: Partial<DockerfileSourceController> = {}): DockerfileSourceController {
  return {
    snapshot: { exists: true, contents: "FROM node:22\n" },
    error: null,
    copied: false,
    copy: vi.fn().mockResolvedValue(undefined),
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
  it("renders an honest empty state, not a build affordance", () => {
    render(
      <DockerfileTab
        useDockerfileSourceHook={() => controllerFixture({ snapshot: { exists: false, contents: null } })}
      />,
    );
    expect(screen.getByText("No Dockerfile yet")).toBeInTheDocument();
    expect(
      screen.getByText("No Dockerfile exists at the repo root yet. Once one is added, its contents will appear here."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download" })).not.toBeInTheDocument();
  });
});

describe("an existing Dockerfile", () => {
  it("shows the real contents read-only, with no way to save an edit", () => {
    render(<DockerfileTab useDockerfileSourceHook={() => controllerFixture()} />);
    expect(screen.getByText("FROM node:22")).toBeInTheDocument();
    // No textarea/contenteditable anywhere on this tab — it is a `<pre><code>`, not an editor.
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.getByText("Building is a terminal command (docker build …), not a button here."),
    ).toBeInTheDocument();
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

  it("Download builds a real file from the loaded contents — object URL created, anchor clicked, then revoked", async () => {
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
