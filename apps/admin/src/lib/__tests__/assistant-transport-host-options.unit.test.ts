import { expect, it, vi } from "vitest";
import { createTovuAssistantTransport, type CreateTovuAssistantTransportOptions } from "../assistant-transport";
import type { StreamActivity } from "../stream-activity";

type HostOptions = Record<string, ((input: unknown) => unknown) | undefined>;

/** Builds the transport with a fake Jini factory and returns the host options Jini would receive. */
function hostOptionsFor(options: CreateTovuAssistantTransportOptions): HostOptions {
  let captured: HostOptions | undefined;
  const createTransport = vi.fn((arg: { options?: HostOptions }) => {
    captured = arg.options;
    return { startRun: vi.fn() } as never;
  });
  const activity = { begin: vi.fn(), end: vi.fn() } as unknown as StreamActivity;
  createTovuAssistantTransport(options, { createTransport: createTransport as never, activity });
  return captured!;
}

it("leaves every port undefined when the dock supplies no callback, so Jini keeps its defaults", () => {
  const host = hostOptionsFor({});
  expect(Object.values(host).every(port => port === undefined)).toBe(true);
});

it("forwards each dock callback with exactly its own arguments and returns its result", async () => {
  const options: CreateTovuAssistantTransportOptions = {
    getExecutionConfig: vi.fn(() => ({ mode: "local" })) as never,
    getAgUiEnabled: vi.fn(() => true),
    getResumeCapableAgentIds: vi.fn(() => ["a1"]),
    ensureConversationId: vi.fn(() => "conv-1") as never,
    persistUserTurn: vi.fn(async () => undefined),
  };
  const host = hostOptionsFor(options);
  expect(host.getExecutionConfig!({})).toEqual({ mode: "local" });
  expect(host.getAgUiEnabled!({})).toBe(true);
  expect(host.getResumeCapableAgentIds!({})).toEqual(["a1"]);
  expect(host.ensureConversationId!({})).toBe("conv-1");
  const message = { id: "m1", role: "user", content: "hi" };
  await host.persistUserTurn!({ conversationId: "conv-1", message });
  expect(options.persistUserTurn).toHaveBeenCalledExactlyOnceWith("conv-1", message);
  expect(options.getExecutionConfig).toHaveBeenCalledWith();
  expect(options.getAgUiEnabled).toHaveBeenCalledWith();
});

it("re-reads each option on every call: a callback removed after construction fails loudly instead of silently", () => {
  const options: CreateTovuAssistantTransportOptions = {
    getExecutionConfig: () => ({}) as never,
    getAgUiEnabled: () => true,
    getResumeCapableAgentIds: () => [],
    ensureConversationId: () => "c" as never,
    persistUserTurn: async () => undefined,
  };
  const host = hostOptionsFor(options);
  options.getExecutionConfig = undefined;
  options.getAgUiEnabled = undefined;
  options.getResumeCapableAgentIds = undefined;
  options.ensureConversationId = undefined;
  options.persistUserTurn = undefined;
  expect(() => host.getExecutionConfig!({})).toThrow("assistant transport has no execution config callback");
  expect(() => host.getAgUiEnabled!({})).toThrow("assistant transport has no AG-UI enabled callback");
  expect(() => host.getResumeCapableAgentIds!({})).toThrow("assistant transport has no resumable agents callback");
  expect(() => host.ensureConversationId!({})).toThrow("assistant transport has no conversation id callback");
  expect(() => host.persistUserTurn!({ conversationId: "c", message: {} })).toThrow("assistant transport has no user turn persistence callback");
});
