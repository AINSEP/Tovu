import { recordAssistantPageHtmlWrite as record, type PageHtmlRecordingDeps as RecordingDeps } from "@jini-ai/cms/pages/html-change-recording";
import type { PageHtmlOperation, PageHtmlWriteOutcome } from "@jini-ai/core/contracts/site/page-html-store";
import { PAGES_EDIT_HTML_PERMISSION } from "./permissions.js";

export type PageHtmlRecordingDeps = Omit<RecordingDeps, "editPermission" | "summary">;

/** Short, HTML-free summaries: change-set summaries are listed to the model and to History. */
const SUMMARY: Readonly<Record<PageHtmlOperation, string>> = {
  pages_write_html: "Assistant rewrote a page's HTML",
  pages_write_region: "Assistant edited a page section",
  pages_move_region: "Assistant moved a page section",
};

export async function recordAssistantPageHtmlWrite<T>(
  { deps, target, expectedVersion, operation, write, signal }: {
    deps: PageHtmlRecordingDeps;
    target: { workspaceId: string; pageId: string; actorId: string; executionId: string };
    expectedVersion: number;
    operation: PageHtmlOperation;
    write: () => Promise<PageHtmlWriteOutcome<T>>;
    signal: AbortSignal;
  },
  _optional = {},
): Promise<{ value: T; version: number | null; changeSetId?: string }> {
  return record({ deps: { ...deps, editPermission: PAGES_EDIT_HTML_PERMISSION, summary: SUMMARY }, target, expectedVersion, operation, write, signal });
}
