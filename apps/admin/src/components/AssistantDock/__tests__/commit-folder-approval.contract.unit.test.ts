import { expect, it } from "vitest";
import { toolApprovalPresentation, renderDetailList } from "@jini-ai/ui/mcp-ui/surfaces";
import { executeCommitSchema } from "@jini-ai/devops/source-control/site/commit-schema";

it("the public Jini approval presentation keeps the registered target-folder label and selected value", () => {
  const presentation = toolApprovalPresentation({ descriptor: { id: "source_control_execute_commit", inputSchema: executeCommitSchema } }, { text: ({ key }) => key });
  const html = renderDetailList({ details: [{ label: "Input", value: { folder: "static_sites" }, labels: presentation.labels }] });
  const doc = new DOMParser().parseFromString(html, "text/html");
  expect([...doc.querySelectorAll("dt")].map(node => node.textContent)).toContain("Target folder");
  expect([...doc.querySelectorAll("dd")].map(node => node.textContent)).toContain("static_sites");
});
