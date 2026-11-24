import type { DownloadHtmlSourceEdits } from "@jini-ai/devops/backup/site/static-download-html";
import { escapeHtml } from "@jini-ai/core/text";
import * as sourceEdits from "#src/platform/html/source-edits";

/** @file The host seam for the Jini static-download rewriter: this host's parse5 source-edit helpers plus the shared HTML escaper (the backup package imports neither). */
export const downloadHtmlSourceEdits: DownloadHtmlSourceEdits = { ...sourceEdits, escapeHtml };
