/**
 * `skipProbeWhileHidden` — the assistant dock's 5s daemon-online poll must not hit the network while
 * the tab or desktop window is hidden; it answers with the last known result instead.
 */
import { describe, expect, it, vi } from "vitest";

import { skipProbeWhileHidden } from "../hidden-probe-gate";

describe("skipProbeWhileHidden", () => {
  it("probes every call while visible", async () => {
    const probe = vi.fn(async () => true);
    const gated = skipProbeWhileHidden(probe, () => false);
    await gated();
    await gated();
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it("answers the last known result without probing while hidden", async () => {
    let hidden = false;
    const probe = vi.fn(async () => true);
    const gated = skipProbeWhileHidden(probe, () => hidden);
    expect(await gated()).toBe(true);
    hidden = true;
    expect(await gated()).toBe(true);
    expect(await gated()).toBe(true);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("still probes while hidden when nothing is known yet", async () => {
    const probe = vi.fn(async () => false);
    const gated = skipProbeWhileHidden(probe, () => true);
    expect(await gated()).toBe(false);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("probes again once visible", async () => {
    let hidden = true;
    let online = false;
    const probe = vi.fn(async () => online);
    const gated = skipProbeWhileHidden(probe, () => hidden);
    await gated();
    hidden = false;
    online = true;
    expect(await gated()).toBe(true);
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it("a rejected probe leaves nothing cached, so the next hidden call probes", async () => {
    const probe = vi.fn(async () => {
      throw new Error("offline");
    });
    const gated = skipProbeWhileHidden(probe, () => true);
    await expect(gated()).rejects.toThrow("offline");
    await expect(gated()).rejects.toThrow("offline");
    expect(probe).toHaveBeenCalledTimes(2);
  });
});
