import { expect, it } from "vitest";
import { subscribeToSettingsChanges } from "../settings-events";
import { fakeBrowserOrigin, settleLocks, StreamFake } from "./browser-stream.fakes";

it("keeps principal identity in the real host feed key", async () => {
  const origin = fakeBrowserOrigin();
  const sources: StreamFake[] = [];
  const received: unknown[][] = [[], []];
  const stops = ["a", "b"].map((principalId, index) => subscribeToSettingsChanges({ workspaceId: "ws" }, {
    principalId, ports: origin.tab().ports,
    open: url => { const source = new StreamFake(url); sources.push(source); return source; },
    publishSettings: namespaces => { received[index]?.push(namespaces); },
  }));
  await settleLocks();
  expect(sources).toHaveLength(2);
  sources[0]?.emit("settings-changed", '{"namespaces":["private"]}', "7");
  await settleLocks();
  expect(received).toEqual([[["private"]], []]);
  stops.forEach(stop => stop());
});
