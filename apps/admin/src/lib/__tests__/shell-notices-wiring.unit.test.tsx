import { renderToStaticMarkup } from "react-dom/server";
import { AdminKitProvider } from "@jini-ai/admin/react/kit";
import { adminKit } from "../../integrations/jini-kits";
import { act, fireEvent, render, screen } from "@/__tests__/render-with-jini-kits";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatUserFacingError } from "@jini-ai/core";
import { TovuAdminFailureNotice, TovuServerRestartingBanner } from "../shell-notices-wiring";
import { adminFailureChannel } from "../admin-failure-channel";
import { createServerReconnect } from "@jini-ai/admin/browser/server-reconnect";

/** @file Tovu's bindings into the Jini shell notices: the real failure channel, dictionary and reconnect store. */

afterEach(() => { adminFailureChannel.reset(); vi.restoreAllMocks(); document.documentElement.lang = ""; });

describe("TovuAdminFailureNotice", () => {
  it("dismisses an incident through the translated German action", () => {
    document.documentElement.lang = "de";
    const failure = formatUserFacingError({ message: "Pages could not be loaded.", action: "Try loading them again.", step: "Loading pages", cause: "offline" }, { errorId: "translated-incident" });
    adminFailureChannel.publish({ failure });
    render(<TovuAdminFailureNotice />);
    fireEvent.click(screen.getByRole("button", { name: "Fehlermeldung schließen" }));
    expect(screen.queryByText(failure.message)).toBeNull();
    expect(adminFailureChannel.getSnapshot()).toBeNull();
  });

  it("shows the app channel's incident through the admin kit's ErrorNotice with copyable details", () => {
    render(<TovuAdminFailureNotice />);
    expect(screen.queryByRole("status")).toBeNull();
    const failure = formatUserFacingError({ message: "Pages could not be loaded.", action: "Try loading them again.", step: "Loading pages", cause: "The error ID identifies the server report." }, { errorId: "incident-ui" });
    act(() => adminFailureChannel.publish({ failure }));
    expect(screen.getByRole("status")).toHaveTextContent(failure.message);
    fireEvent.click(screen.getByText("Show details"));
    expect(screen.getByText((_content, element) => element?.tagName === "PRE" && element.textContent === failure.copyText)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss error" }));
    expect(screen.queryByText(failure.message)).toBeNull();
    expect(adminFailureChannel.getSnapshot()).toBeNull();
  });
});

describe("TovuServerRestartingBanner", () => {
  it("shows while the server is restarting and hides once it answers", async () => {
    let release!: (up: boolean) => void;
    const reconnect = createServerReconnect({
      probe: () => new Promise<boolean>((resolve) => (release = resolve)),
      sleep: async () => {},
      now: () => 0,
    });
    render(<TovuServerRestartingBanner reconnect={reconnect} />);
    expect(screen.queryByRole("status")).toBeNull();

    let done!: Promise<boolean>;
    act(() => {
      done = reconnect.waitUntilReachable();
    });
    expect(screen.getByRole("status").textContent).toContain("Server restarting");

    await act(async () => {
      release(true);
      await done;
    });
    expect(screen.queryByRole("status")).toBeNull();
  });
});

it("renders the live connection banner before any server failure as an empty slot", () => {
  const { container } = render(<TovuServerRestartingBanner />);
  expect(container).toBeEmptyDOMElement();
});

it("renders an English dismiss action when there is no document locale", () => {
  const failure = formatUserFacingError({
    message: "Saving the menu failed.", action: "Try saving again.", step: "Save menu", cause: "offline",
  }, { errorId: "menu-save" });
  adminFailureChannel.publish({ failure });
  vi.stubGlobal("document", undefined);
  let markup: string;
  try {
    markup = renderToStaticMarkup(<AdminKitProvider kit={adminKit}><TovuAdminFailureNotice /></AdminKitProvider>);
  } finally {
    vi.unstubAllGlobals();
  }
  expect(markup).toContain('aria-label="Dismiss error"');
  expect(markup).toContain("Saving the menu failed.");
});
