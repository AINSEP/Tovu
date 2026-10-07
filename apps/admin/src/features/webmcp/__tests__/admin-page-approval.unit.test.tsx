import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PAGE_CAPABILITIES, type PageDriver, type WebMcpToolRegistration } from "@jini-ai/agentic";
import { registerAdminPageWebMcpTools } from "../admin-page-tools";
import { createAdminPageApprovalStore } from "../admin-page-approval.store";
import { AdminPageApprovalDialog } from "../AdminPageApprovalDialog";
import { WEBMCP_DICT, t } from "../webmcp-i18n";

afterEach(cleanup);
function fixture() {
  const approvals = createAdminPageApprovalStore({}, { createId: () => "approval-1" });
  const tools: WebMcpToolRegistration[] = [];
  const controller = new AbortController();
  const driver: PageDriver = {
    findElements: async () => [], listPages: async () => [], describeField: async () => ({ type: "text" }),
    highlight: async () => {}, scrollTo: async () => {}, click: vi.fn(async () => {}),
    fill: vi.fn(async () => {}), selectOption: async () => {}, navigate: async () => {},
  };
  registerAdminPageWebMcpTools({ driver, signal: controller.signal }, {
    approvals, isEnabled: () => true,
    modelContext: { registerTool: async ({ tool }) => { tools.push(tool as WebMcpToolRegistration); } },
  });
  const tool = (name: string) => tools.find(tool => tool.name === name)!;
  const request = () => tool("page.click").execute({ handle: "post-delete-confirm" });
  const respond = (approved: boolean, approvalId = "approval-1") => tool("admin.respond_page_approval").execute({ approvalId, approved });
  return { approvals, driver, controller, tool, request, respond };
}

it("returns an answerable approval and shows the same exact action to the human before executing", async () => {
  const f = fixture();
  render(<AdminPageApprovalDialog locale="en" approvals={f.approvals} />);
  let result: unknown;
  await act(async () => { result = await f.request(); });
  expect(result).toEqual({ status: "approval_required", approvalId: "approval-1", capabilityId: "page.click", args: { handle: "post-delete-confirm" }, responseTool: "admin.respond_page_approval" });
  expect(f.driver.click).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toHaveTextContent("Allow the browser agent to perform this admin action?");
  expect(screen.getByRole("dialog")).toHaveTextContent('"post-delete-confirm"');
  expect(screen.getByRole("button", { name: "Confirm" })).toHaveAttribute("data-agent-element", "webmcp-page-approval-confirm");
  await act(async () => { await f.respond(true); });
  expect(f.driver.click).toHaveBeenCalledExactlyOnceWith({ handle: "post-delete-confirm" });
  expect(screen.queryByRole("dialog")).toBeNull();
  await expect(f.respond(true)).rejects.toThrow("Page approval is missing or expired");
});

it("denial, human Cancel, unknown ids and malformed replies never execute", async () => {
  const f = fixture();
  render(<AdminPageApprovalDialog locale="en" approvals={f.approvals} />);
  await act(async () => { await f.request(); });
  await expect(f.respond(true, "other")).rejects.toThrow("Page approval is missing or expired");
  await expect(f.tool("admin.respond_page_approval").execute({ approvalId: "approval-1", approved: "true" })).rejects.toThrow("Expected approvalId (string) and approved (boolean)");
  await act(async () => { expect(await f.respond(false)).toEqual({ status: "declined" }); });
  await act(async () => { await f.request(); });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(f.driver.click).not.toHaveBeenCalled();
  expect(f.approvals.getSnapshot().pending).toBeNull();
});

it("requires explicit approval even for destructive controls and keeps their own dialog gate", async () => {
  const f = fixture();
  await f.tool("page.click").execute({ handle: "plugin-row-remove-confirm" });
  expect(f.driver.click).not.toHaveBeenCalled();
  await f.respond(false);
  expect(f.driver.click).not.toHaveBeenCalled();
});

it("validates inputs before asking and invalidates pending approvals on abort", async () => {
  const f = fixture();
  const schema = PAGE_CAPABILITIES.find(capability => capability.id === "page.click")!.inputSchema;
  await expect(f.tool("page.click").execute({})).rejects.toThrow(`page.click: "handle" is required. Expected input: ${JSON.stringify(schema)}`);
  expect(f.approvals.getSnapshot().pending).toBeNull();
  await f.request();
  f.controller.abort();
  expect(f.approvals.getSnapshot().pending).toBeNull();
  await expect(f.respond(true)).rejects.toThrow("WebMCP admin access is disabled or closed");
  expect(f.driver.click).not.toHaveBeenCalled();
});

it("rejects concurrent proposals and snapshots the input so an approved call cannot change", async () => {
  const f = fixture();
  const args = { handle: "post-delete-confirm" };
  await f.tool("page.click").execute(args);
  args.handle = "plugin-row-remove-confirm";
  f.approvals.getSnapshot().pending!.args.handle = "another-remove-confirm";
  await expect(f.request()).rejects.toThrow("A page approval is already pending");
  await f.respond(true);
  expect(f.driver.click).toHaveBeenCalledExactlyOnceWith({ handle: "post-delete-confirm" });
});

it("human Confirm uses the same once-only decision and displays execution failures", async () => {
  const f = fixture();
  vi.mocked(f.driver.click).mockRejectedValueOnce(new Error("Plugin source unavailable"));
  render(<AdminPageApprovalDialog locale="en" approvals={f.approvals} />);
  await act(async () => { await f.request(); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Confirm" })); });
  expect(screen.getByRole("alert")).toHaveTextContent("Plugin source unavailable");
  await expect(f.respond(true)).rejects.toThrow("Page approval is missing or expired");
});

it("translates the confirmation choice in every supported locale", () => {
  expect(Object.keys(WEBMCP_DICT)).toHaveLength(22);
  for (const locale of Object.keys(WEBMCP_DICT)) {
    expect(WEBMCP_DICT[locale].Confirm).toBeTruthy();
    expect(t(locale, "Confirm")).toBe(WEBMCP_DICT[locale].Confirm);
  }
});


it("retains credential-field and navigation guards after approval, and refuses disabled access", async () => {
  const f = fixture();
  f.driver.describeField = async () => ({ type: "password", name: "password" });
  await expect(f.tool("page.fill").execute({ handle: "secret", text: "example" })).rejects.toThrow('refusing to fill "secret": this field type can never be filled by an agent');
  expect(f.driver.fill).not.toHaveBeenCalled();
  await expect(f.tool("page.navigate").execute({ page: "https://example.com" })).rejects.toThrow('"https://example.com" is not a published page. Available: (none)');
  const tools: WebMcpToolRegistration[] = [];
  let enabled = true;
  registerAdminPageWebMcpTools({ driver: f.driver, signal: f.controller.signal }, {
    approvals: f.approvals, isEnabled: () => enabled,
    modelContext: { registerTool: async ({ tool }) => { tools.push(tool as WebMcpToolRegistration); } },
  });
  await tools.find(t => t.name === "page.click")!.execute({ handle: "post-delete-confirm" });
  enabled = false;
  await expect(f.approvals.respond({ approvalId: "approval-1", approved: true })).rejects.toThrow("WebMCP admin access is disabled or closed");
  expect(f.driver.click).not.toHaveBeenCalled();
});
