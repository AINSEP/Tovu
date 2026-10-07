import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { buildUninstallConfirmationResource } from "../../uninstall-confirmation-ui.js";

/** Execute the delivered script. The sandbox can be hidden while document.write runs and visible
 * by ui/initialize without delivering visibilitychange to the newly written document. */
function mount() {
  const html = buildUninstallConfirmationResource({ preview: { pluginId: "notes", versions: ["1"], archiveDigests: ["a"] }, exchangeId: "exchange", expiresAtMs: Date.now() + 60_000 }).resource.text;
  let time = 0, visibilityState = "hidden";
  const ready: Array<() => void> = [], calls: unknown[] = [];
  const timers = new Map<number, { at: number; fn: () => void }>();
  let timerId = 0;
  const buttons = ["confirm", "delete-memory", "cancel"].map(action => ({
    disabled: action !== "cancel", action, listeners: new Map<string, (event: unknown) => void>(),
    getAttribute: () => action,
    addEventListener(type: string, listener: (event: unknown) => void) { this.listeners.set(type, listener); },
  }));
  const document = { get visibilityState() { return visibilityState; },
    querySelectorAll: (selector: string) => selector === "[data-mcpui-action]" ? buttons : [],
    getElementById: () => ({ textContent: "", setAttribute() {} }), addEventListener() {},
  };
  const api = { whenReady: (fn: () => void) => ready.push(fn),
    callTool: (tool: string, params: unknown) => { calls.push({ tool, params }); return new Promise(() => {}); }, requestTeardown() {},
  };
  const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)![1]!;
  runInNewContext(script, { window: { jiniMcpUi: api }, document, performance: { now: () => time },
    setTimeout: (fn: () => void, delay: number) => { timers.set(++timerId, { at: time + delay, fn }); return timerId; },
    clearTimeout: (id: number) => timers.delete(id),
  });
  return { buttons, calls,
    initialized() { visibilityState = "visible"; ready.forEach(fn => fn()); },
    advance(ms: number) { time += ms; for (const [id, timer] of [...timers]) if (timer.at <= time) { timers.delete(id); timer.fn(); } },
    click(action: string, trusted = true) { const button = buttons.find(b => b.action === action)!; button.listeners.get("click")!({ currentTarget: button, isTrusted: trusted }); },
  };
}

test("both uninstall choices re-arm after sandbox initialization without a visibilitychange event", () => {
  for (const action of ["confirm", "delete-memory"]) {
    const surface = mount();
    assert.deepEqual(surface.buttons.map(b => b.disabled), [true, true, false]);
    surface.initialized();
    surface.advance(1499); surface.click(action);
    assert.equal(surface.calls.length, 0, "early clicks cannot confirm");
    surface.advance(1);
    assert.deepEqual(surface.buttons.map(b => b.disabled), [false, false, false]);
    surface.click(action, false); assert.equal(surface.calls.length, 0, "synthetic clicks cannot confirm");
    surface.click(action); surface.click("confirm");
    assert.equal(surface.calls.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(surface.calls[0])), { tool: "plugins_uninstall", params: { __exchangeId: "exchange", decision: "confirm", ...(action === "delete-memory" ? { choice: action } : {}) } });
  }
});

test("cancel is usable before initialization and locks both uninstall choices", () => {
  const surface = mount(); surface.click("cancel"); surface.initialized(); surface.advance(1500);
  assert.deepEqual(surface.buttons.map(b => b.disabled), [true, true, true]);
  assert.equal(surface.calls.length, 1);
});
