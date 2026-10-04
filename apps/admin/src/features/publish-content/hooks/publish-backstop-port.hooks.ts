/** CMS-specific addresses and DTOs. Peers are saved server-side; this port never accepts a
 * credential, arbitrary destination URL, row value, or file bytes from the browser. */
export interface BackstopPeer { id: string; label: string; baseUrl: string; remoteWorkspaceId: string }
export interface BackstopRow { table: string; pk: Readonly<Record<string, string | number>> }
export interface BackstopSelection { peerId: string; reason: string; rows: readonly BackstopRow[]; files: readonly string[]; overwriteEntityKeys?: readonly string[] }
export interface BackstopReportRow { entityType: string; entityId: string; outcome: string; writes: boolean; reason: string | null; canOverwrite?: boolean }
export interface BackstopPreview { entityType: string; entityId: string; before: unknown; after: unknown; unavailableReason: string | null }
export interface BackstopPlan {
  logId: string | null;
  entities: readonly unknown[];
  skipped: readonly { entityType: string; id: string; reason: string }[];
  plan?: { planId: string; planHash: string; details: { refused: boolean; refusalReason: string | null; rows: readonly BackstopReportRow[] }; backstopPreview?: readonly BackstopPreview[] };
}
export interface BackstopSendResult { runId: string; logId: string; destination: string; details?: { rows?: readonly BackstopReportRow[] }; report?: { rows?: readonly BackstopReportRow[] } }
export interface BackstopUndoResult { runId: string; undone: number; skipped: readonly string[] }
export interface BackstopRun { runId: string; reason: string; items: readonly { entityType: string; id: string }[]; canUndo: boolean }
export interface BackstopGap { label: string; count: number; lastReason: string; lastAt: string }
export interface PublishBackstopPort {
  status(required?: Record<string, never>, optional?: Record<string, never>): Promise<{ allowed: boolean; installed: boolean }>;
  listPeers(required?: Record<string, never>, optional?: Record<string, never>): Promise<{ peers: readonly BackstopPeer[] }>;
  gaps(required?: Record<string, never>, optional?: Record<string, never>): Promise<{ gaps: readonly BackstopGap[] }>;
  plan(required: BackstopSelection, optional?: Record<string, never>): Promise<BackstopPlan>;
  send(required: BackstopSelection & { typedHost: string; logId: string }, optional?: Record<string, never>): Promise<BackstopSendResult>;
  run(required: { runId: string }, optional?: Record<string, never>): Promise<BackstopRun>;
  undo(required: { runId: string }, optional?: Record<string, never>): Promise<BackstopUndoResult>;
}
