import type { ToolAttemptAuditSink } from "@jini-ai/daemon/tool-audit";
import type { VisitorToolPolicy } from "../../contracts/site-assistant/visitor-tools.js";
import type { VisitorToolBudgets } from "./visitor-tool-budgets.js";
import type { VisitorConfirmations, ToolConfirmationDirective } from "./visitor-confirmations.js";


export interface VisitorExecutionPorts {
  readonly initialPolicy: VisitorToolPolicy | null;
  /** Re-read at each invocation, including Off changes during a running model turn. */
  readonly readPolicy: () => Promise<VisitorToolPolicy | null>;
  /** Value-row revision from the settings owner; required to execute Ask, optional for legacy Auto. */
  readonly readSnapshot?: () => Promise<{ policy: VisitorToolPolicy | null; revision: string }>;
  readonly confirmation?: VisitorConfirmations & { readonly emit: (directive: ToolConfirmationDirective) => void };
  readonly budgets: VisitorToolBudgets;
  readonly ip: string;
  readonly workspaceId: string;
  readonly runId: string;
  readonly clock: { nowMs(): number; nowIso(): string };
  readonly ids: { newId(): string };
  readonly sink: ToolAttemptAuditSink;
  readonly reportError: (error: unknown) => void;
  readonly signal?: AbortSignal;
}
