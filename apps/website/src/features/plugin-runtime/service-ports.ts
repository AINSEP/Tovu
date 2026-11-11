/** Consumer-owned service boundaries for plugin execution and install policy. */
import type { HostSignals } from "../../contracts/core/host-signals.js";
import type { PostRecord } from "../post/index.js";

/** Reads a required post, preserving the post owner's existing not-found error. */
export interface PluginPostReadPort {
  readRequired(input: { workspaceId: string; id: string }, options?: Record<string, never>): Promise<PostRecord>;
}

/** Provider/assistant-face relationships and safe linked-switch error details. */
export interface PluginProviderFacesPort {
  /** A provider switch covers itself and its linked assistant faces. Used only by explicit OFF. */
  affectedPluginIds?(input: { pluginId: string }, options?: Record<string, never>): Promise<readonly string[]>;
  linkedProvider(input: { pluginId: string }, options?: Record<string, never>): Promise<string | undefined>;
  /** Safe preflight refusal, formatted by the same owner as linked-switch errors. */
  describeLinkedFace(input: { pluginId: string; providerPluginId: string }, options?: Record<string, never>): { code: string; message: string; providerPluginId: string };
  describeLinkedError(input: { error: unknown }, options?: Record<string, never>): { code: string; message: string; providerPluginId: string } | undefined;
  /** A "Soon" Agent Plugin is locked off (`agent-plugins/soon-lock.ts`): the refusal to show before
   *  any confirmation, or undefined when it may be switched on. */
  describeNotReady?(input: { pluginId: string }, options?: Record<string, never>): Promise<{ code: string; message: string } | undefined>;
  /** The owner's own Soon refusal at write time; a lookalike error is not classified. */
  describeNotReadyError?(input: { error: unknown }, options?: Record<string, never>): { code: string; message: string } | undefined;
}

/** Host facts are resolved by composition before install policy runs. */
export interface PluginHostFactsPort {
  readonly hostSignals: HostSignals;
}
