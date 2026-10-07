import { describe, expect, it, vi } from "vitest";
import { PAGE_CAPABILITIES, type PageDriver, type WebMcpToolRegistration } from "@jini-ai/agentic";
import { registerAdminPageWebMcpTools } from "../admin-page-tools";
import type { AgentModelContextRegisterToolOptions, AgentModelContextToolRegistration } from "@jini-ai/agentic/dom";

function fixture() {
  const tools: WebMcpToolRegistration[] = [];
  const registerTool = vi.fn(({ tool }: { tool: AgentModelContextToolRegistration }, _options?: AgentModelContextRegisterToolOptions) => {
    tools.push(tool as WebMcpToolRegistration); return Promise.resolve();
  });
  const driver: PageDriver = {
    findElements: vi.fn().mockResolvedValue([{ handle: "save", role: "button", label: "Save" }]),
    listPages: vi.fn().mockResolvedValue([{ id: "pages", label: "Pages" }]),
    describeField: vi.fn().mockResolvedValue({ type: "text", name: "title" }),
    highlight: vi.fn(), scrollTo: vi.fn(), click: vi.fn(), fill: vi.fn(),
    selectOption: vi.fn(), navigate: vi.fn(),
  };
  const controller = new AbortController();
  const requestUserInteraction = vi.fn().mockResolvedValue(true);
  const onError = vi.fn();
  registerAdminPageWebMcpTools({ driver, signal: controller.signal }, {
    modelContext: { registerTool }, requestUserInteraction, onError,
  });
  const tool = (name: string) => tools.find((entry) => entry.name === name)!;
  return { tools, registerTool, driver, controller, requestUserInteraction, onError, tool };
}

describe("admin page WebMCP", () => {
  it("publishes the whole Jini page manifest with an abort signal and read hints", async () => {
    const f = fixture();
    expect(f.tools.map((tool) => tool.name)).toEqual(PAGE_CAPABILITIES.map((tool) => tool.id));
    for (const [index, call] of f.registerTool.mock.calls.entries()) {
      expect(call[1]).toEqual({ signal: f.controller.signal });
      expect(f.tools[index].annotations?.readOnlyHint).toBe(PAGE_CAPABILITIES[index].risk === "read");
    }
    const result = await f.tool("page.find_elements").execute({});
    expect(result).toMatchObject({ elements: [{ handle: "save" }], pages: [{ id: "pages" }] });
    expect(f.requestUserInteraction).not.toHaveBeenCalled();
  });

  it("confirms before a click and never executes a declined action", async () => {
    const f = fixture();
    f.requestUserInteraction.mockResolvedValueOnce(false);
    await expect(f.tool("page.click").execute({ handle: "save" })).rejects.toThrow(/declined/);
    expect(f.driver.click).not.toHaveBeenCalled();
    await f.tool("page.click").execute({ handle: "save" });
    expect(f.requestUserInteraction).toHaveBeenCalledWith(expect.objectContaining({ args: { handle: "save" } }));
    expect(f.driver.click).toHaveBeenCalledWith({ handle: "save" });
  });

  it("refuses writes when no confirmation handler is supplied", async () => {
    const f = fixture();
    const tools: WebMcpToolRegistration[] = [];
    registerAdminPageWebMcpTools({ driver: f.driver, signal: f.controller.signal }, {
      modelContext: { registerTool: async ({ tool }) => { tools.push(tool as WebMcpToolRegistration); } },
    });
    await expect(tools.find((t) => t.name === "page.click")!.execute({ handle: "save" })).rejects.toThrow(/confirmation/);
    expect(f.driver.fill).not.toHaveBeenCalled();
  });

  it("retains Jini navigation and credential-field refusals", async () => {
    const f = fixture();
    await expect(f.tool("page.navigate").execute({ page: "https://evil.example" })).rejects.toThrow();
    expect(f.driver.navigate).not.toHaveBeenCalled();
    vi.mocked(f.driver.describeField).mockResolvedValue({ type: "password", name: "password" });
    await expect(f.tool("page.fill").execute({ handle: "save", text: "secret" })).rejects.toThrow();
    expect(f.driver.fill).not.toHaveBeenCalled();
  });

  it("validates before confirmation and blocks stale calls after teardown", async () => {
    const f = fixture();
    await expect(f.tool("page.click").execute({})).rejects.toThrow(/handle/);
    expect(f.requestUserInteraction).not.toHaveBeenCalled();
    f.controller.abort();
    await expect(f.tool("page.find_elements").execute({})).rejects.toThrow(/disabled|closed/);
    expect(f.driver.findElements).not.toHaveBeenCalled();
  });

  it("checks teardown again after an asynchronous confirmation", async () => {
    const f = fixture();
    f.requestUserInteraction.mockImplementationOnce(async () => { f.controller.abort(); return true; });
    await expect(f.tool("page.click").execute({ handle: "save" })).rejects.toThrow(/disabled|closed/);
    expect(f.driver.click).not.toHaveBeenCalled();
  });

  it("handles synchronous and asynchronous registration failures without throwing", async () => {
    const f = fixture();
    const failure = new Error("registration failed");
    const registerTool = vi.fn().mockImplementationOnce(() => { throw failure; }).mockRejectedValue(failure);
    expect(() => registerAdminPageWebMcpTools({ driver: f.driver, signal: f.controller.signal }, {
      modelContext: { registerTool }, onError: f.onError,
    })).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(f.onError).toHaveBeenCalledWith(expect.objectContaining({ error: failure }));
  });

  it("skips registration when access is disabled or the registration lifetime has ended", () => {
    const f = fixture();
    f.registerTool.mockClear();
    registerAdminPageWebMcpTools({ driver: f.driver, signal: f.controller.signal }, {
      modelContext: { registerTool: f.registerTool }, isEnabled: () => false,
    });
    expect(f.registerTool).not.toHaveBeenCalled();
    f.controller.abort();
    registerAdminPageWebMcpTools({ driver: f.driver, signal: f.controller.signal }, {
      modelContext: { registerTool: f.registerTool },
    });
    expect(f.registerTool).not.toHaveBeenCalled();
  });
});
