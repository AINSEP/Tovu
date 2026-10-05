import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ServerRestartingBanner } from "../ServerRestartingBanner/ServerRestartingBanner";
import { createServerReconnect } from "@/lib/server-reconnect";

/** @file The restart banner follows the reconnect store: hidden online, shown while reconnecting. */

describe("ServerRestartingBanner", () => {
  it("shows while the server is restarting and hides once it answers", async () => {
    let release!: (up: boolean) => void;
    const reconnect = createServerReconnect({
      probe: () => new Promise<boolean>((resolve) => (release = resolve)),
      sleep: async () => {},
      now: () => 0,
    });
    render(<ServerRestartingBanner reconnect={reconnect} />);
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
