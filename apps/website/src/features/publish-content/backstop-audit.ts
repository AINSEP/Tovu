import type { PackedEntity } from "./type-registry.js";
import type { RawFileInverse, RawRowSnapshot } from "./backstop-ports.js";

export interface BackstopMetadata {
  readonly mode: "backstop";
  readonly reason: string;
  readonly sourceActor: string;
  readonly destinationHost: string;
  readonly gapLabels: readonly string[];
}
export type BackstopInverse =
  | { readonly entity: PackedEntity; readonly kind: "raw-row"; readonly before: RawRowSnapshot | null; readonly afterHash: string }
  | { readonly entity: PackedEntity; readonly kind: "raw-file"; readonly before: RawFileInverse; readonly afterHash: string };
export interface BackstopAuditRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly direction: "source" | "destination";
  readonly actorId: string;
  readonly destination: string;
  readonly reason: string;
  readonly at: string;
  readonly items: readonly { readonly entityType: string; readonly id: string; readonly beforeHash?: string | null; readonly afterHash: string }[];
  readonly gapLabels: readonly string[];
  readonly result: "pending" | "planned" | "success" | "failure" | "undone";
  readonly runId: string | null;
  readonly details: Readonly<Record<string, unknown>>;
  readonly inverses: readonly BackstopInverse[];
}
export interface BackstopGap { readonly label: string; readonly count: number; readonly lastReason: string; readonly lastAt: string }
export interface BackstopAuditPort {
  ready(): Promise<boolean>;
  save(input: { record: BackstopAuditRecord }): Promise<void>;
  get(input: { workspaceId: string; id: string }): Promise<BackstopAuditRecord | null>;
  gaps(input: { workspaceId: string }): Promise<readonly BackstopGap[]>;
}
