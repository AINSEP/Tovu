import { buildConfirmationSurface, type UIResource, type UIResourceUri } from "@jini-ai/ui/mcp-ui/surfaces";

import { SURFACE_EXCHANGE_ID_PARAM } from "../../contracts/core/tool-surface-exchanges.js";

/**
 * @file The confirmation dialog `tool-registrations.ts` raises before `custom_credential_write_files`
 * writes anything — every call writes to a real, third-party repository, so every call is gated, not
 * just a subset (contrast `delete-request-confirmation-ui.ts`'s DELETE-only gate). Structurally
 * mirrors that file's own mechanism: a held-open `SurfaceExchangeStore` exchange,
 * `resolveConfirmationDecision`, a confirm/cancel action pair carrying `SURFACE_EXCHANGE_ID_PARAM`
 * back to the SAME tool call — reused rather than reinvented, per this domain's own established
 * pattern.
 *
 * Two things this dialog must do that DELETE's confirmation does not:
 *
 * 1. Name EVERY path being written, and whether it already exists on the branch (an update) or does
 *   not (a create) — `tool-registrations.ts`'s handler resolves this via `github-write-files.ts`'s
 *   `planGitHubFileWrite` before this resource is ever built, so the label shown here is always a
 *   real, freshly-checked fact, never a guess.
 * 2. Make a `.github/workflows/**` write visually/textually distinct from an ordinary file write —
 *   see {@link buildWriteFilesConfirmationResource}'s own doc for exactly how, and why: a workflow
 *   file controls what code executes automatically on every future push, the single most sensitive
 *   path class a repository can have.
 */

export const WRITE_FILES_TOOL_ID = "custom_credential_write_files";

export function writeFilesConfirmationUri(exchangeId: string): UIResourceUri {
  return `ui://tovu/custom-credential-write-files/${exchangeId}` as UIResourceUri;
}

/** One file the confirmation dialog names — `exists` (create vs. update) and `isWorkflow` are both
 *  facts the caller must have already resolved (`github-write-files.ts`'s plan phase,
 *  `write-files-validation.ts`'s `isWorkflowPath`) — this module only renders them, it never decides
 *  them. */
export interface WriteFilesConfirmationFileSpec {
  readonly path: string;
  readonly exists: boolean;
  readonly isWorkflow: boolean;
}

/** One `{label, value}` detail row per file — a workflow file's LABEL itself carries the emphasis
 *  (`SurfaceDetail` has no per-row style/variant field to hook into — see `@jini-ai/ui`'s own
 *  `confirmation.ts`), so the words in the label are the only lever this builder has to make that row
 *  read differently from an ordinary file's row, in addition to the dedicated warning sentence
 *  {@link buildWriteFilesConfirmationResource} adds below the whole list.
 *
 * @complexity O(1).
 */
function fileDetailRow(file: WriteFilesConfirmationFileSpec): { label: string; value: string } {
  const action = file.exists ? "update" : "create";
  if (file.isWorkflow) {
    return { label: `WORKFLOW FILE — controls CI, runs on every future push (${action})`, value: file.path };
  }
  return { label: `File (${action})`, value: file.path };
}

/**
 * Renders the dialog naming every path this call would write, whether each is a create or an
 * update, and the resolved credential/owner/repo/branch — per the same "show exactly what is about
 * to happen" discipline `delete-request-confirmation-ui.ts` documents for its own dialog.
 *
 * A `.github/workflows/**` file gets an EXTRA, more emphatic warning, not just a normal path listing:
 * its own detail row's label is textually distinct from an ordinary file's (see {@link fileDetailRow}),
 * the dialog's title itself changes when any workflow file is present, and the `warning` callout
 * (rendered as its own distinct block, never folded into the plain detail list) names every workflow
 * path explicitly and states what a workflow file controls — the human cannot mistake it for an
 * ordinary config file by skimming the list.
 *
 * @complexity O(files) — one detail row and one possible warning mention per file.
 */
export function buildWriteFilesConfirmationResource(spec: {
  label: string;
  owner: string;
  repo: string;
  branch: string;
  files: readonly WriteFilesConfirmationFileSpec[];
  exchangeId: string;
}): UIResource {
  const { label, owner, repo, branch, files, exchangeId } = spec;
  const workflowFiles = files.filter((f) => f.isWorkflow);

  const details = [
    { label: "Credential", value: label },
    { label: "Repository", value: `${owner}/${repo}` },
    { label: "Branch", value: branch },
    ...files.map(fileDetailRow),
  ];

  const warningParts = [`This writes ${files.length} file(s) directly to '${owner}/${repo}' on branch '${branch}' in one commit — Tovu has no way to undo it once it lands.`];
  if (workflowFiles.length > 0) {
    warningParts.push(
      `This includes ${workflowFiles.length} GitHub Actions WORKFLOW file(s) — ${workflowFiles.map((f) => f.path).join(", ")} — a workflow file controls what code runs automatically on every future push to this repository. Review its contents carefully before confirming.`
    );
  }

  return buildConfirmationSurface({
    uri: writeFilesConfirmationUri(exchangeId),
    title: workflowFiles.length > 0 ? `Write ${files.length} file(s), INCLUDING A CI WORKFLOW, to '${owner}/${repo}'?` : `Write ${files.length} file(s) to '${owner}/${repo}'?`,
    description: "This calls GitHub's own Git Data API using this saved credential — Tovu has no way to undo the resulting commit.",
    details,
    warning: warningParts.join(" "),
    danger: true,
    confirm: { label: "Write files", toolName: WRITE_FILES_TOOL_ID, params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "confirm" } },
    cancel: { label: "Cancel", toolName: WRITE_FILES_TOOL_ID, params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "cancel" } },
    app: { appName: "tovu-custom-credential-write-files", appVersion: "1" },
    preferredFrameSize: ["100%", "420px"],
  });
}
