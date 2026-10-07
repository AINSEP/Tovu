import { expect, it } from "vitest";
import { PAGE_CAPABILITIES, type PageDriver, type WebMcpToolRegistration } from "@jini-ai/agentic";
import { createAdminPageApprovalStore } from "../admin-page-approval.store";
import { registerAdminPageWebMcpTools } from "../admin-page-tools";

function fixture() {
  const approvals = createAdminPageApprovalStore({}, { createId: () => "input-approval" });
  const registrations: WebMcpToolRegistration[] = [];
  const clicks: string[] = [];
  const driver: PageDriver = {
    findElements: async () => [], listPages: async () => [],
    describeField: async () => ({ type: "text" }),
    highlight: async () => {}, scrollTo: async () => {},
    click: async ({ handle }) => { clicks.push(handle); },
    fill: async () => {}, selectOption: async () => {}, navigate: async () => {},
  };
  const controller = new AbortController();
  registerAdminPageWebMcpTools({ driver, signal: controller.signal }, {
    approvals, isEnabled: () => true,
    modelContext: { registerTool: async ({ tool }) => { registrations.push(tool as WebMcpToolRegistration); } },
  });
  const tool = (name: string) => registrations.find(entry => entry.name === name)!;
  return { approvals, clicks, controller, tool };
}

it("checks the Jini schema before proposing and returns its exact correction schema", async () => {
  const f = fixture();
  const capability = PAGE_CAPABILITIES.find(entry => entry.id === "page.click")!;
  await expect(f.tool("page.click").execute({})).rejects.toThrow(
    `page.click: "handle" is required. Expected input: ${JSON.stringify(capability.inputSchema)}`,
  );
  expect(f.approvals.getSnapshot().pending).toBeNull();
  expect(f.clicks).toEqual([]);
  await f.tool("page.click").execute({ handle: "post-delete-confirm" });
  expect(f.approvals.getSnapshot().pending?.capability.id).toBe("page.click");
  expect(f.clicks).toEqual([]);
  f.controller.abort();
});

it("a valid proposal does not click until the matching explicit approval executes it once", async () => {
  const f = fixture();
  await expect(f.tool("page.click").execute({ handle: "post-delete-confirm" })).resolves.toEqual({
    status: "approval_required", approvalId: "input-approval", capabilityId: "page.click",
    args: { handle: "post-delete-confirm" }, responseTool: "admin.respond_page_approval",
  });
  expect(f.clicks).toEqual([]);
  await f.tool("admin.respond_page_approval").execute({ approvalId: "input-approval", approved: true });
  expect(f.clicks).toEqual(["post-delete-confirm"]);
  await expect(f.tool("admin.respond_page_approval").execute({ approvalId: "input-approval", approved: true }))
    .rejects.toThrow("Page approval is missing or expired");
  f.controller.abort();
});

it("mutating a returned proposal cannot redirect the action that was captured for approval", async () => {
  const f = fixture();
  const proposal = await f.tool("page.click").execute({ handle: "post-delete-confirm" }) as { args: Record<string, unknown> };
  proposal.args.handle = "plugin-row-remove-confirm";
  await f.tool("admin.respond_page_approval").execute({ approvalId: "input-approval", approved: true });
  expect(f.clicks).toEqual(["post-delete-confirm"]);
  f.controller.abort();
});
