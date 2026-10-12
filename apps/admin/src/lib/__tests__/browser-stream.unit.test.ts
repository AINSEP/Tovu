import { describe, expect, it } from "vitest";
import { startBrowserStream } from "../browser-stream";
import { createStreamActivity } from "../stream-activity";
import { fakeBrowserOrigin, settleLocks } from "./browser-stream.fakes";

describe("browser stream ownership", () => {
  it("two tabs use one connection, both receive exact frames, and closing the leader transfers ownership", async () => {
    const origin = fakeBrowserOrigin();
    const a = origin.tab();
    const b = origin.tab();
    const connections: { closed: boolean; emit: (frame: { data: string; id: string }) => void }[] = [];
    const received: { data: string; id: string }[][] = [[], []];
    const connect = ({ emit }: { emit: (frame: { data: string; id: string }) => void }) => {
      const connection = { closed: false, emit };
      connections.push(connection);
      return () => { connection.closed = true; };
    };
    const stopA = startBrowserStream({ key: "settings/ws/user", connect, receive: ({ frame }) => { received[0]!.push(frame); } }, { ports: a.ports });
    const stopB = startBrowserStream({ key: "settings/ws/user", connect, receive: ({ frame }) => { received[1]!.push(frame); } }, { ports: b.ports });
    await settleLocks();
    expect(connections).toHaveLength(1);
    connections[0]!.emit({ data: "verbatim", id: "42" });
    await settleLocks();
    expect(received).toEqual([[{ data: "verbatim", id: "42" }], [{ data: "verbatim", id: "42" }]]);
    stopA();
    await settleLocks();
    expect(connections[0]!.closed).toBe(true);
    expect(connections).toHaveLength(2);
    expect(connections.filter((connection) => !connection.closed)).toHaveLength(1);
    stopB();
    expect(b.listenerCount()).toBe(0);
  });

  it("a hidden leader immediately yields to a visible follower; hidden tabs still receive frames", async () => {
    const origin = fakeBrowserOrigin();
    const a = origin.tab();
    const b = origin.tab();
    const opened: string[] = [];
    const closed: string[] = [];
    let emit: (frame: string) => void = () => {};
    const received: string[] = [];
    const stopA = startBrowserStream({ key: "feed", connect: () => { opened.push("a"); return () => { closed.push("a"); }; }, receive: ({ frame }: { frame: string }) => { received.push(frame); } }, { ports: a.ports });
    const stopB = startBrowserStream({ key: "feed", connect: (args) => { emit = args.emit; opened.push("b"); return () => { closed.push("b"); }; } }, { ports: b.ports });
    await settleLocks();
    a.hide();
    await settleLocks();
    expect(opened).toEqual(["a", "b"]);
    expect(closed).toEqual(["a"]);
    emit("hidden follower refresh");
    await settleLocks();
    expect(received).toEqual(["hidden follower refresh"]);
    a.show();
    await settleLocks();
    expect(opened).toEqual(["a", "b"]);
    stopA(); stopB();
  });

  it.each(["tab", "fallback"] as const)("%s stream closes after 30s hidden and reopens on visible", (mode) => {
    const tab = fakeBrowserOrigin().tab();
    const ports = { ...tab.ports, requestLock: undefined };
    let opens = 0;
    let closes = 0;
    const stop = startBrowserStream({ key: "page", connect: () => { opens++; return () => { closes++; }; } }, { ports, scope: mode === "tab" ? "tab" : "origin" });
    tab.hide(); tab.advance(29_999);
    expect(closes).toBe(0);
    tab.advance(1);
    expect(closes).toBe(1);
    tab.show();
    expect(opens).toBe(2);
    stop();
    expect(closes).toBe(2);
    expect(tab.timerCount()).toBe(0);
  });

  it("an active chat keeps the page stream, and ending the last run releases it if already idle", () => {
    const tab = fakeBrowserOrigin().tab();
    const activity = createStreamActivity({});
    let opens = 0;
    let closes = 0;
    const stop = startBrowserStream({ key: "page", connect: () => { opens++; return () => { closes++; }; } }, { ports: tab.ports, scope: "tab", activity });
    const releaseA = activity.retain({});
    const releaseB = activity.retain({});
    tab.hide(); tab.advance(31_000);
    expect(closes).toBe(0);
    releaseA(); releaseA();
    expect(closes).toBe(0);
    releaseB();
    expect(closes).toBe(1);
    const releaseC = activity.retain({});
    expect(opens).toBe(2);
    releaseC();
    expect(closes).toBe(2);
    stop();
  });

  it("pagehide releases an acquired or queued lock and pageshow can rejoin", async () => {
    const origin = fakeBrowserOrigin();
    const a = origin.tab(); const b = origin.tab();
    let live = 0;
    const connect = () => { live++; return () => { live--; }; };
    const stopA = startBrowserStream({ key: "feed", connect }, { ports: a.ports });
    const stopB = startBrowserStream({ key: "feed", connect }, { ports: b.ports });
    await settleLocks();
    b.page("pagehide"); a.page("pagehide");
    await settleLocks();
    expect(live).toBe(0);
    b.page("pageshow");
    await settleLocks();
    expect(live).toBe(1);
    stopA(); stopB();
  });

  it("isolates different workspace/principal keys", async () => {
    const origin = fakeBrowserOrigin();
    let opens = 0;
    const connect = () => { opens++; return () => {}; };
    const a = startBrowserStream({ key: "ws/user-a", connect }, { ports: origin.tab().ports });
    const b = startBrowserStream({ key: "ws/user-b", connect }, { ports: origin.tab().ports });
    await settleLocks();
    expect(opens).toBe(2);
    a(); b();
  });

  it("lock refusal falls back to a visibility-managed per-tab stream", async () => {
    const tab = fakeBrowserOrigin().tab();
    let closes = 0;
    const stop = startBrowserStream({ key: "feed", connect: () => () => { closes++; } }, {
      ports: { ...tab.ports, requestLock: async () => { throw new DOMException("unavailable", "SecurityError"); } },
    });
    await settleLocks();
    tab.hide(); tab.advance(30_000);
    expect(closes).toBe(1);
    stop();
  });

  it("ignores frames from a former leader after handoff and never resurrects a disposed follower", async () => {
    const origin = fakeBrowserOrigin();
    const a = origin.tab(); const b = origin.tab(); const c = origin.tab();
    const emitters: ((frame: string) => void)[] = [];
    const received: string[] = [];
    const connect = ({ emit }: { emit: (frame: string) => void }) => { emitters.push(emit); return () => {}; };
    const stopA = startBrowserStream({ key: "feed", connect }, { ports: a.ports });
    const stopB = startBrowserStream({ key: "feed", connect, receive: ({ frame }) => { received.push(frame); } }, { ports: b.ports });
    const stopC = startBrowserStream({ key: "feed", connect }, { ports: c.ports });
    await settleLocks();
    stopC(); stopC(); stopA();
    await settleLocks();
    expect(emitters).toHaveLength(2);
    emitters[0]!("stale"); emitters[1]!("current");
    await settleLocks();
    expect(received).toEqual(["current"]);
    stopB(); await settleLocks();
    expect(emitters).toHaveLength(2);
    expect(c.listenerCount()).toBe(0);
  });

  it("all hidden shared tabs release the origin connection until one becomes visible", async () => {
    const origin = fakeBrowserOrigin();
    const a = origin.tab(); const b = origin.tab();
    let live = 0;
    const connect = () => { live++; return () => { live--; }; };
    const stopA = startBrowserStream({ key: "feed", connect }, { ports: a.ports });
    const stopB = startBrowserStream({ key: "feed", connect }, { ports: b.ports });
    await settleLocks();
    b.hide(); a.hide(); await settleLocks();
    expect(live).toBe(0);
    b.show(); await settleLocks();
    expect(live).toBe(1);
    stopA(); stopB();
  });

  it("channel construction refusal falls back and cleans up visibility listeners", () => {
    const tab = fakeBrowserOrigin().tab();
    let live = 0;
    const stop = startBrowserStream({ key: "feed", connect: () => { live++; return () => { live--; }; } }, {
      ports: { ...tab.ports, openChannel: () => { throw new DOMException("denied", "SecurityError"); } },
    });
    expect(live).toBe(1);
    tab.hide(); tab.advance(30_000);
    expect(live).toBe(0);
    stop();
    expect(tab.listenerCount()).toBe(0);
  });
});
