import type { TemplateForIssue } from "@jini-ai/cms/themes/template-applicability";

export function rejectTemplateFor({ issue }: { issue: TemplateForIssue }, _optional = {}): never {
  if (issue.kind === "invalid-map") {
    throw new Error("theme.json templateFor must be an object mapping template names to content kinds");
  }
  if (issue.kind === "undeclared-template") {
    throw new Error(`theme.json templateFor '${issue.template}' is not listed in templates`);
  }
  throw new Error(`theme.json templateFor '${issue.template}' must be a non-empty array of unique 'post'/'page' kinds`);
}
