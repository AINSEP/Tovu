/** Consumer-owned service boundaries for plugin execution and install policy. */
import type { HostSignals } from "../../contracts/core/host-signals.js";
import type { PostRecord } from "../post/post.js";

/** Reads a required post, preserving the post owner's existing not-found error. */
export interface PluginPostReadPort {
  readRequired(input: { workspaceId: string; id: string }, options?: Record<string, never>): Promise<PostRecord>;
}

/** Provider/assistant-face relationships and safe linked-switch error details. */
export interface PluginProviderFacesPort {
  linkedProvider(input: { pluginId: string }, options?: Record<string, never>): Promise<string | undefined>;
  /** Safe preflight refusal, formatted by the same owner as linked-switch errors. */
  describeLinkedFace(input: { pluginId: string; providerPluginId: string }, options?: Record<string, never>): { code: string; message: string; providerPluginId: string };
  describeLinkedError(input: { error: unknown }, options?: Record<string, never>): { code: string; message: string; providerPluginId: string } | undefined;
}

/** Host facts are resolved by composition before install policy runs. */
export interface PluginHostFactsPort {
  readonly hostSignals: HostSignals;
}
