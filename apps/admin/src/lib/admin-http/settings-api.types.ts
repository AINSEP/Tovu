import type { SettingScope } from "@jini-ai/core/settings";

// SPEC-007 Settings (core-only layered ledger) — client-side types mirroring the settings response contracts.
export interface SettingValueResponse {
  key: string;
  scope: SettingScope;
  value: unknown;
  revisionSeq: number;
}

export interface SettingResetResponse {
  namespace: string;
  clearedCount: number;
  revisionSeqs: number[];
}
