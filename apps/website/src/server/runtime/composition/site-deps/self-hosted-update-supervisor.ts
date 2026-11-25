/**
 * @file The contract a future operator-owned self-hosted update driver implements. Types only: this wave ships no
 * driver and no website implementation, so self-hosted installations are check-only. A future driver targets a named,
 * versioned deployment OUTSIDE the website process and observes the running artifact and its readiness itself:
 * neither a target marker nor the old process's environment is evidence that a replacement booted.
 */
import type { SiteUpdateCallOptions, SiteUpdateVerification } from "@jini-ai/devops/deploy";

export interface SelfHostedUpdateDriver {
  /** The artifact actually running now, as the deployment reports it (not as this process remembers it). */
  readRunning(required: Record<string, never>, optional?: SiteUpdateCallOptions): Promise<{ tag: string; version: string }>;
  /** Replaces the running deployment with `tag`; resolves once the deployment accepted the change. */
  restart(required: { tag: string }, optional?: SiteUpdateCallOptions): Promise<void>;
  /** Observes the live deployment's readiness and version. */
  checkLive(required: { expectedVersion: string }, optional?: SiteUpdateCallOptions): Promise<SiteUpdateVerification>;
  /** Puts the previous artifact and its data backup back. */
  restorePrevious(required: { previousTag: string; backupId: string }, optional?: SiteUpdateCallOptions): Promise<void>;
}
